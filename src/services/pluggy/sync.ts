/**
 * Sincronização Pluggy → ledger local (bank_connections / bank_accounts /
 * bank_transactions). Fase 2 da integração bancária (set/2026).
 *
 * Princípios (docs/analise-pluggy-set2026.md §4 e docs/pluggy-dev-setup.md):
 *  - o Pluggy sincroniza o item diariamente; nós só puxamos o delta quando
 *    um webhook chega (fila) ou na reconciliação diária;
 *  - janela de releitura de 7 dias (regra do Open Finance) a partir do último
 *    sync; primeira carga = 12 meses (máximo que o provedor devolve);
 *  - transações são identificadas pelo id do provedor; como esse id pode
 *    mudar, a reconciliação da janela marca `deletedAt` no que sumiu e a
 *    versão nova entra como linha nova (o dedupHash permite religar depois);
 *  - `PATCH /items` (atualização manual) é limitado a 20/min no Pluggy e
 *    proibido em lote → cooldown por conexão;
 *  - nunca gravar documento (CPF) de contrapartes: só o nome.
 */
import { createHash } from 'crypto';
import type { Account, Item, Transaction } from 'pluggy-sdk';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getPluggyClient } from '@/lib/pluggy';
import { logger } from '@/lib/logger';
import { ApiError } from '@/utils/apiErrorHandler';

export const JANELA_RESYNC_DIAS = 7;
export const HISTORICO_INICIAL_MESES = 12;
export const COOLDOWN_ATUALIZACAO_MANUAL_MS = 6 * 60 * 60 * 1000;
export const MAX_TENTATIVAS_EVENTO = 3;

export interface SyncResultado {
  connectionId: string;
  status: string;
  contas: number;
  transacoesNovas: number;
  transacoesAtualizadas: number;
  transacoesRemovidas: number;
}

// ---------------------------------------------------------------------------
// Mapeamento provedor → ledger
// ---------------------------------------------------------------------------

