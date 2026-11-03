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
 * Proventos recebidos (ticket 86e3yeay4): os proventos que caem hoje viram UMA
 * notificação própria por usuário e dia (`PROVENTO_RECEBIDO_TYPE`, categoria de
 * push 'proventos') — "Você recebeu proventos de ITSA4" com 1 ativo, um resumo
 * com vários. O valor em R$ fica só na `message` do sino (mascarada pelos
 * valores ocultos); o título, que vai no push, nunca leva R$ — a preferência de
 * valores ocultos é do navegador e o servidor não a enxerga.
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
import { enviarPushDaNotificacao } from '@/services/push/enviarPush';
import { montarAgenda } from './agenda';
import { hojeCivil, somarDias } from './datas';
import type { EventoAgenda, TipoEvento } from './types';

export const AGENDA_LEMBRETE_TYPE = 'agenda_lembrete';

/** Proventos que caíram hoje na carteira: no máximo uma notificação por usuário e dia. */
export const PROVENTO_RECEBIDO_TYPE = 'provento_recebido';

/** Quantos proventos o resumo lista por nome antes do "e mais N". */
export const MAX_PROVENTOS_LISTADOS = 5;

/** Destino do resumo com vários ativos: Carteira › Análises (sub-aba Proventos). */
export const HREF_PROVENTOS = '/carteira?aba=analise';

export interface ProventoRecebidoMetadata {
  /** Data civil do pagamento — a chave do "um por dia". */
  data: string;
  eventoIds: string[];
  symbols: string[];
  href: string;
}

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

const symbolDoProvento = (e: EventoAgenda): string =>
  typeof e.detalhe.symbol === 'string' && e.detalhe.symbol
    ? e.detalhe.symbol
    : e.titulo.split(' · ')[0];

const rotuloDoProvento = (e: EventoAgenda): string => {
  const tipo = typeof e.detalhe.tipoProvento === 'string' ? e.detalhe.tipoProvento : null;
  return tipo ? `${symbolDoProvento(e)} (${tipo})` : symbolDoProvento(e);
};

const listaHumana = (itens: string[]): string =>
  itens.length <= 1 ? (itens[0] ?? '') : `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`;

/**
 * Texto da notificação de proventos do dia. O título vai no push e NUNCA leva
 * R$ (contrato do push); o valor fica na `message`, só no sino.
 */
export function textoProventosRecebidos(eventos: EventoAgenda[]): {
  title: string;
  message: string;
} {
  const symbols = [...new Set(eventos.map(symbolDoProvento))];
  const title =
    symbols.length <= 3
      ? `Você recebeu proventos de ${listaHumana(symbols)}`
      : `Você recebeu proventos de ${symbols.length} ativos`;

  if (eventos.length === 1) {
    const [e] = eventos;
    return {
      title,
      message:
        e.valor != null
          ? `Você recebeu ${brl(e.valor)} de ${rotuloDoProvento(e)} hoje.`
          : `${rotuloDoProvento(e)} tem pagamento hoje.`,
    };
  }

  const listados = eventos
    .slice(0, MAX_PROVENTOS_LISTADOS)
    .map((e) => (e.valor != null ? `${rotuloDoProvento(e)} ${brl(e.valor)}` : rotuloDoProvento(e)));
  const resto = eventos.length - listados.length;
  const lista = resto > 0 ? `${listados.join(', ')} e mais ${resto}` : listaHumana(listados);
  const todosComValor = eventos.every((e) => e.valor != null);
  const total = eventos.reduce((acc, e) => acc + (e.valor ?? 0), 0);
  return {
    title,
    message: todosComValor
      ? `Você recebeu ${brl(total)} em ${eventos.length} proventos hoje: ${lista}.`
      : `${eventos.length} proventos com pagamento hoje: ${lista}.`,
  };
}

/** Destino do toque: o ativo, se for um só; senão a aba de Proventos da carteira. */
const hrefDosProventos = (eventos: EventoAgenda[]): string => {
  const symbols = new Set(eventos.map(symbolDoProvento));
  const link = eventos[0]?.link;
  return symbols.size === 1 && link && link.startsWith('/') && !link.startsWith('//')
    ? link
    : HREF_PROVENTOS;
};

interface JaAvisados {
  /** `${eventoId}|${data}` dos lembretes da agenda (inclui provento do formato antigo). */
  chaves: Set<string>;
  /** Datas em que o usuário já recebeu a notificação de proventos (uma por dia). */
  diasProventos: Set<string>;
}

/** Lembretes e avisos de proventos já enviados nos últimos dias, para não repetir. */
async function jaAvisados(userId: string, desde: Date): Promise<JaAvisados> {
  const existentes = await prisma.notification.findMany({
    where: {
      userId,
      type: { in: [AGENDA_LEMBRETE_TYPE, PROVENTO_RECEBIDO_TYPE] },
      createdAt: { gte: desde },
    },
    select: { type: true, metadata: true },
  });
  const chaves = new Set<string>();
  const diasProventos = new Set<string>();
  for (const n of existentes) {
    if (n.type === PROVENTO_RECEBIDO_TYPE) {
      const meta = n.metadata as Partial<ProventoRecebidoMetadata> | null;
      if (meta?.data) diasProventos.add(meta.data);
      continue;
    }
    const meta = n.metadata as Partial<LembreteMetadata> | null;
    if (meta?.eventoId && meta.data) chaves.add(`${meta.eventoId}|${meta.data}`);
  }
  return { chaves, diasProventos };
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

      const { chaves: enviados, diasProventos } = await jaAvisados(userId, desde);
      const naoEnviados = escolhidos.filter(
        ({ evento }) => !enviados.has(`${evento.id}|${evento.data}`),
      );

      // Proventos de hoje: um aviso só por dia (resumo se forem vários). O dia
      // já avisado não reenvia, nem se o cron rodar de novo.
      const proventosHoje = naoEnviados
        .filter(({ evento }) => evento.tipo === 'provento')
        .map(({ evento }) => evento);
      if (proventosHoje.length > 0 && !diasProventos.has(hoje)) {
        const { title, message } = textoProventosRecebidos(proventosHoje);
        const notificacao = await prisma.notification.create({
          data: {
            userId,
            title,
            message,
            type: PROVENTO_RECEBIDO_TYPE,
            metadata: {
              data: hoje,
              eventoIds: proventosHoje.map((e) => e.id),
              symbols: [...new Set(proventosHoje.map(symbolDoProvento))],
              href: hrefDosProventos(proventosHoje),
            } satisfies ProventoRecebidoMetadata,
          },
        });
        void enviarPushDaNotificacao(notificacao);
        notificacoes += 1;
      }

      const novos = naoEnviados
        .filter(({ evento }) => evento.tipo !== 'provento')
        .slice(0, MAX_LEMBRETES_POR_USUARIO);

      for (const { evento, quando } of novos) {
        const { title, message } = textoDoLembrete(evento, quando);
        const notificacao = await prisma.notification.create({
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
        // Web push best-effort (fase 5): a preferência por categoria vale
        // também para o cron — o gate fica dentro do serviço de envio.
        void enviarPushDaNotificacao(notificacao);
        notificacoes += 1;
      }
    } catch (error: unknown) {
      comErro += 1;
      logger.error('[agenda-lembretes] falhou para um usuário:', error);
    }
  }

  return { usuarios: atendidos, notificacoes, comErro };
}
