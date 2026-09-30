/**
 * STUB da fatia 0: só registra no logger. A fatia E substitui a implementação (alerta por falhas
 * seguidas, notificação a admins atrás de flag) MANTENDO esta assinatura.
 */
import type { PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logger';
import type { RelatorioJob } from '@/services/analiseAtivos/tipos';

export async function notificarResultadoJob(_prisma: PrismaClient, r: RelatorioJob): Promise<void> {
  const resumo = {
    job: r.job,
    status: r.status,
    duracaoMs: r.duracaoMs,
    linhasLidas: r.linhasLidas,
    linhasGravadas: r.linhasGravadas,
    rejeitadas: r.rejeitadas,
    rssPicoMb: r.rssPicoMb,
    alertas: r.alertas.length,
  };
  if (r.status === 'falha') {
    logger.error('[analise-ativos] job falhou', { ...resumo, erro: r.erro });
  } else if (r.alertas.some((a) => a.nivel === 'erro' || a.nivel === 'aviso')) {
    logger.warn('[analise-ativos] job com alertas', resumo);
  } else {
    logger.info('[analise-ativos] job concluído', resumo);
  }
}
