/**
 * Caixa de entrada: transações importadas do banco → linhas do Fluxo de Caixa.
 *
 * Regras (docs/analise-pluggy-set2026.md §4, decisão 14/09/2026):
 *  - a transação fica PENDENTE até o usuário aplicar (numa linha) ou ignorar;
 *  - o banco SOMA ao que já está na célula (item, ano, mês): a parte do banco
 *    (CashflowValue.valorBanco) = soma dos valores absolutos das transações
 *    aplicadas naquele mês, e lançar/desfazer ajusta o total pela diferença —
 *    o que o usuário digitou é preservado (06/10/2026; antes a célula virava
 *    só a soma do banco e apagava o valor digitado);
 *  - o sentido (receita/despesa) vem do GRUPO da linha, não do sinal da
 *    transação (cartão manda compra com sinal trocado em alguns conectores);
 *  - o comentário da célula ganha uma linha por transação aplicada ("Gasto de R$ 30,00 — 15/08
 *    Mercado (Open Finance)", como o carimbo do assistente); tirar a transação tira a linha
 *    (03/11/2026, ticket 86e3xtngw);
 *  - linhas do grupo Investimentos não aceitam transação (a Carteira é a fonte);
 *  - mês de competência = BankTransaction.competencia* quando preenchida (cartão no
 *    mês do vencimento da fatura, chave PLUGGY_CARTAO_MES_FATURA — competenciaCartao.ts);
 *    senão, a data da transação (UTC).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/apiErrorHandler';
import { ensurePersonalizedItem } from '@/utils/cashflowPersonalization';
import { getUserCashflowStructure } from '@/utils/cashflowSetup';
import { isReceitaGroupByType } from '@/utils/formatters';
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
  items?: {
    id: string;
    name: string;
    hidden?: boolean;
    objetivoId?: string | null;
    dividaId?: string | null;
  }[];
  children?: GrupoEstrutura[];
}

/** Linha espelho de Sonho/Dívida: regenerada pelo Planejamento/Dívidas — não recebe banco. */
export const isLinhaEspelho = (it: { objetivoId?: string | null; dividaId?: string | null }) =>
  !!it.objetivoId || !!it.dividaId;

/** Sem acento/caixa, espaços colapsados e barra espaçada ("Moto/ Carro" ≡ "moto / carro"). */
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim();

