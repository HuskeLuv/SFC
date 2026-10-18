/**
 * Job 'quadro-eua' (avulso; no cron roda dentro do 'eua-diario'). Materializa as linhas stock/reit
 * de analise_quadro_linhas (mapeamento em src/types/analiseAtivosEua.ts, "Quadro EUA") pelo
 * gravador da fatia 0 com CLASSES_EUA (gravarLinhasQuadro(prisma, linhas, CLASSES_EUA)) e lê os
 * compactos com lerCompactosPorSimbolo(prisma, { classes: CLASSES_EUA }).
 *
 * DONO: fatia B (docs/analise-ativos/stocks-reits/desenho.json). O corpo está em
 * quadro/gerarQuadroEua.ts; este módulo é o ponto de entrada que o catálogo importa.
 */
import type { OpcoesExecucaoJob } from '@/services/analiseAtivos/jobs/catalogoJobs';
import { gerarQuadroEua } from '@/services/analiseAtivos/quadro/gerarQuadroEua';
import type { JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';

export async function jobQuadroEua(
  ctx: JobContexto,
  _opcoes?: OpcoesExecucaoJob,
): Promise<ResultadoJob> {
  return gerarQuadroEua(ctx);
}
