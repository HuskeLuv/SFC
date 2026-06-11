/**
 * Invalida TODOS os snapshots de patrimônio/performance (todos os usuários).
 * Necessário após um fix na lógica da SÉRIE (ex.: data-ex de proventos): os
 * snapshots cacheados foram construídos com código errado. Apagando-os, cada
 * resumo reconstrói ao vivo com o código corrigido e re-persiste certo.
 *
 * Seguro: o reader cai pro builder ao vivo quando não há snapshot. Custo = 1
 * rebuild por usuário na próxima leitura (one-time). O cache TTL em memória
 * expira sozinho.
 *
 * Uso: tsx --env-file=.env scripts/invalidate-all-snapshots.ts [--apply]
 */
import { prisma } from '@/lib/prisma';

async function main() {
  const apply = process.argv.includes('--apply');
  const daily = await prisma.portfolioDailySnapshot.count();
  const perf = await prisma.portfolioPerformance.count();
  console.log(`\nSnapshots atuais: ${daily} daily + ${perf} performance\n`);

  if (!apply) {
    console.log('(dry-run — rode com --apply pra apagar tudo)\n');
    return;
  }

  const d1 = await prisma.portfolioDailySnapshot.deleteMany({});
  const d2 = await prisma.portfolioPerformance.deleteMany({});
  console.log(`✅ removidos: ${d1.count} daily + ${d2.count} performance.`);
  console.log('Próxima leitura de cada resumo reconstrói ao vivo (código corrigido).\n');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Fatal:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
