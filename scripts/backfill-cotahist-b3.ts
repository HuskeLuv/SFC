/**
 * F2.2 — Backfill de histórico de renda variável (ações/FIIs/BDRs/ETFs) via
 * arquivos COTAHIST anuais da B3, cobrindo o gap 2016-2020 em
 * AssetPriceHistory. 2021+ já é coberto pela sync diária BRAPI.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/backfill-cotahist-b3.ts                  # dry-run, todos os anos
 *   npx tsx --env-file=.env scripts/backfill-cotahist-b3.ts --apply          # persiste
 *   npx tsx --env-file=.env scripts/backfill-cotahist-b3.ts --years=2020     # apenas 2020
 *   npx tsx --env-file=.env scripts/backfill-cotahist-b3.ts --years=2018,2019 --apply
 *
 * Default seguro: --years=2016..2020 e dry-run ativo. Precisa de --apply
 * explícito pra persistir (operação demorada e custosa).
 *
 * Idempotente — pode rodar de novo sem duplicar (upsert via [symbol, date]).
 */
import { syncCotahistYear } from '@/services/pricing/cotahistB3Sync';

const DEFAULT_YEARS = [2016, 2017, 2018, 2019, 2020];

function parseArgs(): { years: number[]; apply: boolean } {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const yearsArg = argv.find((a) => a.startsWith('--years='));
  let years: number[] = DEFAULT_YEARS;
  if (yearsArg) {
    const value = yearsArg.split('=', 2)[1] ?? '';
    years = value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => {
        const n = Number(s);
        if (!Number.isFinite(n) || n < 1986 || n > 2100) {
          throw new Error(`Ano inválido: ${s}`);
        }
        return n;
      });
  }
  if (years.length === 0) throw new Error('Nenhum ano informado');
  return { years, apply };
}

async function main() {
  const { years, apply } = parseArgs();
  const mode = apply ? 'APPLY' : 'DRY RUN';

  console.log(`\n🔧 F2.2 — backfill B3 COTAHIST RV histórico (${mode})`);
  console.log(`   Anos: ${years.join(', ')}\n`);

  const start = Date.now();
  let grandInserted = 0;
  let grandUpdated = 0;
  let grandErrors = 0;

  for (const year of years) {
    try {
      const result = await syncCotahistYear(year, { dryRun: !apply });
      console.log(`\n📈 Ano ${year}`);
      console.log(`   linhas lidas:    ${result.lines.toLocaleString('pt-BR')}`);
      console.log(`   parseadas:       ${result.parsed.toLocaleString('pt-BR')}`);
      console.log(`   symbols únicos:  ${result.uniqueSymbols}`);
      console.log(`   candidatas:      ${result.matched.toLocaleString('pt-BR')}`);
      if (apply) {
        console.log(`   inseridos:       ${result.inserted}`);
        console.log(`   atualizados:     ${result.updated}`);
        console.log(`   erros:           ${result.errors}`);
      } else {
        console.log(`   (dry-run; nada persistido)`);
        if (result.sample.length > 0) {
          console.log('   amostra:');
          for (const s of result.sample) {
            console.log(
              `      ${s.date.toISOString().slice(0, 10)}  ${s.symbol.padEnd(12)}  R$ ${s.closePrice.toFixed(2)}  (CODBDI=${s.codBdi})`,
            );
          }
        }
      }
      console.log(`   duração:         ${result.duration.toFixed(1)}s`);

      grandInserted += result.inserted;
      grandUpdated += result.updated;
      grandErrors += result.errors;
    } catch (err) {
      console.error(`\n❌ Falha no ano ${year}:`, err);
      grandErrors++;
    }
  }

  const totalDuration = (Date.now() - start) / 1000;
  console.log(`\n=== Resultado consolidado ===`);
  console.log(`Anos processados: ${years.length}`);
  console.log(`Total inseridos:  ${grandInserted}`);
  console.log(`Total atualizados: ${grandUpdated}`);
  console.log(`Total erros:      ${grandErrors}`);
  console.log(`Duração total:    ${totalDuration.toFixed(1)}s`);

  if (!apply) {
    console.log(`\n⚠️  Dry-run — rode com --apply para persistir.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Erro fatal:', err);
    process.exit(1);
  });
