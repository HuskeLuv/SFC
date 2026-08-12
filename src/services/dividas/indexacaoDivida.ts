/**
 * Dívidas — correção do saldo devedor pelo índice REALIZADO (TR/IPCA/CDI).
 *
 * O cronograma SAC/Price é sempre em moeda constante (amortizacao.ts); este
 * helper devolve o fator acumulado do índice entre o 1º vencimento e hoje,
 * pra exibir `saldoCorrigido = saldoConstante × fator`. É aproximação de
 * exibição declarada na UI — contratos reais (ex.: TR em financiamento
 * imobiliário) corrigem o saldo antes de cada amortização.
 *
 * Fonte: EconomicIndex (ingestão BACEN, ver economicIndexesIngestion.ts).
 * CDI e TR são séries DIÁRIAS (fração decimal por dia útil); IPCA é MENSAL.
 * Composição segue o padrão de fixedIncomePricing.ts: Π(1 + taxa) sobre as
 * linhas do intervalo. Série ausente/vazia → fator 1 (degrada sem corrigir).
 */

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { getTtlCache } from '@/lib/simpleTtlCache';

export type IndexadorDivida = 'PREFIXADO' | 'TR' | 'IPCA' | 'CDI';

const FACTOR_TTL_MS = 60 * 60 * 1000; // 1h — ingestão BACEN roda no máx. 1×/dia
const factorCache = getTtlCache<number>('dividas:indexFactor');

/** Primeiro dia (UTC) de um YYYY-MM. */
const monthStartUTC = (yearMonth: string): Date => {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
};

/**
 * Fator acumulado do índice de `fromMonth` (YYYY-MM, inclusive) até `asOf`
 * (default: agora). PREFIXADO ou intervalo inválido → 1.
 */
export async function accruedIndexFactor(
  indexador: IndexadorDivida | string,
  fromMonth: string | null | undefined,
  asOf: Date = new Date(),
): Promise<number> {
  if (indexador === 'PREFIXADO' || !fromMonth) return 1;
  if (indexador !== 'TR' && indexador !== 'IPCA' && indexador !== 'CDI') return 1;

  const start = monthStartUTC(fromMonth);
  if (!Number.isFinite(start.getTime()) || start.getTime() >= asOf.getTime()) return 1;

  const cacheKey = `${indexador}|${fromMonth}|${asOf.toISOString().slice(0, 10)}`;
  const cached = factorCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let rows: Array<{ value: unknown }> = [];
  try {
    rows = await prisma.economicIndex.findMany({
      where: { indexType: indexador, date: { gte: start, lte: asOf } },
      orderBy: { date: 'asc' },
      select: { value: true },
    });
  } catch (error) {
    // P2021 (tabela ausente em ambiente parcial) → sem correção, como no
    // safeFindMany do fixedIncomePricing.
    const prismaError = error as Prisma.PrismaClientKnownRequestError;
    if (prismaError?.code !== 'P2021') throw error;
    return 1;
  }

  let factor = 1;
  for (const row of rows) {
    const val = Number(row.value);
    if (Number.isFinite(val)) factor *= 1 + val;
  }

  factorCache.set(cacheKey, factor, FACTOR_TTL_MS);
  return factor;
}
