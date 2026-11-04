/**
 * Conserta a debênture/CRI/CRA que o Open Finance JÁ importou pela curva desde a compra sobre o
 * valor aplicado, mas que já pagou juros/amortização (QA lunny, 04/11/2026: 3 CRIs ~R$ 160 mil
 * acima do saldo do banco). A importação nova já entra pelo saldo de hoje; este script só alcança
 * o legado com a mesma regra (`debentureJaPagouFluxo`).
 *
 * Correção = a compra da importação passa a ser o saldo do banco na data da posição
 * (providerDate) e o recalc sincroniza Portfolio + FixedIncomeAsset (investedAmount, startDate)
 * e invalida os snapshots desde a data antiga.
 *
 * Só toca o que veio do Pluggy (asset.source = 'pluggy', bank_investments importado), com UMA
 * transação no ativo (a compra da importação, nunca editada pelo cliente) e o valor aplicado do
 * banco ainda lá. Update condicional pelos valores antigos: rodar de novo não muda nada.
 *
 *   npx tsx --env-file=.env scripts/pluggy/corrigir-rf-amortizada.ts [--user=<e-mail>] [--saida=<arq.json>]
 *   ... --apply --saida=/var/tmp/rf-amortizada-apply.json
 *   ... --restaurar=/var/tmp/rf-amortizada-apply.json   (devolve cada compra ao estado de antes)
 */
import { readFileSync, writeFileSync } from 'fs';
import { prisma } from '../../src/lib/prisma';
import {
  debentureJaPagouFluxo,
  NOTA_IMPORTACAO,
  SUBTIPOS_PAGAM_FLUXO,
} from '../../src/services/pluggy/importarCarteira';
import { recalculatePortfolioFromTransactions } from '../../src/services/portfolio/portfolioRecalculation';

const APLICAR = process.argv.includes('--apply');
const arg = (nome: string) =>
  process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3) ?? null;
const EMAIL = arg('user');
const SAIDA = arg('saida');
const RESTAURAR = arg('restaurar');

interface Correcao {
  txId: string;
  userId: string;
  assetId: string;
  portfolioId: string | null;
  email: string;
  nome: string;
  subtype: string;
  quantidade: number;
  antes: { price: number; total: number; date: string };
  depois: { price: number; total: number; date: string };
}
interface Pulada {
  email: string;
  nome: string;
  motivo: string;
}
interface Relatorio {
  aplicado: boolean;
  em: string;
  correcoes: Correcao[];
}

const brl = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

async function recalcular(c: Correcao, desde: Date) {
  await recalculatePortfolioFromTransactions({
    targetUserId: c.userId,
    assetId: c.assetId,
    portfolioId: c.portfolioId ?? undefined,
    recomputeSnapshotsFrom: desde,
  });
}

async function restaurar(arquivo: string) {
  const rel = JSON.parse(readFileSync(arquivo, 'utf8')) as Relatorio;
  if (!rel.aplicado) throw new Error('O relatório não é de um --apply');
  let n = 0;
  for (const c of rel.correcoes) {
    const r = await prisma.stockTransaction.updateMany({
      where: { id: c.txId, total: c.depois.total, date: new Date(c.depois.date) },
      data: { price: c.antes.price, total: c.antes.total, date: new Date(c.antes.date) },
    });
    if (r.count > 0) {
      await recalcular(c, new Date(c.antes.date));
      n++;
    }
  }
  console.log(`✅ restauradas: ${n} de ${rel.correcoes.length}`);
}

