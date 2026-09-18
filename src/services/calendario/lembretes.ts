/**
 * Lembretes da Agenda: notificação in-app do que vence.
 *
 * Roda uma vez por dia (cron) e olha uma janela de dois dias:
 *  - o que SAI ou VENCE (parcela de dívida em aberto, título de renda fixa,
 *    prazo de IR, evento marcado com lembrete) avisa na VÉSPERA, para dar
 *    tempo de agir;
 *  - o que ENTRA (provento na data de pagamento) avisa NO DIA.
 * Decisão do plano da Agenda (11/09/2026).
 *
 * Uma notificação por evento, com dedup por (usuário, id do evento, data)
 * guardado em `Notification.metadata` — rodar o cron duas vezes no mesmo dia
 * não duplica nada. Quem desligou os lembretes no perfil fica de fora.
 *
 * Custo: monta a agenda de cada usuário (proventos e IR percorrem o histórico
 * inteiro). Hoje são poucas contas; se crescer, filtrar antes quem tem algo
 * na janela.
 */
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { montarAgenda } from './agenda';
import { hojeCivil, somarDias } from './datas';
import type { EventoAgenda, TipoEvento } from './types';

export const AGENDA_LEMBRETE_TYPE = 'agenda_lembrete';

/** Fontes que geram lembrete (planejamento e mercado não são "a fazer"). */
const TIPOS_LEMBRETE: TipoEvento[] = ['divida', 'rf', 'provento', 'ir', 'manual'];

/** Teto por usuário numa rodada, para um mês cheio não virar 30 notificações. */
export const MAX_LEMBRETES_POR_USUARIO = 10;

export interface LembreteMetadata {
  eventoId: string;
  data: string;
  tipo: TipoEvento;
  quando: 'hoje' | 'vespera';
}

const brl = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const dataLegivel = (d: string): string => d.split('-').reverse().join('/');

/**
 * Escolhe o que vira lembrete. `hoje` e `amanha` são datas civis.
 * Parcela já paga, data-com de provento e evento manual sem lembrete marcado
 * não avisam nada.
 */
export function selecionarLembretes(
  eventos: EventoAgenda[],
  hoje: string,
  amanha: string,
): Array<{ evento: EventoAgenda; quando: 'hoje' | 'vespera' }> {
  const out: Array<{ evento: EventoAgenda; quando: 'hoje' | 'vespera' }> = [];
  for (const e of eventos) {
    if (e.tipo === 'provento') {
      // Dinheiro que entra: avisa no dia em que cai.
      if (e.detalhe.evento === 'pagamento' && e.data === hoje) {
        out.push({ evento: e, quando: 'hoje' });
      }
      continue;
    }
    if (e.data !== amanha) continue;
    if (e.tipo === 'divida' && e.detalhe.paga === true) continue;
    if (e.tipo === 'manual' && e.detalhe.lembrete !== true) continue;
    out.push({ evento: e, quando: 'vespera' });
  }
  return out;
}

export function textoDoLembrete(
  evento: EventoAgenda,
  quando: 'hoje' | 'vespera',
): { title: string; message: string } {
  const valor = evento.valor != null ? ` (${brl(evento.valor)})` : '';
  if (quando === 'hoje') {
    return {
      title: 'Provento na conta hoje',
      message: `${evento.titulo}${valor} tem pagamento hoje.`,
    };
  }
  const titulo =
    evento.tipo === 'divida'
      ? 'Parcela vence amanhã'
      : evento.tipo === 'rf'
        ? 'Título vence amanhã'
        : evento.tipo === 'ir'
          ? 'Prazo de imposto amanhã'
          : 'Compromisso amanhã';
  return {
    title: titulo,
    message: `${evento.titulo}${valor} — ${dataLegivel(evento.data)}.`,
  };
}

/** Lembretes já enviados nos últimos dias, para não repetir. */
async function jaAvisados(userId: string, desde: Date): Promise<Set<string>> {
  const existentes = await prisma.notification.findMany({
    where: { userId, type: AGENDA_LEMBRETE_TYPE, createdAt: { gte: desde } },
    select: { metadata: true },
  });
  const chaves = new Set<string>();
  for (const n of existentes) {
    const meta = n.metadata as Partial<LembreteMetadata> | null;
    if (meta?.eventoId && meta.data) chaves.add(`${meta.eventoId}|${meta.data}`);
  }
  return chaves;
}

export interface ResultadoLembretes {
  usuarios: number;
  notificacoes: number;
  comErro: number;
}

export async function runAgendaLembretesJob(agora: Date = new Date()): Promise<ResultadoLembretes> {
  const hoje = hojeCivil(agora);
  const amanha = somarDias(hoje, 1);
  // Janela de dedup: 3 dias cobrem a véspera + reprocessos, sem varrer a tabela.
  const desde = new Date(agora.getTime() - 3 * 24 * 60 * 60 * 1000);

  const desligados = await prisma.agendaPreferencia.findMany({
    where: { lembretes: false },
    select: { userId: true },
  });
  const fora = new Set(desligados.map((d) => d.userId));
  const usuarios = await prisma.user.findMany({ select: { id: true } });

  let notificacoes = 0;
  let comErro = 0;
  let atendidos = 0;

  for (const { id: userId } of usuarios) {
    if (fora.has(userId)) continue;
    atendidos += 1;
    try {
      const { eventos } = await montarAgenda(userId, { de: hoje, ate: amanha }, TIPOS_LEMBRETE);
      const escolhidos = selecionarLembretes(eventos, hoje, amanha);
      if (escolhidos.length === 0) continue;

      const enviados = await jaAvisados(userId, desde);
      const novos = escolhidos
        .filter(({ evento }) => !enviados.has(`${evento.id}|${evento.data}`))
        .slice(0, MAX_LEMBRETES_POR_USUARIO);

      for (const { evento, quando } of novos) {
        const { title, message } = textoDoLembrete(evento, quando);
        await prisma.notification.create({
          data: {
            userId,
            title,
            message,
            type: AGENDA_LEMBRETE_TYPE,
            metadata: {
              eventoId: evento.id,
              data: evento.data,
              tipo: evento.tipo,
              quando,
            } satisfies LembreteMetadata,
          },
        });
        notificacoes += 1;
      }
    } catch (error: unknown) {
      comErro += 1;
      logger.error('[agenda-lembretes] falhou para um usuário:', error);
    }
  }

  return { usuarios: atendidos, notificacoes, comErro };
}
