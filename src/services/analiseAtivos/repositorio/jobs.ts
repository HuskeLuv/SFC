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

/**
 * Jobs renomeados (D6-a, 23/10/2026): o OK do nome antigo vale para o novo enquanto o histórico tiver
 * só o antigo (1 ciclo depois do deploy). 'scores' → 'derivados'.
 */
export const JOBS_RENOMEADOS: ReadonlyArray<readonly [antigo: NomeJob, novo: NomeJob]> = [
  ['scores', 'derivados'],
];

/**
 * Fim da última execução 'ok' ou 'parcial' (parcial = avançou e continua no próximo run). O job
 * renomeado recebe o max(novo, antigo) — o incremental dos derivados e o frescor não recomeçam do
 * zero no 1º run com o nome novo.
 */
export async function ultimaExecucaoOkPorJob(prisma: PrismaClient): Promise<Map<NomeJob, Date>> {
  const grupos = await prisma.analiseJobRun.groupBy({
    by: ['job'],
    where: { status: { in: ['ok', 'parcial'] }, fim: { not: null } },
    _max: { fim: true },
  });
  const out = new Map<NomeJob, Date>();
  for (const g of grupos) if (g._max.fim) out.set(g.job as NomeJob, g._max.fim);
  for (const [antigo, novo] of JOBS_RENOMEADOS) {
    const a = out.get(antigo);
    const n = out.get(novo);
    if (a && (!n || a > n)) out.set(novo, a);
  }
  return out;
}

export async function dadoMaisRecentePorCamada(
  prisma: PrismaClient,
): Promise<Record<Camada, string | null>> {
  const [cot, dfp, itr, mensal, trimestral, setor, fii, eventos, scores, quadro] =
    await Promise.all([
      prisma.assetQuoteDaily.aggregate({ _max: { date: true } }),
      prisma.assetFundamentalsPeriod.aggregate({
        where: { docTipo: 'DFP' },
        _max: { dtFim: true },
      }),
      prisma.assetFundamentalsPeriod.aggregate({
        where: { docTipo: 'ITR' },
        _max: { dtFim: true },
      }),
      prisma.fiiMonthly.aggregate({ _max: { refMonth: true } }),
      prisma.fiiQuarterly.aggregate({ _max: { refQuarter: true } }),
      prisma.assetSetorB3.aggregate({ _max: { atualizadoEm: true } }),
      prisma.fiiTickerMap.aggregate({ _max: { fetchedAt: true } }),
      prisma.assetEvento.aggregate({ where: { tipo: 'assembleia' }, _max: { data: true } }),
      // D6-a: a camada 'scores' (nome mantido) = múltiplos atuais do job derivados (precoData = o
      // último pregão do run, a mesma data que o asset_scores.dataRef tinha)
      prisma.assetMultiplesCurrent.aggregate({
        where: { classe: { in: ['acao', 'fii'] } },
        _max: { precoData: true },
      }),
      prisma.analiseQuadroLinha.aggregate({ _max: { dataRef: true } }),
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
    scores: paraData(scores._max.precoData),
    quadro: paraData(quadro._max.dataRef),
  };
}
