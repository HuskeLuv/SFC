import type { CashflowGroup, CashflowValue } from '@/types/cashflow';
import { isReceitaGroupByType } from '@/utils/formatters';
import { CANONICAL_GROUPS, isCanonical } from './groupMatchers';

/**
 * Agregação pura e isomórfica do fluxo de caixa.
 *
 * Fonte única de verdade para os totais mensais/anuais derivados da árvore de
 * grupos. Consumida tanto pelo hook client `useProcessedData` (planilha) quanto
 * por endpoints server-side (ex.: contexto de planejamento), garantindo que a
 * "sobra mensal", "despesa mensal" e "despesa fixa" tenham exatamente a mesma
 * semântica em todos os lugares.
 *
 * Convenções preservadas do cálculo original (`useProcessedData`):
 * - `entradasByMonth`/`despesasByMonth` somam os itens por mês; o grupo de
 *   investimentos é EXCLUÍDO de `despesasByMonth` (mas seu anual entra em
 *   `despesasTotal`, quirk histórico mantido por compatibilidade).
 * - `totalByMonth` = receitas − despesas dos grupos de topo, ignorando o grupo
 *   `investimento` (a "sobra"/capacidade de poupança do mês).
 */

const MONTHS = 12;

export interface CashflowAverages {
  /** Meses com qualquer movimento (entrada ou despesa != 0). */
  activeMonths: number;
  /** Sobra média por mês ativo (capacidade de poupança/aporte). */
  sobraMensalMedia: number;
  /** Despesa média por mês ativo (proxy de renda-alvo na aposentadoria). */
  despesaMensalMedia: number;
  /** Despesa fixa média por mês ativo (base para reserva de emergência ideal). */
  despesaFixaMensal: number;
}

export interface CashflowAggregation {
  groupTotals: Record<string, number[]>;
  groupAnnualTotals: Record<string, number>;
  groupPercentages: Record<string, number>;
  itemTotals: Record<string, number[]>;
  itemAnnualTotals: Record<string, number>;
  itemPercentages: Record<string, number>;
  totalByMonth: number[];
  totalAnnual: number;
  entradasTotal: number;
  despesasTotal: number;
  entradasByMonth: number[];
  despesasByMonth: number[];
  despesaFixaByMonth: number[];
  despesaFixaAnnual: number;
  averages: CashflowAverages;
}

const findGroupBy = (
  groups: CashflowGroup[],
  predicate: (g: CashflowGroup) => boolean,
): CashflowGroup | undefined => {
  for (const group of groups) {
    if (predicate(group)) return group;
    if (group.children?.length) {
      const found = findGroupBy(group.children, predicate);
      if (found) return found;
    }
  }
  return undefined;
};

