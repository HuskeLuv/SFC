/**
 * Notificações da curadoria (bloco C, fatia C) — sino (tabela Notification) + web push best-effort.
 *
 *  - Resposta ao autor (decisão 11): SÓ ao fechar o caso, UMA Notification por autor distinto
 *    (o consultor, se agia pelo cliente — decisão 10; o cliente não é notificado). Título
 *    "Seu relato sobre <TICKER> foi respondido", mensagem neutra pela resolução (o texto da equipe
 *    fica em Meus relatos e na página do ativo, nunca no push). href = página do ativo com ?relatos=1.
 *  - Resumo diário de prazos aos admins (decisão 14): vencidos e vencendo em até 2 dias úteis, só
 *    casos com usuário (casos só de regra e de revisão não têm prazo). 1×/dia por admin.
 *
 * As Notifications são criadas DENTRO da transação de quem chama (decisão do curador); o push sai
 * depois do commit (`enviarPushes`), sem nunca falhar a ação.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logger';
import { enviarPushDaNotificacao } from '@/services/push/enviarPush';
import {
  ROTAS_CURADORIA,
  TIPOS_NOTIFICACAO,
  dataCivilSaoPaulo,
  type ResolucaoCaso,
} from '@/services/analiseAtivos/curadoria/contrato';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';

type Db = PrismaClient | Prisma.TransactionClient;

export interface NotificacaoCaso {
  id: string;
  userId: string;
  type: string;
  title: string;
  metadata?: unknown;
}

const T_NOTIF = TEXTOS_TELA.relatos.notificacoes;

/** Título e mensagem da resposta ao autor (sem texto livre: a resposta da equipe fica na tela). */
export function textoRespostaAutor(ticker: string, resolucao: ResolucaoCaso) {
  const motivo = TEXTOS_TELA.relatos.meus.resolucoes[resolucao];
  return {
    title: formatarTexto(T_NOTIF.respostaTitulo, { ticker: ticker.toUpperCase() }),
    message: formatarTexto(T_NOTIF.respostaMensagem, { motivo }),
  };
}

/**
 * Cria UMA Notification por autor distinto do caso (na transação de quem fecha). Devolve as
 * criadas, para o push depois do commit.
 */
export async function notificarAutoresDoCaso(
  db: Db,
  caso: { id: string; symbol: string; resolucao: ResolucaoCaso },
  autores: readonly string[],
): Promise<NotificacaoCaso[]> {
  const unicos = [...new Set(autores)];
  if (unicos.length === 0) return [];
  const { title, message } = textoRespostaAutor(caso.symbol, caso.resolucao);
  const href = ROTAS_CURADORIA.ativoComRelatos(caso.symbol);
  const criadas: NotificacaoCaso[] = [];
  for (const userId of unicos) {
    const n = await db.notification.create({
      data: {
        userId,
        type: TIPOS_NOTIFICACAO.resposta,
        title,
        message,
        metadata: { casoId: caso.id, ticker: caso.symbol, href, groupId: caso.id },
      },
      select: { id: true, userId: true, type: true, title: true, metadata: true },
    });
    criadas.push(n);
  }
  return criadas;
}

/** Push best-effort de cada notificação criada (nunca lança). */
export function enviarPushes(notificacoes: readonly NotificacaoCaso[]): void {
  for (const n of notificacoes) void enviarPushDaNotificacao(n);
}

// ===========================================================================
// Resumo diário de prazos (digest) aos admins
// ===========================================================================

export interface ContagemPrazos {
  vencidos: number;
  /** vencendo em até 2 dias úteis (inclui os que vencem hoje) */
  vencendo: number;
}

/** Texto do resumo; null quando não há nada a avisar. */
export function textoDigest(c: ContagemPrazos): { title: string; message: string } | null {
  if (c.vencidos + c.vencendo === 0) return null;
  return {
    title: T_NOTIF.slaTitulo,
    message: formatarTexto(T_NOTIF.slaMensagem, { n: c.vencidos, total: c.vencendo }),
  };
}

/** Início do dia civil de São Paulo (UTC−3, sem horário de verão desde 2019) como instante. */
export function inicioDoDiaSaoPaulo(agora: Date): Date {
  return new Date(`${dataCivilSaoPaulo(agora)}T00:00:00-03:00`);
}

/**
 * Manda o resumo para cada admin que ainda não recebeu um hoje (dia civil de São Paulo). Devolve
 * quantos seriam/foram enviados; `aplicar=false` só conta.
 */
export async function enviarDigestSla(
  prisma: PrismaClient,
  contagem: ContagemPrazos,
  agora: Date,
  aplicar: boolean,
): Promise<number> {
  const texto = textoDigest(contagem);
  if (!texto) return 0;
  const admins = await prisma.user.findMany({ where: { role: 'admin' }, select: { id: true } });
  if (admins.length === 0) return 0;
  const jaReceberam = await prisma.notification.findMany({
    where: {
      type: TIPOS_NOTIFICACAO.sla,
      userId: { in: admins.map((a) => a.id) },
      createdAt: { gte: inicioDoDiaSaoPaulo(agora) },
    },
    select: { userId: true },
  });
  const ja = new Set(jaReceberam.map((n) => n.userId));
  const destinatarios = admins.filter((a) => !ja.has(a.id));
  if (!aplicar) return destinatarios.length;
  const href = ROTAS_CURADORIA.fila;
  for (const a of destinatarios) {
    try {
      const n = await prisma.notification.create({
        data: {
          userId: a.id,
          type: TIPOS_NOTIFICACAO.sla,
          title: texto.title,
          message: texto.message,
          metadata: { href, groupId: `curadoria-sla-${dataCivilSaoPaulo(agora)}`, ...contagem },
        },
        select: { id: true, userId: true, type: true, title: true, metadata: true },
      });
      void enviarPushDaNotificacao(n);
    } catch (e: unknown) {
      logger.error('[analise-ativos][curadoria] falha ao enviar o resumo de prazos', {
        userId: a.id,
        erro: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return destinatarios.length;
}
