/**
 * Backfill histórico de TesouroDiretoPrice a partir do CSV completo do
 * Tesouro Transparente (~13 MB, ~500 mil linhas desde 2002).
 *
 * Contexto: o cron diário (runTesouroDiretoSync) só processa os últimos
 * ~3 dias para caber no limite de 60s da Vercel, então a tabela fica sem
 * histórico. Este script roda localmente sem esse limite e popula tudo.
 *
 * Flags:
 *   --since=YYYY-MM-DD   Filtra para linhas com baseDate >= data informada
 *                        (default: 2002-01-01, o início da série)
 *   --only-held          Restringe aos bondType+maturity que algum usuário
 *                        possui hoje (asset.type='tesouro-direto')
 *   --dry-run            Baixa e conta as linhas sem gravar
 *   --batch-size=N       Tamanho do batch de upsert (default 200)
 *
 * Uso típico para desbloquear legado:
 *   npx tsx scripts/backfill-tesouro-historical-prices.ts --only-held --since=2022-01-01
 *
 * Backfill completo (mais lento, ~20 min):
 *   npx tsx scripts/backfill-tesouro-historical-prices.ts
 */
import axios from 'axios';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaClient } from '@prisma/client';
import {
  TESOURO_CSV_URL,
  parseRow,
  type TesouroDiretoRow,
} from '../src/services/pricing/tesouroDiretoSync';

const prisma = new PrismaClient();

function parseArg(flag: string): string | null {
  const entry = process.argv.find((a) => a.startsWith(`${flag}=`));
  return entry ? entry.slice(flag.length + 1) : null;
}

async function loadHeldBondKeys(): Promise<Set<string>> {
  // Catalog Tesouros expõem bondType+maturityYear no `name` (ex: "Tesouro Selic 2027")
  const assets = await prisma.asset.findMany({
    where: { type: 'tesouro-direto' },
    select: { name: true },
  });
  const keys = new Set<string>();
  for (const a of assets) {
    const m = a.name?.match(/^(.+)\s(\d{4})$/);
    if (!m) continue;
    const bondType = m[1].trim();
    const maturityYear = parseInt(m[2], 10);
    keys.add(`${bondType}|${maturityYear}`);
  }
  return keys;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const onlyHeld = process.argv.includes('--only-held');
  const sinceStr = parseArg('--since');
  const batchSize = parseInt(parseArg('--batch-size') ?? '200', 10);

  const since = sinceStr ? new Date(sinceStr) : new Date('2002-01-01');
  if (isNaN(since.getTime())) {
    console.error(`❌ --since inválido: "${sinceStr}"`);
    process.exit(1);
  }

  const heldKeys = onlyHeld ? await loadHeldBondKeys() : null;
  if (onlyHeld) {
    console.log(`🎯 --only-held: ${heldKeys!.size} bondType+maturityYear sendo monitorados`);
    for (const k of heldKeys!) console.log(`   • ${k}`);
  }

  console.log(`📥 Baixando CSV (${TESOURO_CSV_URL.split('/').pop()})…`);
  const start = Date.now();
  const { data: csvText } = await axios.get<string>(TESOURO_CSV_URL, {
    responseType: 'text',
    timeout: 120000,
  });
  const downloadSec = ((Date.now() - start) / 1000).toFixed(1);
  const mb = (csvText.length / 1024 / 1024).toFixed(1);

  const lines = csvText.split('\n');
  console.log(
    `📄 ${lines.length.toLocaleString()} linhas, ~${mb} MB (download em ${downloadSec}s)`,
  );

  const rows: TesouroDiretoRow[] = [];
  let skippedDate = 0;
  let skippedHeld = 0;
  let skippedParse = 0;

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;

    const row = parseRow(raw);
    if (!row) {
      skippedParse++;
      continue;
    }

    if (row.baseDate < since) {
      skippedDate++;
      continue;
    }

    if (heldKeys) {
      const key = `${row.bondType}|${row.maturityDate.getFullYear()}`;
      if (!heldKeys.has(key)) {
        skippedHeld++;
        continue;
      }
    }

    rows.push(row);
  }

  console.log(
    `📊 ${rows.length.toLocaleString()} linhas a processar | ${skippedDate.toLocaleString()} fora do período | ${skippedHeld.toLocaleString()} fora do held-set | ${skippedParse} sem parse`,
  );

  if (rows.length === 0) {
    console.log('⚠️  Nada para fazer.');
    return;
  }

  if (dryRun) {
    const dates = rows.map((r) => r.baseDate.getTime());
    const oldest = new Date(Math.min(...dates)).toISOString().slice(0, 10);
    const newest = new Date(Math.max(...dates)).toISOString().slice(0, 10);
    console.log(`(dry-run) baseDate range: ${oldest} → ${newest}`);
    console.log('(dry-run — nenhuma alteração persistida)');
    return;
  }

  let inserted = 0;
  let updated = 0;
  let errors = 0;
  const totalBatches = Math.ceil(rows.length / batchSize);

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;

    try {
      const existing = await prisma.tesouroDiretoPrice.findMany({
        where: {
          OR: batch.map((row) => ({
            bondType: row.bondType,
            maturityDate: row.maturityDate,
            baseDate: row.baseDate,
          })),
        },
        select: { bondType: true, maturityDate: true, baseDate: true },
      });
      const existingSet = new Set(
        existing.map(
          (k) => `${k.bondType}|${k.maturityDate.toISOString()}|${k.baseDate.toISOString()}`,
        ),
      );

      const ops = batch.map((row) => {
        const data = {
          buyRate: row.buyRate !== null ? new Decimal(row.buyRate) : null,
          sellRate: row.sellRate !== null ? new Decimal(row.sellRate) : null,
          buyPU: row.buyPU !== null ? new Decimal(row.buyPU) : null,
          sellPU: row.sellPU !== null ? new Decimal(row.sellPU) : null,
          basePU: row.basePU !== null ? new Decimal(row.basePU) : null,
        };
        return prisma.tesouroDiretoPrice.upsert({
          where: {
            bondType_maturityDate_baseDate: {
              bondType: row.bondType,
              maturityDate: row.maturityDate,
              baseDate: row.baseDate,
            },
          },
          update: { ...data, updatedAt: new Date() },
          create: {
            bondType: row.bondType,
            maturityDate: row.maturityDate,
            baseDate: row.baseDate,
            ...data,
          },
        });
      });

      await prisma.$transaction(ops);

      for (const row of batch) {
        const key = `${row.bondType}|${row.maturityDate.toISOString()}|${row.baseDate.toISOString()}`;
        if (existingSet.has(key)) updated++;
        else inserted++;
      }

      if (batchNum % 10 === 0 || batchNum === totalBatches) {
        const pct = ((batchNum / totalBatches) * 100).toFixed(1);
        console.log(
          `  …batch ${batchNum}/${totalBatches} (${pct}%) — inseridos=${inserted} atualizados=${updated}`,
        );
      }
    } catch (err) {
      console.error(`❌ Erro no batch ${batchNum}:`, err);
      errors += batch.length;
    }
  }

  const totalSec = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `\n✅ Finalizado em ${totalSec}s | ${inserted.toLocaleString()} inseridos | ${updated.toLocaleString()} atualizados | ${errors} erros`,
  );
  console.log(
    `💡 Próximo passo: rode "npx tsx scripts/backfill-tesouro-valor-investido.ts --dry-run --verbose" para revalidar`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
