/**
 * Dívidas — correção pelo índice REALIZADO (TR/IPCA/IGPM/CDI).
 *
 * O cronograma SAC/Price é sempre em moeda constante (amortizacao.ts); este
 * módulo devolve fatores acumulados do índice realizado pra corrigir a
 * exibição:
 *  - `accruedIndexFactor` — fator único do 1º vencimento até hoje (corrige o
 *    saldo devedor atual).
 *  - `monthlyIndexFactors` — fator POR MÊS do cronograma, na data de
 *    aniversário de cada parcela: a parcela do mês M é corrigida pelo índice
 *    realizado entre o 1º vencimento e M (exclusive). Meses futuros carregam
 *    o último fator realizado (sem projeção) — conforme o BACEN publica novos
 *    valores, a correção avança sozinha.
 * Ambos são aproximações de exibição declaradas na UI — contratos reais
 * (ex.: TR em financiamento imobiliário) corrigem o saldo antes de cada
 * amortização.
 *
 * Fonte: EconomicIndex (ingestão BACEN, ver economicIndexesIngestion.ts).
 * Semântica por índice (verificada nos dados em 2026-08):
 *  - CDI (série 12): taxa DIÁRIA por dia útil (~0.000525) → compõe linha a
 *    linha, padrão fixedIncomePricing.
 *  - IPCA (série 433) e IGPM (série 189): variação MENSAL, uma linha no dia
 *    1º → compõe linha a linha (cada linha já é um mês).
 *  - TR (série 226): taxa DO PERÍODO de ~30 dias publicada TODO DIA
 *    (~0.0017, inclusive fim de semana). Compor diariamente inflaria ~30×;
 *    amostra-se UMA observação por mês (a primeira) e compõe-se mensalmente.
 * Série ausente/vazia → fator 1 (degrada sem corrigir).
 */

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { getTtlCache } from '@/lib/simpleTtlCache';

export type IndexadorDivida = 'PREFIXADO' | 'TR' | 'IPCA' | 'IGPM' | 'CDI';

const INDEXADORES_CORRIGIVEIS = new Set(['TR', 'IPCA', 'IGPM', 'CDI']);

/** True quando o indexador tem série realizável no EconomicIndex. */
export function isIndexadorCorrigivel(indexador: string | null | undefined): boolean {
  return indexador != null && INDEXADORES_CORRIGIVEIS.has(indexador);
}

const FACTOR_TTL_MS = 60 * 60 * 1000; // 1h — ingestão BACEN roda no máx. 1×/dia
const factorCache = getTtlCache<number>('dividas:indexFactor');
const monthlyCache = getTtlCache<Record<string, number>>('dividas:indexFactorsMensais');

/** Primeiro dia (UTC) de um YYYY-MM. */
const monthStartUTC = (yearMonth: string): Date => {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
};

/** YYYY-MM da data (UTC). */
const ymOf = (d: Date): string =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/** YYYY-MM + n meses. */
const addYm = (ym: string, n: number): string => {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
};

/** Busca as observações do índice no intervalo; tabela ausente → []. */
async function fetchIndexRows(
  indexador: string,
  start: Date,
  end: Date,
): Promise<Array<{ date: Date; value: unknown }>> {
  try {
    return await prisma.economicIndex.findMany({
      where: { indexType: indexador, date: { gte: start, lte: end } },
      orderBy: { date: 'asc' },
      select: { date: true, value: true },
    });
  } catch (error) {
    // P2021 (tabela ausente em ambiente parcial) → sem correção, como no
    // safeFindMany do fixedIncomePricing.
    const prismaError = error as Prisma.PrismaClientKnownRequestError;
    if (prismaError?.code !== 'P2021') throw error;
    return [];
  }
}

/**
 * Contribuição multiplicativa de cada mês (YYYY-MM → Π(1+v) das observações
 * do mês), respeitando a semântica por índice (TR amostra a 1ª observação).
 */
function monthContributions(
  indexador: string,
  rows: Array<{ date: Date; value: unknown }>,
): Map<string, number> {
  const contrib = new Map<string, number>();
  for (const row of rows) {
    const val = Number(row.value);
    if (!Number.isFinite(val)) continue;
    if (!(row.date instanceof Date) || !Number.isFinite(row.date.getTime())) continue;
    const key = ymOf(row.date);
    if (indexador === 'TR') {
      // Uma observação por mês (a primeira) — cada linha já é a taxa de um
      // período de ~30 dias; ver doc do módulo.
      if (!contrib.has(key)) contrib.set(key, 1 + val);
    } else {
      contrib.set(key, (contrib.get(key) ?? 1) * (1 + val));
    }
  }
  return contrib;
}

/**
 * Fator acumulado do índice de `fromMonth` (YYYY-MM, inclusive) até `asOf`
 * (default: agora). PREFIXADO ou intervalo inválido → 1.
 */
export async function accruedIndexFactor(
  indexador: IndexadorDivida | string,
  fromMonth: string | null | undefined,
  asOf: Date = new Date(),
): Promise<number> {
  if (!isIndexadorCorrigivel(indexador) || !fromMonth) return 1;

  const start = monthStartUTC(fromMonth);
  if (!Number.isFinite(start.getTime()) || start.getTime() >= asOf.getTime()) return 1;

  const cacheKey = `${indexador}|${fromMonth}|${asOf.toISOString().slice(0, 10)}`;
  const cached = factorCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const rows = await fetchIndexRows(indexador, start, asOf);
  let factor = 1;
  if (indexador === 'TR') {
    for (const c of monthContributions(indexador, rows).values()) factor *= c;
  } else {
    // CDI/IPCA/IGPM: Π(1+v) linha a linha — cada linha já é uma observação.
    for (const row of rows) {
      const val = Number(row.value);
      if (Number.isFinite(val)) factor *= 1 + val;
    }
  }

  factorCache.set(cacheKey, factor, FACTOR_TTL_MS);
  return factor;
}

/**
 * Fator de correção POR MÊS de cronograma, na data de aniversário: o mês M
 * recebe o acumulado do índice realizado em [fromMonth, M) — a 1ª parcela
 * (M = fromMonth) fica no valor contratual (fator 1) e cada aniversário
 * seguinte compõe mais um mês realizado. Meses sem observação (futuro, ou
 * série ainda não publicada) repetem o último fator — sem projeção.
 *
 * @returns Record YYYY-MM → fator, cobrindo [fromMonth, untilMonth].
 *          PREFIXADO/intervalo inválido → {} (caller trata como fator 1).
 */
export async function monthlyIndexFactors(
  indexador: IndexadorDivida | string,
  fromMonth: string | null | undefined,
  untilMonth: string,
  asOf: Date = new Date(),
): Promise<Record<string, number>> {
  if (!isIndexadorCorrigivel(indexador) || !fromMonth) return {};

  const start = monthStartUTC(fromMonth);
  if (!Number.isFinite(start.getTime()) || fromMonth > untilMonth) return {};

  const cacheKey = `${indexador}|${fromMonth}|${untilMonth}|${asOf.toISOString().slice(0, 10)}`;
  const cached = monthlyCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const rows = start.getTime() < asOf.getTime() ? await fetchIndexRows(indexador, start, asOf) : [];
  const contrib = monthContributions(indexador, rows);

  const factors: Record<string, number> = {};
  let cum = 1;
  for (let ym = fromMonth; ym <= untilMonth; ym = addYm(ym, 1)) {
    factors[ym] = cum;
    cum *= contrib.get(ym) ?? 1;
  }

  monthlyCache.set(cacheKey, factors, FACTOR_TTL_MS);
  return factors;
}
