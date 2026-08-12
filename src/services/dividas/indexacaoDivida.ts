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
 * Semântica por índice (verificada nos dados em 2026-08):
 *  - CDI (série 12): taxa DIÁRIA por dia útil (~0.000525) → compõe linha a
 *    linha, padrão fixedIncomePricing.
 *  - IPCA (série 433): variação MENSAL, uma linha no dia 1º → compõe linha
 *    a linha (cada linha já é um mês).
 *  - TR (série 226): taxa DO PERÍODO de ~30 dias publicada TODO DIA
 *    (~0.0017, inclusive fim de semana). Compor diariamente inflaria ~30×;
 *    amostra-se UMA observação por mês (a primeira) e compõe-se mensalmente.
 * Série ausente/vazia → fator 1 (degrada sem corrigir).
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

  let rows: Array<{ date: Date; value: unknown }> = [];
  try {
    rows = await prisma.economicIndex.findMany({
      where: { indexType: indexador, date: { gte: start, lte: asOf } },
      orderBy: { date: 'asc' },
      select: { date: true, value: true },
    });
  } catch (error) {
    // P2021 (tabela ausente em ambiente parcial) → sem correção, como no
    // safeFindMany do fixedIncomePricing.
    const prismaError = error as Prisma.PrismaClientKnownRequestError;
    if (prismaError?.code !== 'P2021') throw error;
    return 1;
  }

  // TR: uma observação por mês (a primeira), porque cada linha já é a taxa
  // de um período de ~30 dias — ver doc do módulo.
  if (indexador === 'TR') {
    const firstOfMonth = new Map<string, number>();
    for (const row of rows) {
      const d = row.date;
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      if (!firstOfMonth.has(key)) {
        const val = Number(row.value);
        if (Number.isFinite(val)) firstOfMonth.set(key, val);
      }
    }
    rows = Array.from(firstOfMonth.values()).map((value) => ({ date: start, value }));
  }

  let factor = 1;
  for (const row of rows) {
    const val = Number(row.value);
    if (Number.isFinite(val)) factor *= 1 + val;
  }

  factorCache.set(cacheKey, factor, FACTOR_TTL_MS);
  return factor;
}
