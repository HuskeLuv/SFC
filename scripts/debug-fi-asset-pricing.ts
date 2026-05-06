/**
 * Diagnóstico de cálculo de renda fixa: pega um ativo (por id, symbol ou
 * portfolioId) e dissecta o cálculo do `getCurrentValue` do pricer dia-a-dia.
 *
 * - Imprime parâmetros do FixedIncomeAsset (indexer, %, annualRate, type, datas)
 * - Roda o pricer real (mesmo código que /carteira/renda-fixa usa)
 * - Reproduz a iteração do `buildFixedIncomeFactorSeries` com log por dia
 * - Compara: cumulativo puro de CDI (todos os rows do DB), nosso pricer,
 *   misses do timeline (chaves que não casam), e quantos compoundings extras/perdidos
 *
 * Run: npx tsx scripts/debug-fi-asset-pricing.ts <symbol|assetId|portfolioId>
 *
 * Exemplo: npx tsx scripts/debug-fi-asset-pricing.ts RENDA-FIXA-1778021145794-i5ori16
 */
import { PrismaClient } from '@prisma/client';
import {
  buildDailyTimeline,
  normalizeDateStart,
  buildFixedIncomeFactorSeries,
} from '@/services/portfolio/patrimonioHistoricoBuilder';

const prisma = new PrismaClient();

type FixedIncomeAssetWithAsset = Parameters<typeof buildFixedIncomeFactorSeries>[0];

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtPct = (v: number) => `${(v * 100).toFixed(4)}%`;