function isoDia(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function dedupHash(
  accountId: string,
  date: Date,
  amount: number,
  description: string,
): string {
  return createHash('sha256')
    .update(`${accountId}|${isoDia(date)}|${amount.toFixed(2)}|${description.trim().toLowerCase()}`)
    .digest('hex');
}

export function mapItem(item: Item) {
  return {
    connectorId: item.connector.id,
    connectorName: item.connector.name,
    connectorImageUrl: item.connector.imageUrl ?? null,
    isOpenFinance: Boolean(item.connector.isOpenFinance),
    isSandbox: Boolean(item.connector.isSandbox),
    status: String(item.status),
    executionStatus: item.executionStatus ? String(item.executionStatus) : null,
    errorMessage: item.error?.message ?? null,
    consentExpiresAt: item.consentExpiresAt ? new Date(item.consentExpiresAt) : null,
    providerUpdatedAt: item.lastUpdatedAt ? new Date(item.lastUpdatedAt) : null,
  };
}

export function mapAccount(a: Account, connectionId: string, userId: string) {
  const credit = a.creditData;
  return {
    connectionId,
    userId,
    providerAccountId: a.id,
    type: String(a.type),
    subtype: a.subtype ? String(a.subtype) : null,
    name: a.marketingName || a.name,
    number: a.number ?? null,
    currencyCode: a.currencyCode ?? 'BRL',
    balance: a.balance ?? 0,
    balanceAt: new Date(),
    creditLimit: credit?.creditLimit ?? null,
    creditAvailable: credit?.availableCreditLimit ?? null,
    creditBrand: credit?.brand ?? null,
    creditDueDate: credit?.balanceDueDate ? new Date(credit.balanceDueDate) : null,
    creditClosingDate: credit?.balanceCloseDate ? new Date(credit.balanceCloseDate) : null,
  };
}

export function mapTransaction(t: Transaction, accountId: string, userId: string) {
  const date = new Date(t.date);
  const counterpart =
    t.type === 'CREDIT' ? t.paymentData?.payer?.name : t.paymentData?.receiver?.name;
  return {
    accountId,
    userId,
    providerTxId: t.id,
    dedupHash: dedupHash(accountId, date, t.amount, t.description),
    date,
    description: t.description,
    descriptionRaw: t.descriptionRaw ?? null,
    amount: t.amount,
    type: String(t.type),
    status: t.status ? String(t.status) : 'POSTED',
    currencyCode: t.currencyCode ?? 'BRL',
    providerCategory: t.category ?? null,
    providerCategoryId: t.categoryId ?? null,
    merchantName: t.merchant?.name ?? null,
    merchantCnpj: t.merchant?.cnpj ?? null,
    paymentMethod: t.paymentData?.paymentMethod ?? null,
    counterpartName: counterpart ?? null,
    installmentNumber: t.creditCardMetadata?.installmentNumber ?? null,
    installmentTotal: t.creditCardMetadata?.totalInstallments ?? null,
    billId: t.creditCardMetadata?.billId ?? null,
  };
}

type TxMapeada = ReturnType<typeof mapTransaction>;

function transacaoMudou(
  local: {
    dedupHash: string;
    status: string;
    providerCategory: string | null;
    amount: Prisma.Decimal;
  },
  nova: TxMapeada,
): boolean {
  return (
    local.dedupHash !== nova.dedupHash ||
    local.status !== nova.status ||
    (local.providerCategory ?? null) !== nova.providerCategory ||
    Number(local.amount) !== nova.amount
  );
}

// ---------------------------------------------------------------------------
// Conexões
// ---------------------------------------------------------------------------

/**
 * Registra o item criado pelo widget (POST /api/pluggy/connections) e faz a
 * primeira carga. Recusa item que pertença a outro usuário.
 */
export async function registrarConexao(userId: string, providerItemId: string) {
  const client = getPluggyClient();
  const item = await client.fetchItem(providerItemId);
  if (item.clientUserId && item.clientUserId !== userId) {
    throw new ApiError(403, 'Este item pertence a outro usuário');
  }
  const existente = await prisma.bankConnection.findUnique({ where: { providerItemId } });
  if (existente && existente.userId !== userId) {
    throw new ApiError(403, 'Este item pertence a outro usuário');
  }

  const dados = mapItem(item);
  const conexao = existente
    ? await prisma.bankConnection.update({ where: { id: existente.id }, data: dados })
    : await prisma.bankConnection.create({ data: { userId, providerItemId, ...dados } });

  await sincronizarConexao(conexao.id, { item });
  return prisma.bankConnection.findUniqueOrThrow({
    where: { id: conexao.id },
    include: { accounts: { orderBy: { name: 'asc' } } },
  });
}

/**
 * Puxa item + contas + transações da janela e grava no ledger.
 * `completo` força reler 12 meses (ex.: reconexão após consentimento novo).
 */
export async function sincronizarConexao(
  connectionId: string,
  opts: { completo?: boolean; item?: Item } = {},
): Promise<SyncResultado> {
  const conexao = await prisma.bankConnection.findUniqueOrThrow({ where: { id: connectionId } });
  const client = getPluggyClient();

  try {
    const item = opts.item ?? (await client.fetchItem(conexao.providerItemId));
    await prisma.bankConnection.update({ where: { id: connectionId }, data: mapItem(item) });

    const contas = (await client.fetchAccounts(conexao.providerItemId)).results;
    const inicio = new Date();
    if (opts.completo || !conexao.lastSyncAt) {
      inicio.setMonth(inicio.getMonth() - HISTORICO_INICIAL_MESES);
    } else {
      inicio.setTime(conexao.lastSyncAt.getTime() - JANELA_RESYNC_DIAS * 86_400_000);
    }
    const dateFrom = isoDia(inicio);

    let novas = 0;
    let atualizadas = 0;
    let removidas = 0;

    for (const conta of contas) {
      const local = await prisma.bankAccount.upsert({
        where: { providerAccountId: conta.id },
        create: mapAccount(conta, connectionId, conexao.userId),
        update: mapAccount(conta, connectionId, conexao.userId),
      });

      const remotas = await client.fetchAllTransactions(conta.id, { dateFrom });
      const mapeadas = remotas.map((t) => mapTransaction(t, local.id, conexao.userId));
      const idsRemotos = new Set(mapeadas.map((t) => t.providerTxId));

      const existentes = await prisma.bankTransaction.findMany({
        where: { accountId: local.id, providerTxId: { in: [...idsRemotos] } },
        select: {
          id: true,
          providerTxId: true,
          dedupHash: true,
          status: true,
          providerCategory: true,
          amount: true,
          deletedAt: true,
        },
      });
      const porProviderId = new Map(existentes.map((e) => [e.providerTxId, e]));

      const paraCriar = mapeadas.filter((t) => !porProviderId.has(t.providerTxId));
      if (paraCriar.length > 0) {
        const r = await prisma.bankTransaction.createMany({
          data: paraCriar,
          skipDuplicates: true,
        });
        novas += r.count;
      }
      for (const t of mapeadas) {
        const e = porProviderId.get(t.providerTxId);
        if (!e) continue;
        if (e.deletedAt || transacaoMudou(e, t)) {
          await prisma.bankTransaction.update({
            where: { id: e.id },
            data: { ...t, deletedAt: null },
          });
          atualizadas += 1;
        }
      }

      // Reconciliação da janela: o que existe localmente na janela e não veio
      // do provedor foi removido lá (ou trocou de id) → marca deletedAt.
      const r = await prisma.bankTransaction.updateMany({
        where: {
          accountId: local.id,
          date: { gte: new Date(`${dateFrom}T00:00:00.000Z`) },
          deletedAt: null,
          providerTxId: { notIn: [...idsRemotos] },
        },
        data: { deletedAt: new Date() },
      });
      removidas += r.count;
    }

    await prisma.bankConnection.update({
      where: { id: connectionId },
      data: { lastSyncAt: new Date(), lastSyncError: null },
    });

    const resultado: SyncResultado = {
      connectionId,
      status: String(item.status),
      contas: contas.length,
      transacoesNovas: novas,
      transacoesAtualizadas: atualizadas,
      transacoesRemovidas: removidas,
    };
    logger.info('[pluggy sync] conexão sincronizada', resultado);
    return resultado;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'erro desconhecido';
    await prisma.bankConnection.update({
      where: { id: connectionId },
      data: { lastSyncError: msg.slice(0, 500) },
    });
    throw error;
  }
}

/**
 * Atualização manual (botão "Atualizar agora"): pede ao Pluggy para
 * ressincronizar o item. Os dados chegam depois, via webhook item/updated.
 */
export async function atualizarManualmente(connectionId: string, userId: string) {
  const conexao = await prisma.bankConnection.findFirst({ where: { id: connectionId, userId } });
  if (!conexao) throw new ApiError(404, 'Conexão não encontrada');

  const ultima = conexao.lastManualUpdateAt?.getTime() ?? 0;
  const restante = ultima + COOLDOWN_ATUALIZACAO_MANUAL_MS - Date.now();
  if (restante > 0) {
    const minutos = Math.ceil(restante / 60_000);
    throw new ApiError(429, `Aguarde ${minutos} min para atualizar esta conexão de novo`);
  }

  const item = await getPluggyClient().updateItem(conexao.providerItemId);
  return prisma.bankConnection.update({
    where: { id: connectionId },
    data: { ...mapItem(item), lastManualUpdateAt: new Date() },
  });
}

/** Exclui no Pluggy (LGPD: apaga o consentimento lá) e no ledger (cascade). */
export async function excluirConexao(connectionId: string, userId: string) {
  const conexao = await prisma.bankConnection.findFirst({ where: { id: connectionId, userId } });
  if (!conexao) throw new ApiError(404, 'Conexão não encontrada');
  try {
    await getPluggyClient().deleteItem(conexao.providerItemId);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '';
    if (!/404/.test(msg)) throw error;
  }
  await prisma.bankConnection.delete({ where: { id: connectionId } });
}

// ---------------------------------------------------------------------------
// Fila de webhooks e reconciliação
// ---------------------------------------------------------------------------

export interface ProcessamentoResultado {
  processados: number;
  erros: number;
  ignorados: number;
  adiados: number;
}

/**
 * Processa eventos pendentes da fila (chamado pelo cron a cada 5 min).
 * Cada evento vira um sync da conexão correspondente. Evento de item ainda
 * não registrado (o widget acabou de criar e o POST /connections está a
 * caminho) é adiado até MAX_TENTATIVAS_EVENTO e então ignorado.
 */
export async function processarEventosPendentes(limite = 20): Promise<ProcessamentoResultado> {
  const eventos = await prisma.pluggyWebhookEvent.findMany({
    where: { status: 'pending' },
    orderBy: { receivedAt: 'asc' },
    take: limite,
  });
  const r: ProcessamentoResultado = { processados: 0, erros: 0, ignorados: 0, adiados: 0 };

  for (const ev of eventos) {
    const lock = await prisma.pluggyWebhookEvent.updateMany({
      where: { id: ev.id, status: 'pending' },
      data: { status: 'processing', attempts: { increment: 1 } },
    });
    if (lock.count === 0) continue; // outro worker pegou

    const finalizar = (status: string, error?: string) =>
      prisma.pluggyWebhookEvent.update({
        where: { id: ev.id },
        data: { status, error: error ?? null, processedAt: new Date() },
      });

    if (!ev.providerItemId) {
      await finalizar('ignored', 'evento sem itemId');
      r.ignorados += 1;
      continue;
    }
    const conexao = await prisma.bankConnection.findUnique({
      where: { providerItemId: ev.providerItemId },
    });
    if (!conexao) {
      if (ev.attempts + 1 < MAX_TENTATIVAS_EVENTO) {
        await prisma.pluggyWebhookEvent.update({
          where: { id: ev.id },
          data: { status: 'pending' },
        });
        r.adiados += 1;
      } else {
        await finalizar('ignored', 'item não registrado no MyFinance');
        r.ignorados += 1;
      }
      continue;
    }
    try {
      await sincronizarConexao(conexao.id);
      await finalizar('done');
      r.processados += 1;
    } catch (error: unknown) {
      const msg = (error instanceof Error ? error.message : 'erro').slice(0, 500);
      if (ev.attempts + 1 < MAX_TENTATIVAS_EVENTO) {
        await prisma.pluggyWebhookEvent.update({
          where: { id: ev.id },
          data: { status: 'pending', error: msg },
        });
        r.adiados += 1;
      } else {
        await finalizar('error', msg);
        r.erros += 1;
      }
      logger.error('[pluggy sync] evento falhou', { id: ev.id, event: ev.event, msg });
    }
  }
  return r;
}

/**
 * Reconciliação diária: garante um sync por conexão mesmo que nenhum webhook
 * tenha chegado (rede, fila, retentativas esgotadas). Sequencial de propósito.
 */
export async function reconciliarConexoes(
  maxIdadeHoras = 20,
): Promise<{ sincronizadas: number; falhas: number }> {
  const limite = new Date(Date.now() - maxIdadeHoras * 3_600_000);
  const conexoes = await prisma.bankConnection.findMany({
    where: { OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: limite } }] },
    select: { id: true },
  });
  let sincronizadas = 0;
  let falhas = 0;
  for (const c of conexoes) {
    try {
      await sincronizarConexao(c.id);
      sincronizadas += 1;
    } catch {
      falhas += 1;
    }
  }
  return { sincronizadas, falhas };
}
