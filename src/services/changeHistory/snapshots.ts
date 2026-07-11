/**
 * Builders de ChangeSnapshot — estado pré-mutação allowlisted gravado em
 * user_change_logs.snapshot para permitir desfazer exclusões/upserts.
 * Cada builder escolhe explicitamente os campos necessários à recriação
 * (nunca dump cego da row) e serializa Date → ISO.
 */

import type { ChangeSnapshot } from './types';

const iso = (value: Date | string | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : value;
};

interface TransacaoRow {
  id: string;
  assetId: string | null;
  type: string;
  quantity: number;
  price: number;
  total: number;
  date: Date;
  fees: number | null;
  notes: string | null;
}

interface PortfolioMeta {
  id: string;
  assetId: string | null;
  objetivo: number;
  estrategia: string | null;
  tipoFii: string | null;
  regiaoEtf: string | null;
  planejamentoObjetivoId: string | null;
  vinculoAposentadoria: boolean;
}

interface FixedIncomeRow {
  type: string;
  description: string;
  startDate: Date;
  maturityDate: Date;
  investedAmount: number;
  annualRate: number;
  indexer: string | null;
  indexerPercent: number | null;
  liquidityType: string | null;
  taxExempt: boolean;
  tesouroBondType: string | null;
  tesouroMaturity: Date | null;
}

const pickTransacao = (tx: TransacaoRow) => ({
  id: tx.id,
  assetId: tx.assetId,
  type: tx.type,
  quantity: tx.quantity,
  price: tx.price,
  total: tx.total,
  date: iso(tx.date),
  fees: tx.fees,
  notes: tx.notes,
});

const pickPortfolioMeta = (portfolio: PortfolioMeta) => ({
  id: portfolio.id,
  assetId: portfolio.assetId,
  objetivo: portfolio.objetivo,
  estrategia: portfolio.estrategia,
  tipoFii: portfolio.tipoFii,
  regiaoEtf: portfolio.regiaoEtf,
  planejamentoObjetivoId: portfolio.planejamentoObjetivoId,
  vinculoAposentadoria: portfolio.vinculoAposentadoria,
});

const pickFixedIncome = (fi: FixedIncomeRow) => ({
  type: fi.type,
  description: fi.description,
  startDate: iso(fi.startDate),
  maturityDate: iso(fi.maturityDate),
  investedAmount: fi.investedAmount,
  annualRate: fi.annualRate,
  indexer: fi.indexer,
  indexerPercent: fi.indexerPercent,
  liquidityType: fi.liquidityType,
  taxExempt: fi.taxExempt,
  tesouroBondType: fi.tesouroBondType,
  tesouroMaturity: iso(fi.tesouroMaturity),
});

/**
 * Exclusão de uma transação. `meta` carrega o Portfolio e o FixedIncomeAsset
 * do ativo porque recalculatePortfolioFromTransactions DELETA ambos quando a
 * última transação some — o undo precisa recriá-los.
 */
export function buildTransacaoSnapshot(
  tx: TransacaoRow,
  related: { portfolio?: PortfolioMeta | null; fixedIncome?: FixedIncomeRow | null },
): ChangeSnapshot {
  return {
    v: 1,
    kind: 'transacao',
    data: pickTransacao(tx),
    meta: {
      ...(related.portfolio ? { portfolio: pickPortfolioMeta(related.portfolio) } : {}),
      ...(related.fixedIncome ? { fixedIncome: pickFixedIncome(related.fixedIncome) } : {}),
    },
  };
}

/** Acima disso a remoção de ativo não grava snapshot (sem botão de desfazer). */
export const ATIVO_SNAPSHOT_MAX_TRANSACTIONS = 200;

/**
 * Remoção de um ativo inteiro da carteira (Portfolio + transações + renda
 * fixa). Retorna undefined quando o volume de transações excede o cap —
 * nesse caso a exclusão fica irreversível, por design.
 */
export function buildAtivoSnapshot(
  portfolio: PortfolioMeta,
  transactions: TransacaoRow[],
  fixedIncome?: FixedIncomeRow | null,
): ChangeSnapshot | undefined {
  if (transactions.length > ATIVO_SNAPSHOT_MAX_TRANSACTIONS) return undefined;
  return {
    v: 1,
    kind: 'ativo-completo',
    data: {
      portfolio: pickPortfolioMeta(portfolio),
      transactions: transactions.map(pickTransacao),
      ...(fixedIncome ? { fixedIncome: pickFixedIncome(fixedIncome) } : {}),
    },
  };
}

/**
 * Upsert de uma métrica do DashboardData (caixa para investir, meta de
 * patrimônio). `value: null` = a métrica não existia antes (undo = delete).
 */
export function buildDashboardMetricSnapshot(
  metric: string,
  valorAnterior: number | null | undefined,
): ChangeSnapshot {
  return {
    v: 1,
    kind: 'dashboard-metric',
    data: { value: valorAnterior ?? null },
    meta: { metric },
  };
}
