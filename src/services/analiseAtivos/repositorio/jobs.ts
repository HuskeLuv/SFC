/**
 * Leituras de execução dos jobs e do dado mais recente por camada (frescor, fatia E). A E não lê
 * tabela de outra fatia direto: passa por aqui.
 */
import type { PrismaClient } from '@prisma/client';
import { paraData } from '@/services/analiseAtivos/repositorio/conversao';
import type { Camada, NomeJob } from '@/services/analiseAtivos/tipos';

export async function ultimasExecucoes(
  prisma: PrismaClient,
  job: NomeJob,
  n: number,
): Promise<Array<{ status: string; inicio: Date; fim: Date | null; erro: string | null }>> {
  return prisma.analiseJobRun.findMany({
    where: { job },
    orderBy: { inicio: 'desc' },
    take: n,
    select: { status: true, inicio: true, fim: true, erro: true },
  });
}

/** Fim da última execução 'ok' ou 'parcial' (parcial = avançou e continua no próximo run). */
export async function ultimaExecucaoOkPorJob(prisma: PrismaClient): Promise<Map<NomeJob, Date>> {
  const grupos = await prisma.analiseJobRun.groupBy({
    by: ['job'],
    where: { status: { in: ['ok', 'parcial'] }, fim: { not: null } },
    _max: { fim: true },
  });
  const out = new Map<NomeJob, Date>();
  for (const g of grupos) if (g._max.fim) out.set(g.job as NomeJob, g._max.fim);
  return out;
}

export async function dadoMaisRecentePorCamada(
  prisma: PrismaClient,
): Promise<Record<Camada, string | null>> {
  const [cot, dfp, itr, mensal, trimestral, setor, fii, eventos, scores] = await Promise.all([
    prisma.assetQuoteDaily.aggregate({ _max: { date: true } }),
    prisma.assetFundamentalsPeriod.aggregate({ where: { docTipo: 'DFP' }, _max: { dtFim: true } }),
    prisma.assetFundamentalsPeriod.aggregate({ where: { docTipo: 'ITR' }, _max: { dtFim: true } }),
    prisma.fiiMonthly.aggregate({ _max: { refMonth: true } }),
    prisma.fiiQuarterly.aggregate({ _max: { refQuarter: true } }),
    prisma.assetSetorB3.aggregate({ _max: { atualizadoEm: true } }),
    prisma.fiiTickerMap.aggregate({ _max: { fetchedAt: true } }),
    prisma.assetEvento.aggregate({ where: { tipo: 'assembleia' }, _max: { data: true } }),
    prisma.assetScore.aggregate({ _max: { dataRef: true } }),
  ]);
  return {
    cotacoes: paraData(cot._max.date),
    fundamentos_dfp: paraData(dfp._max.dtFim),
    fundamentos_itr: paraData(itr._max.dtFim),
    fii_mensal: paraData(mensal._max.refMonth),
    fii_trimestral: paraData(trimestral._max.refQuarter),
    cadastro_b3: paraData(setor._max.atualizadoEm),
    cadastro_fii: paraData(fii._max.fetchedAt),
    eventos: paraData(eventos._max.data),
    scores: paraData(scores._max.dataRef),
  };
}
