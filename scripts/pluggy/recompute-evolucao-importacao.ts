/**
 * Recalcula os snapshots travados da Evolução do Patrimônio de quem importou a carteira pelo
 * Open Finance (ClickUp 86e3zhgzx, 07/11/2026).
 *
 * Antes da correção, as posições importadas entravam como aporte do mês E saíam do Fluxo de
 * Caixa Livre: as duas parcelas se anulavam e a Evolução ficava só com a base aplicada (ex.: R$
 * 1,2 mi investidos, Evolução em R$ 69 mil). O código novo trata a importação como "dinheiro que
 * já estava investido", mas os meses já TRAVADOS pelo cron (cashflow_patrimonio_snapshots)
 * guardam o valor antigo — este script os recalcula com a mesma cadeia do cron.
 *
 * Só toca cashflow_patrimonio_snapshots (UPDATE do valor) dos usuários com transação importada.
 * Idempotente: rodar de novo não muda nada.
 *
 * Uso (prod, como myfinance):
 *   node --env-file=/etc/myfinance/app.env --import tsx scripts/pluggy/recompute-evolucao-importacao.ts          # dry-run
 *   node --env-file=/etc/myfinance/app.env --import tsx scripts/pluggy/recompute-evolucao-importacao.ts --apply  # grava
 */
import prisma from '@/lib/prisma';
import {
  computeEvolucaoSeriesDoAno,
  recomputeEvolucaoSnapshots,
} from '@/services/cashflow/evolucaoPatrimonioServer';
import { ehImportacaoOpenFinance } from '@/services/pluggy/notaImportacao';

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(
    `Evolução do Patrimônio × importação Open Finance (${apply ? 'APPLY' : 'DRY RUN'})\n`,
  );

  const candidatas = await prisma.stockTransaction.findMany({
    where: {
      OR: [
        { notes: { startsWith: 'Importado do banco (Open Finance)' } },
        { notes: { contains: '"origem":"open-finance"' } },
      ],
    },
    select: { userId: true, notes: true },
  });
  const userIds = [
    ...new Set(candidatas.filter((t) => ehImportacaoOpenFinance(t.notes)).map((t) => t.userId)),
  ];
  console.log(`${userIds.length} usuário(s) com posição importada.\n`);

  let mudancas = 0;
  for (const userId of userIds) {
    const snapshots = await prisma.cashflowPatrimonioSnapshot.findMany({
      where: { userId },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
    if (snapshots.length === 0) continue;
    const series = new Map<number, number[]>();
    for (const year of new Set(snapshots.map((s) => s.year))) {
      series.set(year, await computeEvolucaoSeriesDoAno(userId, year));
    }
    for (const s of snapshots) {
      const novo = Math.round(series.get(s.year)![s.month] * 100) / 100;
      if (novo === s.valor) continue;
      mudancas++;
      console.log(
        `${userId} ${s.year}-${String(s.month + 1).padStart(2, '0')}: ${brl(s.valor)} → ${brl(novo)}`,
      );
    }
    if (apply) await recomputeEvolucaoSnapshots(userId, new Date(0));
  }

  console.log(`\n${mudancas} snapshot(s) ${apply ? 'atualizado(s)' : 'a atualizar'}.`);
  if (!apply && mudancas > 0) console.log('Rode de novo com --apply para gravar.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
