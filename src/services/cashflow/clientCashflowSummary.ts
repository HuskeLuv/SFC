import prisma from '@/lib/prisma';
import { aggregateCashflow, type CashflowAggregation } from './cashflowAggregation';
import { getMergedCashflowGroups } from './getCashflowTree';

/**
 * Resumos de fluxo de caixa de um cliente derivados da PLANILHA
 * (CashflowGroup/Item/Value via aggregateCashflow) — substitui as agregações
 * sobre o modelo legado `Cashflow`, no qual a planilha nunca escreveu (o
 * resumo do consultor sempre zerava). Semântica idêntica à da planilha:
 * grupos de investimento e de saldo ficam fora de entradas/despesas.
 */

export interface MonthlyFlow {
  /** Primeiro dia do mês (fuso local). */
  date: Date;
  income: number;
  expenses: number;
  net: number;
}

const aggregationForYear = (userId: string, year: number): Promise<CashflowAggregation> =>
  getMergedCashflowGroups(userId, year).then(aggregateCashflow);

/**
 * Fluxo mensal dos últimos `months` meses, terminando no mês corrente.
 * Meses sem lançamento voltam zerados.
 */
export const getMonthlyFlows = async (userId: string, months: number): Promise<MonthlyFlow[]> => {
  const now = new Date();
  const slots: { year: number; month: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    slots.push({ year: d.getFullYear(), month: d.getMonth() });
  }

  const years = [...new Set(slots.map((s) => s.year))];
  const aggs = new Map(
    await Promise.all(
      years.map(async (year) => [year, await aggregationForYear(userId, year)] as const),
    ),
  );

  return slots.map(({ year, month }) => {
    const agg = aggs.get(year);
    const income = agg?.entradasByMonth[month] ?? 0;
    const expenses = agg?.despesasByMonth[month] ?? 0;
    return { date: new Date(year, month, 1), income, expenses, net: income - expenses };
  });
};

export interface CashBalances {
  total: { income: number; expenses: number; net: number };
  monthly: { income: number; expenses: number; net: number };
}

/**
 * Entradas/despesas acumuladas desde o primeiro ano com lançamento (janela
 * máxima de 10 anos) + recorte do mês corrente. No ano corrente a soma para no
 * mês atual: a planilha carrega projeções para os meses futuros e elas não
 * devem inflar o saldo realizado.
 */
export const getCashBalances = async (userId: string): Promise<CashBalances> => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const oldest = await prisma.cashflowValue.findFirst({
    where: { userId },
    orderBy: { year: 'asc' },
    select: { year: true },
  });
  const minYear = Math.max(oldest?.year ?? currentYear, currentYear - 10);

  const years: number[] = [];
  for (let year = minYear; year <= currentYear; year++) years.push(year);
  const aggs = await Promise.all(years.map((year) => aggregationForYear(userId, year)));

  let income = 0;
  let expenses = 0;
  years.forEach((year, index) => {
    const agg = aggs[index];
    const lastMonth = year === currentYear ? currentMonth : 11;
    for (let month = 0; month <= lastMonth; month++) {
      income += agg.entradasByMonth[month];
      expenses += agg.despesasByMonth[month];
    }
  });

  const current = aggs[aggs.length - 1];
  const monthlyIncome = current?.entradasByMonth[currentMonth] ?? 0;
  const monthlyExpenses = current?.despesasByMonth[currentMonth] ?? 0;

  return {
    total: { income, expenses, net: income - expenses },
    monthly: {
      income: monthlyIncome,
      expenses: monthlyExpenses,
      net: monthlyIncome - monthlyExpenses,
    },
  };
};
