import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { CashflowGroup } from '@/types/cashflow';
import type { ProventoData } from '@/hooks/useProventos';
import {
  buildSaldoContaCorrenteAnterior,
  buildFluxoLivreByMonth,
  computeEvolucaoSeries,
} from '@/services/cashflow/evolucaoPatrimonioSeries';
import { CANONICAL_GROUPS, findGroupByCanonicalName } from '@/services/cashflow/groupMatchers';

const EMPTY_MONTHS = (): number[] => Array(12).fill(0);

/** Subconjunto de `useProcessedData` que as linhas derivadas consomem. */
export interface DerivedRowsInput {
  groups: CashflowGroup[];
  groupTotals: Record<string, number[]>;
  groupAnnualTotals: Record<string, number>;
  entradasByMonth: number[];
  despesasByMonth: number[];
}

interface UseCashflowDerivedRowsArgs {
  processedData: DerivedRowsInput;
  currentYear: number;
  /** Proventos do ano (qualquer status; o hook filtra `realizado`). */
  proventos: ProventoData[];
  /** Aportes de linhas-espelho de sonho por mês (série cheia da Evolução). */
  planejamentoPorMes?: number[];
  /** Operações "dinheiro já estava investido" por mês (série cheia da Evolução). */
  reinvestimentosPorMes?: number[];
}

const findGroupByType = (groups: CashflowGroup[], type: string): CashflowGroup | null => {
  for (const group of groups) {
    if (group.type === type) return group;
    if (group.children) {
      const found = findGroupByType(group.children, type);
      if (found) return found;
    }
  }
  return null;
};

/**
 * Séries das linhas CALCULADAS da planilha de Fluxo de Caixa (Saldo Conta
 * Corrente Mês Anterior, Fluxo de Caixa livre, Evolução do Patrimônio,
 * Rendimentos Recebidos, Índice paz financeira). Extraído do `DataTableTwo`
 * para separar cálculo de render; as regras (Pedro Haddad) estão comentadas
 * em cada série.
 */
