/**
 * Survey para feature "Sensibilidade da Carteira":
 * verifica se AssetPriceHistory tem cobertura suficiente para computar
 * correlações mensais sobre janelas de 24m / 12m.
 *
 * Uso: npx tsx scripts/survey-sensibilidade-coverage.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Mesmo filtro de assetPriceService.ts — símbolos sem cotação BRAPI de mercado
const isBlockedSymbol = (symbol: string) => {
  const s = symbol.trim().toUpperCase();
  return (
    s.startsWith('RESERVA-EMERG') ||
    s.startsWith('RESERVA-OPORT') ||
    s.startsWith('RENDA-FIXA') ||
    s.startsWith('CONTA-CORRENTE') ||
    s.startsWith('PERSONALIZADO') ||
    s.startsWith('DEBENTURE-') ||
    s.startsWith('FUNDO-') ||
    s.startsWith('TESOURO-') ||
    s.startsWith('OPCAO-') ||
    /-\d{13}-/.test(s) ||
    s.startsWith('-') ||
    /^\d/.test(s)
  );
};

async function main() {
  console.log('=== Survey: Sensibilidade da Carteira — cobertura de histórico ===\n');

  // 1) Símbolos únicos em carteiras (de mercado, filtra reservas/renda-fixa)
  const portfolios = await prisma.portfolio.findMany({
    include: { asset: true },
  });

  const totalPositions = portfolios.length;
  const symbolsPerUser = new Map<string, Set<string>>();
  const allMarketSymbols = new Set<string>();

  for (const p of portfolios) {
    const symbol = (p.asset?.symbol || '').toUpperCase();
    if (!symbol) continue;
    if (isBlockedSymbol(symbol)) continue;
    allMarketSymbols.add(symbol);
    if (!symbolsPerUser.has(p.userId)) symbolsPerUser.set(p.userId, new Set());
    symbolsPerUser.get(p.userId)!.add(symbol);
  }

  const users = Array.from(symbolsPerUser.keys());
  console.log(`Posições em Portfolio: ${totalPositions}`);
  console.log(`Usuários com carteira: ${users.length}`);
  console.log(`Símbolos de mercado únicos (após filtro): ${allMarketSymbols.size}\n`);

  if (allMarketSymbols.size === 0) {
    console.log('Nenhum símbolo de mercado — encerrando.');
    return;
  }

  // 2) Para cada símbolo, conta meses distintos com pelo menos 1 registro nos últimos 24m
  const now = new Date();
  const vinte_e_quatro_meses_atras = new Date(now);
  vinte_e_quatro_meses_atras.setMonth(vinte_e_quatro_meses_atras.getMonth() - 24);

  const priceRows = await prisma.assetPriceHistory.findMany({
    where: {
      symbol: { in: Array.from(allMarketSymbols) },
      date: { gte: vinte_e_quatro_meses_atras },
    },
    select: { symbol: true, date: true },
  });

  const monthsPerSymbol = new Map<string, Set<string>>();
  for (const row of priceRows) {
    const key = `${row.date.getUTCFullYear()}-${String(row.date.getUTCMonth() + 1).padStart(2, '0')}`;
    if (!monthsPerSymbol.has(row.symbol)) monthsPerSymbol.set(row.symbol, new Set());
    monthsPerSymbol.get(row.symbol)!.add(key);
  }

  // Categorização: TD e pares FX vêm de fontes diferentes, devem ser tratados à parte
  const isTesouroDireto = (s: string) => s.startsWith('TD-');
  const isFxPair = (s: string) => /^[A-Z]{3}-[A-Z]{3}$/.test(s);
  const categorize = (s: string): 'td' | 'fx' | 'market' => {
    if (isTesouroDireto(s)) return 'td';
    if (isFxPair(s)) return 'fx';
    return 'market';
  };

  // 3) Buckets — apenas sobre símbolos de MERCADO (excluindo TD/FX)
  const marketSymbols = Array.from(allMarketSymbols).filter((s) => categorize(s) === 'market');
  const tdSymbols = Array.from(allMarketSymbols).filter((s) => categorize(s) === 'td');
  const fxSymbols = Array.from(allMarketSymbols).filter((s) => categorize(s) === 'fx');

  const buckets = { ge24: 0, m18_23: 0, m12_17: 0, m1_11: 0, zero: 0 };
  const coldSymbols: Array<{ symbol: string; months: number }> = [];

  for (const symbol of marketSymbols) {
    const n = monthsPerSymbol.get(symbol)?.size ?? 0;
    if (n >= 24) buckets.ge24++;
    else if (n >= 18) buckets.m18_23++;
    else if (n >= 12) buckets.m12_17++;
    else if (n >= 1) buckets.m1_11++;
    else buckets.zero++;
    if (n < 12) coldSymbols.push({ symbol, months: n });
  }

  console.log('--- Segmentação ---');
  console.log(`Tesouro Direto (TD-*): ${tdSymbols.length} — fonte própria (TesouroDiretoPrice)`);
  console.log(`Pares FX (XXX-YYY):    ${fxSymbols.length} — candidatos a exclusão ou fonte BACEN`);
  console.log(`Mercado (ações/FII/crypto/BDR/ETF): ${marketSymbols.length}\n`);

  const total = marketSymbols.length;
  const pct = (n: number) => (total > 0 ? ((n / total) * 100).toFixed(1) : '0.0');

  console.log(
    '--- Distribuição por meses de histórico (últimos 24m) — apenas ativos de mercado ---',
  );
  console.log(`>= 24 meses: ${buckets.ge24} (${pct(buckets.ge24)}%)`);
  console.log(`18-23 meses: ${buckets.m18_23} (${pct(buckets.m18_23)}%)`);
  console.log(`12-17 meses: ${buckets.m12_17} (${pct(buckets.m12_17)}%)`);
  console.log(`1-11 meses:  ${buckets.m1_11} (${pct(buckets.m1_11)}%)`);
  console.log(`0 meses:     ${buckets.zero} (${pct(buckets.zero)}%)`);

  const coldPct = ((buckets.m1_11 + buckets.zero) / total) * 100;
  const usablePct = ((buckets.ge24 + buckets.m18_23 + buckets.m12_17) / total) * 100;
  console.log(`\nUtilizáveis (>= 12 meses): ${usablePct.toFixed(1)}%`);
  console.log(`Cold (< 12 meses): ${coldPct.toFixed(1)}%`);

  // 4) Análise por usuário
  console.log('\n--- Cobertura por usuário ---');
  const userSummaries: Array<{
    userId: string;
    totalSymbols: number;
    usable: number;
    cold: number;
    usablePct: number;
  }> = [];

  for (const [userId, symbols] of symbolsPerUser) {
    let usable = 0;
    let cold = 0;
    const marketOnly = Array.from(symbols).filter((s) => categorize(s) === 'market');
    for (const s of marketOnly) {
      const n = monthsPerSymbol.get(s)?.size ?? 0;
      if (n >= 12) usable++;
      else cold++;
    }
    userSummaries.push({
      userId: userId.slice(0, 8),
      totalSymbols: marketOnly.length,
      usable,
      cold,
      usablePct: marketOnly.length > 0 ? (usable / marketOnly.length) * 100 : 0,
    });
  }

  userSummaries.sort((a, b) => b.totalSymbols - a.totalSymbols);
  for (const u of userSummaries.slice(0, 10)) {
    console.log(
      `  user ${u.userId}…: ${u.totalSymbols} ativos | ${u.usable} utilizáveis, ${u.cold} cold | ${u.usablePct.toFixed(0)}%`,
    );
  }
  if (userSummaries.length > 10) {
    console.log(`  ...e mais ${userSummaries.length - 10} usuários`);
  }

  // 5) Lista os cold symbols (para saber o que o BRAPI precisaria backfillar)
  if (coldSymbols.length > 0) {
    console.log(`\n--- Cold symbols (< 12 meses) — top 20 ---`);
    coldSymbols.sort((a, b) => a.months - b.months);
    for (const c of coldSymbols.slice(0, 20)) {
      console.log(`  ${c.symbol}: ${c.months}m`);
    }
    if (coldSymbols.length > 20) {
      console.log(`  ...e mais ${coldSymbols.length - 20} símbolos`);
    }
  }

  // 6) Veredito
  console.log('\n=== Veredito ===');
  if (usablePct >= 90) {
    console.log('✅ OK para seguir direto ao commit 1 (math + tipos).');
    console.log(
      '   Cold symbols serão backfillados sob demanda via BRAPI fallback no primeiro request.',
    );
  } else if (usablePct >= 70) {
    console.log('⚠️  Cobertura OK mas não excelente.');
    console.log('   Considere backfill preventivo (commit opcional) antes de shippar o feature.');
  } else {
    console.log('❌ Cobertura insuficiente.');
    console.log(
      '   Antes do feature, estender cron prices-stocks para fetch com range=2y ou rodar backfill one-off.',
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
