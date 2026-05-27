/**
 * F2.4 — Backfill de histórico de cripto via CoinGecko.
 *
 * Hoje AssetPriceHistory tem ~1.8 anos de cripto (2024-07 → hoje, via BRAPI).
 * Esse script densifica os últimos 365 dias com pontos diários USD via API
 * pública gratuita do CoinGecko.
 *
 * IMPORTANTE: o free tier do CoinGecko foi restringido aos últimos 365 dias
 * (HTTP 401 + error_code 10012 para days > 365). Pra puxar 10 anos é
 * necessária chave Analyst/Pro paga. Esse script aceita --days=N maior que
 * 365 — basta plugar uma chave paga quando ficar disponível.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/backfill-coingecko-crypto.ts                    # dry-run, todas mapeadas, days=365
 *   npx tsx --env-file=.env scripts/backfill-coingecko-crypto.ts --apply            # persiste
 *   npx tsx --env-file=.env scripts/backfill-coingecko-crypto.ts --symbols=BTC      # apenas BTC, dry-run
 *   npx tsx --env-file=.env scripts/backfill-coingecko-crypto.ts --symbols=BTC,ETH --apply
 *   npx tsx --env-file=.env scripts/backfill-coingecko-crypto.ts --days=3650 --apply # 10 anos (exige chave paga)
 *
 * Default seguro: dry-run, days=365 (limite do free tier), todas as cripto
 * do catálogo que tenham mapeamento conhecido (SYMBOL_TO_COINGECKO_ID).
 *
 * Idempotente: pode rodar de novo sem duplicar (skipDuplicates por
 * unique [symbol, date]).
 *
 * Rate limit: free tier do CoinGecko cai em 429 com 2s de delay. Service
 * usa sleep de 6s entre chamadas (~10 req/min efetivo) + retry com backoff
 * exponencial em 429. Pra 10 cripto isso são ~1min de overhead.
 */
import prisma from '@/lib/prisma';
import { syncCoinGeckoBatch, SYMBOL_TO_COINGECKO_ID } from '@/services/pricing/coinGeckoSync';

interface CliArgs {
  apply: boolean;
  symbols: string[] | null;
  days: number | 'max';
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');

  let symbols: string[] | null = null;
  const symbolsArg = argv.find((a) => a.startsWith('--symbols='));
  if (symbolsArg) {
    const value = symbolsArg.split('=', 2)[1] ?? '';
    symbols = value
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0);
    if (symbols.length === 0) {
      throw new Error('--symbols vazio');
    }
  }

  let days: number | 'max' = 365;
  const daysArg = argv.find((a) => a.startsWith('--days='));
  if (daysArg) {
    const value = daysArg.split('=', 2)[1] ?? '';
    if (value === 'max') {
      days = 'max';
    } else {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0 || n > 10_000) {
        throw new Error(`--days inválido: ${value}`);
      }
      days = Math.floor(n);
    }
  }

  return { apply, symbols, days };
}

function warnIfBeyondFreeTier(days: number | 'max'): void {
  const exceeds = days === 'max' || (typeof days === 'number' && days > 365);
  if (exceeds) {
    console.warn(`\n⚠️  days=${days} excede o limite do free tier do CoinGecko (365 dias).`);
    console.warn(`   Sem chave paga (Analyst/Pro) você vai receber HTTP 401 (error_code 10012).`);
    console.warn(`   Pra contornar: use --days=365 OU configure CoinGecko Analyst Key.\n`);
  }
}

async function listCryptoAssets(): Promise<string[]> {
  const assets = await prisma.asset.findMany({
    where: { type: 'crypto' },
    select: { symbol: true, name: true },
  });
  return assets.map((a) => a.symbol.trim().toUpperCase());
}

async function main() {
  const { apply, symbols, days } = parseArgs();
  const mode = apply ? 'APPLY' : 'DRY RUN';

  console.log(`\n🪙 F2.4 — backfill CoinGecko cripto histórico (${mode})`);
  console.log(`   days=${days}\n`);

  warnIfBeyondFreeTier(days);

  // Determinar símbolos alvo
  let targetSymbols: string[];

  if (symbols) {
    targetSymbols = symbols;
    console.log(`📋 Símbolos do CLI: ${targetSymbols.join(', ')}`);
  } else {
    console.log(`📋 Buscando criptos no catálogo (Asset.type='crypto')...`);
    const all = await listCryptoAssets();
    console.log(`   ${all.length} criptos no catálogo: ${all.join(', ') || '(nenhuma)'}`);
    targetSymbols = all.filter((s) => SYMBOL_TO_COINGECKO_ID[s]);
    const skipped = all.filter((s) => !SYMBOL_TO_COINGECKO_ID[s]);
    console.log(`   ${targetSymbols.length} com mapeamento CoinGecko: ${targetSymbols.join(', ')}`);
    if (skipped.length > 0) {
      console.log(`   ⚠️  ${skipped.length} sem mapeamento (pulados): ${skipped.join(', ')}`);
    }
  }

  if (targetSymbols.length === 0) {
    console.log(`\n⚠️  Nada a fazer.`);
    return;
  }

  const start = Date.now();
  const results = await syncCoinGeckoBatch(targetSymbols, days, { dryRun: !apply });

  let grandFetched = 0;
  let grandInserted = 0;
  let grandUpdated = 0;
  let grandErrors = 0;

  console.log(`\n=== Resultado por ativo ===\n`);
  for (const r of results) {
    console.log(`🪙 ${r.symbol.padEnd(6)} (${r.coinId})`);
    console.log(`   pontos retornados: ${r.fetched.toLocaleString('pt-BR')}`);
    if (apply) {
      console.log(`   inseridos:         ${r.inserted}`);
      console.log(`   já existiam:       ${r.updated}`);
      console.log(`   erros:             ${r.errors}`);
    } else {
      console.log(`   (dry-run; nada persistido)`);
      if (r.sample.length > 0) {
        console.log(`   amostra:`);
        for (const s of r.sample) {
          console.log(`      ${s.date.toISOString().slice(0, 10)}  USD ${s.priceUsd.toFixed(4)}`);
        }
      }
    }
    console.log(`   duração:           ${r.duration.toFixed(1)}s`);
    console.log('');

    grandFetched += r.fetched;
    grandInserted += r.inserted;
    grandUpdated += r.updated;
    grandErrors += r.errors;
  }

  const totalDuration = (Date.now() - start) / 1000;
  console.log(`=== Resultado consolidado ===`);
  console.log(`Ativos processados:  ${results.length}`);
  console.log(`Total pontos:        ${grandFetched.toLocaleString('pt-BR')}`);
  if (apply) {
    console.log(`Total inseridos:     ${grandInserted}`);
    console.log(`Total já existiam:   ${grandUpdated}`);
    console.log(`Total erros:         ${grandErrors}`);
  }
  console.log(`Duração total:       ${totalDuration.toFixed(1)}s`);

  if (!apply) {
    console.log(`\n⚠️  Dry-run — rode com --apply para persistir.`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('❌ Erro fatal:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
