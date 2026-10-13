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

/** Linhas por createMany (a resposta de cada linha tem ~2 KB de JSON). */
export const LOTE_GRAVACAO = 500;

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

/** Troca TODAS as linhas de criteria_eval numa transação. Devolve quantas gravou. */
export async function gravarCriteriaEval(
  prisma: Pick<PrismaClient, '$transaction' | 'criteriaEval'>,
  linhas: LinhaCriteriaEval[],
): Promise<number> {
  const lotes: LinhaCriteriaEval[][] = [];
  for (let i = 0; i < linhas.length; i += LOTE_GRAVACAO) {
    lotes.push(linhas.slice(i, i + LOTE_GRAVACAO));
  }
  const r = await prisma.$transaction([
    prisma.criteriaEval.deleteMany({}),
    ...lotes.map((data) => prisma.criteriaEval.createMany({ data })),
  ]);
  return (r.slice(1) as Array<{ count: number }>).reduce((s, x) => s + x.count, 0);
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

/**
 * Cópias compactas de todos os símbolos avaliados (job 'quadro'). Lê só as colunas usadas, em
 * páginas, para o pico de memória ficar baixo (~2.600 linhas × ~2 KB).
 */
export async function lerCompactosPorSimbolo(
  prisma: Pick<PrismaClient, 'criteriaEval'>,
  opts: { pagina?: number } = {},
): Promise<Map<string, CompactoSimbolo>> {
  const pagina = opts.pagina ?? 1000;
  const porSimbolo = new Map<
    string,
    {
      perfil: string;
      paramsVersion: number;
      linhas: Parameters<typeof compactarLinhas>[0][number][];
    }
  >();
  let cursor: string | undefined;
  for (;;) {
    const linhas = await prisma.criteriaEval.findMany({
      select: {
        id: true,
        symbol: true,
        perfil: true,
        janela: true,
        atendidos: true,
        aplicaveis: true,
        resultados: true,
        paramsVersion: true,
      },
      orderBy: { id: 'asc' },
      take: pagina,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    for (const l of linhas) {
      const atual = porSimbolo.get(l.symbol) ?? {
        perfil: l.perfil,
        paramsVersion: l.paramsVersion,
        linhas: [],
      };
      atual.linhas.push(l);
      porSimbolo.set(l.symbol, atual);
    }
    if (linhas.length < pagina) break;
    cursor = linhas[linhas.length - 1].id;
  }
  const out = new Map<string, CompactoSimbolo>();
  for (const [symbol, v] of porSimbolo) {
    if (!ehPerfil(v.perfil)) continue;
    out.set(symbol, {
      perfil: v.perfil,
      paramsVersion: v.paramsVersion,
      criterios: compactarLinhas(v.linhas),
    });
  }
  return out;
}
