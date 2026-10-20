/**
 * Faturas do cartão (GET /bills do Pluggy) e competência das compras: cada compra entra no
 * Fluxo de Caixa no mês do vencimento da fatura (ticket 86e3tjtep). Regra pura em
 * competenciaCartao.ts; aqui só o I/O.
 *
 * Chamado pelo sync (sincronizarConexao) com PLUGGY_CARTAO_MES_FATURA ligada, e pelo
 * scripts/pluggy/backfill-competencia-cartao.ts para as transações já importadas.
 */
import type { PluggyClient } from 'pluggy-sdk';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { celulaDe, type Celula } from './caixaEntrada';
import { competenciasDoCartao, type FaturaCartao } from './competenciaCartao';

/** Teto de páginas por cartão (a API pagina em 20; 12 meses de histórico cabem em 1). */
const MAX_PAGINAS_FATURAS = 10;

interface ContaCartao {
  id: string;
  providerAccountId: string;
  userId: string;
}

/**
 * Busca as faturas no Pluggy e grava em bank_credit_bills. Best-effort: consentimento sem
 * faturas (ou erro da API) devolve as que já estavam gravadas.
 */
export async function sincronizarFaturas(
  client: Pick<PluggyClient, 'fetchCreditCardBills'>,
  conta: ContaCartao,
  opts: { gravar?: boolean } = {},
): Promise<FaturaCartao[]> {
  const gravar = opts.gravar ?? true;
  const lidas: FaturaCartao[] = [];
  try {
    for (let page = 1; page <= MAX_PAGINAS_FATURAS; page++) {
      const r = await client.fetchCreditCardBills(conta.providerAccountId, { page });
      for (const b of r.results) {
        lidas.push({
          providerBillId: b.id,
          dueDate: new Date(b.dueDate),
          closingDate: b.billClosingDate ? new Date(b.billClosingDate) : null,
        });
        if (!gravar) continue;
        const dados = {
          accountId: conta.id,
          userId: conta.userId,
          dueDate: new Date(b.dueDate),
          closingDate: b.billClosingDate ? new Date(b.billClosingDate) : null,
          totalAmount: b.totalAmount ?? 0,
        };
        await prisma.bankCreditBill.upsert({
          where: { providerBillId: b.id },
          create: { providerBillId: b.id, ...dados },
          update: dados,
        });
      }
      if (page >= (r.totalPages ?? 1)) break;
    }
  } catch (error: unknown) {
    logger.warn('[pluggy faturas] não foi possível buscar as faturas do cartão', {
      accountId: conta.id,
      msg: error instanceof Error ? error.message : 'erro',
    });
  }
  if (!gravar) {
    // Simulação: o que já estava gravado + o que veio agora (sem escrever).
    const porId = new Map((await faturasGravadas(conta.id)).map((f) => [f.providerBillId, f]));
    for (const f of lidas) porId.set(f.providerBillId, f);
    return [...porId.values()];
  }
  return faturasGravadas(conta.id);
}

export async function faturasGravadas(accountId: string): Promise<FaturaCartao[]> {
  return prisma.bankCreditBill.findMany({
    where: { accountId },
    select: { providerBillId: true, dueDate: true, closingDate: true },
  });
}

export interface MudancaCompetencia {
  id: string;
  cashflowItemId: string | null;
  amount: number;
  de: { ano: number; mes: number } | null;
  para: { ano: number; mes: number };
}

/**
 * Recalcula a competência de TODAS as transações do cartão (a fatura de uma compra muda
 * quando a fatura aberta fecha e o billId chega). Com `aplicar`, grava e devolve as células
 * do Fluxo que precisam de recomputo (origem e destino das já lançadas).
 */
export async function atualizarCompetenciasDoCartao(
  conta: { id: string; creditDueDate: Date | null },
  faturas: FaturaCartao[],
  opts: { aplicar: boolean },
): Promise<{ mudancas: MudancaCompetencia[]; celulas: Celula[] }> {
  const txs = await prisma.bankTransaction.findMany({
    where: { accountId: conta.id, deletedAt: null },
    select: {
      id: true,
      date: true,
      billId: true,
      description: true,
      amount: true,
      installmentNumber: true,
      installmentTotal: true,
      competenciaAno: true,
      competenciaMes: true,
      cashflowItemId: true,
    },
  });
  const calculadas = competenciasDoCartao(
    txs.map((t) => ({ ...t, amount: Number(t.amount) })),
    faturas,
    conta.creditDueDate,
  );

  const mudancas: MudancaCompetencia[] = [];
  const celulas = new Map<string, Celula>();
  for (const t of txs) {
    const para = calculadas.get(t.id)!;
    if (t.competenciaAno === para.ano && t.competenciaMes === para.mes) continue;
    const de =
      t.competenciaAno !== null && t.competenciaMes !== null
        ? { ano: t.competenciaAno, mes: t.competenciaMes }
        : null;
    mudancas.push({
      id: t.id,
      cashflowItemId: t.cashflowItemId,
      amount: Number(t.amount),
      de,
      para,
    });
    if (t.cashflowItemId) {
      const origem = celulaDe(t.cashflowItemId, t);
      const destino = { itemId: t.cashflowItemId, year: para.ano, month: para.mes };
      celulas.set(`${origem.itemId}|${origem.year}|${origem.month}`, origem);
      celulas.set(`${destino.itemId}|${destino.year}|${destino.month}`, destino);
    }
  }

  if (opts.aplicar && mudancas.length > 0) {
    const porMes = new Map<string, string[]>();
    for (const m of mudancas) {
      const k = `${m.para.ano}|${m.para.mes}`;
      const ids = porMes.get(k);
      if (ids) ids.push(m.id);
      else porMes.set(k, [m.id]);
    }
    await prisma.$transaction(
      [...porMes.entries()].map(([k, ids]) => {
        const [ano, mes] = k.split('|').map(Number);
        return prisma.bankTransaction.updateMany({
          where: { id: { in: ids } },
          data: { competenciaAno: ano, competenciaMes: mes },
        });
      }),
    );
  }
  return { mudancas, celulas: [...celulas.values()] };
}
