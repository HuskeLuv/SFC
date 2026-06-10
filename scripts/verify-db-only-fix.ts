/**
 * Verificação end-to-end do fix banco-only.
 *
 * Reproduz EXATAMENTE o cenário que quebrava: um usuário detém um FII que sofreu
 * split (HFOF11 10:1 em 2025-05-12) e paga dividendos. Verifica, COM A INTERNET
 * "CORTADA" (global.fetch lança), que tudo resolve a partir da nossa base:
 *   1. quantidade split-ajustada (100 → 1000) — evento corporativo aplicado do DB;
 *   2. proventos resolvidos (resolveProventoEvents) — sem fetch externo;
 *   3. série de rentabilidade inclui proventos (loadProventosByDay) — sem drawdown-fantasma.
 *
 * Cria um usuário de teste isolado e o REMOVE ao final. READ-mostly: só toca o
 * próprio usuário criado.
 *
 *   tsx --env-file=.env scripts/verify-db-only-fix.ts
 */
import { prisma } from '@/lib/prisma';
import { recalculatePortfolioFromTransactions } from '@/services/portfolio/portfolioRecalculation';
import { applyCorporateActionsToUserPositions } from '@/services/portfolio/applyCorporateActions';
import { resolveProventoEvents } from '@/services/portfolio/resolveProventos';
import { loadProventosByDay } from '@/services/portfolio/proventosByDay';

const SYMBOL = 'HFOF11';
const BUY_QTY = 100;
const BUY_DATE = new Date('2023-01-02T00:00:00Z'); // ANTES do split de 2025-05-12
const EMAIL = `verify-dbonly-${BUY_DATE.getTime()}@test.local`;

let failures = 0;
const assert = (cond: boolean, msg: string) => {
  console.log(`  ${cond ? '✅' : '❌'} ${msg}`);
  if (!cond) failures++;
};

async function main() {
  const asset = await prisma.asset.findUnique({ where: { symbol: SYMBOL } });
  if (!asset) throw new Error(`${SYMBOL} não está no catálogo`);

  // Limpa execução anterior, se houver.
  await prisma.user.deleteMany({ where: { email: EMAIL } });

  const user = await prisma.user.create({
    data: { email: EMAIL, password: 'x', name: 'Verify DB-Only' },
  });

  try {
    const portfolio = await prisma.portfolio.create({
      data: {
        userId: user.id,
        assetId: asset.id,
        quantity: BUY_QTY,
        avgPrice: 90,
        totalInvested: BUY_QTY * 90,
      },
    });
    await prisma.stockTransaction.create({
      data: {
        userId: user.id,
        assetId: asset.id,
        type: 'compra',
        quantity: BUY_QTY,
        price: 90,
        total: BUY_QTY * 90,
        date: BUY_DATE,
      },
    });

    console.log(
      `\nCenário: comprou ${BUY_QTY} cotas de ${SYMBOL} em ${BUY_DATE.toISOString().slice(0, 10)} (antes do split 10:1)\n`,
    );

    // ───────────────────────────────────────────────────────────────────────
    // CORTA A INTERNET: qualquer fetch externo a partir daqui = falha do teste.
    // Prova que o caminho de runtime NÃO depende de fonte externa.
    // ───────────────────────────────────────────────────────────────────────
    const realFetch = global.fetch;
    let fetchAttempts = 0;
    global.fetch = (...args: Parameters<typeof realFetch>) => {
      fetchAttempts++;
      const url = String(args[0]);
      throw new Error(`FETCH EXTERNO BLOQUEADO (não deveria acontecer): ${url.slice(0, 60)}`);
    };

    console.log('=== com global.fetch DESABILITADO (internet cortada) ===\n');

    // 1) Recálculo do add-flow — aplica o evento corporativo lendo do banco.
    await recalculatePortfolioFromTransactions({
      targetUserId: user.id,
      assetId: asset.id,
      portfolioId: portfolio.id,
      recomputeSnapshotsFrom: BUY_DATE,
    });
    await applyCorporateActionsToUserPositions(user.id, { assetId: asset.id });

    const after = await prisma.portfolio.findUnique({ where: { id: portfolio.id } });
    assert(
      after?.quantity === BUY_QTY * 10,
      `quantidade split-ajustada: ${after?.quantity} (esperado ${BUY_QTY * 10} após 10:1)`,
    );

    // 2) Proventos resolvidos a partir do histórico global (sem fetch).
    const { events, total } = await resolveProventoEvents(user.id);
    const hfofEvents = events.filter((e) => e.symbol === SYMBOL);
    assert(
      hfofEvents.length > 0,
      `proventos resolvidos do banco: ${hfofEvents.length} eventos de ${SYMBOL}`,
    );
    assert(total > 0, `renda total líquida > 0: R$ ${total.toFixed(2)}`);

    // 3) Série de rentabilidade inclui proventos (anti drawdown-fantasma).
    const { proventosByDay, total: serieTotal } = await loadProventosByDay(user.id);
    assert(proventosByDay.size > 0, `série tem ${proventosByDay.size} dia(s) com provento`);
    assert(serieTotal > 0, `provento total na série: R$ ${serieTotal.toFixed(2)}`);

    assert(fetchAttempts === 0, `nenhuma tentativa de fetch externo (${fetchAttempts})`);

    global.fetch = realFetch;

    console.log(
      `\nResumo: ${hfofEvents.length} proventos, R$ ${total.toFixed(2)} de renda, quantidade ${after?.quantity}, tudo SEM internet.`,
    );
  } finally {
    // Cleanup total do usuário de teste.
    await prisma.stockTransaction.deleteMany({ where: { userId: user.id } });
    await prisma.portfolioProvento.deleteMany({ where: { userId: user.id } });
    await prisma.portfolio.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    console.log('\n(usuário de teste removido)');
  }

  console.log(
    `\n${failures === 0 ? '✅ TODAS AS VERIFICAÇÕES PASSARAM' : `❌ ${failures} VERIFICAÇÃO(ÕES) FALHARAM`}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
