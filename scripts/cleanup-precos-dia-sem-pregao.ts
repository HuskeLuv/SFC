/**
 * Limpa as linhas de AssetPriceHistory gravadas pela BRAPI em dia SEM pregão B3
 * (sábado, domingo ou feriado) para ativos de bolsa brasileira.
 *
 * Origem: o cron de preços (07h UTC) gravava o fechamento do pregão anterior com a
 * data do dia da consulta, porque a BRAPI devolve `regularMarketTime` = hora da
 * consulta. Nos dias úteis o valor é corrigido rodando o COTAHIST oficial (que tem
 * precedência sobre a BRAPI: scripts/backfill-cotahist-b3.ts --years=2025,2026);
 * nos dias sem pregão não existe cotação oficial e a linha é só uma cópia do
 * fechamento anterior — este script as remove.
 *
 * Ordem recomendada em produção:
 *   1. npx tsx --env-file=.env scripts/backfill-cotahist-b3.ts --years=2025,2026 --apply
 *   2. npx tsx --env-file=.env scripts/cleanup-precos-dia-sem-pregao.ts            # dry-run
 *   3. npx tsx --env-file=.env scripts/cleanup-precos-dia-sem-pregao.ts --apply
 *
 * Só toca linhas source='BRAPI' de ativos com mercado B3 (mercadoDoAtivo); cripto,
 * moeda e ativos em USD ficam intactos. Idempotente.
 */
import prisma from '@/lib/prisma';
import { isNonBusinessDayB3 } from '@/utils/feriadosB3';
import { mercadoDoAtivo } from '@/services/pricing/pregaoReferencia';

async function main() {
  const apply = process.argv.slice(2).includes('--apply');
  console.log(`\n🧹 Preços BRAPI em dia sem pregão B3 (${apply ? 'APPLY' : 'DRY RUN'})\n`);

  const linhas = await prisma.assetPriceHistory.findMany({
    where: { source: 'BRAPI' },
    select: {
      id: true,
      symbol: true,
      date: true,
      price: true,
      asset: { select: { type: true, currency: true } },
    },
  });

  const alvo = linhas.filter((l) => mercadoDoAtivo(l.asset) === 'B3' && isNonBusinessDayB3(l.date));

  const porAno = new Map<number, number>();
  for (const l of alvo) {
    const ano = l.date.getUTCFullYear();
    porAno.set(ano, (porAno.get(ano) ?? 0) + 1);
  }
  console.log(`   linhas BRAPI lidas:          ${linhas.length.toLocaleString('pt-BR')}`);
  console.log(`   em dia sem pregão (B3):      ${alvo.length.toLocaleString('pt-BR')}`);
  for (const [ano, n] of [...porAno].sort((a, b) => a[0] - b[0])) {
    console.log(`      ${ano}: ${n.toLocaleString('pt-BR')}`);
  }
  console.log('   amostra:');
  for (const l of alvo.slice(0, 8)) {
    console.log(`      ${l.date.toISOString().slice(0, 10)}  ${l.symbol.padEnd(10)}  ${l.price}`);
  }

  if (!apply) {
    console.log('\n   (dry-run; nada removido — use --apply)\n');
    return;
  }

  const LOTE = 5000;
  let removidas = 0;
  for (let i = 0; i < alvo.length; i += LOTE) {
    const ids = alvo.slice(i, i + LOTE).map((l) => l.id);
    const r = await prisma.assetPriceHistory.deleteMany({
      where: { id: { in: ids }, source: 'BRAPI' },
    });
    removidas += r.count;
  }
  console.log(`\n   ✅ removidas: ${removidas.toLocaleString('pt-BR')}\n`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