async function main() {
  if (RESTAURAR) return restaurar(RESTAURAR);
  if (APLICAR && !SAIDA) throw new Error('--apply exige --saida (é o backup para reverter)');

  let userId: string | undefined;
  if (EMAIL) {
    const u = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
    if (!u) throw new Error(`Usuário não encontrado: ${EMAIL}`);
    userId = u.id;
  }

  const importadas = await prisma.bankInvestment.findMany({
    where: {
      ...(userId ? { userId } : {}),
      type: 'FIXED_INCOME',
      subtype: { in: [...SUBTIPOS_PAGAM_FLUXO] },
      importStatus: 'importado',
      fixedIncomeAssetId: { not: null },
      assetId: { not: null },
    },
    select: {
      name: true,
      subtype: true,
      balance: true,
      amountOriginal: true,
      providerDate: true,
      userId: true,
      assetId: true,
      portfolioId: true,
      fixedIncomeAssetId: true,
      user: { select: { email: true } },
    },
  });

  const agora = new Date();
  const correcoes: Correcao[] = [];
  const puladas: Pulada[] = [];
  for (const b of importadas) {
    const pular = (motivo: string) => puladas.push({ email: b.user.email, nome: b.name, motivo });
    const fi = await prisma.fixedIncomeAsset.findUnique({
      where: { id: b.fixedIncomeAssetId! },
      include: { asset: { select: { source: true } } },
    });
    if (!fi || fi.asset?.source !== 'pluggy') {
      pular('renda fixa não é da importação');
      continue;
    }
    const saldo = Number(b.balance ?? 0);
    const aplicado = Number(fi.investedAmount);
    if (b.amountOriginal == null || Math.abs(aplicado - Number(b.amountOriginal)) > 0.01) {
      pular('já entrou pelo saldo ou foi alterada');
      continue;
    }
    if (!debentureJaPagouFluxo(aplicado, saldo, Number(fi.annualRate), fi.startDate, agora)) {
      pular('saldo coerente com a curva (sem fluxo pago)');
      continue;
    }
    const txs = await prisma.stockTransaction.findMany({
      where: { userId: b.userId, assetId: b.assetId! },
      select: {
        id: true,
        type: true,
        quantity: true,
        price: true,
        total: true,
        date: true,
        notes: true,
      },
    });
    if (txs.length !== 1 || txs[0].type !== 'compra' || txs[0].notes !== NOTA_IMPORTACAO) {
      pular(`${txs.length} transações no ativo (não é só a compra da importação)`);
      continue;
    }
    const tx = txs[0];
    const editada = await prisma.userChangeLog.count({
      where: { userId: b.userId, action: 'transacao.editar', entityId: tx.id, undoneAt: null },
    });
    if (editada > 0) {
      pular('compra já editada pelo cliente');
      continue;
    }
    const quantidade = Number(tx.quantity) > 0 ? Number(tx.quantity) : 1;
    const data = b.providerDate ?? agora;
    correcoes.push({
      txId: tx.id,
      userId: b.userId,
      assetId: b.assetId!,
      portfolioId: b.portfolioId,
      email: b.user.email,
      nome: b.name,
      subtype: b.subtype ?? '-',
      quantidade,
      antes: { price: Number(tx.price), total: Number(tx.total), date: tx.date.toISOString() },
      depois: {
        price: Math.round((saldo / quantidade) * 1_000_000) / 1_000_000,
        total: saldo,
        date: data.toISOString(),
      },
    });
  }

  console.log(`\nA corrigir (${correcoes.length})`);
  console.table(
    correcoes.map((c) => ({
      email: c.email,
      nome: c.nome.slice(0, 40),
      subtype: c.subtype,
      aplicado: brl(c.antes.total),
      desde: c.antes.date.slice(0, 10),
      saldoBanco: brl(c.depois.total),
      em: c.depois.date.slice(0, 10),
    })),
  );
  console.log(`\nPuladas (${puladas.length})`);
  if (puladas.length) console.table(puladas);

  if (APLICAR) {
    let n = 0;
    for (const c of correcoes) {
      const r = await prisma.stockTransaction.updateMany({
        where: { id: c.txId, total: c.antes.total, date: new Date(c.antes.date) },
        data: { price: c.depois.price, total: c.depois.total, date: new Date(c.depois.date) },
      });
      if (r.count > 0) {
        await recalcular(c, new Date(c.antes.date));
        n++;
      }
    }
    console.log(`\n✅ aplicado: ${n} de ${correcoes.length}`);
  } else {
    console.log('\n(dry-run: nada gravado; use --apply --saida=<arq.json>)');
  }
  if (SAIDA) {
    const rel: Relatorio = { aplicado: APLICAR, em: new Date().toISOString(), correcoes };
    writeFileSync(SAIDA, JSON.stringify(rel, null, 2));
    console.log(`relatório: ${SAIDA}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
