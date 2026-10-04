/**
 * Aviso aos curadores (admins) de caso novo de relato (bloco C, fatia D). A resposta ao AUTOR, ao
 * fechar o caso, é da fatia C (notificacoesCaso.ts).
 *
 * - Disparo: caso aberto agora por um relato, ou 1º relato de usuário num caso de regra.
 * - Gate (decisão 14): ANALISE_ATIVOS_REPORTE_HABILITADO + produção. NÃO depende de
 *   ANALISE_ATIVOS_ALERTA_ADMIN (o alerta de caso novo independe dela).
 * - Sem empilhar: se o admin ainda tem um aviso NÃO lido do mesmo caso, não recebe outro.
 * - Notification 'analise_ativos_reporte' com href /admin/curadoria/<id>; push best-effort (só
 *   envia se o type estiver no contrato de push).
 * - Nunca lança (falha vira logger.error; o relato já foi gravado).
 */
import type { PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logger';
import { analiseAtivosReporteHabilitado } from '@/lib/analiseAtivosConfig';
import { enviarPushDaNotificacao } from '@/services/push/enviarPush';
import {
  ROTAS_CURADORIA,
  TIPOS_NOTIFICACAO,
  type CampoReporte,
} from '@/services/analiseAtivos/curadoria/contrato';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';

export interface CasoParaAviso {
  id: string;
  symbol: string;
  campo: string;
  /** AAAA-MM-DD */
  slaAte: string | null;
}

function dataBr(civil: string | null): string {
  if (!civil) return '—';
  const [a, m, d] = civil.split('-');
  return `${d}/${m}/${a}`;
}

function rotuloCampo(campo: string): string {
  const campos = TEXTOS_TELA.relatos.campos as Record<CampoReporte, string>;
  return campos[campo as CampoReporte] ?? campo;
}

/** O aviso só sai em produção com a flag do relato ligada (decisão 14). */
export function avisoAdminsAtivo(): boolean {
  return process.env.NODE_ENV === 'production' && analiseAtivosReporteHabilitado();
}

/** Devolve quantos admins foram avisados. */
export async function notificarAdminsNovoCaso(
  db: PrismaClient,
  caso: CasoParaAviso,
): Promise<number> {
  if (!avisoAdminsAtivo()) return 0;
  try {
    const admins = await db.user.findMany({ where: { role: 'admin' }, select: { id: true } });
    if (admins.length === 0) return 0;
    const pendentes = await db.notification.findMany({
      where: {
        userId: { in: admins.map((a) => a.id) },
        type: TIPOS_NOTIFICACAO.novoCaso,
        readAt: null,
        metadata: { path: ['casoId'], equals: caso.id },
      },
      select: { userId: true },
    });
    const jaAvisados = new Set(pendentes.map((p) => p.userId));
    const t = TEXTOS_TELA.relatos.notificacoes;
    const title = formatarTexto(t.novoCasoTitulo, {
      ticker: caso.symbol,
      campo: rotuloCampo(caso.campo),
    });
    const message = formatarTexto(t.novoCasoMensagem, { data: dataBr(caso.slaAte) });
    let n = 0;
    for (const admin of admins) {
      if (jaAvisados.has(admin.id)) continue;
      const notificacao = await db.notification.create({
        data: {
          userId: admin.id,
          type: TIPOS_NOTIFICACAO.novoCaso,
          title,
          message,
          metadata: {
            casoId: caso.id,
            symbol: caso.symbol,
            campo: caso.campo,
            href: ROTAS_CURADORIA.caso(caso.id),
          },
        },
      });
      n += 1;
      void enviarPushDaNotificacao(notificacao);
    }
    return n;
  } catch (error: unknown) {
    logger.error('[analise-ativos][relatos] falha ao avisar os admins do caso novo', {
      casoId: caso.id,
      erro: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}