async function findAsset(arg: string) {
  // Tenta como Asset (symbol ou id)
  const byAsset = await prisma.asset.findFirst({
    where: { OR: [{ id: arg }, { symbol: arg }] },
  });
  if (byAsset) return { asset: byAsset, portfolio: null };

  // Tenta como Portfolio id
  const portfolio = await prisma.portfolio.findUnique({
    where: { id: arg },
    include: { asset: true },
  });
  if (portfolio?.asset) return { asset: portfolio.asset, portfolio };

  return null;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Uso: npx tsx scripts/debug-fi-asset-pricing.ts <symbol|assetId|portfolioId>');
    process.exit(1);
  }

  const found = await findAsset(arg);
  if (!found) {
    console.error(`Asset/Portfolio não encontrado: ${arg}`);
    process.exit(1);
  }
  const { asset } = found;

  const fi = await prisma.fixedIncomeAsset.findUnique({
    where: { assetId: asset.id },
    include: { asset: true },
  });
  if (!fi) {
    console.error(`FixedIncomeAsset não encontrado para asset ${asset.id} (${asset.symbol})`);
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════');
  console.log('  PARÂMETROS DO ATIVO');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Symbol:           ${asset.symbol}`);
  console.log(`Name:             ${asset.name}`);
  console.log(`Type:             ${asset.type}`);
  console.log(`FI.type:          ${fi.type}`);
  console.log(`FI.indexer:       ${fi.indexer}`);
  console.log(`FI.indexerPercent:${fi.indexerPercent}`);
  console.log(`FI.annualRate:    ${fi.annualRate}`);
  console.log(`FI.taxExempt:     ${fi.taxExempt}`);
  console.log(`FI.startDate:     ${fi.startDate.toISOString()}`);
  console.log(`FI.maturityDate:  ${fi.maturityDate.toISOString()}`);
  console.log(`FI.investedAmount:${fmtBRL(fi.investedAmount)}`);
  console.log(`FI.tesouroBondType:${fi.tesouroBondType ?? '—'}`);

  // Portfolio (quantity)
  const portfolio = await prisma.portfolio.findFirst({
    where: { userId: fi.userId, assetId: asset.id },
  });
  console.log(
    `Portfolio:        qty=${portfolio?.quantity}  avgPrice=${portfolio?.avgPrice}  totalInvested=${portfolio?.totalInvested}`,
  );

  // Transações
  const txs = await prisma.stockTransaction.findMany({
    where: { userId: fi.userId, assetId: asset.id },
    orderBy: { date: 'asc' },
  });
  console.log(`\nTransações (${txs.length}):`);
  for (const tx of txs) {
    console.log(
      `  ${tx.type}  ${tx.date.toISOString()}  qty=${tx.quantity}  price=${tx.price}  total=${tx.total}`,
    );
  }

  // ─────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  TIMELINE & CDI SOURCE');
  console.log('═══════════════════════════════════════════════════');
  const today = new Date();
  const startNorm = normalizeDateStart(new Date(fi.startDate));
  const todayNorm = normalizeDateStart(today);
  const startTs = startNorm.getTime();
  const timeline = buildDailyTimeline(startNorm, todayNorm);
  console.log(`startNorm: ${startNorm.toISOString()}`);
  console.log(`todayNorm: ${todayNorm.toISOString()}`);
  console.log(`Timeline business days: ${timeline.length}`);

  const cdiRows = await prisma.economicIndex.findMany({
    where: { indexType: 'CDI', date: { gte: fi.startDate, lte: today } },
    orderBy: { date: 'asc' },
  });
  console.log(`CDI rows (DB): ${cdiRows.length}`);

  const cdiByKey = new Map<number, number>();
  cdiRows.forEach((row) => {
    const v = Number(row.value);
    if (Number.isFinite(v)) {
      cdiByKey.set(normalizeDateStart(row.date).getTime(), v);
    }
  });
  console.log(`CDI map keys (after normalizeDateStart): ${cdiByKey.size}`);

  // CDI rate range sanity
  const rates = Array.from(cdiByKey.values());
  const minRate = Math.min(...rates);
  const maxRate = Math.max(...rates);
  const meanRate = rates.reduce((a, b) => a + b, 0) / rates.length;
  console.log(
    `CDI daily rate range: min=${fmtPct(minRate)}  max=${fmtPct(maxRate)}  mean=${fmtPct(meanRate)}`,
  );
  console.log(
    `Annualized (mean): ${fmtPct(Math.pow(1 + meanRate, 252) - 1)}  (252 BD compounding)`,
  );

  // ─────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  TIMELINE ↔ CDI ALIGNMENT CHECK');
  console.log('═══════════════════════════════════════════════════');
  const timelineSet = new Set(timeline);
  const cdiKeysNotInTimeline: number[] = [];
  const timelineDaysWithoutCdi: number[] = [];
  for (const k of cdiByKey.keys()) {
    if (!timelineSet.has(k)) cdiKeysNotInTimeline.push(k);
  }
  for (const day of timeline) {
    if (!cdiByKey.has(day) && day >= startTs) timelineDaysWithoutCdi.push(day);
  }
  console.log(`CDI keys NOT in timeline: ${cdiKeysNotInTimeline.length}`);
  console.log(`Timeline days WITHOUT CDI (>= startTs): ${timelineDaysWithoutCdi.length}`);
  if (cdiKeysNotInTimeline.length > 0 && cdiKeysNotInTimeline.length <= 10) {
    console.log('  Mismatches:');
    cdiKeysNotInTimeline.forEach((k) =>
      console.log(`    ${new Date(k).toISOString()} (CDI: ${cdiByKey.get(k)})`),
    );
  }
  if (timelineDaysWithoutCdi.length > 0 && timelineDaysWithoutCdi.length <= 10) {
    console.log('  Timeline holes:');
    timelineDaysWithoutCdi.forEach((k) => console.log(`    ${new Date(k).toISOString()}`));
  }

  // ─────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  PRICER REAL (mesmo código de produção)');
  console.log('═══════════════════════════════════════════════════');
  const ipcaRows = await prisma.economicIndex.findMany({
    where: { indexType: 'IPCA', date: { gte: fi.startDate, lte: today } },
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

  const factors = buildFixedIncomeFactorSeries(fi as FixedIncomeAssetWithAsset, timeline, {
    cdi: cdiByKey,
    ipca: ipcaMap,
  });
  const lastDay = timeline[timeline.length - 1];
  const finalFactor = factors.get(lastDay) ?? 1;
  const valorPricer = fi.investedAmount * finalFactor;
  console.log(`Final factor: ${finalFactor.toFixed(8)}`);
  console.log(`Valor pricer: ${fmtBRL(valorPricer)}  (${fmtPct(finalFactor - 1)})`);

  // ─────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  REPRODUÇÃO MANUAL DIA-A-DIA (com log dos extremos)');
  console.log('═══════════════════════════════════════════════════');
  const indexer = (fi.indexer || 'PRE').toUpperCase();
  const indexerPercent = fi.indexerPercent != null ? Number(fi.indexerPercent) / 100 : 1;
  const isHibrido = String(fi.type || '')
    .toUpperCase()
    .endsWith('_HIB');

  let manualFactor = 1;
  let cdiCompoundCount = 0;
  let firstCompoundDay: number | null = null;
  let lastCompoundDay: number | null = null;
  for (const day of timeline) {
    if (day < startTs) continue;
    if (indexer === 'CDI' && day >= startTs) {
      const cdi = cdiByKey.get(day);
      if (cdi != null && Number.isFinite(cdi)) {
        manualFactor *= 1 + cdi * indexerPercent;
        cdiCompoundCount++;
        if (firstCompoundDay == null) firstCompoundDay = day;
        lastCompoundDay = day;
      }
    }
  }
  console.log(`indexer=${indexer}  indexerPercent=${indexerPercent}  isHibrido=${isHibrido}`);
  console.log(`Compoundings de CDI: ${cdiCompoundCount}`);
  if (firstCompoundDay) {
    console.log(`Primeiro compounding: ${new Date(firstCompoundDay).toISOString()}`);
  }
  if (lastCompoundDay) {
    console.log(`Último compounding:   ${new Date(lastCompoundDay).toISOString()}`);
  }
  console.log(
    `Manual factor: ${manualFactor.toFixed(8)}  → ${fmtBRL(fi.investedAmount * manualFactor)} (${fmtPct(manualFactor - 1)})`,
  );

  // ─────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  COMPARAÇÕES ALTERNATIVAS');
  console.log('═══════════════════════════════════════════════════');

  // Linear vs geométrico (X% CDI):  (1+r)*p vs (1+r)^p
  let linearFactor = 1;
  let geomFactor = 1;
  for (const day of timeline) {
    if (day < startTs) continue;
    const cdi = cdiByKey.get(day);
    if (cdi == null || !Number.isFinite(cdi)) continue;
    linearFactor *= 1 + cdi * indexerPercent;
    geomFactor *= Math.pow(1 + cdi, indexerPercent);
  }
  console.log(
    `Linear (1+cdi*p):    ${linearFactor.toFixed(8)} → ${fmtBRL(fi.investedAmount * linearFactor)} (${fmtPct(linearFactor - 1)})`,
  );
  console.log(
    `Geométrico (1+cdi)^p:${geomFactor.toFixed(8)} → ${fmtBRL(fi.investedAmount * geomFactor)} (${fmtPct(geomFactor - 1)})`,
  );
  console.log(
    `Diferença linear-geom: ${fmtBRL(fi.investedAmount * (linearFactor - geomFactor))} (${fmtPct(linearFactor - geomFactor)})`,
  );

  // Cumulativo puro do CDI
  let cumPure = 1;
  for (const row of cdiRows) {
    const v = Number(row.value);
    if (Number.isFinite(v)) cumPure *= 1 + v;
  }
  console.log(
    `\nCDI puro (todos rows, 100% CDI): ${cumPure.toFixed(8)} → ${fmtBRL(fi.investedAmount * cumPure)} (${fmtPct(cumPure - 1)})`,
  );

  // ─────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  RESUMO');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Investido:           ${fmtBRL(fi.investedAmount)}`);
  console.log(`Pricer (produção):   ${fmtBRL(valorPricer)}  ${fmtPct(finalFactor - 1)}`);
  console.log(
    `Manual reprod.:      ${fmtBRL(fi.investedAmount * manualFactor)}  ${fmtPct(manualFactor - 1)}`,
  );
  console.log(
    `Linear vs Geom diff: ${fmtBRL(fi.investedAmount * Math.abs(linearFactor - geomFactor))}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    void prisma.$disconnect();
  });
