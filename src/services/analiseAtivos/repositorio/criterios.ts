/**
 * Persistência dos Filtros de Fundamentos (fatia A):
 *  - criteria_eval: UMA linha por símbolo × janela (3 | 5 | 10), com paramsVersion e os resultados
 *    completos (ResultadoCriterio[]); regravada pelo job 'criterios' numa transação (deleteMany +
 *    createMany) — os leitores veem a versão anterior inteira até o commit (idempotente);
 *  - cópia COMPACTA para AnaliseQuadroLinha.criterios ({"3":{n,de,m:[[id,estado,fato]]},…}) e
 *    perfilCriterios, lida pelo job 'quadro' (gerarQuadro) e pelo seed do banco efêmero.
 * `atendidos` é contagem factual, não é nota. Só banco: nenhum provedor externo.
 * v2.5: cada resultado leva `fonte` (ids das fontes da janela) e `obs` (fallback do lucro
 * descontado, dados incompletos) no JSON de criteria_eval; a marca compacta ganha o 4º elemento
 * (obs) só quando há obs — sem migration.
 *
 * ISOLAMENTO POR CLASSE (Stocks e REITs, fatia 0): o gravador recebe as classes do job e só apaga
 * essas (deleteMany where classe IN …) — o job BR passa CLASSES_BR e nunca apaga as linhas
 * stock/reit; o job EUA (fatia B) passa CLASSES_EUA e nunca apaga acao/fii. Linha de outra classe ou
 * symbol que já existe com outra classe = erro (ErroClasseGravador), antes de qualquer escrita.
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import { ehClasseQuadro, type ClasseQuadro } from '@/types/analiseAtivosApi';
import {
  ehJanela,
  ehIdCriterio,
  ehObsCriterio,
  PERFIS_CRITERIO,
  type AvaliacaoAtivo,
  type AvaliacaoJanela,
  type ChaveJanela,
  type CriteriosCompactos,
  type MarcaCompacta,
  type PerfilCriterio,
  type ResultadoCriterio,
} from '@/types/analiseAtivosCriterios';

/** Linhas por createMany (cada linha leva ~1–2 KB de JSON em `resultados`). */
export const LOTE_GRAVACAO = 200;

export interface AvaliacaoGravar {
  symbol: string;
  cnpj: string;
  avaliacao: AvaliacaoAtivo;
}

export type LinhaCriteriaEval = Prisma.CriteriaEvalCreateManyInput;

/** Uma linha de criteria_eval por janela da avaliação. Pura. */
export function linhasCriteriaEval(a: AvaliacaoGravar, computedAt: Date): LinhaCriteriaEval[] {
  return (Object.values(a.avaliacao.janelas) as AvaliacaoJanela[]).map((j) => ({
    symbol: a.symbol,
    cnpj: a.cnpj,
    classe: a.avaliacao.classe,
    perfil: a.avaliacao.perfil,
    janela: j.janela,
    anoInicio: j.anoInicio,
    anoFim: j.anoFim,
    atendidos: j.atendidos,
    aplicaveis: j.aplicaveis,
    semDado: j.semDado,
    resultados: j.resultados as unknown as Prisma.InputJsonValue,
    paramsVersion: a.avaliacao.paramsVersion,
    computedAt,
  }));
}

/** Prazo da transação de gravação (Neon: ~15 lotes; o padrão de 5 s do Prisma não basta). */
export const PRAZO_TRANSACAO_MS = 120_000;

// ---------------------------------------------------------------------------
// Isolamento por classe (compartilhado com gerarQuadro.gravarLinhasQuadro)
// ---------------------------------------------------------------------------

/** Erro de contrato do gravador: classe fora das do job ou symbol já gravado com outra classe. */
export class ErroClasseGravador extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroClasseGravador';
  }
}

/**
 * Confere (puro) as classes do job e as linhas antes de gravar: lista não vazia de classes válidas
 * e TODA linha com classe dentro delas. Devolve as classes sem repetição.
 */
export function exigirClassesDoGravador(
  tabela: string,
  classes: readonly ClasseQuadro[],
  linhas: ReadonlyArray<{ symbol: string; classe: string }>,
): ClasseQuadro[] {
  const unicas = [...new Set(classes)];
  if (unicas.length === 0 || !unicas.every(ehClasseQuadro)) {
    throw new ErroClasseGravador(`${tabela}: classes do job inválidas (${classes.join(', ')})`);
  }
  const fora = linhas.find((l) => !(unicas as string[]).includes(l.classe));
  if (fora) {
    throw new ErroClasseGravador(
      `${tabela}: ${fora.symbol} tem classe '${fora.classe}' fora das classes do job (${unicas.join(', ')})`,
    );
  }
  return unicas;
}

