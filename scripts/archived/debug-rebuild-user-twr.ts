/**
 * Reroda buildPatrimonioHistorico para um usuário SEM persistir; mostra os
 * dias problemáticos. Útil para distinguir "DB tem lixo" (snapshot antigo
 * stale) de "builder está gerando -100%".
 *
 * Uso:
 *   npx tsx scripts/debug-rebuild-user-twr.ts <email>
 */
import prisma from '../src/lib/prisma';
import { loadCarteiraHistoricoData } from '../src/services/portfolio/carteiraHistoricoDataLoader';
import { buildPatrimonioHistorico } from '../src/services/portfolio/patrimonioHistoricoBuilder';
import { createFixedIncomePricer } from '../src/services/portfolio/fixedIncomePricing';

async function main() {
  const email = process.argv[2] || 'testekivo@hotmail.com';
  const candidates = [email];
  if (email.includes('kivo')) candidates.push(email.replace('kivo', 'kinvo'));
  if (email.includes('kinvo')) candidates.push(email.replace('kinvo', 'kivo'));

  const user = await prisma.user.findFirst({
    where: { email: { in: candidates } },
    select: { id: true, email: true },
  });
  if (!user) {
    console.error('User not found');
    process.exit(1);
  }
  console.log(`Rebuilding TWR for ${user.email} (${user.id})\n`);

  const { portfolio, fixedIncomeAssets, stockTransactions, investmentsExclReservas } =
    await loadCarteiraHistoricoData(user.id);

  const fiPricer = await createFixedIncomePricer(user.id, {});

  const built = await buildPatrimonioHistorico({
    portfolio,
    fixedIncomeAssets,
    stockTransactions,
    investmentsExclReservas,
    saldoBrutoAtual: 0,
    valorAplicadoAtual: 0,
    maxHistoricoMonths: null,
    patchLastDayWithLiveTotals: false,
    fixedIncomeValueSeriesBuilder: fiPricer.buildValueSeriesForAsset,
    implicitCdiValueSeriesBuilder: fiPricer.buildImplicitCdiValueSeries,
  });

  console.log(`historicoTWR rebuilt: ${built.historicoTWR.length} pontos`);
  console.log(`historicoPatrimonio rebuilt: ${built.historicoPatrimonio.length} pontos\n`);

  // Procurar saltos > |10%|
  let prev: number | null = null;
  const saltos: Array<{ date: string; from: number; to: number; delta: number }> = [];
  for (const p of built.historicoTWR) {
    const dateStr = new Date(p.data).toISOString().slice(0, 10);
    if (prev != null) {
      const fromFrac = 1 + prev / 100;
      const toFrac = 1 + p.value / 100;
      const delta = fromFrac > 0 ? (toFrac / fromFrac - 1) * 100 : 0;
      if (Math.abs(delta) > 10) {
        saltos.push({ date: dateStr, from: prev, to: p.value, delta });
      }
    }
    prev = p.value;
  }
  console.log(`Saltos > |10%| no REBUILD: ${saltos.length}`);
  for (const s of saltos.slice(0, 20)) {
    console.log(
      `  ${s.date}: ${s.from.toFixed(2)}% → ${s.to.toFixed(2)}% (delta ${s.delta.toFixed(2)}%)`,
    );
  }

  // Comparar com snapshots persistidos no DB
  console.log(`\n=== Comparação rebuild vs DB (últimos 10 pontos) ===`);
  const persistedPerf = await prisma.portfolioPerformance.findMany({
    where: { userId: user.id },
    orderBy: { date: 'desc' },
    take: 10,
  });
  const persistedByDay = new Map<number, number>();
  for (const pp of persistedPerf) {
    persistedByDay.set(pp.date.getTime(), Number(pp.cumulativeReturn));
  }

  for (const p of built.historicoTWR.slice(-10)) {
    const dateStr = new Date(p.data).toISOString().slice(0, 10);
    const persisted = persistedByDay.get(p.data);
    const persistedStr = persisted != null ? persisted.toFixed(2) + '%' : 'null';
    const mark = persisted != null && Math.abs(persisted - p.value) > 0.5 ? ' ⚠️' : '';
    console.log(
      `  ${dateStr}: rebuild=${p.value.toFixed(2).padStart(8)}% db=${persistedStr.padStart(10)}${mark}`,
    );
  }

  // Dia 06/05/2026 específico
  console.log(`\n=== Dia problemático 2026-05-06 ===`);
  const target = built.historicoTWR.find((p) =>
    new Date(p.data).toISOString().startsWith('2026-05-06'),
  );
  const targetPat = built.historicoPatrimonio.find((p) =>
    new Date(p.data).toISOString().startsWith('2026-05-06'),
  );
  const prevDay = built.historicoTWR.find((p) =>
    new Date(p.data).toISOString().startsWith('2026-05-05'),
  );
  const prevPat = built.historicoPatrimonio.find((p) =>
    new Date(p.data).toISOString().startsWith('2026-05-05'),
  );
  console.log(
    `  05/05 rebuild: TWR=${prevDay?.value.toFixed(2)}% patrimonio=${prevPat?.saldoBruto.toFixed(2)} aplicado=${prevPat?.valorAplicado.toFixed(2)}`,
  );
  console.log(
    `  06/05 rebuild: TWR=${target?.value.toFixed(2)}% patrimonio=${targetPat?.saldoBruto.toFixed(2)} aplicado=${targetPat?.valorAplicado.toFixed(2)}`,
  );
  const cashflow = built.cashFlowsByDay.get(targetPat?.data ?? 0) ?? 0;
  console.log(`  Cashflow 06/05 em rebuild: ${cashflow.toFixed(2)}`);
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error('❌', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
