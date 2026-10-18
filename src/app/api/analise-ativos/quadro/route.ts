import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { validationError } from '@/utils/validation-schemas';
import {
  exigirAcessoAnalise,
  exigirClasseAnalise,
  flagsEua,
} from '@/services/analiseAtivos/acesso/acessoAnalise';
import {
  obterCriteriaParamsQuadro,
  obterLinhasQuadro,
  obterLinhasQuadroApi,
  versaoQuadro,
} from '@/services/analiseAtivos/leitura/linhasQuadro';
import {
  consultarQuadro,
  definicoesQuadro,
  idsFiltraveis,
  LIMITE_MAXIMO,
} from '@/services/analiseAtivos/quadro/consultaQuadro';
import {
  CLASSES_QUADRO,
  ehClasseEua,
  type QuadroParams,
  type QuadroResposta,
} from '@/types/analiseAtivosApi';
import { normalizarTickerEua } from '@/types/analiseAtivosEua';
import {
  JANELAS_CRITERIOS,
  ehIdCriterio,
  type IdCriterio,
  type Janela,
} from '@/types/analiseAtivosCriterios';

/**
 * GET /api/analise-ativos/quadro — linhas do Quadro (noQuadro=true) de uma classe, filtradas pelos
 * critérios de fundamentos na janela (E lógico), ordenadas (A–Z por padrão; nulos sempre no fim) e
 * paginadas de 25 em 25. Só banco: as linhas ficam em memória por versão e janela
 * (leitura/linhasQuadro.ts) e a consulta é pura (quadro/consultaQuadro.ts) — rec. 8.
 *
 * Query (zod ESTRITO: parâmetro desconhecido ou antigo — lucroConsistente, dyMin, pvpMax, tipo,
 * somenteCompletos, a ordem do indicador antigo — dá 400): classe; janela 3|5|10 (padrão 5); criterios (ids
 * separados por vírgula, só chips habilitados da classe; em FII o id de tijolo cobre o par de papel);
 * naCarteira; setor; segmento; ordem; dir; offset; limite ≤ 100.
 *
 * - 404 sem acesso (flag/beta, exigirAcessoAnalise); 400 com query inválida.
 * - Stocks e REITs (fatia C): classe stock|reit SÓ com ANALISE_ATIVOS_EUA_HABILITADO (sem a chave =
 *   404 antes da sessão, exigirClasseAnalise); contagens das abas EUA só com a chave; preço/P/L/DY
 *   EUA só com ANALISE_ATIVOS_EUA_PRECO_HABILITADO (consultaQuadro.comCotacaoEua); ocupação
 *   (chip inativo, sem fonte) em ?criterios= = 400 como qualquer chip desabilitado.
 * - naCarteira=1: posições e planejados do targetUserId (o cliente, quando o consultor age por ele),
 *   lidos direto de portfolios/watchlists.
 * - Resposta + {janela, totalClasse, definicoes}; nenhuma chave do indicador antigo
 *   (contratoSemNota.test.ts).
 * - Cache-Control: no-store (o cache é o do servidor; um ativo recém-registrado aparece logo no
 *   filtro "Na minha carteira"). Server-Timing com o tempo da consulta.
 */
export const dynamic = 'force-dynamic';

const booleano = z
  .enum(['1', '0', 'true', 'false'])
  .transform((v) => v === '1' || v === 'true')
  .optional();

const ORDENS = [
  'ticker',
  'criterios',
  'lucro10',
  'preco',
  'anosLucro',
  'mesesRendimento',
  'roe',
  'pl',
  'pvp',
  'dy',
  'margem',
  'divLiqEbitda',
  'payout',
  'vacancia',
  'valorMercado',
  'patrimonio',
  'liquidez',
  'obrigacoesPl',
  'cotistas',
] as const;

