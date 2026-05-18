/**
 * Debug: instrumenta o cálculo do pricer para um FI 100% CDI e compara com o
 * cumulado puro do CDI no mesmo período. Mostra quantos dias do timeline
 * recebem CDI (vs quantos rows existem) pra detectar misalignment de chave.
 *
 * Run: npx tsx scripts/debug-cdi-100pct.ts <assetId|symbol>
 */
import { PrismaClient } from '@prisma/client';
import {
  buildDailyTimeline,
  normalizeDateStart,
} from '@/services/portfolio/patrimonioHistoricoBuilder';

const prisma = new PrismaClient();

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Uso: npx tsx scripts/debug-cdi-100pct.ts <assetId|symbol>');
    process.exit(1);
  }

  const asset = await prisma.asset.findFirst({
    where: { OR: [{ id: arg }, { symbol: arg }] },
  });
  if (!asset) {
    console.error(`Asset não encontrado: ${arg}`);
    process.exit(1);
  }

  const fi = await prisma.fixedIncomeAsset.findUnique({
    where: { assetId: asset.id },
    include: { asset: true },
  });
  if (!fi) {
    console.error(`FixedIncomeAsset não encontrado para asset ${asset.id}`);
    process.exit(1);
  }

  console.log(`Asset:    ${asset.name} (${asset.symbol})`);
  console.log(`Indexer:  ${fi.indexer} ${fi.indexerPercent}%   annualRate=${fi.annualRate}`);
  console.log(`Period:   ${fi.startDate.toISOString()} → today  (raw startDate stored in DB)`);
  console.log(`Invested: R$ ${fi.investedAmount.toFixed(2)}\n`);

  const today = new Date();
  const startNorm = normalizeDateStart(new Date(fi.startDate));
  const todayNorm = normalizeDateStart(today);
  const startTs = startNorm.getTime();
  const timeline = buildDailyTimeline(startNorm, todayNorm);

  console.log(`startNorm:  ${startNorm.toString()}  ts=${startTs}`);
  console.log(`todayNorm:  ${todayNorm.toString()}`);
  console.log(`Timeline business days: ${timeline.length}\n`);

  const cdiRows = await prisma.economicIndex.findMany({
    where: {
      indexType: 'CDI',
      date: { gte: fi.startDate, lte: today },
    },
    orderBy: { date: 'asc' },
  });
  console.log(`CDI rows in period (DB): ${cdiRows.length}`);

  const cdiMap = new Map<number, number>();
  cdiRows.forEach((row) => {
    const v = Number(row.value);
    if (Number.isFinite(v)) cdiMap.set(normalizeDateStart(row.date).getTime(), v);
  });
  console.log(`CDI map keys (normalized): ${cdiMap.size}`);

  // 1) Replica EXATA da lógica do pricer
  let pricerFactor = 1;
  let pricerHits = 0;
  let pricerMisses = 0;
  for (const day of timeline) {
    if (day < startTs) continue;
    if (day > startTs) {
      const cdiRate = cdiMap.get(day);
      if (cdiRate != null && Number.isFinite(cdiRate)) {
        pricerFactor *= 1 + cdiRate;
        pricerHits++;
      } else {
        pricerMisses++;
      }
    }
  }
  console.log(`\n[Pricer logic] hits=${pricerHits}  misses=${pricerMisses}`);
  console.log(
    `  factor = ${pricerFactor.toFixed(6)}  → R$ ${(fi.investedAmount * pricerFactor).toFixed(2)}  (${((pricerFactor - 1) * 100).toFixed(2)}%)`,
  );

  // 2) Cumulado puro: percorre TODOS os rows (ignora timeline)
  let cumFactor = 1;
  for (const row of cdiRows) {
    const v = Number(row.value);
    if (Number.isFinite(v)) cumFactor *= 1 + v;
  }
  console.log(
    `\n[Pure cumulative CDI rows] count=${cdiRows.length}  factor=${cumFactor.toFixed(6)}  → R$ ${(fi.investedAmount * cumFactor).toFixed(2)}  (${((cumFactor - 1) * 100).toFixed(2)}%)`,
  );

  // 3) Cumulado mas EXCLUINDO o row do startDate (compara fairmente com pricer)
  let cumFactorExStart = 1;
  for (const row of cdiRows) {
    const rowKey = normalizeDateStart(row.date).getTime();
    if (rowKey === startTs) continue;
    const v = Number(row.value);
    if (Number.isFinite(v)) cumFactorExStart *= 1 + v;
  }
  console.log(
    `[Pure cumulative ex-startDate]  factor=${cumFactorExStart.toFixed(6)}  → R$ ${(fi.investedAmount * cumFactorExStart).toFixed(2)}  (${((cumFactorExStart - 1) * 100).toFixed(2)}%)`,
  );

  // 4) Quantos rows do CDI NÃO casam com o timeline (misses do pricer)?
  const timelineSet = new Set(timeline);
  let cdiNotInTimeline = 0;
  for (const row of cdiRows) {
    const k = normalizeDateStart(row.date).getTime();
    if (!timelineSet.has(k)) cdiNotInTimeline++;
  }
  console.log(`\nCDI rows whose normalized date is NOT in timeline: ${cdiNotInTimeline}`);

  // 5) Mostra alguns exemplos de keys que não casam
  const sampleMismatches: string[] = [];
  for (const row of cdiRows) {
    const k = normalizeDateStart(row.date).getTime();
    if (!timelineSet.has(k) && sampleMismatches.length < 6) {
      sampleMismatches.push(
        `  row.date=${row.date.toISOString()}  normalized=${new Date(k).toString()}`,
      );
    }
  }
  if (sampleMismatches.length > 0) {
    console.log('Exemplos:');
    sampleMismatches.forEach((s) => console.log(s));
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    void prisma.$disconnect();
  });
