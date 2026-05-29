/**
 * Backfill one-shot: reclassifica o catálogo de ativos usando o subType
 * autoritativo da BRAPI (/quote/list), corrigindo FIIs que estavam presos em
 * 'stock' (name=symbol => o classifier por nome não tinha texto e caía em
 * stock) e separando ETFs corretamente.
 *
 * Por que precisa: o sync diário (syncStocks) já passa a usar o subType e
 * reclassifica tudo no próximo run — este script só antecipa a correção pro
 * banco atual sem esperar o cron.
 *
 * Uso:
 *   npx tsx scripts/backfill-fii-classification.ts        # dry-run (relatório)
 *   APPLY=1 npx tsx scripts/backfill-fii-classification.ts # aplica
 */
import prisma from '../src/lib/prisma';
import { classifyByBrapiType, classifyByName } from '../src/services/pricing/brapiSync';

const APPLY = process.env.APPLY === '1';

interface BrapiListEntry {
  stock: string;
  name?: string;
  type?: string;
  subType?: string;
}

async function fetchBrapiList(): Promise<Map<string, BrapiListEntry>> {
  const apiKey = process.env.BRAPI_API_KEY;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  const map = new Map<string, BrapiListEntry>();
  // Por type pra fugir do cap de 2000 da lista sem filtro.
  for (const type of ['stock', 'fund', 'bdr']) {
    const res = await fetch(`https://brapi.dev/api/quote/list?type=${type}&limit=10000`, {
      headers,
    });
    if (!res.ok) throw new Error(`BRAPI ${type} ${res.status} ${res.statusText}`);
    const data = (await res.json()) as { stocks?: BrapiListEntry[] };
    for (const s of data.stocks ?? []) {
      if (!map.has(s.stock.toUpperCase())) map.set(s.stock.toUpperCase(), s);
    }
  }
  return map;
}

async function main() {
  const list = await fetchBrapiList();
  console.log(`BRAPI /quote/list: ${list.size} ativos`);

  const assets = await prisma.asset.findMany({
    where: { source: 'brapi' },
    select: { id: true, symbol: true, name: true, type: true },
  });

  const changes: Array<{ symbol: string; from: string; to: string }> = [];
  let noBrapiEntry = 0;
  for (const a of assets) {
    const entry = list.get(a.symbol.toUpperCase());
    if (!entry) {
      noBrapiEntry++;
      continue;
    }
    // subType autoritativo; se ambíguo, cai no nome (longName já gravado).
    const newType =
      classifyByBrapiType(entry.type, entry.subType) ??
      classifyByName(a.name ?? '', a.symbol, a.type);
    if (newType !== a.type) changes.push({ symbol: a.symbol, from: a.type, to: newType });
  }

  const migrations: Record<string, number> = {};
  changes.forEach((c) => {
    const key = `${c.from} → ${c.to}`;
    migrations[key] = (migrations[key] || 0) + 1;
  });

  console.log(`Ativos brapi no banco: ${assets.length} (sem entry na BRAPI: ${noBrapiEntry})`);
  console.log(`Reclassificações: ${changes.length}`);
  console.log('Por migração:', migrations);
  console.log(
    'Amostra:',
    changes.slice(0, 25).map((c) => `${c.symbol} ${c.from}→${c.to}`),
  );

  if (!APPLY) {
    console.log('\n[dry-run] Nada aplicado. Rode com APPLY=1 pra persistir.');
    await prisma.$disconnect();
    return;
  }

  let applied = 0;
  for (const c of changes) {
    await prisma.asset.updateMany({ where: { symbol: c.symbol }, data: { type: c.to } });
    applied++;
  }
  console.log(`\n[apply] ${applied} ativos atualizados.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