/** Índice "caminho|item" → id, montado uma vez por request sobre a árvore mesclada. */
export function indexarEstrutura(grupos: GrupoEstrutura[]): Map<string, string> {
  const idx = new Map<string, string>();
  const walk = (g: GrupoEstrutura, caminho: string[]) => {
    const atual = [...caminho, norm(g.name)];
    for (const it of g.items ?? []) {
      if (it.hidden || isLinhaEspelho(it)) continue;
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
  const chave = (caminho: readonly string[], item: string) =>
    [...caminho.map(norm), norm(item)].join('|');
  const candidatos = [{ caminho: s.caminho, item: s.item }, ...(s.alternativas ?? [])];
  const achado = candidatos.find((c) => idx.has(chave(c.caminho, c.item)));
  const alvo = achado ?? candidatos[0];
  return {
    tipo: 'linha',
    itemId: achado ? idx.get(chave(achado.caminho, achado.item))! : null,
    rotulo: [...alvo.caminho.slice(1), alvo.item].join(' › '),
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
  /** Mês do fluxo em que entra ("2026-10"), quando difere da regra da data (cartão). */
  competencia: string | null;
  /** Banco da conexão (filtro "Banco"). */
  connectionId: string;
  banco: string;
  /** Comentário que o usuário já escreveu (fica salvo mesmo se ele tirar do fluxo). */
  nota: string | null;
  sugestao: SugestaoLinha;
}

/** Banco com transações pendentes, para o filtro da Caixa de entrada. */
export interface BancoPendente {
  connectionId: string;
  banco: string;
  total: number;
}

export interface FiltrosCaixa {
  /** Só as transações deste banco (BankConnection.id). */
  connectionId?: string | null;
  /** Período pela data da transação, AAAA-MM-DD, inclusive. */
  de?: string | null;
  ate?: string | null;
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Filtros → where do Prisma. Datas inválidas são ignoradas (a data é UTC, como na tela). */
export function whereDosFiltros(f: FiltrosCaixa): Prisma.BankTransactionWhereInput {
  const where: Prisma.BankTransactionWhereInput = {};
  if (f.connectionId) where.account = { connectionId: f.connectionId };
  const date: Prisma.DateTimeFilter = {};
  if (f.de && DATA_RE.test(f.de)) date.gte = new Date(`${f.de}T00:00:00.000Z`);
  if (f.ate && DATA_RE.test(f.ate)) {
    const fim = new Date(`${f.ate}T00:00:00.000Z`);
    fim.setUTCDate(fim.getUTCDate() + 1);
    date.lt = fim;
  }
  if (date.gte || date.lt) where.date = date;
  return where;
}

const PENDENTE_WHERE = {
  deletedAt: null,
  ignorada: false,
  cashflowItemId: null,
  duplicadaDe: null,
} as const;

export async function listarPendentes(
  userId: string,
  opts: { page?: number; limit?: number } & FiltrosCaixa = {},
): Promise<{
  pendentes: PendenteDTO[];
  total: number;
  page: number;
  totalPages: number;
  /** Bancos com pendentes (sem filtro), para o seletor. */
  bancos: BancoPendente[];
}> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const base = { userId, ...PENDENTE_WHERE };
  const where = { ...base, ...whereDosFiltros(opts) };
  const [total, rows, estrutura, porConta] = await Promise.all([
    prisma.bankTransaction.count({ where }),
    prisma.bankTransaction.findMany({
      where,
      include: {
        account: {
          select: {
            name: true,
            connectionId: true,
            connection: { select: { connectorName: true } },
          },
        },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    getUserCashflowStructure(userId),
    prisma.bankTransaction.groupBy({ by: ['accountId'], where: base, _count: { _all: true } }),
  ]);
  const idx = indexarEstrutura(estrutura as GrupoEstrutura[]);
  const bancos = await bancosPendentes(porConta);
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
      competencia: competenciaTexto(t),
      connectionId: t.account.connectionId,
      banco: t.account.connection.connectorName,
      nota: t.nota,
      sugestao: resolverSugestao(t.providerCategory, idx),
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
    bancos,
  };
}

/** Contagem de pendentes por conta → por banco (conexão), em ordem alfabética. */
async function bancosPendentes(
  porConta: Array<{ accountId: string; _count: { _all: number } }>,
): Promise<BancoPendente[]> {
  if (porConta.length === 0) return [];
  const contas = await prisma.bankAccount.findMany({
    where: { id: { in: porConta.map((c) => c.accountId) } },
    select: { id: true, connectionId: true, connection: { select: { connectorName: true } } },
  });
  const porId = new Map(contas.map((c) => [c.id, c]));
  const out = new Map<string, BancoPendente>();
  for (const c of porConta) {
    const conta = porId.get(c.accountId);
    if (!conta) continue;
    const atual = out.get(conta.connectionId) ?? {
      connectionId: conta.connectionId,
      banco: conta.connection.connectorName,
      total: 0,
    };
    atual.total += c._count._all;
    out.set(conta.connectionId, atual);
  }
  return [...out.values()].sort((a, b) => a.banco.localeCompare(b.banco, 'pt-BR'));
}

// ---------------------------------------------------------------------------
// Recomputo das células
// ---------------------------------------------------------------------------

export interface Celula {
  itemId: string;
  year: number;
  month: number;
}

export const chaveCelula = (c: Celula) => `${c.itemId}|${c.year}|${c.month}`;

interface DataCompetencia {
  date: Date;
  competenciaAno?: number | null;
  competenciaMes?: number | null;
}

/** Célula (item, ano, mês) da transação: a competência gravada ou, sem ela, a data. */
export function celulaDe(itemId: string, t: DataCompetencia): Celula {
  if (t.competenciaAno != null && t.competenciaMes != null) {
    return { itemId, year: t.competenciaAno, month: t.competenciaMes };
  }
  return { itemId, year: t.date.getUTCFullYear(), month: t.date.getUTCMonth() };
}

function competenciaTexto(t: DataCompetencia): string | null {
  if (t.competenciaAno == null || t.competenciaMes == null) return null;
  return `${t.competenciaAno}-${String(t.competenciaMes + 1).padStart(2, '0')}`;
}

export const SELECT_COMPETENCIA = {
  date: true,
  competenciaAno: true,
  competenciaMes: true,
} as const;

// ---------------------------------------------------------------------------
// Comentário da célula (ticket 86e3xtngw)
// ---------------------------------------------------------------------------

/** Sufixo das linhas que o banco escreve no comentário — como o "(assistente)" da IA. */
export const SUFIXO_OPEN_FINANCE = '(Open Finance)';

/** Teto do comentário da célula (o mesmo do batch-update e do assistente). */
const COMENTARIO_MAX = 2000;

/**
 * Linhas geradas pelo banco: "Gasto de R$ 30,00 — 15/08 Mercado X (Open Finance)" e o resumo
 * "+ 3 lançamentos do banco (Open Finance)". São reescritas a cada recomputo da célula; o resto do
 * comentário (digitado, da IA) fica como está.
 */
const LINHA_BANCO_RE =
  /^(?:(?:Gasto|Receita) de R\$ .* |\+ \d+ lançamentos? do banco )\(Open Finance\)$/;

export interface TransacaoComentario {
  date: Date;
  description: string;
  amount: number | { toString(): string };
  /** Comentário do usuário na Caixa de entrada. */
  nota?: string | null;
}

/** Teto do comentário do usuário por transação. */
export const NOTA_MAX = 200;

/** Mesmo formato do carimbo do assistente ("R$ 1234,50"). */
const formatarBrl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`;

/** "Gasto de R$ 30,00 — 15/08 Mercado X (Open Finance)": data UTC da transação, como na caixa. */
export function linhaComentarioBanco(t: TransacaoComentario, receita: boolean): string {
  const dia = String(t.date.getUTCDate()).padStart(2, '0');
  const mes = String(t.date.getUTCMonth() + 1).padStart(2, '0');
  const descricao = t.description.replace(/\s+/g, ' ').trim().slice(0, 120);
  const valor = formatarBrl(Math.abs(Number(t.amount)));
  const nota = (t.nota ?? '').replace(/\s+/g, ' ').trim().slice(0, NOTA_MAX);
  return `${receita ? 'Receita' : 'Gasto'} de ${valor} — ${dia}/${mes}${descricao ? ` ${descricao}` : ''}${nota ? ` — ${nota}` : ''} ${SUFIXO_OPEN_FINANCE}`;
}

/**
 * Comentário da célula com as linhas do banco em dia: tira as linhas geradas antes e põe uma por
 * transação aplicada hoje na célula (lançar acrescenta, tirar remove, lote = várias). O que não é
 * linha do banco é preservado. Se não couber no teto, as últimas viram "+ N lançamentos do banco".
 * `null` quando não sobra nada.
 */
export function comentarioComBanco(atual: string | null, linhasBanco: string[]): string | null {
  const todas = (atual ?? '').split('\n');
  const manuais = todas.filter((l) => !LINHA_BANCO_RE.test(l.trim()));
  // Nada do banco antes nem agora: o comentário fica intacto (nem espaços mudam).
  if (linhasBanco.length === 0 && manuais.length === todas.length) return atual;
  while (manuais.length > 0 && manuais[manuais.length - 1].trim() === '') manuais.pop();

  const montar = (linhas: string[]) => [...manuais, ...linhas].join('\n');
  let texto = montar(linhasBanco);
  if (texto.length > COMENTARIO_MAX) {
    let cabem = linhasBanco.length;
    const resumo = (n: number) =>
      `+ ${n} ${n === 1 ? 'lançamento' : 'lançamentos'} do banco ${SUFIXO_OPEN_FINANCE}`;
    do {
      cabem--;
      texto = montar([...linhasBanco.slice(0, cabem), resumo(linhasBanco.length - cabem)]);
    } while (cabem > 0 && texto.length > COMENTARIO_MAX);
    texto = texto.slice(0, COMENTARIO_MAX);
  }
  return texto.trim() === '' ? null : texto;
}

/**
 * Recalcula a parte do banco da célula (Σ |amount| das transações aplicadas no item naquele mês)
 * e ajusta o total pela diferença: value = value atual − parte do banco anterior + parte nova.
 * O que o usuário digitou (inclusive um total editado depois do lançamento) é preservado.
 * A fórmula é descartada quando o total muda (deixa de corresponder ao valor). A linha só é
 * apagada quando fica sem valor, sem parte do banco, sem cor e sem comentário.
 * Devolve o novo total da célula.
 */
export async function recomputarCelula(userId: string, c: Celula): Promise<number> {
  const inicio = new Date(Date.UTC(c.year, c.month, 1));
  const fim = new Date(Date.UTC(c.year, c.month + 1, 1));
  const rows = await prisma.bankTransaction.findMany({
    where: {
      userId,
      cashflowItemId: c.itemId,
      deletedAt: null,
      duplicadaDe: null,
      OR: [
        { competenciaAno: c.year, competenciaMes: c.month },
        { competenciaAno: null, date: { gte: inicio, lt: fim } },
      ],
    },
    select: { amount: true, date: true, description: true, nota: true },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  });
  const banco = centavos(rows.reduce((acc, r) => acc + Math.abs(Number(r.amount)), 0));
  const where = {
    itemId_userId_year_month: { itemId: c.itemId, userId, year: c.year, month: c.month },
  };
  // Sentido pelo GRUPO da linha (como o valor): receita em Entradas, gasto no resto.
  let linhasBanco: string[] = [];
  if (rows.length > 0) {
    const item = await prisma.cashflowItem.findUnique({
      where: { id: c.itemId },
      select: { group: { select: { type: true } } },
    });
    const receita = isReceitaGroupByType(item?.group?.type ?? '');
    linhasBanco = rows.map((r) => linhaComentarioBanco(r, receita));
  }

  return prisma.$transaction(async (tx) => {
    const atual = await tx.cashflowValue.findUnique({ where });
    const bancoAnterior = atual ? Number(atual.valorBanco) : 0;
    const totalAnterior = atual ? Number(atual.value) : 0;
    const comentarioAnterior = atual?.comment ?? null;
    const comentario = comentarioComBanco(comentarioAnterior, linhasBanco);
    const comentarioMudou = comentario !== comentarioAnterior;
    if (atual && centavos(bancoAnterior - banco) === 0) {
      // Mesma parte do banco: valor e fórmula intactos; só o comentário pode se atualizar
      // (ex.: troca de transação de mesmo valor, ou célula lançada antes do comentário existir).
      if (comentarioMudou) await tx.cashflowValue.update({ where, data: { comment: comentario } });
      return totalAnterior;
    }

    const total = centavos(totalAnterior - bancoAnterior + banco);
    if (!atual) {
      if (banco === 0) return 0;
      await tx.cashflowValue.create({
        data: {
          itemId: c.itemId,
          userId,
          year: c.year,
          month: c.month,
          value: total,
          valorBanco: banco,
          ...(comentario ? { comment: comentario } : {}),
        },
      });
      return total;
    }
    if (total === 0 && banco === 0 && !atual.color && !comentario) {
      await tx.cashflowValue.delete({ where });
      return 0;
    }
    await tx.cashflowValue.update({
      where,
      data: {
        value: total,
        valorBanco: banco,
        formula: null,
        ...(comentarioMudou ? { comment: comentario } : {}),
      },
    });
    return total;
  });
}

const centavos = (v: number) => Math.round(v * 100) / 100;

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
  /** Comentário do usuário (undefined = mantém o que já estava; '' = apaga). */
  nota?: string;
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
    select: { id: true, ...SELECT_COMPETENCIA },
  });
  if (txs.length !== ids.length) {
    throw new ApiError(409, 'Alguma transação já foi aplicada, ignorada ou não existe');
  }
  const txPorId = new Map(txs.map((t) => [t.id, t]));

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
    // A regeneração da linha espelho (Planejamento de Sonhos / Dívidas) reescreve as células e
    // apagaria o lançamento do banco.
    if (isLinhaEspelho(item)) {
      throw new ApiError(
        400,
        'Linhas de Sonhos e Dívidas não recebem transações do banco: são geridas no Planejamento e em Dívidas',
      );
    }
    itemFinal.set(itemId, finalId);
  }

  const celulas = new Map<string, Celula>();
  const agora = new Date();
  await prisma.$transaction(
    aplicacoes.map((a) => {
      const finalId = itemFinal.get(a.itemId)!;
      const c = celulaDe(finalId, txPorId.get(a.id)!);
      celulas.set(chaveCelula(c), c);
      const nota =
        a.nota === undefined ? undefined : a.nota.replace(/\s+/g, ' ').trim().slice(0, NOTA_MAX);
      return prisma.bankTransaction.update({
        where: { id: a.id },
        data: {
          cashflowItemId: finalId,
          appliedAt: agora,
          ...(nota === undefined ? {} : { nota: nota || null }),
        },
      });
    }),
  );
  return { aplicadas: aplicacoes.length, celulas: await recomputarCelulas(userId, celulas), ids };
}

/** Tira transações do fluxo (voltam a pendentes) e recomputa as células. */
export async function desaplicar(userId: string, ids: string[]): Promise<AplicarResultado> {
  const txs = await prisma.bankTransaction.findMany({
    where: { id: { in: ids }, userId, cashflowItemId: { not: null } },
    select: { id: true, cashflowItemId: true, ...SELECT_COMPETENCIA },
  });
  if (txs.length === 0) return { aplicadas: 0, celulas: [], ids: [] };
  const celulas = new Map<string, Celula>();
  for (const t of txs) {
    const c = celulaDe(t.cashflowItemId!, t);
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
