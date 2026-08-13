/**
 * Taxas econômicas pontuais (% a.a.) derivadas da tabela EconomicIndex.
 *
 * Extraído de /api/planejamento/contexto pra ser compartilhado com a Saúde
 * Financeira. Diferente de /api/analises/indices (séries normalizadas pra
 * gráfico), aqui são VALORES ÚNICOS: o CDI anualizado mais recente e o IPCA
 * acumulado 12m.
 *
 * Unidades no banco (ver economicIndexesIngestion.ts): CDI_ANUALIZADO já vem
 * em % a.a.; IPCA é fração mensal (0.0045 = 0,45%/mês).
 */

import { prisma } from '@/lib/prisma';

/** Inflação fallback (% a.a., meta BCB) quando a série IPCA está indisponível. */
export const DEFAULT_INFLACAO_AA = 4.5;

const round1 = (v: number) => Math.round(v * 10) / 10;

/** CDI anualizado mais recente (% a.a.), validado. Null se indisponível. */
export async function getCdiAnualizado(): Promise<number | null> {
  const latest = await prisma.economicIndex.findFirst({
    where: { indexType: 'CDI_ANUALIZADO' },
    orderBy: { date: 'desc' },
    select: { value: true },
  });
  if (!latest) return null;
  const cdi = Number(latest.value);
  if (!Number.isFinite(cdi) || cdi <= 0 || cdi >= 100) return null;
  return round1(cdi);
}

/**
 * Inflação acumulada nos últimos 12 meses (% a.a.), compondo as variações
 * mensais do IPCA. Null se não houver 12 registros — o consumidor cai no
 * fallback (DEFAULT_INFLACAO_AA).
 */
export async function getInflacao12m(): Promise<number | null> {
  const records = await prisma.economicIndex.findMany({
    where: { indexType: 'IPCA' },
    orderBy: { date: 'desc' },
    take: 12,
    select: { value: true },
  });
  if (records.length < 12) return null;
  let acumulado = 1;
  for (const r of records) {
    const v = Number(r.value);
    if (!Number.isFinite(v)) return null;
    acumulado *= 1 + v;
  }
  return round1((acumulado - 1) * 100);
}
