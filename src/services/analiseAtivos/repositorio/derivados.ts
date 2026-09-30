/**
 * Leituras dos derivados da fatia D (Índice MF/semáforo e múltiplos atuais) para a Fase 1 e frescor.
 */
import type { PrismaClient } from '@prisma/client';
import { deData, paraData, paraNumero } from '@/services/analiseAtivos/repositorio/conversao';
import type { CheckSemaforo, ClasseAnalise, Regua } from '@/services/analiseAtivos/tipos';

export interface ScoreGravado {
  symbol: string;
  cnpj: string;
  dataRef: string;
  classe: ClasseAnalise;
  regua: Regua;
  fiiTipo: string | null;
  tickerReferencia: string | null;
  indiceMf: number | null;
  cLucro: number | null;
  cDivida: number | null;
  cRent: number | null;
  cDiv: number | null;
  cPreco: number | null;
  componentes: unknown;
  pesosEfetivos: unknown;
  checks: CheckSemaforo[];
  criteriosAplicaveis: number;
  criteriosAtendidos: number;
  incompleto: boolean;
  motivosIncompleto: string[];
  paramsVersion: number;
  computedAt: Date;
}

export async function scoresNaData(
  prisma: PrismaClient,
  dataRef: string,
  symbols?: string[],
): Promise<ScoreGravado[]> {
  const linhas = await prisma.assetScore.findMany({
    where: { dataRef: deData(dataRef), ...(symbols ? { symbol: { in: symbols } } : {}) },
    orderBy: { symbol: 'asc' },
  });
  return linhas.map((l) => ({
    ...l,
    dataRef: paraData(l.dataRef),
    classe: l.classe as ClasseAnalise,
    regua: l.regua as Regua,
    checks: (Array.isArray(l.checks) ? l.checks : []) as unknown as CheckSemaforo[],
  }));
}

export interface MultiplosAtuaisGravados {
  symbol: string;
  cnpj: string;
  classe: ClasseAnalise;
  preco: number;
  precoData: string;
  ttmDtFim: string | null;
  lpaTtm: number | null;
  vpa: number | null;
  dpa12m: number | null;
  rend12m: number | null;
  vpCota: number | null;
  pl: number | null;
  pvp: number | null;
  pReceita: number | null;
  evEbitda: number | null;
  pFco: number | null;
  pFcl: number | null;
  dy12mPct: number | null;
  payoutPct: number | null;
  margemLiquidaPct: number | null;
  roePct: number | null;
  roaPct: number | null;
  roicPct: number | null;
  divLiqEbitda: number | null;
  divLiqPl: number | null;
  liquidezCorrente: number | null;
  obrigacoesPlPct: number | null;
  anosLucroConsecutivos: number | null;
  mesesComRendimento: number | null;
  plMedia10a: number | null;
  plPontosHistorico: number;
  plVsMedia10aPct: number | null;
  naoSeAplica: string[];
  flags: string[];
  paramsVersion: number;
  calculadoEm: Date;
}

export async function multiplosAtuais(
  prisma: PrismaClient,
  symbols?: string[],
): Promise<MultiplosAtuaisGravados[]> {
  const linhas = await prisma.assetMultiplesCurrent.findMany({
    where: symbols ? { symbol: { in: symbols } } : {},
    orderBy: { symbol: 'asc' },
  });
  return linhas.map((l) => ({
    ...l,
    classe: l.classe as ClasseAnalise,
    preco: paraNumero(l.preco) ?? 0,
    precoData: paraData(l.precoData),
    ttmDtFim: paraData(l.ttmDtFim),
  }));
}
