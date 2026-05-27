/**
 * Bug #08 (relatório Maio/2026, follow-up): limpa entries legacy de renda-fixa
 * cujo `asset.symbol` ficou no padrão "-{timestamp}-{uuid}" e `asset.name`
 * começa com " - R$ X - data" (causa raiz: pré-Maio/11 o branch
 * `renda-fixa-hibrida` em `operacao/route.ts` não setava baseName/baseSymbol).
 *
 * Idempotente — só toca rows que ainda batem com o padrão corrompido.
 * Reconstrói name e symbol a partir do `notes.descricao` da StockTransaction
 * relacionada (que sempre tem o título original digitado pelo usuário).
 *
 * Uso:
 *   npx tsx scripts/backfill-corrupt-rf-titles.ts          # dry run
 *   npx tsx scripts/backfill-corrupt-rf-titles.ts --apply  # persiste
 */
import prisma from '@/lib/prisma';

const CORRUPT_SYMBOL_REGEX = /^-\d{12,}-[a-z0-9]+$/i;

interface RecoveryPlan {
  id: string;
  oldSymbol: string;
  oldName: string;
  newSymbol: string;
  newName: string;
  source: 'notes.descricao' | 'fallback';
}

const formatBRL = (value: number): string =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

async function buildPlan(): Promise<RecoveryPlan[]> {
  const candidates = await prisma.asset.findMany({
    where: {
      type: 'bond',
      symbol: { startsWith: '-' },
    },
    select: { id: true, symbol: true, name: true },
  });

  const plans: RecoveryPlan[] = [];

  for (const asset of candidates) {
    if (!CORRUPT_SYMBOL_REGEX.test(asset.symbol)) continue;

    // Recupera descricao da 1ª transação (compra) — sempre existe pra RF manual.
    const tx = await prisma.stockTransaction.findFirst({
      where: { assetId: asset.id, type: 'compra' },
      orderBy: { date: 'asc' },
      select: { date: true, total: true, notes: true },
    });

    let descricao = '';
    let dataInicio: Date | null = null;
    let valor: number | null = null;

    if (tx?.notes) {
      try {
        const parsed = JSON.parse(tx.notes);
        // descricao pode vir como objeto (legacy bug) — `.toString()` resultaria
        // em "[object Object]" que vaza pro nome do ativo. Aceita só string.
        const rawDescricao = parsed?.descricao;
        descricao = typeof rawDescricao === 'string' ? rawDescricao.trim() : '';
        if (parsed?.dataInicio) dataInicio = new Date(parsed.dataInicio);
      } catch {
        // notes não-JSON — segue com fallback
      }
    }
    if (!dataInicio && tx?.date) dataInicio = tx.date;
    if (tx?.total) valor = tx.total;

    // Fallback: tenta extrair valor da `FixedIncomeAsset.investedAmount`
    if (valor == null) {
      const fi = await prisma.fixedIncomeAsset.findFirst({
        where: { assetId: asset.id },
        select: { investedAmount: true, startDate: true },
      });
      if (fi?.investedAmount) valor = fi.investedAmount;
      if (!dataInicio && fi?.startDate) dataInicio = fi.startDate;
    }

    const baseName = descricao || 'Renda Fixa';
    const valorStr = valor ? ` - ${formatBRL(valor)}` : '';
    const dataStr = dataInicio
      ? ` - ${dataInicio.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}`
      : '';
    const newName = `${baseName}${valorStr}${dataStr}`;

    // Symbol: troca o "-" inicial por "RENDA-FIXA-" (preserva o sufixo ts-uuid
    // que já é único). Resultado: "RENDA-FIXA-{ts}-{uuid}".
    const newSymbol = `RENDA-FIXA${asset.symbol}`;

    plans.push({
      id: asset.id,
      oldSymbol: asset.symbol,
      oldName: asset.name,
      newSymbol,
      newName,
      source: descricao ? 'notes.descricao' : 'fallback',
    });
  }

  return plans;
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`🔧 Backfill títulos RF corrompidos (${apply ? 'APPLY' : 'DRY RUN'})\n`);

  const plans = await buildPlan();

  if (plans.length === 0) {
    console.log('Nada a fazer — nenhuma entrada corrompida encontrada.');
    return;
  }

  console.log(`${plans.length} entradas para corrigir:\n`);
  console.table(
    plans.map((p) => ({
      oldSymbol: p.oldSymbol.slice(0, 30),
      newSymbol: p.newSymbol.slice(0, 40),
      oldName: p.oldName,
      newName: p.newName,
      source: p.source,
    })),
  );

  if (!apply) {
    console.log('\n💡 Rode com --apply para persistir as mudanças.');
    return;
  }

  let updated = 0;
  let collisions = 0;

  for (const plan of plans) {
    // Asset.symbol é @unique — verifica colisão antes de updatar
    const collision = await prisma.asset.findUnique({
      where: { symbol: plan.newSymbol },
      select: { id: true },
    });
    if (collision && collision.id !== plan.id) {
      console.warn(`  ⚠️  Colisão de symbol: ${plan.newSymbol} já existe (id ${collision.id})`);
      collisions++;
      continue;
    }

    await prisma.asset.update({
      where: { id: plan.id },
      data: { symbol: plan.newSymbol, name: plan.newName },
    });
    updated++;
  }

  console.log(`\n✅ ${updated} atualizadas, ${collisions} colisões pulladas.`);
}

main()
  .catch((err) => {
    console.error('❌ Erro:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
