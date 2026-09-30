/**
 * Painel de frescor dos dados da Análise de Ativos: por camada, 'em_dia' | 'atrasado' | 'sem_dado'.
 * Lê só pelo repositório da fatia 0 (a E não consulta tabelas de A–D direto). Sem tela nesta fase:
 * insumo do selo "Dados: fonte · data" da Fase 1 e de um /admin futuro.
 */
import type { PrismaClient } from '@prisma/client';
import {
  calcularFrescor,
  LIMITES_FRESCOR_PADRAO,
  type LimiteFrescor,
  type PainelFrescor,
} from '@/services/analiseAtivos/regras/eventos/alertasFrescor';
import {
  dadoMaisRecentePorCamada,
  ultimaExecucaoOkPorJob,
} from '@/services/analiseAtivos/repositorio/jobs';
import type { Camada } from '@/services/analiseAtivos/tipos';

export async function obterPainelFrescor(
  prisma: PrismaClient,
  agora: Date = new Date(),
  limites: Record<Camada, LimiteFrescor> = LIMITES_FRESCOR_PADRAO,
): Promise<PainelFrescor> {
  const [ultimaOkPorJob, dadoMaisRecente] = await Promise.all([
    ultimaExecucaoOkPorJob(prisma),
    dadoMaisRecentePorCamada(prisma),
  ]);
  return calcularFrescor({ ultimaOkPorJob, dadoMaisRecente }, agora, limites);
}
