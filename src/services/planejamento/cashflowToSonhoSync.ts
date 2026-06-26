import { prisma } from '@/lib/prisma';
import type { Status } from './planejamentoSonhos';

/**
 * Sync REVERSO (caixa → sonho): deriva o "Realizado" de um objetivo a partir das
 * células VERDES (realizadas) da linha-espelho no fluxo de caixa.
 *
 * Direção complementar ao `sonhoCashflowSync` (sonho → caixa, que escreve o
 * aporte PLANEJADO). Aqui, conforme o cliente lança o valor real no mês e pinta
 * a célula de verde ("Recebido"), derivamos uma `PlanejamentoObjetivoEntry`:
 *  - `aporte`  = valor da célula verde.
 *  - `balance` = saldo composto pela taxa do objetivo sobre os aportes verdes
 *                (saldo[n] = saldo[n-1]·(1+rate) + aporte[n], saldo[0]=available).
 *
 * Precedência: entries `source='manual'` (modal "Registrar Mês") NUNCA são
 * tocadas. O sync só cria/atualiza/remove entries `source='auto'`.
 */

/** Verde "Recebido" do ColorPickerButton — marca a célula como realizada. */
export const REALIZADO_COLOR = '#76933C';

const ENTRY_SOURCE_AUTO = 'auto';
const ENTRY_SOURCE_MANUAL = 'manual';

/** Decimal | number → number (Prisma serializa Decimal como objeto). */
function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** YYYY-MM a partir de (year, month0-based). */
function monthStr(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, '0')}`;
}

/**
 * Re-deriva as entries `auto` de um objetivo a partir das células verdes da sua
 * linha no fluxo de caixa. Idempotente. No-op se o objetivo não tem linha-espelho.
 */
export async function syncCashflowToObjetivo(userId: string, objetivoId: string): Promise<void> {
  const objetivo = await prisma.planejamentoObjetivo.findFirst({
    where: { id: objetivoId, userId },
    select: {
      id: true,
      target: true,
      available: true,
      rate: true,
      status: true,
      cashflowItem: { select: { id: true } },
      entries: { select: { month: true, balance: true, source: true } },
    },
  });
  if (!objetivo || !objetivo.cashflowItem) return;

  const target = toNum(objetivo.target);
  const available = toNum(objetivo.available);
  const rate = toNum(objetivo.rate);

  // Células verdes (realizadas) da linha-espelho, ordenadas cronologicamente.
  const values = await prisma.cashflowValue.findMany({
    where: { itemId: objetivo.cashflowItem.id, userId, color: REALIZADO_COLOR },
    select: { year: true, month: true, value: true },
  });
  const realized = values
    .map((v) => ({ month: monthStr(v.year, v.month), aporte: toNum(v.value) }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // Meses já cobertos por registro MANUAL — manual vence, auto não os toca.
  const manualMonths = new Set(
    objetivo.entries.filter((e) => e.source === ENTRY_SOURCE_MANUAL).map((e) => e.month),
  );

  // Trajetória de saldo composta sobre os aportes verdes (independe do manual).
  const greenMonths: string[] = [];
  const autoEntries: { month: string; aporte: number; balance: number }[] = [];
  let bal = available;
  for (const r of realized) {
    bal = bal * (1 + rate) + r.aporte;
    const balance = Math.round(bal * 100) / 100;
    greenMonths.push(r.month);
    if (!manualMonths.has(r.month)) {
      autoEntries.push({ month: r.month, aporte: Math.round(r.aporte * 100) / 100, balance });
    }
  }

  // Próximo status: olha o último saldo conhecido (manual ou auto).
  const remaining = [
    ...objetivo.entries
      .filter((e) => e.source === ENTRY_SOURCE_MANUAL)
      .map((e) => ({ month: e.month, balance: toNum(e.balance) })),
    ...autoEntries.map((e) => ({ month: e.month, balance: e.balance })),
  ];
  const nextStatus = resolveStatus(objetivo.status as Status, remaining, target);

  await prisma.$transaction([
    // Remove entries auto de meses que não estão mais verdes.
    prisma.planejamentoObjetivoEntry.deleteMany({
      where: { objetivoId, source: ENTRY_SOURCE_AUTO, month: { notIn: greenMonths } },
    }),
    // Cria/atualiza as entries auto dos meses verdes (exceto os manuais).
    ...autoEntries.map((e) =>
      prisma.planejamentoObjetivoEntry.upsert({
        where: { objetivoId_month: { objetivoId, month: e.month } },
        create: {
          objetivoId,
          month: e.month,
          aporte: e.aporte,
          balance: e.balance,
          source: ENTRY_SOURCE_AUTO,
        },
        update: { aporte: e.aporte, balance: e.balance, source: ENTRY_SOURCE_AUTO },
      }),
    ),
    prisma.planejamentoObjetivo.update({
      where: { id: objetivoId },
      data: nextStatus !== objetivo.status ? { status: nextStatus } : {},
    }),
  ]);
}

/**
 * Status derivado do último saldo. Promove "Em espera"→"Iniciado" no 1º
 * realizado, "Concluído" quando saldo ≥ meta, e desfaz "Concluído" stale.
 * Espelha autoStatusOnEntry + deriveStatusAfterEntryDelete sobre o conjunto.
 */
function resolveStatus(
  current: Status,
  remaining: Array<{ month: string; balance: number }>,
  target: number,
): Status {
  if (remaining.length === 0) {
    return current === 'Concluído' ? 'Em espera' : current;
  }
  const latest = [...remaining].sort((a, b) => a.month.localeCompare(b.month)).at(-1)!;
  if (target > 0 && latest.balance >= target) return 'Concluído';
  if (current === 'Em espera') return 'Iniciado';
  if (current === 'Concluído') return 'Iniciado';
  return current;
}
