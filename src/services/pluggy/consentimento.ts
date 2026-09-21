import { createHash } from 'crypto';
import type { NextRequest } from 'next/server';
import type { OpenFinanceConsentimento } from '@prisma/client';
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
 *      `revogado`). O registro FICA: é a prova do que foi autorizado.
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
  if (!c || c.status !== 'pendente') {
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
      where: { id: consentimentoId, userId, status: 'pendente' },
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
): Promise<void> {
  await prisma.openFinanceConsentimento.updateMany({
    where: { connectionId, status: 'ativo' },
    data: { status: 'revogado', revogadoEm: new Date(), motivoRevogacao: motivo },
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
}

/** Aceites que viraram conexão (ativos, revogados, substituídos), mais recentes primeiro. */
export async function listarConsentimentos(userId: string): Promise<ConsentimentoDTO[]> {
  const rows = await prisma.openFinanceConsentimento.findMany({
    where: { userId, status: { not: 'pendente' } },
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
  }));
}
