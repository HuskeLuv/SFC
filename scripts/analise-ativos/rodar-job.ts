/**
 * Runner de job da Análise de Ativos em PROCESSO SEPARADO do next-server (cron de produção dos jobs
 * pesados; qualquer job do catálogo pode rodar assim). Mesma função e mesmo AnaliseJobRun da rota
 * /api/cron/analise-ativos/<rota>; o processo termina e devolve a memória ao sistema.
 *
 * Uso (produção: /usr/local/bin/myfinance-job.sh <job>, ver docs/analise-ativos/fase0/RUNBOOK.md §5):
 *   NODE_OPTIONS=--max-old-space-size=256 npx tsx --env-file=.env \
 *     scripts/analise-ativos/rodar-job.ts scores [--prazo-s=N]
 *
 * Jobs: b3-cadastro, fii-cadastro, cvm-cias:fca|dfp|itr, cvm-ipe, fii-mensal, fii-trimestral,
 * cotahist, scores. Saída: uma linha JSON com o relatório; código 1 se o job falhou.
 */
import { rodarJobCli } from '../../src/services/analiseAtivos/jobs/rodarJobCli';
import { prisma } from '../../src/lib/prisma';

async function main() {
  let codigo = 1;
  try {
    const r = await rodarJobCli(process.argv.slice(2));
    const { alertas, ...resumo } = r.relatorio;
    console.log(JSON.stringify({ ...resumo, alertas: alertas.length }));
    for (const a of alertas) console.log(`  [${a.nivel}] ${a.codigo}: ${a.mensagem}`);
    codigo = r.codigo;
  } catch (e: unknown) {
    console.error(e instanceof Error ? e.message : e);
  } finally {
    await prisma.$disconnect();
  }
  process.exit(codigo);
}

main();
