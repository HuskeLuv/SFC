/**
 * Caixa de entrada: transações importadas do banco → linhas do Fluxo de Caixa.
 *
 * Regras (docs/analise-pluggy-set2026.md §4, decisão 14/09/2026):
 *  - a transação fica PENDENTE até o usuário aplicar (numa linha) ou ignorar;
 *  - a célula (item, ano, mês) de uma linha que recebeu transações passa a ser
 *    a SOMA dos valores absolutos das transações aplicadas naquele mês
 *    ("uma conta = um canal": a conta conectada é a dona da célula);
 *  - o sentido (receita/despesa) vem do GRUPO da linha, não do sinal da
 *    transação (cartão manda compra com sinal trocado em alguns conectores);
 *  - linhas do grupo Investimentos não aceitam transação (a Carteira é a fonte);
 *  - mês de competência = data da transação (UTC). Fatura de cartão por data
 *    de vencimento fica para depois.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/apiErrorHandler';
import { ensurePersonalizedItem } from '@/utils/cashflowPersonalization';
import { getUserCashflowStructure } from '@/utils/cashflowSetup';
import { sugerirPorCategoria, type SugestaoCategoria } from './categorias';

export interface SugestaoLinha {
  tipo: SugestaoCategoria['tipo'];
  /** Id do item (template ou override) quando a sugestão resolveu para uma linha existente. */
  itemId: string | null;
  /** "Despesas Fixas › Habitação › Conta de energia" — para exibir mesmo sem id. */
  rotulo: string | null;
}

interface GrupoEstrutura {
  id: string;
  name: string;
  type: string;
  items?: { id: string; name: string; hidden?: boolean }[];
  children?: GrupoEstrutura[];
}

const norm = (s: string) => s.trim().toLowerCase();

/** Índice "caminho|item" → id, montado uma vez por request sobre a árvore mesclada. */
export function indexarEstrutura(grupos: GrupoEstrutura[]): Map<string, string> {
  const idx = new Map<string, string>();
  const walk = (g: GrupoEstrutura, caminho: string[]) => {
    const atual = [...caminho, norm(g.name)];
    for (const it of g.items ?? []) {
      if (it.hidden) continue;
      idx.set([...atual, norm(it.name)].join('|'), it.id);
    }
    for (const c of g.children ?? []) walk(c, atual);
  };
  for (const g of grupos) walk(g, []);
  return idx;
}

export function resolverSugestao(
  categoria: string | null,
  idx: Map<string, string>,
): SugestaoLinha {
  const s = sugerirPorCategoria(categoria);
  if (s.tipo !== 'linha') return { tipo: s.tipo, itemId: null, rotulo: null };
  const chave = [...s.caminho.map(norm), norm(s.item)].join('|');
  return {
    tipo: 'linha',
    itemId: idx.get(chave) ?? null,
    rotulo: [...s.caminho.slice(1), s.item].join(' › '),
  };
}

export interface PendenteDTO {
  id: string;
  accountId: string;
  contaNome: string;
  date: string;
  description: string;
  merchantName: string | null;
  amount: number;
  type: string;
  providerCategory: string | null;
  sugestao: SugestaoLinha;
}

const PENDENTE_WHERE = { deletedAt: null, ignorada: false, cashflowItemId: null } as const;

