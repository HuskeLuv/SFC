import { createHash } from 'crypto';
import type { NextRequest } from 'next/server';
import type { OpenFinanceConsentimento, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/apiErrorHandler';
import { getClientIp } from '@/lib/rateLimit';
import {
  PRODUTOS_OPEN_FINANCE,
  TEXTO_CONSENTIMENTO_ATUAL,
  VERSOES_CONSENTIMENTO,
} from '@/lib/openFinanceConsentimento';

/**
 * Consentimento Open Finance DENTRO do My Finance (adequação jurídica,
 * 21/09/2026). Ciclo:
 *
 *   1. `registrarConsentimento` — o cliente marcou "Li e autorizo" e clicou
 *      em "Autorizar e continuar": grava versão + hash do texto, produtos, IP
 *      e navegador (status `pendente`);
 *   2. `exigirConsentimentoPendente` — o connect token do Pluggy só sai com
 *      um consentimento pendente e recente do próprio usuário;
 *   3. `vincularConsentimento` — o widget concluiu e a conexão foi registrada
 *      (status `ativo`; o anterior da mesma conexão vira `substituido`);
 *   4. `revogarConsentimentosDaConexao` — o cliente desconectou (status
 *      `revogado`, com o IP de quem desconectou). O registro FICA: é a prova do que foi autorizado.
 *   (+) `registrarEventoConsentimento` — marcos da etapa Pluggy/instituição
 *      (banco escolhido, consentimento enviado, login…); fechar sem concluir
 *      deixa o aceite `nao_concluido`.
 */

/** Tempo para concluir o widget depois de aceitar (o connect token vale 30 min). */
const VALIDADE_PENDENTE_MS = 60 * 60_000;

export function hashDoTexto(versao: string): string {
  const texto = VERSOES_CONSENTIMENTO[versao];
  if (!texto) throw new Error(`Versão de consentimento desconhecida: ${versao}`);
  return createHash('sha256')
    .update(JSON.stringify({ texto, produtos: PRODUTOS_OPEN_FINANCE }))
    .digest('hex');
}

export async function registrarConsentimento(
  request: NextRequest,
  userId: string,
  params: { versao: string; reconexaoDe?: string },
): Promise<OpenFinanceConsentimento> {
  // A tela mostra o texto da versão que ela tem; se o servidor já publicou
  // outra, o cliente precisa ler a nova antes de aceitar.
  if (params.versao !== TEXTO_CONSENTIMENTO_ATUAL.versao) {
    throw new ApiError(
      409,
      'O texto da autorização foi atualizado. Recarregue a página e leia de novo.',
    );
  }
  let reconexao = false;
  if (params.reconexaoDe) {
    const conexao = await prisma.bankConnection.findFirst({
      where: { id: params.reconexaoDe, userId },
      select: { id: true },
    });
    if (!conexao) throw new ApiError(404, 'Conexão não encontrada');
    reconexao = true;
  }
  const ip = getClientIp(request);
  return prisma.openFinanceConsentimento.create({
    data: {
      userId,
      versaoTexto: params.versao,
      hashTexto: hashDoTexto(params.versao),
      produtos: [...PRODUTOS_OPEN_FINANCE],
      reconexao,
      ip: ip === 'unknown' ? null : ip,
      userAgent: request.headers.get('user-agent')?.slice(0, 500) ?? null,
    },
  });
}

/** O connect token só sai com um aceite pendente, recente e do próprio usuário. */
export async function exigirConsentimentoPendente(
  userId: string,
  consentimentoId: string | undefined,
): Promise<OpenFinanceConsentimento> {
  if (!consentimentoId) {
    throw new ApiError(400, 'Autorize o compartilhamento de dados antes de conectar o banco.');
  }
  const c = await prisma.openFinanceConsentimento.findFirst({
    where: { id: consentimentoId, userId },
  });
  if (!c || (c.status !== 'pendente' && c.status !== 'nao_concluido')) {
    throw new ApiError(400, 'Autorização inválida. Comece a conexão de novo.');
  }
  if (Date.now() - c.aceitoEm.getTime() > VALIDADE_PENDENTE_MS) {
    throw new ApiError(400, 'A autorização expirou. Comece a conexão de novo.');
  }
  return c;
}

/**
 * Widget concluído e conexão registrada: o aceite vira `ativo` e aponta para
 * a conexão. Reconexão = consentimento novo na instituição, então o que
 * estava ativo nessa conexão fica `substituido`.
 */
export async function vincularConsentimento(
  userId: string,
  consentimentoId: string,
  conexao: { id: string; providerItemId: string; connectorName: string },
): Promise<void> {
  const agora = new Date();
  await prisma.$transaction([
    prisma.openFinanceConsentimento.updateMany({
      where: { userId, connectionId: conexao.id, status: 'ativo', id: { not: consentimentoId } },
      data: { status: 'substituido', revogadoEm: agora, motivoRevogacao: 'substituido' },
    }),
    prisma.openFinanceConsentimento.updateMany({
      // nao_concluido também: o "fechou" do widget pode chegar antes do registro.
      where: { id: consentimentoId, userId, status: { in: ['pendente', 'nao_concluido'] } },
      data: {
        status: 'ativo',
        connectionId: conexao.id,
        providerItemId: conexao.providerItemId,
        connectorName: conexao.connectorName,
        vinculadoEm: agora,
      },
    }),
  ]);
}

/** Desconexão: o registro fica, marcado como revogado (prova + histórico na tela). */
export async function revogarConsentimentosDaConexao(
  connectionId: string,
  motivo: 'usuario' | 'instituicao',
  ip?: string,
): Promise<void> {
  await prisma.openFinanceConsentimento.updateMany({
    where: { connectionId, status: 'ativo' },
    data: {
      status: 'revogado',
      revogadoEm: new Date(),
      motivoRevogacao: motivo,
      ...(ip && ip !== 'unknown' ? { ipRevogacao: ip.slice(0, 64) } : {}),
    },
  });
}

// ── Linha do tempo da etapa externa (eventos do widget Pluggy) ─────────────

/** Eventos aceitos: os do widget (pluggy-connect-sdk) + abertura/fechamento/erro. */
export const EVENTOS_WIDGET = [
  'WIDGET_ABERTO',
  'SELECTED_INSTITUTION',
  'SUBMITTED_CONSENT',
  'SUBMITTED_LOGIN',
  'SUBMITTED_MFA',
  'LOGIN_SUCCESS',
  'LOGIN_MFA_SUCCESS',
  'LOGIN_STEP_COMPLETED',
  'ITEM_RESPONSE',
  'CONCLUIDO',
  'FECHADO_SEM_CONCLUIR',
  'ERRO',
] as const;
export type EventoWidget = (typeof EVENTOS_WIDGET)[number];

export interface EventoConsentimento {
  evento: EventoWidget;
  em: string;
  instituicao?: string;
  detalhe?: string;
  /** IP de quem enviou o marco (mesma regra do `ip` do aceite). Não vai para a tela. */
  ip?: string;
}

const MAX_EVENTOS = 60;

/**
 * Anexa um marco da etapa Pluggy/instituição ao registro. Fechar sem concluir
 * ou erro deixam o aceite `nao_concluido` (ele não vira conexão).
 */
export async function registrarEventoConsentimento(
  userId: string,
  consentimentoId: string,
  evento: Omit<EventoConsentimento, 'em'> & { em?: string },
): Promise<void> {
  const c = await prisma.openFinanceConsentimento.findFirst({
    where: { id: consentimentoId, userId },
    select: { id: true, status: true, eventos: true },
  });
  if (!c) throw new ApiError(404, 'Autorização não encontrada');
  const atuais = Array.isArray(c.eventos) ? (c.eventos as unknown as EventoConsentimento[]) : [];
  if (atuais.length >= MAX_EVENTOS) return;
  const novo: EventoConsentimento = {
    evento: evento.evento,
    em: evento.em ?? new Date().toISOString(),
    ...(evento.instituicao ? { instituicao: evento.instituicao.slice(0, 120) } : {}),
    ...(evento.detalhe ? { detalhe: evento.detalhe.slice(0, 300) } : {}),
    ...(evento.ip && evento.ip !== 'unknown' ? { ip: evento.ip.slice(0, 64) } : {}),
  };
  const encerra =
    c.status === 'pendente' &&
    (evento.evento === 'FECHADO_SEM_CONCLUIR' || evento.evento === 'ERRO');
  await prisma.openFinanceConsentimento.update({
    where: { id: c.id },
    data: {
      eventos: [...atuais, novo] as unknown as Prisma.InputJsonValue,
      ...(encerra ? { status: 'nao_concluido' } : {}),
    },
  });
}

export interface ConsentimentoDTO {
  id: string;
  status: string;
  versaoTexto: string;
  produtos: string[];
  reconexao: boolean;
  aceitoEm: string;
  connectionId: string | null;
  connectorName: string | null;
  vinculadoEm: string | null;
  revogadoEm: string | null;
  motivoRevogacao: string | null;
  eventos: EventoConsentimento[];
}

/** Aceites que viraram conexão (ativos, revogados, substituídos), mais recentes primeiro. */
export async function listarConsentimentos(userId: string): Promise<ConsentimentoDTO[]> {
  const rows = await prisma.openFinanceConsentimento.findMany({
    where: { userId, status: { in: ['ativo', 'revogado', 'substituido'] } },
    orderBy: { aceitoEm: 'desc' },
  });
  return rows.map((c) => ({
    id: c.id,
    status: c.status,
    versaoTexto: c.versaoTexto,
    produtos: c.produtos,
    reconexao: c.reconexao,
    aceitoEm: c.aceitoEm.toISOString(),
    connectionId: c.connectionId,
    connectorName: c.connectorName,
    vinculadoEm: c.vinculadoEm?.toISOString() ?? null,
    revogadoEm: c.revogadoEm?.toISOString() ?? null,
    motivoRevogacao: c.motivoRevogacao,
    // O IP fica só no registro (prova), como o do aceite — a tela não o recebe.
    eventos: Array.isArray(c.eventos)
      ? (c.eventos as unknown as EventoConsentimento[]).map(({ ip: _ip, ...e }) => e)
      : [],
  }));
}
