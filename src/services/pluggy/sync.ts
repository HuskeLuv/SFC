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
 *    mudar, a linha existente com o mesmo dedupHash ADOTA o id novo; o que
 *    sumiu da janela recebe `deletedAt`;
 *  - banco conectado duas vezes: no registro, contas já existentes reaproveitam
 *    a conexão (reconexão) ou entram desativadas; na sincronização, transação
 *    com o mesmo globalHash de outra conta do usuário entra como `duplicadaDe`;
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
import {
  atualizarImportados,
  importarPendentes,
  mapInvestment,
  mapLoan,
  type ImportacaoResultado,
} from './importarCarteira';
import { revogarConsentimentosDaConexao } from './consentimento';

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
  /** Criadas já marcadas como cópia de outra conta do usuário. */
  transacoesDuplicadas: number;
  investimentos: number;
  emprestimos: number;
  /** Importação automática para Carteira/Dívidas (null quando o item não expõe os produtos). */
  importacao: ImportacaoResultado | null;
}

const SELECT_LOCAL = {
  id: true,
  providerTxId: true,
  dedupHash: true,
  globalHash: true,
  status: true,
  providerCategory: true,
  amount: true,
  deletedAt: true,
} as const;

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

/**
 * Identidade de uma conta independente da conexão: banco + número mascarado
 * (ou tipo + nome quando o provedor não manda número). É o que reconhece o
 * mesmo banco conectado duas vezes.
 */
export function chaveConta(
  connectorId: number,
  a: { number?: string | null; type: string; name: string },
): string {
  const numero = (a.number ?? '').replace(/\s+/g, '');
  return numero
    ? `${connectorId}|n:${numero}`
    : `${connectorId}|t:${a.type}|${a.name.trim().toLowerCase()}`;
}

