/**
 * Bug #01 (relatório Maio/2026, follow-up Kinvo): corrige `PortfolioProvento.dataCom`
 * em registros mirrored da BRAPI cujo `dataCom` foi gravado igual a `dataPagamento`.
 *
 * Causa raiz: `src/lib/ensurePortfolioProventosFromMarket.ts` (pré-fix Maio/2026)
 * persistia `dataCom: day` e `dataPagamento: day` usando a mesma payment date,
 * ignorando o `d.dataCom` (ex-date) corretamente extraído pelo `dividendService`.
 * O helper só ressincroniza quando o portfolio NÃO tem proventos — então o
 * registro antigo fica congelado.
 *
 * Estratégia segura (não toca dados manuais):
 *   Para cada PortfolioProvento P onde P.dataCom == P.dataPagamento:
 *     1. Resolve o symbol via Portfolio.asset.symbol
 *     2. Procura AssetDividendHistory matching (symbol, date == P.dataPagamento, tipo == P.tipo)
 *        — exatamente o registro que o dividendService persistiu da BRAPI
 *     3. Se AHD.dataCom existe E é diferente de AHD.date (i.e. ex-date distinto
 *        do payment date confirmado pela BRAPI), atualiza P.dataCom = AHD.dataCom
 *     4. Caso contrário: NÃO mexe (pode ser provento manual ou rendimento FII
 *        cuja data-com == pagamento de fato)
 *
 * Idempotente: a segunda execução não encontra mais P.dataCom == dataPagamento
 * em rows já corrigidos.
 *
 * Uso:
 *   npx tsx scripts/backfill-portfolio-provento-datacom.ts          # dry run
 *   npx tsx scripts/backfill-portfolio-provento-datacom.ts --apply  # persiste
 */
import prisma from '@/lib/prisma';

const sameDay = (a: Date, b: Date): boolean =>
  a.getUTCFullYear() === b.getUTCFullYear() &&
  a.getUTCMonth() === b.getUTCMonth() &&
  a.getUTCDate() === b.getUTCDate();

async function main() {
  const apply = process.argv.includes('--apply');
  if (!apply) {
    console.log('🔍 DRY RUN — execute com --apply para persistir.\n');
  }

  const candidates = await prisma.portfolioProvento.findMany({
    include: {
      portfolio: { include: { asset: { select: { symbol: true } } } },
    },
  });

  const mirrored = candidates.filter((p) => sameDay(p.dataCom, p.dataPagamento));
  console.log(
    `📊 ${candidates.length} PortfolioProvento(s); ${mirrored.length} com dataCom==dataPagamento\n`,
  );

  let fixed = 0;
  let skipped = 0;
  let noMatch = 0;

  for (const p of mirrored) {
    const symbol = p.portfolio.asset?.symbol;
    if (!symbol) {
      skipped += 1;
      continue;
    }

    // Range de 1 dia ao redor de dataPagamento — AssetDividendHistory.date pode
    // estar salvo com offset de timezone (servidor BRT vs UTC) diferente do
    // PortfolioProvento.dataPagamento.
    const pivotMs = p.dataPagamento.getTime();
    const rangeStart = new Date(pivotMs - 24 * 3600 * 1000);
    const rangeEnd = new Date(pivotMs + 24 * 3600 * 1000);

    const ahdCandidates = await prisma.assetDividendHistory.findMany({
      where: {
        symbol: { in: [symbol.toUpperCase(), `${symbol.toUpperCase()}.SA`] },
        tipo: p.tipo,
        date: { gte: rangeStart, lte: rangeEnd },
      },
      select: { date: true, dataCom: true },
    });
    const ahd = ahdCandidates.find((c) => sameDay(c.date, p.dataPagamento)) ?? null;

    if (!ahd || !ahd.dataCom) {
      noMatch += 1;
      continue;
    }

    if (sameDay(ahd.dataCom, ahd.date)) {
      // BRAPI confirma que ex-date == payment-date pra esse evento — não é bug.
      skipped += 1;
      continue;
    }

    console.log(
      `  ✓ ${symbol} ${p.tipo} ${p.dataPagamento.toISOString().slice(0, 10)} — ` +
        `dataCom ${p.dataCom.toISOString().slice(0, 10)} → ${ahd.dataCom.toISOString().slice(0, 10)}`,
    );

    if (apply) {
      await prisma.portfolioProvento.update({
        where: { id: p.id },
        data: { dataCom: ahd.dataCom },
      });
    }
    fixed += 1;
  }

  console.log(`\nResumo:`);
  console.log(`  Candidatos (mirrored):       ${mirrored.length}`);
  console.log(`  Corrigidos:                  ${fixed}`);
  console.log(`  Sem match na BRAPI:          ${noMatch}`);
  console.log(`  Confirmados iguais (skip):   ${skipped}`);
  if (!apply && fixed > 0) {
    console.log(`\n👉 Rode novamente com --apply para persistir.`);
  }
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error('❌ Erro:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

export default main;