/** Mensagem da colisão (symbol já gravado com classe de OUTRO job). */
export function mensagemColisao(
  tabela: string,
  colisoes: ReadonlyArray<{ symbol: string; classe: string }>,
): string {
  const lista = colisoes
    .slice(0, 5)
    .map((c) => `${c.symbol} (${c.classe})`)
    .join(', ');
  return `${tabela}: symbol já gravado com outra classe — ${lista}${colisoes.length > 5 ? '…' : ''}`;
}

/**
 * Troca as linhas de criteria_eval DAS CLASSES DO JOB numa transação INTERATIVA (deleteMany por
 * classe + createMany em lotes, um de cada vez): a transação em lote mandava os ~2.900 JSONs de
 * uma vez e o pico de RSS do processo passava de 380 MB no DEV. Tudo ou nada; devolve quantas
 * gravou. As linhas das outras classes ficam intactas (job BR × job EUA).
 */
export async function gravarCriteriaEval(
  prisma: Pick<PrismaClient, '$transaction'>,
  linhas: LinhaCriteriaEval[],
  classes: readonly ClasseQuadro[],
): Promise<number> {
  const doJob = exigirClassesDoGravador('criteria_eval', classes, linhas);
  return prisma.$transaction(
    async (tx) => {
      if (linhas.length > 0) {
        const colisoes = await tx.criteriaEval.findMany({
          where: {
            symbol: { in: [...new Set(linhas.map((l) => l.symbol))] },
            classe: { notIn: doJob },
          },
          select: { symbol: true, classe: true },
          distinct: ['symbol'],
        });
        if (colisoes.length > 0) {
          throw new ErroClasseGravador(mensagemColisao('criteria_eval', colisoes));
        }
      }
      await tx.criteriaEval.deleteMany({ where: { classe: { in: doJob } } });
      let gravadas = 0;
      for (let i = 0; i < linhas.length; i += LOTE_GRAVACAO) {
        const r = await tx.criteriaEval.createMany({ data: linhas.slice(i, i + LOTE_GRAVACAO) });
        gravadas += r.count;
      }
      return gravadas;
    },
    { timeout: PRAZO_TRANSACAO_MS, maxWait: 10_000 },
  );
}

// ---------------------------------------------------------------------------
// Cópia compacta (AnaliseQuadroLinha.criterios)
// ---------------------------------------------------------------------------

/** Marcas compactas na ordem do perfil ([id, estado, fato] ou [..., obs] com obs). Pura. */
export function marcasCompactas(resultados: readonly ResultadoCriterio[]): MarcaCompacta[] {
  return resultados.map((r): MarcaCompacta => {
    const obs = (r.obs ?? []).filter(ehObsCriterio);
    return obs.length > 0 ? [r.id, r.estado, r.fato, obs] : [r.id, r.estado, r.fato];
  });
}

/** Compacto de uma lista de linhas (uma por janela) de criteria_eval. Pura. */
export function compactarLinhas(
  linhas: ReadonlyArray<{
    janela: number;
    atendidos: number;
    aplicaveis: number;
    resultados: unknown;
  }>,
): CriteriosCompactos {
  const out: CriteriosCompactos = {};
  for (const l of linhas) {
    if (!ehJanela(l.janela) || !Array.isArray(l.resultados)) continue;
    const resultados = (l.resultados as ResultadoCriterio[]).filter((r) => r && ehIdCriterio(r.id));
    out[String(l.janela) as ChaveJanela] = {
      n: l.atendidos,
      de: l.aplicaveis,
      m: marcasCompactas(resultados),
    };
  }
  return out;
}

/** Compacto direto da avaliação (testes e seed). Pura. */
export function compactarAvaliacao(a: AvaliacaoAtivo): CriteriosCompactos {
  return compactarLinhas(
    (Object.values(a.janelas) as AvaliacaoJanela[]).map((j) => ({
      janela: j.janela,
      atendidos: j.atendidos,
      aplicaveis: j.aplicaveis,
      resultados: j.resultados,
    })),
  );
}