/** Mesma transação vista por outra conexão do mesmo usuário (chave da conta em vez do id local). */
export function globalHash(
  userId: string,
  chave: string,
  date: Date,
  amount: number,
  description: string,
): string {
  return createHash('sha256')
    .update(
      `${userId}|${chave}|${isoDia(date)}|${amount.toFixed(2)}|${description.trim().toLowerCase()}`,
    )
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

export function mapTransaction(t: Transaction, accountId: string, userId: string, chave = '') {
  const date = new Date(t.date);
  const counterpart =
    t.type === 'CREDIT' ? t.paymentData?.payer?.name : t.paymentData?.receiver?.name;
  return {
    accountId,
    userId,
    providerTxId: t.id,
    dedupHash: dedupHash(accountId, date, t.amount, t.description),
    globalHash: globalHash(userId, chave, date, t.amount, t.description),
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
    globalHash: string | null;
    status: string;
    providerCategory: string | null;
    amount: Prisma.Decimal;
  },
  nova: TxMapeada,
): boolean {
  return (
    local.dedupHash !== nova.dedupHash ||
    local.globalHash !== nova.globalHash ||
    local.status !== nova.status ||
    (local.providerCategory ?? null) !== nova.providerCategory ||
    Number(local.amount) !== nova.amount
  );
}

// ---------------------------------------------------------------------------
// Conexões
// ---------------------------------------------------------------------------

export interface RegistroResultado {
  conexao: Prisma.BankConnectionGetPayload<{ include: { accounts: true } }>;
  /** true = o banco já estava conectado: a conexão existente foi migrada para o item novo. */
  reaproveitada: boolean;
  /** Contas do item novo que já existiam em outra conexão e ficaram desativadas. */
  contasRepetidas: number;
}

function carregar(id: string) {
  return prisma.bankConnection.findUniqueOrThrow({
    where: { id },
    include: { accounts: { orderBy: { name: 'asc' } } },
  });
}

/**
 * Registra o item criado pelo widget (POST /api/pluggy/connections) e faz a
 * primeira carga. Recusa item que pertença a outro usuário. Detecta o mesmo
 * banco conectado de novo (Open Finance cria um item por consentimento).
 */
export async function registrarConexao(
  userId: string,
  providerItemId: string,
): Promise<RegistroResultado> {
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
  if (existente) {
    const conexao = await prisma.bankConnection.update({
      where: { id: existente.id },
      data: dados,
    });
    await sincronizarConexao(conexao.id, { item });
    return { conexao: await carregar(conexao.id), reaproveitada: false, contasRepetidas: 0 };
  }

  // Compara as contas do item novo com as que o usuário já tem no mesmo banco
  // (por número mascarado).
  const contasNovas = (await client.fetchAccounts(providerItemId)).results;
  const existentes = await prisma.bankAccount.findMany({
    where: { userId, connection: { connectorId: item.connector.id } },
    include: { connection: true },
  });
  const porChave = new Map(existentes.map((a) => [chaveConta(item.connector.id, a), a]));
  const repetidas = contasNovas.filter((c) => porChave.has(chaveConta(item.connector.id, c)));

  if (contasNovas.length > 0 && repetidas.length === contasNovas.length) {
    // Reconexão: a conexão antiga passa a apontar para o item novo; as contas
    // mantêm o id local (histórico, lançamentos no fluxo) e trocam só o id do
    // provedor. O item antigo é apagado no Pluggy (o consentimento novo vale).
    const alvo = porChave.get(chaveConta(item.connector.id, repetidas[0]))!.connection;
    try {
      await client.deleteItem(alvo.providerItemId);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (!/404/.test(msg)) logger.warn('[pluggy sync] não apagou item antigo', { msg });
    }
    await prisma.bankConnection.update({
      where: { id: alvo.id },
      data: { providerItemId, ...dados, lastSyncError: null, lastManualUpdateAt: null },
    });
    for (const c of repetidas) {
      const local = porChave.get(chaveConta(item.connector.id, c))!;
      if (local.connectionId !== alvo.id) continue; // conta de outra conexão antiga: fica onde está
      await prisma.bankAccount.update({
        where: { id: local.id },
        data: { providerAccountId: c.id },
      });
    }
    // Consentimento novo: relê os 12 meses (pode trazer mais histórico) e
    // preenche globalHash/ids nas linhas antigas.
    await sincronizarConexao(alvo.id, { item, completo: true });
    return {
      conexao: await carregar(alvo.id),
      reaproveitada: true,
      contasRepetidas: repetidas.length,
    };
  }

  // Conexão nova; contas que já existem em outra conexão entram desativadas
  // (sem importar transações) para não duplicar.
  const conexao = await prisma.bankConnection.create({
    data: { userId, providerItemId, ...dados },
  });
  const chavesInativas = new Set(repetidas.map((c) => chaveConta(item.connector.id, c)));
  await sincronizarConexao(conexao.id, { item, chavesInativas });
  return {
    conexao: await carregar(conexao.id),
    reaproveitada: false,
    contasRepetidas: repetidas.length,
  };
}

/**
 * Puxa item + contas + transações da janela e grava no ledger.
 * `completo` força reler 12 meses (ex.: reconexão após consentimento novo).
 */
export async function sincronizarConexao(
  connectionId: string,
  opts: { completo?: boolean; item?: Item; chavesInativas?: Set<string> } = {},
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
    let duplicadas = 0;

    for (const conta of contas) {
      const chave = chaveConta(item.connector.id, conta);
      const inativa = opts.chavesInativas?.has(chave) ?? false;
      const dadosConta = mapAccount(conta, connectionId, conexao.userId);
      const local = await prisma.bankAccount.upsert({
        where: { providerAccountId: conta.id },
        create: { ...dadosConta, ativa: !inativa },
        update: dadosConta,
      });
      // Conta desativada (repetida de outra conexão ou desligada pelo usuário):
      // não gasta cota do Open Finance nem importa transações.
      if (!local.ativa) continue;

      const remotas = await client.fetchAllTransactions(conta.id, { dateFrom });
      const mapeadas = remotas.map((t) => mapTransaction(t, local.id, conexao.userId, chave));
      const idsRemotos = new Set(mapeadas.map((t) => t.providerTxId));

      const existentes = await prisma.bankTransaction.findMany({
        where: { accountId: local.id, providerTxId: { in: [...idsRemotos] } },
        select: SELECT_LOCAL,
      });
      const porProviderId = new Map(existentes.map((e) => [e.providerTxId, e]));

      // Id trocado no provedor (mesma conta, mesma data/valor/descrição): a
      // linha existente adota o id novo em vez de virar cópia + removida.
      const adotados = new Set<string>();
      const semId = mapeadas.filter((t) => !porProviderId.has(t.providerTxId));
      if (semId.length > 0) {
        const porHash = await prisma.bankTransaction.findMany({
          where: {
            accountId: local.id,
            dedupHash: { in: semId.map((t) => t.dedupHash) },
            providerTxId: { notIn: [...idsRemotos] },
          },
          select: SELECT_LOCAL,
        });
        const mapaHash = new Map(porHash.map((e) => [e.dedupHash, e]));
        for (const t of semId) {
          const e = mapaHash.get(t.dedupHash);
          if (!e) continue;
          mapaHash.delete(t.dedupHash);
          await prisma.bankTransaction.update({
            where: { id: e.id },
            data: { ...t, deletedAt: null },
          });
          adotados.add(t.providerTxId);
          atualizadas += 1;
        }
      }

      const paraCriar = mapeadas.filter(
        (t) => !porProviderId.has(t.providerTxId) && !adotados.has(t.providerTxId),
      );
      if (paraCriar.length > 0) {
        // Mesma transação já importada por OUTRA conta do usuário (banco
        // conectado duas vezes, cartão visto por dois bancos): entra marcada
        // como duplicada e fica fora da Caixa de entrada e das células.
        const originais = await prisma.bankTransaction.findMany({
          where: {
            userId: conexao.userId,
            accountId: { not: local.id },
            globalHash: { in: paraCriar.map((t) => t.globalHash) },
            deletedAt: null,
            duplicadaDe: null,
          },
          select: { id: true, globalHash: true },
        });
        const originalPorHash = new Map(originais.map((o) => [o.globalHash, o.id]));
        const r = await prisma.bankTransaction.createMany({
          data: paraCriar.map((t) => ({
            ...t,
            duplicadaDe: originalPorHash.get(t.globalHash) ?? null,
          })),
          skipDuplicates: true,
        });
        novas += r.count;
        duplicadas += paraCriar.filter((t) => originalPorHash.has(t.globalHash)).length;
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
      // do provedor foi removido lá → marca deletedAt.
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

    // Investimentos e empréstimos (Fase 3): espelho + importação automática.
    // Best-effort: consentimento sem esses produtos não pode derrubar o sync de contas.
    const { investimentos, emprestimos } = await sincronizarPosicoes(
      client,
      conexao.providerItemId,
      connectionId,
      conexao.userId,
    );
    let importacao: ImportacaoResultado | null = null;
    if (investimentos > 0 || emprestimos > 0) {
      try {
        importacao = await importarPendentes(conexao.userId);
        await atualizarImportados(conexao.userId);
      } catch (error: unknown) {
        logger.error('[pluggy sync] importação para Carteira/Dívidas falhou', {
          connectionId,
          msg: error instanceof Error ? error.message : 'erro',
        });
      }
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
      transacoesDuplicadas: duplicadas,
      investimentos,
      emprestimos,
      importacao,
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
 * Espelha investimentos e empréstimos do item. Posição que sumiu do provedor
 * fica `ativo=false` (não apaga: o vínculo com a Carteira/Dívida continua).
 */
async function sincronizarPosicoes(
  client: ReturnType<typeof getPluggyClient>,
  providerItemId: string,
  connectionId: string,
  userId: string,
): Promise<{ investimentos: number; emprestimos: number }> {
  let investimentos = 0;
  let emprestimos = 0;
  try {
    const lista = (await client.fetchInvestments(providerItemId)).results;
    const ids: string[] = [];
    for (const inv of lista) {
      const dados = mapInvestment(inv, connectionId, userId);
      ids.push(inv.id);
      await prisma.bankInvestment.upsert({
        where: { providerInvestmentId: inv.id },
        create: dados,
        update: dados,
      });
    }
    await prisma.bankInvestment.updateMany({
      where: { connectionId, providerInvestmentId: { notIn: ids }, ativo: true },
      data: { ativo: false },
    });
    investimentos = lista.length;
  } catch (error: unknown) {
    logger.warn('[pluggy sync] investimentos indisponíveis', {
      connectionId,
      msg: error instanceof Error ? error.message : 'erro',
    });
  }
  try {
    const lista = (await client.fetchLoans(providerItemId)).results;
    const ids: string[] = [];
    for (const loan of lista) {
      const dados = mapLoan(loan, connectionId, userId);
      ids.push(loan.id);
      await prisma.bankLoan.upsert({
        where: { providerLoanId: loan.id },
        create: dados,
        update: dados,
      });
    }
    await prisma.bankLoan.updateMany({
      where: { connectionId, providerLoanId: { notIn: ids }, ativo: true },
      data: { ativo: false },
    });
    emprestimos = lista.length;
  } catch (error: unknown) {
    logger.warn('[pluggy sync] empréstimos indisponíveis', {
      connectionId,
      msg: error instanceof Error ? error.message : 'erro',
    });
  }
  return { investimentos, emprestimos };
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
  // O registro do consentimento fica (revogado): é a prova do que foi autorizado.
  await revogarConsentimentosDaConexao(connectionId, 'usuario');
  await prisma.bankConnection.delete({ where: { id: connectionId } });
}

/**
 * O que a conexão trouxe (tela "Conexão realizada"): quantidades por tipo de
 * dado. Investimentos e empréstimos entram sozinhos na Carteira e em Dívidas
 * (importarCarteira.ts); o que o importador não mapeia fica "para cadastrar".
 */
export interface ResumoImportado {
  contas: number;
  cartoes: number;
  transacoes: number;
  /** Já na Carteira (importados ou vinculados a uma posição que existia). */
  investimentos: number;
  investimentosParaCadastrar: number;
  /** Já em Dívidas. */
  emprestimos: number;
  emprestimosParaCadastrar: number;
}

const NA_CARTEIRA = { in: ['importado', 'vinculado'] };

export async function resumoImportado(connectionId: string): Promise<ResumoImportado> {
  const [
    contas,
    cartoes,
    transacoes,
    investimentos,
    investimentosParaCadastrar,
    emprestimos,
    emprestimosParaCadastrar,
  ] = await Promise.all([
    prisma.bankAccount.count({ where: { connectionId, type: 'BANK', ativa: true } }),
    prisma.bankAccount.count({ where: { connectionId, type: 'CREDIT', ativa: true } }),
    prisma.bankTransaction.count({
      where: { account: { connectionId }, deletedAt: null, duplicadaDe: null },
    }),
    prisma.bankInvestment.count({ where: { connectionId, importStatus: NA_CARTEIRA } }),
    prisma.bankInvestment.count({ where: { connectionId, importStatus: 'sem-suporte' } }),
    prisma.bankLoan.count({ where: { connectionId, importStatus: NA_CARTEIRA } }),
    prisma.bankLoan.count({ where: { connectionId, importStatus: 'sem-suporte' } }),
  ]);
  return {
    contas,
    cartoes,
    transacoes,
    investimentos,
    investimentosParaCadastrar,
    emprestimos,
    emprestimosParaCadastrar,
  };
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