export async function listarPendentes(
  userId: string,
  opts: { page?: number; limit?: number } = {},
): Promise<{ pendentes: PendenteDTO[]; total: number; page: number; totalPages: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const where = { userId, ...PENDENTE_WHERE };
  const [total, rows, estrutura] = await Promise.all([
    prisma.bankTransaction.count({ where }),
    prisma.bankTransaction.findMany({
      where,
      include: { account: { select: { name: true } } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    getUserCashflowStructure(userId),
  ]);
  const idx = indexarEstrutura(estrutura as GrupoEstrutura[]);
  return {
    pendentes: rows.map((t) => ({
      id: t.id,
      accountId: t.accountId,
      contaNome: t.account.name,
      date: t.date.toISOString(),
      description: t.description,
      merchantName: t.merchantName,
      amount: Number(t.amount),
      type: t.type,
      providerCategory: t.providerCategory,
      sugestao: resolverSugestao(t.providerCategory, idx),
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

// ---------------------------------------------------------------------------
// Recomputo das células
// ---------------------------------------------------------------------------

export interface Celula {
  itemId: string;
  year: number;
  month: number;
}

const chaveCelula = (c: Celula) => `${c.itemId}|${c.year}|${c.month}`;

function celulaDe(itemId: string, date: Date): Celula {
  return { itemId, year: date.getUTCFullYear(), month: date.getUTCMonth() };
}

/**
 * Célula = Σ |amount| das transações aplicadas no item naquele mês. Zero
 * (nada aplicado) apaga a célula — a linha volta a ser digitável no mês.
 * Cor e comentário da célula são preservados.
 */
export async function recomputarCelula(userId: string, c: Celula): Promise<number> {
  const inicio = new Date(Date.UTC(c.year, c.month, 1));
  const fim = new Date(Date.UTC(c.year, c.month + 1, 1));
  const rows = await prisma.bankTransaction.findMany({
    where: {
      userId,
      cashflowItemId: c.itemId,
      deletedAt: null,
      date: { gte: inicio, lt: fim },
    },
    select: { amount: true },
  });
  const soma = Math.round(rows.reduce((acc, r) => acc + Math.abs(Number(r.amount)), 0) * 100) / 100;
  const where = {
    itemId_userId_year_month: { itemId: c.itemId, userId, year: c.year, month: c.month },
  };
  if (soma > 0) {
    await prisma.cashflowValue.upsert({
      where,
      update: { value: soma, formula: null },
      create: { itemId: c.itemId, userId, year: c.year, month: c.month, value: soma },
    });
  } else {
    await prisma.cashflowValue.deleteMany({
      where: { itemId: c.itemId, userId, year: c.year, month: c.month },
    });
  }
  return soma;
}

async function recomputarCelulas(userId: string, celulas: Map<string, Celula>) {
  const resultado: Array<Celula & { value: number }> = [];
  for (const c of celulas.values()) {
    resultado.push({ ...c, value: await recomputarCelula(userId, c) });
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// Ações do usuário
// ---------------------------------------------------------------------------

export interface Aplicacao {
  id: string;
  itemId: string;
}

export interface AplicarResultado {
  aplicadas: number;
  celulas: Array<Celula & { value: number }>;
  /** Ids realmente aplicados (para o histórico/desfazer). */
  ids: string[];
}

/**
 * Aplica transações pendentes em linhas do fluxo. O item pode ser template:
 * é personalizado (override) na primeira vez, como no batch-update.
 */
export async function aplicar(userId: string, aplicacoes: Aplicacao[]): Promise<AplicarResultado> {
  if (aplicacoes.length === 0) return { aplicadas: 0, celulas: [], ids: [] };
  const ids = [...new Set(aplicacoes.map((a) => a.id))];
  const txs = await prisma.bankTransaction.findMany({
    where: { id: { in: ids }, userId, ...PENDENTE_WHERE },
    select: { id: true, date: true },
  });
  if (txs.length !== ids.length) {
    throw new ApiError(409, 'Alguma transação já foi aplicada, ignorada ou não existe');
  }
  const dataPorTx = new Map(txs.map((t) => [t.id, t.date]));

  // Resolve cada item pedido uma vez (personalizando template → override).
  const itemFinal = new Map<string, string>();
  for (const itemId of new Set(aplicacoes.map((a) => a.itemId))) {
    const { itemId: finalId, item } = await ensurePersonalizedItem(itemId, userId).catch(() => {
      throw new ApiError(404, 'Linha do fluxo de caixa não encontrada');
    });
    const grupo = await prisma.cashflowGroup.findUnique({
      where: { id: item.groupId },
      select: { type: true },
    });
    if (grupo?.type === 'investimento') {
      throw new ApiError(
        400,
        'Linhas de Investimentos não recebem transações do banco: a Carteira é a fonte',
      );
    }
    itemFinal.set(itemId, finalId);
  }

  const celulas = new Map<string, Celula>();
  const agora = new Date();
  await prisma.$transaction(
    aplicacoes.map((a) => {
      const finalId = itemFinal.get(a.itemId)!;
      const c = celulaDe(finalId, dataPorTx.get(a.id)!);
      celulas.set(chaveCelula(c), c);
      return prisma.bankTransaction.update({
        where: { id: a.id },
        data: { cashflowItemId: finalId, appliedAt: agora },
      });
    }),
  );
  return { aplicadas: aplicacoes.length, celulas: await recomputarCelulas(userId, celulas), ids };
}

/** Tira transações do fluxo (voltam a pendentes) e recomputa as células. */
export async function desaplicar(userId: string, ids: string[]): Promise<AplicarResultado> {
  const txs = await prisma.bankTransaction.findMany({
    where: { id: { in: ids }, userId, cashflowItemId: { not: null } },
    select: { id: true, date: true, cashflowItemId: true },
  });
  if (txs.length === 0) return { aplicadas: 0, celulas: [], ids: [] };
  const celulas = new Map<string, Celula>();
  for (const t of txs) {
    const c = celulaDe(t.cashflowItemId!, t.date);
    celulas.set(chaveCelula(c), c);
  }
  await prisma.bankTransaction.updateMany({
    where: { id: { in: txs.map((t) => t.id) } },
    data: { cashflowItemId: null, appliedAt: null },
  });
  return {
    aplicadas: txs.length,
    celulas: await recomputarCelulas(userId, celulas),
    ids: txs.map((t) => t.id),
  };
}

export async function ignorar(userId: string, ids: string[], valor = true): Promise<string[]> {
  const where: Prisma.BankTransactionWhereInput = valor
    ? { id: { in: ids }, userId, ...PENDENTE_WHERE }
    : { id: { in: ids }, userId, ignorada: true };
  const txs = await prisma.bankTransaction.findMany({ where, select: { id: true } });
  if (txs.length === 0) return [];
  await prisma.bankTransaction.updateMany({
    where: { id: { in: txs.map((t) => t.id) } },
    data: { ignorada: valor },
  });
  return txs.map((t) => t.id);
}
