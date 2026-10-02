import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { validationError } from '@/utils/validation-schemas';
import { exigirAcessoAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import {
  obterLinhasQuadro,
  obterLinhasQuadroApi,
  versaoQuadro,
} from '@/services/analiseAtivos/leitura/linhasQuadro';
import { consultarQuadro, LIMITE_MAXIMO } from '@/services/analiseAtivos/quadro/consultaQuadro';
import type { QuadroParams, QuadroResposta } from '@/types/analiseAtivosApi';

/**
 * GET /api/analise-ativos/quadro — linhas do Quadro (noQuadro=true) de uma classe, filtradas,
 * ordenadas (nulos sempre no fim) e paginadas de 25 em 25. Só banco: as linhas ficam em memória
 * por versão (leitura/linhasQuadro.ts) e a consulta é pura (quadro/consultaQuadro.ts).
 *
 * - 404 sem acesso (flag/beta, exigirAcessoAnalise); 400 com query inválida (zod).
 * - naCarteira=1: posições e planejados do targetUserId (o cliente, quando o consultor age por ele),
 *   lidos direto de portfolios/watchlists.
 * - Cache-Control: no-store (o cache é o do servidor; um ativo recém-registrado aparece logo no
 *   filtro "Na minha carteira"). Server-Timing com o tempo da consulta.
 */
export const dynamic = 'force-dynamic';

const booleano = z
  .enum(['1', '0', 'true', 'false'])
  .transform((v) => v === '1' || v === 'true')
  .optional();

const schemaQuadro = z.object({
  classe: z.enum(['acao', 'fii']),
  ordem: z
    .enum([
      'indiceMf',
      'ticker',
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
    ])
    .optional(),
  dir: z.enum(['asc', 'desc']).optional(),
  lucroConsistente: booleano,
  dyMin: z.coerce.number().min(0).max(100).optional(),
  pvpMax: z.coerce.number().positive().max(100).optional(),
  tipo: z.enum(['tijolo', 'papel', 'hibrido', 'fof', 'indefinido']).optional(),
  naCarteira: booleano,
  setor: z.string().trim().min(1).max(120).optional(),
  segmento: z.string().trim().min(1).max(120).optional(),
  somenteCompletos: booleano,
  offset: z.coerce.number().int().min(0).max(10_000).optional(),
  limite: z.coerce.number().int().min(1).max(LIMITE_MAXIMO).optional(),
});

/** Tickers com posição (quantidade > 0) ou planejados (watchlist) do usuário. */
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
    if (p.asset?.symbol) out.add(p.asset.symbol.toUpperCase());
  }
  return out;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const inicio = performance.now();
  const { targetUserId } = await exigirAcessoAnalise(request);

  const bruto = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = schemaQuadro.safeParse(bruto);
  if (!parsed.success) return validationError(parsed);
  const params: QuadroParams = parsed.data;

  const [versao, linhas, linhasDb, naCarteira] = await Promise.all([
    versaoQuadro(),
    obterLinhasQuadroApi(),
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
  });
  const dur = (performance.now() - inicio).toFixed(1);
  return NextResponse.json(corpo, {
    headers: { 'Cache-Control': 'no-store', 'Server-Timing': `quadro;dur=${dur}` },
  });
});