const schemaQuadro = z.strictObject({
  classe: z.enum(CLASSES_QUADRO),
  janela: z.coerce
    .number()
    .refine((v) => (JANELAS_CRITERIOS as readonly number[]).includes(v), 'janela: 3, 5 ou 10')
    .transform((v) => v as Janela)
    .optional(),
  criterios: z
    .string()
    .trim()
    .max(120)
    .refine(
      (v) => v === '' || v.split(',').every((id) => ehIdCriterio(id.trim())),
      'critério desconhecido',
    )
    .optional(),
  naCarteira: booleano,
  setor: z.string().trim().min(1).max(120).optional(),
  segmento: z.string().trim().min(1).max(120).optional(),
  ordem: z.enum(ORDENS).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
  offset: z.coerce.number().int().min(0).max(10_000).optional(),
  limite: z.coerce.number().int().min(1).max(LIMITE_MAXIMO).optional(),
});

/** Símbolo manual de stock/REIT da Carteira: 'AAPL-1731234567890-abc' → 'AAPL'. */
const RE_SIMBOLO_MANUAL = /^([A-Z0-9.]+)-\d{13}-[A-Z0-9]+$/i;

/**
 * Tickers com posição (quantidade > 0) ou planejados (watchlist) do usuário. Cada símbolo entra
 * também NORMALIZADO (sem pontuação, sem o sufixo dos ativos manuais), para casar stocks e REITs
 * (BRK.B ↔ BRKB) — tickers da B3 têm dígito e nunca casam com um ticker EUA.
 */
async function simbolosDoUsuario(userId: string): Promise<Set<string>> {
  const [posicoes, planejados] = await Promise.all([
    prisma.portfolio.findMany({
      where: { userId, quantity: { gt: 0 }, assetId: { not: null } },
      select: { asset: { select: { symbol: true } } },
    }),
    prisma.watchlist.findMany({
      where: { userId, assetId: { not: null } },
      select: { asset: { select: { symbol: true } } },
    }),
  ]);
  const out = new Set<string>();
  for (const p of [...posicoes, ...planejados]) {
    const symbol = p.asset?.symbol?.toUpperCase();
    if (!symbol) continue;
    out.add(symbol);
    out.add(normalizarTickerEua(RE_SIMBOLO_MANUAL.exec(symbol)?.[1] ?? symbol));
  }
  return out;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const inicio = performance.now();
  const bruto = Object.fromEntries(request.nextUrl.searchParams.entries());
  // stock/reit sem a chave EUA = 404 antes da sessão (como a área desligada)
  const { targetUserId } = ehClasseEua(bruto.classe)
    ? await exigirClasseAnalise(request, bruto.classe)
    : await exigirAcessoAnalise(request);

  const parsed = schemaQuadro.safeParse(bruto);
  if (!parsed.success) return validationError(parsed);
  const params: QuadroParams = parsed.data;

  const criteriaParams = await obterCriteriaParamsQuadro();
  // ids válidos, mas fora dos chips habilitados da classe (outra classe, vacância/inadimplência
  // sem dado, id de papel) = 400: a URL nunca filtra por um critério que a tela não oferece
  const permitidos = idsFiltraveis(definicoesQuadro(params.classe, criteriaParams));
  const pedidos = (params.criterios ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const invalidos = pedidos.filter((id) => !permitidos.has(id as IdCriterio));
  if (invalidos.length > 0) {
    return NextResponse.json(
      {
        error: 'Dados inválidos: criterios',
        details: { criterios: [`critério indisponível para a classe: ${invalidos.join(', ')}`] },
      },
      { status: 400 },
    );
  }

  const [versao, linhas, linhasDb, naCarteira] = await Promise.all([
    versaoQuadro(),
    obterLinhasQuadroApi(undefined, { janela: params.janela }),
    obterLinhasQuadro(),
    params.naCarteira ? simbolosDoUsuario(targetUserId) : Promise.resolve(undefined),
  ]);
  const dataRef = linhasDb[0]?.dataRef ? linhasDb[0].dataRef.toISOString().slice(0, 10) : null;

  const corpo: QuadroResposta = consultarQuadro({
    params,
    linhas,
    naCarteira,
    versao,
    dataRef,
    hoje: new Date().toISOString().slice(0, 10),
    criteriaParams,
    eua: (({ eua, euaPreco }) => ({ habilitado: eua, preco: euaPreco }))(flagsEua()),
  });
  const dur = (performance.now() - inicio).toFixed(1);
  return NextResponse.json(corpo, {
    headers: { 'Cache-Control': 'no-store', 'Server-Timing': `quadro;dur=${dur}` },
  });
});
