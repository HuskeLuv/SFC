/**
 * Varredura: pra TODA renda fixa do usuário, projeta o impacto do fix de feriados.
 * Mostra quais ativos são afetados (PRE/HIB com annualRate>0) e quais não são (CDI puro).
 *
 * Run: npx tsx scripts/simulate-fi-fix-all.ts <userId>
 *      (sem userId, lista usuários disponíveis)
 */
import { PrismaClient } from '@prisma/client';
import {
  buildDailyTimeline,
  normalizeDateStart,
  buildFixedIncomeFactorSeries,
  type FixedIncomeAssetWithAsset,
} from '@/services/portfolio/patrimonioHistoricoBuilder';

const prisma = new PrismaClient();
const DAY_MS = 24 * 60 * 60 * 1000;

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;

function easterUtc(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function feriadosB3(year: number): number[] {
  const fixed: Array<[number, number]> = [
    [0, 1],
    [3, 21],
    [4, 1],
    [8, 7],
    [9, 12],
    [10, 2],
    [10, 15],
    [11, 25],
  ];
  const dates = fixed.map(([m, d]) => Date.UTC(year, m, d));
  const easter = easterUtc(year).getTime();
  dates.push(easter - 2 * DAY_MS, easter - 48 * DAY_MS, easter - 47 * DAY_MS, easter + 60 * DAY_MS);
  return dates.sort((a, b) => a - b);
}

async function main() {
  const userId = process.argv[2];
  if (!userId) {
    const users = await prisma.user.findMany({ select: { id: true, email: true } });
    console.log('Usuários disponíveis:');
    users.forEach((u) => console.log(`  ${u.id}  ${u.email}`));
    process.exit(0);
  }

  const fis = await prisma.fixedIncomeAsset.findMany({
    where: { userId },
    include: { asset: true },
    orderBy: { startDate: 'asc' },
  });

  if (fis.length === 0) {
    console.log('Nenhum FixedIncomeAsset encontrado pra esse usuário.');
    process.exit(0);
  }

  const today = new Date();
  const todayNorm = normalizeDateStart(today);

  // Pré-carrega rates
  const earliestStart = fis.reduce((min, fi) => (fi.startDate < min ? fi.startDate : min), today);
  const cdiRows = await prisma.economicIndex.findMany({
    where: { indexType: 'CDI', date: { gte: earliestStart, lte: today } },
    orderBy: { date: 'asc' },
  });
  const cdiByKey = new Map<number, number>();
  cdiRows.forEach((row) => {
    const v = Number(row.value);
    if (Number.isFinite(v)) cdiByKey.set(normalizeDateStart(row.date).getTime(), v);
  });
  const ipcaRows = await prisma.economicIndex.findMany({
    where: { indexType: 'IPCA', date: { gte: earliestStart, lte: today } },
    orderBy: { date: 'asc' },
  });
  const ipcaMap = new Map<string, number>();
  ipcaRows.forEach((row) => {
    const v = Number(row.value);
    if (!Number.isFinite(v)) return;
    const d = new Date(row.date);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    ipcaMap.set(key, v);
  });

  console.log(
    '═════════════════════════════════════════════════════════════════════════════════════════════',
  );
  console.log(`  IMPACTO POR ATIVO (${fis.length} FI(s))`);
  console.log(
    '═════════════════════════════════════════════════════════════════════════════════════════════',
  );
  console.log(
    'tipo'.padEnd(10) +
      'indexer'.padEnd(8) +
      'pct'.padEnd(6) +
      'rate%'.padEnd(7) +
      'invest'.padEnd(13) +
      'atual'.padEnd(13) +
      'projetado'.padEnd(13) +
      'Δ saldo'.padEnd(12) +
      'Δ%'.padEnd(8) +
      'afetado',
  );
  console.log('─'.repeat(110));

  let totalCurrent = 0;
  let totalFixed = 0;
  let affectedCount = 0;

  for (const fi of fis) {
    const startNorm = normalizeDateStart(new Date(fi.startDate));
    const startYear = startNorm.getUTCFullYear();
    const endYear = todayNorm.getUTCFullYear();
    const holidays = new Set<number>();
    for (let y = startYear; y <= endYear; y++) {
      feriadosB3(y).forEach((ts) => holidays.add(ts));
    }
    const timelineCurrent = buildDailyTimeline(startNorm, todayNorm);
    const timelineFixed = timelineCurrent.filter((ts) => !holidays.has(ts));

    const ctx = { cdi: cdiByKey, ipca: ipcaMap };
    const fiTyped = fi as unknown as FixedIncomeAssetWithAsset;
    const factorsCurrent = buildFixedIncomeFactorSeries(fiTyped, timelineCurrent, ctx);
    const factorsFixed = buildFixedIncomeFactorSeries(fiTyped, timelineFixed, ctx);
    const fCurrent = factorsCurrent.get(timelineCurrent[timelineCurrent.length - 1]) ?? 1;
    const fFixed = factorsFixed.get(timelineFixed[timelineFixed.length - 1]) ?? 1;
    const vCurrent = fi.investedAmount * fCurrent;
    const vFixed = fi.investedAmount * fFixed;
    const delta = vFixed - vCurrent;
    const deltaPct = vFixed / vCurrent - 1;
    const afetado = Math.abs(delta) > 0.01;

    totalCurrent += vCurrent;
    totalFixed += vFixed;
    if (afetado) affectedCount++;

    console.log(
      String(fi.type).slice(0, 9).padEnd(10) +
        String(fi.indexer ?? '—').padEnd(8) +
        String(fi.indexerPercent ?? 0).padEnd(6) +
        String(fi.annualRate).padEnd(7) +
        fmtBRL(fi.investedAmount).padEnd(13) +
        fmtBRL(vCurrent).padEnd(13) +
        fmtBRL(vFixed).padEnd(13) +
        (delta >= 0 ? '+' : '') +
        fmtBRL(delta).padEnd(11) +
        fmtPct(deltaPct).padEnd(8) +
        (afetado ? '✓' : '—'),
    );
  }

  console.log('─'.repeat(110));
  console.log(
    'TOTAL'.padEnd(45) +
      fmtBRL(totalCurrent).padEnd(13) +
      fmtBRL(totalFixed).padEnd(13) +
      fmtBRL(totalFixed - totalCurrent).padEnd(12) +
      fmtPct(totalFixed / totalCurrent - 1),
  );
  console.log(`\nAtivos AFETADOS pelo fix: ${affectedCount}/${fis.length}`);

  // Breakdown por tipo
  console.log(
    '\n═════════════════════════════════════════════════════════════════════════════════════════════',
  );
  console.log('  RESUMO POR PERFIL DE INDEXAÇÃO');
  console.log(
    '═════════════════════════════════════════════════════════════════════════════════════════════',
  );
  const buckets = new Map<string, { count: number; affected: number }>();
  for (const fi of fis) {
    const bucket = `${fi.indexer ?? 'PRE'}${fi.annualRate > 0 ? ' + spread' : ''}${String(fi.type).endsWith('_HIB') ? ' (hib)' : ''}`;
    const cur = buckets.get(bucket) ?? { count: 0, affected: 0 };
    cur.count++;
    buckets.set(bucket, cur);
  }
  buckets.forEach((v, k) => console.log(`  ${k.padEnd(30)}${v.count} ativo(s)`));

  console.log(
    '\nNOTA: Ativos sem renda fixa (ações/ETFs/FIIs/cripto/tesouro/imóveis/reservas) NÃO',
  );
  console.log(
    'estão neste relatório porque o bug não os afeta — eles não compõem `dailyPreFactor`',
  );
  console.log(
    'por iteração de timeline. Tesouro Direto usa razão de PU; ações/ETFs usam preço BRAPI;',
  );
  console.log('CDI puro tem filtro implícito (BACEN não publica em feriado).');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    void prisma.$disconnect();
  });
