/**
 * One-off backfill: cria FixedIncomeAsset para reservas manuais (CDB/LCI/LCA, etc)
 * registradas via aba "Reserva de Oportunidade" ou "Reserva de Emergência" antes
 * do fix em src/app/api/carteira/operacao/route.ts.
 *
 * Contexto: a rota só criava FixedIncomeAsset para isRendaFixa | isTesouroRendaFixa
 * | isTesouroReserva. Reservas manuais (tipoAtivo='opportunity'|'emergency') eram
 * puladas, então o pricer em /api/carteira/reserva-* não encontrava registro e o
 * "valor atualizado" ficava congelado em valorInvestido (sem marcação na curva
 * CDI/IPCA).
 *
 * Estratégia (espelha a branch isManualReserva da operacao/route.ts):
 *   - type:           'CDB_PRE'
 *   - annualRate:     0
 *   - indexer:        parse benchmark → IPCA | CDI (default CDI)
 *   - indexerPercent: 100
 *   - liquidityType:  'DAILY'
 *   - taxExempt:      false (default CDB-like, tributável)
 *   - investedAmount: total da primeira compra (sem aportes posteriores)
 *   - startDate:      notes.dataCompra || tx.date da primeira compra
 *   - maturityDate:   notes.vencimento (obrigatório — pula se ausente)
 *
 * Detecção do alvo: Portfolio cujo asset é manual reserve (asset.type opportunity/
 * emergency OU asset.symbol começa com RESERVA-OPORT-/RESERVA-EMERG-) e que ainda
 * não tem FixedIncomeAsset (assetId é @unique).
 *
 * Run with:  npx tsx scripts/backfill-reserva-manual-fixed-income.ts
 * Flags:
 *   --dry-run           Preview sem persistir alterações
 *   --verbose           Log antes/depois de cada portfolio processado
 *   --user-id=<cuid>    Processa apenas o userId informado
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function parseArg(flag: string): string | null {
  const entry = process.argv.find((a) => a.startsWith(`${flag}=`));
  return entry ? entry.slice(flag.length + 1) : null;
}

type ReservaNotes = {
  dataCompra?: string;
  vencimento?: string;
  benchmark?: string;
  cotizacaoResgate?: string;
  liquidacaoResgate?: string;
  descricao?: string;
  ativo?: string;
  operation?: { action?: string };
};

function parseNotes(notes: string | null | undefined): ReservaNotes | null {
  if (!notes) return null;
  try {
    return JSON.parse(notes) as ReservaNotes;
  } catch {
    return null;
  }
}

function detectIndexer(benchmark: string | undefined): 'IPCA' | 'CDI' {
  const upper = String(benchmark || '').toUpperCase();
  if (upper.includes('IPCA')) return 'IPCA';
  // CDI, SELIC, ou desconhecido → default CDI (mesmo comportamento da rota)
  return 'CDI';
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const verbose = process.argv.includes('--verbose');
  const userIdFilter = parseArg('--user-id');

  // Reservas manuais: asset.type opportunity/emergency OU symbol RESERVA-{OPORT,EMERG}-*
  const portfolios = await prisma.portfolio.findMany({
    where: {
      ...(userIdFilter ? { userId: userIdFilter } : {}),
      OR: [
        { asset: { type: 'opportunity' } },
        { asset: { type: 'emergency' } },
        { asset: { symbol: { startsWith: 'RESERVA-OPORT-' } } },
        { asset: { symbol: { startsWith: 'RESERVA-EMERG-' } } },
      ],
    },
    include: { asset: { select: { id: true, name: true, symbol: true, type: true } } },
  });

  console.log(
    `Found ${portfolios.length} reserva manual portfolio(s)${userIdFilter ? ` for user ${userIdFilter}` : ''}.`,
  );

  // Pré-carrega assetIds que já têm FixedIncomeAsset — evita race + reduz queries.
  const assetIds = portfolios.map((p) => p.assetId).filter((id): id is string => Boolean(id));
  const existingFi =
    assetIds.length > 0
      ? await prisma.fixedIncomeAsset.findMany({
          where: { assetId: { in: assetIds } },
          select: { assetId: true },
        })
      : [];
  const hasFiByAssetId = new Set(existingFi.map((fi) => fi.assetId));

  let created = 0;
  let skippedAlreadyHasFi = 0;
  let skippedNoCompra = 0;
  let skippedNoVencimento = 0;
  let skippedNoAssetId = 0;

  for (const portfolio of portfolios) {
    if (!portfolio.assetId || !portfolio.asset) {
      skippedNoAssetId++;
      continue;
    }

    if (hasFiByAssetId.has(portfolio.assetId)) {
      skippedAlreadyHasFi++;
      if (verbose) {
        console.log(
          `  ⏭️  portfolio ${portfolio.id} (${portfolio.asset.name}) — FixedIncomeAsset já existe`,
        );
      }
      continue;
    }

    // A primeira compra é a "compra original" (não aporte). Usa essa pra seedar o FI,
    // espelhando o que a rota faz na criação inicial. Aportes/resgates posteriores
    // não alteram FixedIncomeAsset.investedAmount no fluxo normal.
    const compras = await prisma.stockTransaction.findMany({
      where: {
        userId: portfolio.userId,
        assetId: portfolio.assetId,
        type: 'compra',
      },
      orderBy: { date: 'asc' },
    });

    const compraOriginal = compras.find((tx) => {
      const parsed = parseNotes(tx.notes);
      const action = parsed?.operation?.action;
      return action !== 'aporte';
    });

    if (!compraOriginal) {
      skippedNoCompra++;
      console.log(
        `  ⚠️  portfolio ${portfolio.id} (${portfolio.asset.name}) — sem compra original`,
      );
      continue;
    }

    const notes = parseNotes(compraOriginal.notes);
    if (!notes?.vencimento) {
      skippedNoVencimento++;
      if (verbose) {
        console.log(
          `  ⏭️  portfolio ${portfolio.id} (${portfolio.asset.name}) — sem vencimento nas notes`,
        );
      }
      continue;
    }

    const startDate = notes.dataCompra ? new Date(notes.dataCompra) : compraOriginal.date;
    const maturityDate = new Date(notes.vencimento);
    if (Number.isNaN(maturityDate.getTime())) {
      skippedNoVencimento++;
      console.log(
        `  ⚠️  portfolio ${portfolio.id} (${portfolio.asset.name}) — vencimento inválido: "${notes.vencimento}"`,
      );
      continue;
    }

    const indexer = detectIndexer(notes.benchmark);
    const description = notes.descricao || notes.ativo || portfolio.asset.name || 'Reserva manual';
    const investedAmount = Number(compraOriginal.total);

    const data = {
      userId: portfolio.userId,
      assetId: portfolio.assetId,
      type: 'CDB_PRE' as const,
      description,
      startDate,
      maturityDate,
      investedAmount,
      annualRate: 0,
      indexer,
      indexerPercent: 100,
      liquidityType: 'DAILY' as const,
      taxExempt: false,
      tesouroBondType: null,
      tesouroMaturity: null,
    };

    console.log(
      `  ✓  portfolio ${portfolio.id} (${portfolio.asset.name})  → FI ${indexer} ${notes.benchmark || ''} ` +
        `start=${startDate.toISOString().slice(0, 10)} venc=${maturityDate.toISOString().slice(0, 10)} invested=${investedAmount.toFixed(2)}`,
    );

    if (!dryRun) {
      try {
        await prisma.fixedIncomeAsset.create({ data });
        created++;
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code === 'P2002') {
          // Race: alguém criou entre o pré-load e o create. Trata como já-existe.
          skippedAlreadyHasFi++;
          console.log(`     (P2002 — FI já existia)`);
        } else if (code === 'P2021') {
          console.error(
            'Tabela fixed_income_assets não existe. Rode `npx prisma migrate dev` antes do backfill.',
          );
          throw err;
        } else {
          throw err;
        }
      }
    } else {
      created++;
    }
  }

  console.log(
    `\nCreated ${created} FixedIncomeAsset(s) | skipped ${skippedAlreadyHasFi} (já tinham FI) + ${skippedNoVencimento} (sem vencimento) + ${skippedNoCompra} (sem compra) + ${skippedNoAssetId} (sem assetId)`,
  );
  if (dryRun) console.log('(dry-run — nenhuma alteração persistida)');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