export function aggregateCashflow(data: CashflowGroup[]): CashflowAggregation {
  const groupTotals: Record<string, number[]> = {};
  const groupAnnualTotals: Record<string, number> = {};
  const groupPercentages: Record<string, number> = {};
  const itemTotals: Record<string, number[]> = {};
  const itemAnnualTotals: Record<string, number> = {};
  const itemPercentages: Record<string, number> = {};

  let entradasTotal = 0;
  let despesasTotal = 0;
  const entradasByMonth = Array(MONTHS).fill(0);
  const despesasByMonth = Array(MONTHS).fill(0);

  const processGroup = (group: CashflowGroup, isInvestmentGroup = false, isSaldoGroup = false) => {
    const isInvestment = isInvestmentGroup || group.type === 'investimento';
    // Grupos de saldo (Conta Corrente) não são entrada nem despesa: guardam o
    // que ficou parado na conta. Ficam fora de entradas/despesas/totalByMonth,
    // mas seus itemTotals/groupTotals continuam calculados para a UI.
    const isSaldo = isSaldoGroup || group.type === 'saldo';

    if (group.items?.length) {
      group.items.forEach((item) => {
        const itemValues = Array(MONTHS).fill(0);
        if (item.values?.length) {
          item.values.forEach((val: CashflowValue & { mes?: number; valor?: number }) => {
            const month = val.month !== undefined ? val.month : val.mes;
            const value = val.value !== undefined ? val.value : val.valor;
            if (
              typeof month === 'number' &&
              month >= 0 &&
              month < MONTHS &&
              typeof value === 'number'
            ) {
              itemValues[month] = value;
            }
          });
        }
        itemTotals[item.id] = itemValues;
        const annualTotal = itemValues.reduce((a, b) => a + b, 0);
        itemAnnualTotals[item.id] = annualTotal;

        if (isSaldo) {
          // fora das somas de entradas/despesas
        } else if (isReceitaGroupByType(group.type)) {
          entradasTotal += annualTotal;
          itemValues.forEach((value, month) => {
            entradasByMonth[month] += value;
          });
        } else {
          despesasTotal += annualTotal;
          if (!isInvestment) {
            itemValues.forEach((value, month) => {
              despesasByMonth[month] += value;
            });
          }
        }
      });
    }

    groupTotals[group.id] = Array(MONTHS).fill(0);
    groupAnnualTotals[group.id] = 0;

    if (group.items?.length) {
      group.items.forEach((item) => {
        const itemValues = itemTotals[item.id];
        if (itemValues) {
          itemValues.forEach((value, month) => {
            groupTotals[group.id][month] += value;
            groupAnnualTotals[group.id] += value;
          });
        }
      });
    }

    if (group.children?.length) {
      group.children.forEach((child) => {
        processGroup(child, isInvestment, isSaldo);
        const childTotals = groupTotals[child.id];
        if (childTotals) {
          childTotals.forEach((value, month) => {
            groupTotals[group.id][month] += value;
            groupAnnualTotals[group.id] += value;
          });
        }
      });
    }
  };

  data.forEach((group) => processGroup(group));

  const receitaTotalBase = entradasTotal;

  Object.entries(groupAnnualTotals).forEach(([groupId, annualTotal]) => {
    const base = receitaTotalBase > 0 ? receitaTotalBase : 0;
    groupPercentages[groupId] = base > 0 ? (annualTotal / base) * 100 : 0;
  });

  Object.entries(itemAnnualTotals).forEach(([itemId, annualTotal]) => {
    const base = receitaTotalBase > 0 ? receitaTotalBase : 0;
    itemPercentages[itemId] = base > 0 ? (annualTotal / base) * 100 : 0;
  });

  const totalByMonth = Array(MONTHS).fill(0);
  data.forEach((group) => {
    if (group.type === 'investimento' || group.type === 'saldo') return;
    const arr = groupTotals[group.id];
    if (arr) {
      const isReceita = isReceitaGroupByType(group.type);
      arr.forEach((v, i) => {
        totalByMonth[i] += isReceita ? v : -v;
      });
    }
  });

  const totalAnnual = totalByMonth.reduce((a, b) => a + b, 0);

  // Despesas fixas (base da reserva de emergência ideal). Identificação pelo
  // nome canônico do template — sobrevive a renomeações do usuário.
  const despesasFixasGroup = findGroupBy(data, (g) =>
    isCanonical(g, CANONICAL_GROUPS.DESPESAS_FIXAS),
  );
  const despesaFixaByMonth = despesasFixasGroup
    ? (groupTotals[despesasFixasGroup.id] ?? Array(MONTHS).fill(0))
    : Array(MONTHS).fill(0);
  const despesaFixaAnnual = despesasFixasGroup
    ? (groupAnnualTotals[despesasFixasGroup.id] ?? 0)
    : 0;

  const averages = computeAverages({
    entradasByMonth,
    despesasByMonth,
    totalByMonth,
    despesaFixaByMonth,
  });

  return {
    groupTotals,
    groupAnnualTotals,
    groupPercentages,
    itemTotals,
    itemAnnualTotals,
    itemPercentages,
    totalByMonth,
    totalAnnual,
    entradasTotal,
    despesasTotal,
    entradasByMonth,
    despesasByMonth,
    despesaFixaByMonth,
    despesaFixaAnnual,
    averages,
  };
}

/**
 * Médias por mês ativo. Um mês é "ativo" se tem qualquer entrada ou despesa
 * preenchida — assim meses futuros vazios não diluem a média (o orçamento tem
 * sempre 12 colunas, mas raramente todas preenchidas).
 */
function computeAverages({
  entradasByMonth,
  despesasByMonth,
  totalByMonth,
  despesaFixaByMonth,
}: {
  entradasByMonth: number[];
  despesasByMonth: number[];
  totalByMonth: number[];
  despesaFixaByMonth: number[];
}): CashflowAverages {
  let activeMonths = 0;
  let sobra = 0;
  let despesa = 0;
  let despesaFixa = 0;

  for (let m = 0; m < MONTHS; m++) {
    const ativo = entradasByMonth[m] !== 0 || despesasByMonth[m] !== 0;
    if (!ativo) continue;
    activeMonths += 1;
    sobra += totalByMonth[m];
    despesa += despesasByMonth[m];
    despesaFixa += despesaFixaByMonth[m];
  }

  if (activeMonths === 0) {
    return { activeMonths: 0, sobraMensalMedia: 0, despesaMensalMedia: 0, despesaFixaMensal: 0 };
  }

  const round = (v: number) => Math.round((v / activeMonths) * 100) / 100;
  return {
    activeMonths,
    sobraMensalMedia: round(sobra),
    despesaMensalMedia: round(despesa),
    despesaFixaMensal: round(despesaFixa),
  };
}
