/**
 * Job 'quadro-eua' (avulso; no cron roda dentro do 'eua-diario'). Materializa as linhas stock/reit
 * de analise_quadro_linhas (mapeamento em src/types/analiseAtivosEua.ts, "Quadro EUA") pelo
 * gravador da fatia 0 com CLASSES_EUA (gravarLinhasQuadro(prisma, linhas, CLASSES_EUA)) e lê os
 * compactos com lerCompactosPorSimbolo(prisma, { classes: CLASSES_EUA }).
 *
 * DONO: fatia B (docs/analise-ativos/stocks-reits/desenho.json). Criado na fatia 0 como STUB
 * com a assinatura FINAL — o catálogo (jobs/catalogoJobs.ts) já importa este módulo e não é mais
 * editado pelas fatias A/B. Até a fatia B preencher, termina 'pulado' sem tocar no banco.
 */
import type { OpcoesExecucaoJob } from '@/services/analiseAtivos/jobs/catalogoJobs';
import type { JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';

export const MOTIVO_STUB = 'job quadro-eua ainda não implementado (fatia B)';

export async function jobQuadroEua(
  _ctx: JobContexto,
  _opcoes?: OpcoesExecucaoJob,
): Promise<ResultadoJob> {
  return { pulado: MOTIVO_STUB };
}