export interface CompactoSimbolo {
  perfil: PerfilCriterio;
  criterios: CriteriosCompactos;
  paramsVersion: number;
}

function ehPerfil(s: string): s is PerfilCriterio {
  return (PERFIS_CRITERIO as readonly string[]).includes(s);
}

/** Linha de criteria_eval já compactada pelo Postgres (só id/estado/fato de cada critério). */
export interface LinhaCompactaSql {
  symbol: string;
  perfil: string;
  janela: number;
  atendidos: number;
  aplicaveis: number;
  paramsVersion: number;
  /** [id, estado, fato] ou [id, estado, fato, obs] (v2.5) */
  m: Array<[string, string, string] | [string, string, string, unknown]> | null;
}

/** Marca lida do SQL (o 4º elemento só fica com obs válidas). Pura. */
export function marcaDoSql(
  m: [string, string, string] | [string, string, string, unknown],
): MarcaCompacta {
  const [id, estado, fato] = m;
  const obs = Array.isArray(m[3]) ? (m[3] as unknown[]).filter(ehObsCriterio) : [];
  return (obs.length > 0 ? [id, estado, fato, obs] : [id, estado, fato]) as MarcaCompacta;
}

/**
 * Cópias compactas de todos os símbolos avaliados (job 'quadro'). O Postgres monta o compacto
 * (jsonb_build_array(id, estado, fato)) e a série de cada critério nem sai do banco: lendo
 * `resultados` inteiro pelo Prisma o pico do job 'quadro' subia ~100 MB no DEV. Em páginas
 * (keyset por symbol, janela). `classes` (fatia 0 EUA) restringe às classes do job (o Quadro BR
 * passa CLASSES_BR, o EUA CLASSES_EUA); ausente = todas (seed).
 */
export async function lerCompactosPorSimbolo(
  prisma: Pick<PrismaClient, '$queryRaw'>,
  opts: { pagina?: number; classes?: readonly ClasseQuadro[] } = {},
): Promise<Map<string, CompactoSimbolo>> {
  const pagina = opts.pagina ?? 1000;
  const filtroClasse =
    opts.classes && opts.classes.length > 0
      ? Prisma.sql`AND e."classe" IN (${Prisma.join([...new Set(opts.classes)])})`
      : Prisma.empty;
  const out = new Map<string, CompactoSimbolo>();
  let depois: { symbol: string; janela: number } | null = null;
  for (;;) {
    const ultimo: { symbol: string; janela: number } | null = depois;
    const linhas: LinhaCompactaSql[] = await prisma.$queryRaw<LinhaCompactaSql[]>`
      SELECT e."symbol", e."perfil", e."janela", e."atendidos", e."aplicaveis", e."paramsVersion",
             (SELECT jsonb_agg(
                       CASE WHEN jsonb_typeof(r->'obs') = 'array' AND jsonb_array_length(r->'obs') > 0
                            THEN jsonb_build_array(r->>'id', r->>'estado', r->>'fato', r->'obs')
                            ELSE jsonb_build_array(r->>'id', r->>'estado', r->>'fato') END
                       ORDER BY o)
                FROM jsonb_array_elements(e."resultados") WITH ORDINALITY AS t(r, o)) AS m
      FROM "criteria_eval" e
      WHERE (${ultimo === null}
         OR (e."symbol", e."janela") > (${ultimo?.symbol ?? ''}, ${ultimo?.janela ?? 0}))
        ${filtroClasse}
      ORDER BY e."symbol", e."janela"
      LIMIT ${pagina}`;
    for (const l of linhas) {
      if (!ehPerfil(l.perfil)) continue;
      const atual = out.get(l.symbol) ?? {
        perfil: l.perfil,
        paramsVersion: l.paramsVersion,
        criterios: {},
      };
      if (ehJanela(l.janela) && Array.isArray(l.m)) {
        atual.criterios[String(l.janela) as ChaveJanela] = {
          n: l.atendidos,
          de: l.aplicaveis,
          m: l.m.filter(([id]) => ehIdCriterio(id)).map(marcaDoSql),
        };
      }
      out.set(l.symbol, atual);
    }
    if (linhas.length < pagina) break;
    const fim = linhas[linhas.length - 1];
    depois = { symbol: fim.symbol, janela: fim.janela };
  }
  return out;
}
