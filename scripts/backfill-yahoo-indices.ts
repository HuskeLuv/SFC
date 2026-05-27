/**
 * F2.3 — Backfill de histórico de índices/moedas via Yahoo Finance.
 *
 * Hoje IBOV (^BVSP) e USD-BRL só têm snapshot atual no
 * `MarketIndicatorCache` — não há histórico em `AssetPriceHistory`, o
 * que bloqueia backtest com benchmark e câmbio histórico. Este script
 * preenche o gap puxando do Yahoo (gratuito, sem API key).
 *
 * Convenção de symbols no banco:
 *   ^BVSP   → symbol `^BVSP` (consistente com o assetPriceService já existente)
 *   BRL=X   → symbol `USD-BRL` (consistente com o Asset criado pelo brapiSync)
 *   ^IBX50  → symbol `^IBX50` (opcional)
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/backfill-yahoo-indices.ts                 # dry-run, default
 *   npx tsx --env-file=.env scripts/backfill-yahoo-indices.ts --apply         # persiste
 *   npx tsx --env-file=.env scripts/backfill-yahoo-indices.ts --years=1       # 1 ano só
 *   npx tsx --env-file=.env scripts/backfill-yahoo-indices.ts --symbols=^BVSP # só IBOV
 *   npx tsx --env-file=.env scripts/backfill-yahoo-indices.ts --symbols=^BVSP,BRL=X,^IBX50 --years=10 --apply
 *
 * Default seguro: dry-run + 10 anos + ^BVSP,BRL=X. Idempotente — pode rodar
 * múltiplas vezes sem duplicar (upsert via [symbol, date]).
 */
import { syncYahooSymbol } from '@/services/pricing/yahooFinanceSync';

/**
 * Mapa de tickers Yahoo → `dbSymbol` gravado em Asset/AssetPriceHistory.
 * Adicione aqui sempre que quiser suportar um novo ticker.
 */
const SYMBOL_MAP: Record<string, string> = {
  '^BVSP': '^BVSP',
  'BRL=X': 'USD-BRL',
  '^IBX50': '^IBX50',
};

const DEFAULT_SYMBOLS = ['^BVSP', 'BRL=X'];
const DEFAULT_YEARS = 10;

interface Args {
  years: number;
  apply: boolean;
  symbols: string[];
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');

  const yearsArg = argv.find((a) => a.startsWith('--years='));
  let years = DEFAULT_YEARS;
  if (yearsArg) {
    const value = yearsArg.split('=', 2)[1] ?? '';
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0 || n > 30) {
      throw new Error(`--years inválido: ${value} (1..30)`);
    }
    years = n;
  }

  const symbolsArg = argv.find((a) => a.startsWith('--symbols='));
  let symbols = DEFAULT_SYMBOLS;
  if (symbolsArg) {
    const value = symbolsArg.split('=', 2)[1] ?? '';
    symbols = value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (symbols.length === 0) {
      throw new Error('--symbols vazio');
    }
    for (const s of symbols) {
      if (!(s in SYMBOL_MAP)) {
        throw new Error(
          `Ticker Yahoo desconhecido: ${s}. Suportados: ${Object.keys(SYMBOL_MAP).join(', ')}`,
        );
      }
    }
  }

  return { years, apply, symbols };
}

async function main() {
  const { years, apply, symbols } = parseArgs();
  const mode = apply ? 'APPLY' : 'DRY RUN';

  console.log(`\n🔧 F2.3 — backfill Yahoo Finance índices/moedas (${mode})`);
  console.log(`   Símbolos: ${symbols.join(', ')}`);
  console.log(`   Janela:   ${years} ano(s)\n`);

  const start = Date.now();
  let grandFetched = 0;
  let grandInserted = 0;
  let grandUpdated = 0;
  let grandErrors = 0;

  for (const yahooTicker of symbols) {
    const dbSymbol = SYMBOL_MAP[yahooTicker];
    try {
      const result = await syncYahooSymbol(yahooTicker, dbSymbol, years, { dryRun: !apply });

      console.log(`\n📈 ${yahooTicker} → ${dbSymbol}`);
      console.log(`   pontos buscados:    ${result.fetched.toLocaleString('pt-BR')}`);
      console.log(
        `   janela:             ${result.firstDate?.toISOString().slice(0, 10) ?? '-'} → ${result.lastDate?.toISOString().slice(0, 10) ?? '-'}`,
      );

      if (apply) {
        console.log(`   inseridos:          ${result.inserted}`);
        console.log(`   atualizados:        ${result.updated}`);
        console.log(`   erros:              ${result.errors}`);
      } else {
        console.log(`   (dry-run; nada persistido)`);
        if (result.sample.length > 0) {
          console.log(`   amostra (primeiros 3 pontos):`);
          for (const s of result.sample) {
            console.log(`      ${s.date.toISOString().slice(0, 10)}  ${s.close}`);
          }
        }
      }
      console.log(`   duração:            ${result.duration.toFixed(1)}s`);

      grandFetched += result.fetched;
      grandInserted += result.inserted;
      grandUpdated += result.updated;
      grandErrors += result.errors;
    } catch (err) {
      console.error(`\n❌ Erro em ${yahooTicker}:`, err instanceof Error ? err.message : err);
      grandErrors++;
    }
  }

  const total = (Date.now() - start) / 1000;
  console.log('\n──────────────────────────────────────────');
  console.log(`Modo:        ${mode}`);
  console.log(`Símbolos:    ${symbols.length}`);
  console.log(`Pontos:      ${grandFetched.toLocaleString('pt-BR')}`);
  if (apply) {
    console.log(`Inseridos:   ${grandInserted.toLocaleString('pt-BR')}`);
    console.log(`Atualizados: ${grandUpdated.toLocaleString('pt-BR')}`);
  }
  console.log(`Erros:       ${grandErrors}`);
  console.log(`Total:       ${total.toFixed(1)}s\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
