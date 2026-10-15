/**
 * Persistência dos Filtros de Fundamentos (fatia A):
 *  - criteria_eval: UMA linha por símbolo × janela (3 | 5 | 10), com paramsVersion e os resultados
 *    completos (ResultadoCriterio[]); regravada pelo job 'criterios' numa transação (deleteMany +
 *    createMany) — os leitores veem a versão anterior inteira até o commit (idempotente);
 *  - cópia COMPACTA para AnaliseQuadroLinha.criterios ({"3":{n,de,m:[[id,estado,fato]]},…}) e
 *    perfilCriterios, lida pelo job 'quadro' (gerarQuadro) e pelo seed do banco efêmero.
 * `atendidos` é contagem factual, não é nota. Só banco: nenhum provedor externo.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  ehJanela,
  ehIdCriterio,
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

/**
 * Troca TODAS as linhas de criteria_eval numa transação INTERATIVA (deleteMany + createMany em
 * lotes, um de cada vez): a transação em lote mandava os ~2.900 JSONs de uma vez e o pico de RSS
 * do processo passava de 380 MB no DEV. Tudo ou nada; devolve quantas gravou.
 */
export async function gravarCriteriaEval(
  prisma: Pick<PrismaClient, '$transaction'>,
  linhas: LinhaCriteriaEval[],
): Promise<number> {
  return prisma.$transaction(
    async (tx) => {
      await tx.criteriaEval.deleteMany({});
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

/** Marcas compactas na ordem do perfil. Pura. */
export function marcasCompactas(resultados: readonly ResultadoCriterio[]): MarcaCompacta[] {
  return resultados.map((r) => [r.id, r.estado, r.fato]);
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
  m: Array<[string, string, string]> | null;
}

/**
 * Cópias compactas de todos os símbolos avaliados (job 'quadro'). O Postgres monta o compacto
 * (jsonb_build_array(id, estado, fato)) e a série de cada critério nem sai do banco: lendo
 * `resultados` inteiro pelo Prisma o pico do job 'quadro' subia ~100 MB no DEV. Em páginas
 * (keyset por symbol, janela).
 */
export async function lerCompactosPorSimbolo(
  prisma: Pick<PrismaClient, '$queryRaw'>,
  opts: { pagina?: number } = {},
): Promise<Map<string, CompactoSimbolo>> {
  const pagina = opts.pagina ?? 1000;
  const out = new Map<string, CompactoSimbolo>();
  let depois: { symbol: string; janela: number } | null = null;
  for (;;) {
    const ultimo: { symbol: string; janela: number } | null = depois;
    const linhas: LinhaCompactaSql[] = await prisma.$queryRaw<LinhaCompactaSql[]>`
      SELECT e."symbol", e."perfil", e."janela", e."atendidos", e."aplicaveis", e."paramsVersion",
             (SELECT jsonb_agg(jsonb_build_array(r->>'id', r->>'estado', r->>'fato') ORDER BY o)
                FROM jsonb_array_elements(e."resultados") WITH ORDINALITY AS t(r, o)) AS m
      FROM "criteria_eval" e
      WHERE ${ultimo === null}
         OR (e."symbol", e."janela") > (${ultimo?.symbol ?? ''}, ${ultimo?.janela ?? 0})
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
          m: l.m.filter(([id]) => ehIdCriterio(id)) as MarcaCompacta[],
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
