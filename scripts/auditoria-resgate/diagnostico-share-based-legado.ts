/**
 * Diagnóstico READ-ONLY dos dados legados afetados pelos bugs corrigidos na
 * auditoria de resgate 2026-08-06 (PR #60). Não escreve nada.
 *
 * Caça duas classes de problema em posições share-based (equity + cripto +
 * moedas + opções + fundos CVM):
 *
 * 1. VENENO — transações criadas pelos fluxos antigos que corrompem o replay
 *    por cotas: aporte de valor (quantity=1) e resgate por valor (quantity=1)
 *    em ativo share-based. Enquanto existirem, recalcular o ativo produz
 *    quantidade errada.
 * 2. DRIFT — Portfolio.{quantity,avgPrice,totalInvested} divergente do replay
 *    das transações (ex.: venda parcial antiga que subtraiu receita do custo).
 *    Sem veneno, um recalc simples conserta; com veneno, precisa de decisão.
 *
 * Uso: npx tsx scripts/auditoria-resgate/diagnostico-share-based-legado.ts
 */
import { prisma } from '../../src/lib/prisma';
import { SHARE_BASED_ASSET_TYPES } from '../../src/lib/assetClassification';
import {
  replayPosition,
  isCorporateActionAuditTx,
  APPLICABLE_CORPORATE_ACTION_TYPES,
} from '../../src/services/portfolio/corporateActions';

interface NotesOperation {
  action?: string;
  metodoResgate?: string;
}

const parseOperation = (notes: string | null): NotesOperation | null => {
  if (!notes) return null;
  try {
    return (JSON.parse(notes)?.operation as NotesOperation) ?? null;
  } catch {
    return null;
  }
};

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });

async function main() {
  const portfolios = await prisma.portfolio.findMany({
    include: { asset: { select: { symbol: true, name: true, type: true } } },
  });
  const shareBased = portfolios.filter(
    (p) => p.asset?.type && SHARE_BASED_ASSET_TYPES.has(p.asset.type),
  );

  console.log(
    `Portfolios: ${portfolios.length} no total, ${shareBased.length} share-based a verificar\n`,
  );

  let ok = 0;
  const problemas: string[] = [];
  let totalVeneno = 0;
  let totalDrift = 0;

  for (const p of shareBased) {
    if (!p.assetId) continue;
    const txs = await prisma.stockTransaction.findMany({
      where: { userId: p.userId, assetId: p.assetId },
      orderBy: { date: 'asc' },
    });
    const reais = txs.filter((t) => !isCorporateActionAuditTx(t.notes));

    // veneno: aporte de valor ou resgate por valor em ativo de cotas
    const veneno = reais.filter((t) => {
      const op = parseOperation(t.notes);
      if (!op) return false;
      if (op.action === 'aporte') return true;
      if (op.action === 'resgate' && op.metodoResgate === 'valor') return true;
      return false;
    });

    const eventos = p.asset?.symbol
      ? await prisma.assetCorporateAction.findMany({
          where: {
            symbol: p.asset.symbol,
            type: { in: Array.from(APPLICABLE_CORPORATE_ACTION_TYPES) },
          },
          orderBy: { date: 'asc' },
          select: { date: true, type: true, factor: true },
        })
      : [];

    const replay = replayPosition(reais, eventos);
    const driftQty = Math.abs(replay.quantity - p.quantity) > 1e-6;
    const driftCost = Math.abs(replay.cost - p.totalInvested) > 0.01;

    if (veneno.length === 0 && !driftQty && !driftCost) {
      ok++;
      continue;
    }

    if (veneno.length > 0) totalVeneno += veneno.length;
    if ((driftQty || driftCost) && veneno.length === 0) totalDrift++;

    const rotulo = [
      veneno.length > 0 ? `VENENO×${veneno.length}` : null,
      driftQty || driftCost ? 'DRIFT' : null,
    ]
      .filter(Boolean)
      .join('+');

    problemas.push(
      [
        `[${rotulo}] user=${p.userId.slice(0, 8)}… ${p.asset?.symbol ?? '?'} (${p.asset?.type})`,
        `  gravado : qty=${fmt(p.quantity)} custo=${fmt(p.totalInvested)} avg=${fmt(p.avgPrice)}`,
        `  replay  : qty=${fmt(replay.quantity)} custo=${fmt(replay.cost)}`,
        ...veneno.map((v) => {
          const op = parseOperation(v.notes);
          return `  veneno  : ${v.date.toISOString().slice(0, 10)} ${v.type} qty=${fmt(v.quantity)} total=${fmt(v.total)} (${op?.action}${op?.metodoResgate ? '/' + op.metodoResgate : ''}) tx=${v.id}`;
        }),
      ].join('\n'),
    );
  }

  console.log(problemas.join('\n\n'));
  console.log(`\n===== RESUMO =====`);
  console.log(`OK (replay bate, sem veneno): ${ok}`);
  console.log(`Posições com problema: ${problemas.length}`);
  console.log(`  - transações-veneno no total: ${totalVeneno}`);
  console.log(`  - só DRIFT (recalc simples conserta): ${totalDrift}`);
  console.log(`\nReparo sugerido: DRIFT puro → recalculatePortfolioFromTransactions por ativo;`);
  console.log(
    `VENENO → decisão por caso (converter em compra de cotas pela cota da data, ou reclassificar o ativo).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