export function useCashflowDerivedRows({
  processedData,
  currentYear,
  proventos,
  planejamentoPorMes,
  reinvestimentosPorMes,
}: UseCashflowDerivedRowsArgs) {
  const { groups, groupTotals, groupAnnualTotals, entradasByMonth, despesasByMonth } =
    processedData;

  // Grupo "Despesas Fixas" pelo nome canônico do template (sobrevive a rename)
  const despesasFixasGroup = useMemo(
    () => findGroupByCanonicalName(groups, CANONICAL_GROUPS.DESPESAS_FIXAS),
    [groups],
  );

  const despesasFixasData = useMemo(() => {
    if (!despesasFixasGroup) return { byMonth: EMPTY_MONTHS(), annual: 0 };
    return {
      byMonth: groupTotals[despesasFixasGroup.id] || EMPTY_MONTHS(),
      annual: groupAnnualTotals[despesasFixasGroup.id] || 0,
    };
  }, [despesasFixasGroup, groupTotals, groupAnnualTotals]);

  // Proventos recebidos (apenas realizados no ano atual). Mês/ano em UTC:
  // datas de pagamento são gravadas em meia-noite UTC — getMonth() local (BRT
  // −3h) jogaria um pagamento de dia 1º para o mês anterior.
  //
  // Regra Pedro Haddad: os proventos automáticos ("Rendimentos Recebidos")
  // NÃO somam nas entradas nem no saldo do mês — rodam de forma independente
  // no fim da planilha. Receitas de investimentos lançadas manualmente pelo
  // cliente continuam entrando normalmente pelos itens de Entradas.
  const proventosByMonth = useMemo(() => {
    const totals = EMPTY_MONTHS();
    proventos.forEach((provento) => {
      if (provento.status !== 'realizado') return;
      const date = new Date(provento.data);
      if (Number.isNaN(date.getTime()) || date.getUTCFullYear() !== currentYear) return;
      totals[date.getUTCMonth()] += provento.valor;
    });
    return totals;
  }, [proventos, currentYear]);
  const proventosAnnual = useMemo(
    () => proventosByMonth.reduce((sum, value) => sum + value, 0),
    [proventosByMonth],
  );

  // Aporte/Resgate (grupo type='investimento', automático da carteira)
  const investimentosByMonth = useMemo(() => {
    const group = findGroupByType(groups, 'investimento');
    return group ? groupTotals[group.id] || EMPTY_MONTHS() : EMPTY_MONTHS();
  }, [groups, groupTotals]);

  // Bloco "Conta Corrente" (type='saldo'): o cliente informa manualmente o que
  // ficou parado em cada banco no fim de cada mês.
  const contaCorrenteGroup = useMemo(() => findGroupByType(groups, 'saldo'), [groups]);
  const contaCorrenteByMonth = useMemo(
    () =>
      contaCorrenteGroup ? groupTotals[contaCorrenteGroup.id] || EMPTY_MONTHS() : EMPTY_MONTHS(),
    [contaCorrenteGroup, groupTotals],
  );

  // Carry-over cross-year: saldo da Conta Corrente em dezembro do ano anterior
  // entra como "Saldo Conta Corrente Mês Anterior" de janeiro.
  const { data: saldoAnteriorData } = useQuery({
    queryKey: queryKeys.cashflow.contaCorrenteAnterior(currentYear),
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/cashflow/conta-corrente-anterior?year=${currentYear}`, {
        credentials: 'include',
        signal,
      });
      if (!response.ok) throw new Error('Erro ao buscar saldo do ano anterior');
      return response.json() as Promise<{ saldoDezembroAnterior: number }>;
    },
  });
  const saldoDezembroAnterior = saldoAnteriorData?.saldoDezembroAnterior ?? 0;

  // Saldo Conta Corrente Mês Anterior: jan puxa dez do ano anterior; os demais
  // meses puxam o bloco Conta Corrente do mês anterior. Não soma nas entradas —
  // só compõe o Fluxo de Caixa livre (regra Pedro Haddad).
  const saldoContaCorrenteAnteriorByMonth = useMemo(
    () => buildSaldoContaCorrenteAnterior(contaCorrenteByMonth, saldoDezembroAnterior),
    [saldoDezembroAnterior, contaCorrenteByMonth],
  );

  // Fluxo de Caixa livre = saldo do mês + saldo conta corrente do mês anterior
  // − aportes/resgates (fórmula da planilha, não acumulado: a sobra que ficou
  // na conta entra no mês seguinte via Conta Corrente preenchida pelo cliente).
  const fluxoCaixaLivreByMonth = useMemo(
    () =>
      buildFluxoLivreByMonth({
        entradasByMonth,
        despesasByMonth,
        contaCorrenteByMonth,
        saldoDezembroAnterior,
        aportesByMonth: investimentosByMonth,
      }),
    [
      entradasByMonth,
      despesasByMonth,
      contaCorrenteByMonth,
      saldoDezembroAnterior,
      investimentosByMonth,
    ],
  );
  const fluxoCaixaLivreAnnual = useMemo(
    () => fluxoCaixaLivreByMonth.reduce((sum, val) => sum + val, 0),
    [fluxoCaixaLivreByMonth],
  );

  // Evolução do Patrimônio: modelo encadeado (anterior + aportes do mês +
  // fluxo livre sem o carry da Conta Corrente), sem marcação a mercado.
  // Meses fechados usam o valor travado pelo cron do último dia útil (snapshot).
  const { data: evolucaoData } = useQuery({
    queryKey: queryKeys.cashflow.evolucaoPatrimonio(currentYear),
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/cashflow/evolucao-patrimonio?year=${currentYear}`, {
        credentials: 'include',
        signal,
      });
      if (!response.ok) throw new Error('Erro ao buscar evolução do patrimônio');
      return response.json() as Promise<{
        baseAplicadaAnterior: number;
        snapshots: { month: number; valor: number }[];
      }>;
    },
  });

  const evolucaoPatrimonioByMonth = useMemo(() => {
    const snapshotByMonth: Partial<Record<number, number>> = {};
    for (const snap of evolucaoData?.snapshots ?? []) {
      snapshotByMonth[snap.month] = snap.valor;
    }
    // Série CHEIA de aportes: Aporte/Resgate (livres) + ativos vinculados a
    // sonho + operações "dinheiro já estava investido". Os dois últimos ficam
    // fora do fluxo livre (sonho já desce como despesa da linha-espelho; a
    // operação marcada nunca passou pelo caixa), mas o aporte nominal vira
    // patrimônio do mesmo jeito — sem somá-los, a posição pré-existente sumia
    // da Evolução do ano e reaparecia na base aplicada da virada (degrau).
    const aportesFullByMonth = investimentosByMonth.map(
      (v, i) => v + (planejamentoPorMes?.[i] || 0) + (reinvestimentosPorMes?.[i] || 0),
    );
    return computeEvolucaoSeries({
      baseAplicada: evolucaoData?.baseAplicadaAnterior ?? 0,
      aportesByMonth: aportesFullByMonth,
      fluxoLivreByMonth: fluxoCaixaLivreByMonth,
      saldoAnteriorByMonth: saldoContaCorrenteAnteriorByMonth,
      snapshotByMonth,
    });
  }, [
    evolucaoData,
    investimentosByMonth,
    planejamentoPorMes,
    reinvestimentosPorMes,
    fluxoCaixaLivreByMonth,
    saldoContaCorrenteAnteriorByMonth,
  ]);

  return {
    despesasFixasData,
    proventosByMonth,
    proventosAnnual,
    investimentosByMonth,
    contaCorrenteGroup,
    saldoContaCorrenteAnteriorByMonth,
    fluxoCaixaLivreByMonth,
    fluxoCaixaLivreAnnual,
    evolucaoPatrimonioByMonth,
  };
}
