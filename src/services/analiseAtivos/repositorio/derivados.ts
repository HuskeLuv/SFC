/**
 * Leituras dos derivados da fatia D (múltiplos atuais) para a Fase 1 e frescor. D6-a: as leituras de
 * asset_scores (ScoreGravado/scoresNaData) saíram com o Índice MF.
 */
import type { PrismaClient } from '@prisma/client';
import { paraData, paraNumero } from '@/services/analiseAtivos/repositorio/conversao';
import type { ClasseAnalise } from '@/services/analiseAtivos/tipos';

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
  /** A6 (fatia E): obrigações ÷ ativo total do FII (%) */
  obrigacoesAtivoPct: number | null;
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
