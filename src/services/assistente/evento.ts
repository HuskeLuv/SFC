/**
 * Segunda ação de escrita do assistente: marcar um evento na Agenda
 * (tabela Event). Mesmo fluxo obrigatório do lançamento (spec v1.1 §5):
 *   modelo chama a ferramenta → servidor monta a PROPOSTA (assinada, expira
 *   em 10 min) → app mostra o cartão → usuário confirma → servidor grava.
 * A IA nunca grava direto.
 *
 * Só eventos MANUAIS. Parcela de dívida, provento e vencimento de renda fixa
 * são calculados das telas de origem e não existem como registro na agenda.
 */
import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import type { AuthWithActingResult } from '@/utils/auth';
import { recordChange, diffFields, EVENTO_FIELD_LABELS } from '@/services/changeHistory';
import {
  CATEGORIAS_EVENTO,
  RECORRENCIAS_EVENTO,
  camposDoEvento,
  paraPrisma,
  serializarEvento,
  type CategoriaEvento,
  type EventoManualDto,
  type RecorrenciaEvento,
} from '@/services/calendario/eventoManual';
import { deDataCivil, ehDataCivilValida, hojeCivil, somarDias } from '@/services/calendario/datas';
import { abrirPayload, assinarPayload } from './assinatura';
import { invalidarContextoUsuario } from './contexto';

/** Quantos eventos uma mensagem pode propor (uma chamada de ferramenta por evento). */
export const MAX_EVENTOS_POR_MENSAGEM = 3;

const PROPOSTA_TTL_MS = 10 * 60 * 1000;

/** Janela aceita para a data do evento: nada de agenda em 2098. */
const ANOS_A_FRENTE = 5;
const DIAS_ATRAS = 366;

export interface EventoInput {
  titulo: string;
  data: string;
  dataFim?: string;
  hora?: string;
  categoria?: string;
  recorrencia?: string;
  lembrete?: boolean;
  descricao?: string;
}

export interface PropostaEvento {
  /** Separa esta proposta da de lançamento — as duas usam a mesma chave. */
  kind: 'evento';
  id: string;
  /** Linha de assistente_mensagens que gerou a proposta (métrica de confirmação). */
  mensagemId: string;
  userId: string;
  titulo: string;
  descricao: string | null;
  data: string;
  dataFim: string | null;
  hora: string | null;
  categoria: CategoriaEvento;
  recorrencia: RecorrenciaEvento;
  lembrete: boolean;
  /** epoch ms */
  expiraEm: number;
}

export type ResultadoPropostaEvento =
  | { ok: true; proposta: PropostaEvento; token: string }
  | { ok: false; motivo: string };

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function categoriaValida(v: string | undefined): CategoriaEvento {
  return CATEGORIAS_EVENTO.includes(v as CategoriaEvento) ? (v as CategoriaEvento) : 'pessoal';
}

function recorrenciaValida(v: string | undefined): RecorrenciaEvento {
  return RECORRENCIAS_EVENTO.includes(v as RecorrenciaEvento)
    ? (v as RecorrenciaEvento)
    : 'nenhuma';
}

export function montarPropostaEvento(
  userId: string,
  mensagemId: string,
  input: EventoInput,
  opcoes: { hoje?: Date } = {},
): ResultadoPropostaEvento {
  const titulo = input.titulo?.trim().slice(0, 255);
  if (!titulo) return { ok: false, motivo: 'Faltou o título do evento.' };

  if (!input.data || !ehDataCivilValida(input.data)) {
    return { ok: false, motivo: 'Faltou a data do evento (ou ela não é uma data válida).' };
  }
  const hoje = hojeCivil(opcoes.hoje ?? new Date());
  const limiteAntes = somarDias(hoje, -DIAS_ATRAS);
  const limiteDepois = somarDias(hoje, 365 * ANOS_A_FRENTE);
  if (input.data < limiteAntes || input.data > limiteDepois) {
    return { ok: false, motivo: 'A data está fora da janela que a agenda aceita.' };
  }

  let dataFim: string | null = null;
  if (input.dataFim) {
    if (!ehDataCivilValida(input.dataFim)) {
      return { ok: false, motivo: 'A data de término não é uma data válida.' };
    }
    if (input.dataFim < input.data) {
      return { ok: false, motivo: 'A data de término vem antes da data de início.' };
    }
    if (input.dataFim !== input.data) dataFim = input.dataFim;
  }

  const hora = input.hora?.trim();
  if (hora && !HORA_RE.test(hora)) {
    return { ok: false, motivo: 'A hora precisa estar no formato HH:MM.' };
  }

  const proposta: PropostaEvento = {
    kind: 'evento',
    id: randomUUID(),
    mensagemId,
    userId,
    titulo,
    descricao: input.descricao?.trim().slice(0, 500) || null,
    data: input.data,
    dataFim,
    hora: hora || null,
    categoria: categoriaValida(input.categoria),
    recorrencia: recorrenciaValida(input.recorrencia),
    lembrete: input.lembrete === true,
    expiraEm: Date.now() + PROPOSTA_TTL_MS,
  };
  return { ok: true, proposta, token: assinarPayload(proposta) };
}

/** Devolve a proposta se a assinatura confere, não expirou e pertence ao usuário. */
export function verificarPropostaEvento(token: string, userId: string): PropostaEvento | null {
  const p = abrirPayload<PropostaEvento>(token);
  if (!p || p.kind !== 'evento') return null;
  if (p.userId !== userId || p.expiraEm < Date.now()) return null;
  if (!p.titulo || !ehDataCivilValida(p.data)) return null;
  return p;
}

/**
 * Grava o evento confirmado — mesma escrita de POST /api/calendar, com a
 * mesma entrada de histórico (seção "Agenda", ação `evento.criar`), que já é
 * desfazível pelo registry.
 */
export async function aplicarPropostaEvento(
  auth: AuthWithActingResult,
  request: NextRequest,
  p: PropostaEvento,
): Promise<EventoManualDto> {
  const created = await prisma.event.create({
    data: {
      userId: auth.targetUserId,
      title: p.titulo,
      date: deDataCivil(p.data),
      ...paraPrisma({
        descricao: p.descricao,
        dataFim: p.dataFim,
        hora: p.hora,
        categoria: p.categoria,
        recorrencia: p.recorrencia,
        lembrete: p.lembrete,
      }),
    },
  });

  await recordChange({
    request,
    auth,
    section: 'calendario',
    action: 'evento.criar',
    entity: 'evento',
    entityId: created.id,
    entityLabel: `${created.title} (assistente)`,
    changes: diffFields({}, { ...camposDoEvento(created) }, EVENTO_FIELD_LABELS),
  });

  // A agenda dos próximos 60 dias entra no contexto do assistente.
  invalidarContextoUsuario(auth.targetUserId);

  return serializarEvento(created);
}
