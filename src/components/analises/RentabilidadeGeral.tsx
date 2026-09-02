'use client';
import React, { useMemo, useState } from 'react';
import ComponentCard from '@/components/common/ComponentCard';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { useIndices, IndexData } from '@/hooks/useIndices';
import { useCarteiraResumoContext } from '@/context/CarteiraResumoContext';
import { useCarteiraHistorico } from '@/hooks/useCarteiraHistorico';
import { useRentabilidadePeriodo } from '@/hooks/useRentabilidadePeriodo';
import RentabilidadeChart from './RentabilidadeChart';
import RentabilidadeResumo from './RentabilidadeResumo';
import { alinharSeriesComparativas } from './alinhamentoSeries';
import { inicioUltimosNMeses, inicioDoAno } from '@/utils/periodWindow';
import { utcMidnight, todayUtcMidnight } from '@/utils/utcDay';
import DatePicker from '@/components/form/date-picker';
import Button from '@/components/ui/button/Button';
import {
  cortarNoFim,
  indicesRangeParaInicio,
  resolverPeriodoPersonalizado,
  rotuloPeriodo,
  toIsoDateUtc,
  type PeriodoPersonalizado,
} from './periodoPersonalizado';

type RentabilidadeRangeValue =
  | 'inicio'
  | 'ano'
  | '12m'
  | '2y'
  | '3y'
  | '5y'
  | '10y'
  | 'personalizado';
type RentabilidadeMetric = 'mwr' | 'twr';

const RENTABILIDADE_RANGE_OPTIONS: Array<{ value: RentabilidadeRangeValue; label: string }> = [
  { value: 'inicio', label: 'Do início' },
  { value: 'ano', label: 'No ano' },
  { value: '12m', label: 'Últimos 12 meses' },
  { value: '2y', label: 'Últimos 2 anos' },
  { value: '3y', label: 'Últimos 3 anos' },
  { value: '5y', label: 'Últimos 5 anos' },
  { value: '10y', label: 'Últimos 10 anos' },
  // Ticket 02/09/2026 (Pedro, "igual ao Gorila"): data inicial + data final.
  { value: 'personalizado', label: 'Personalizado…' },
];

// Meia-noite UTC do dia-calendário selecionado: as séries de benchmark têm
// pontos UTC-midnight, e a borda local (03:00Z em UTC-3) + filtro >= excluía
// o ponto-âncora do dia 1º (filterDataByStart) e desalinhava o Math.max com
// firstInvestmentDate (também UTC).
const normalizeStartDate = (date: Date): number => utcMidnight(date);

const getRangeStartDate = (
  range: RentabilidadeRangeValue,
  firstDate?: number,
  personalizado?: PeriodoPersonalizado | null,
) => {
  const now = new Date();
  const normalizedNow = normalizeStartDate(now);

  if (range === 'inicio') {
    return firstDate;
  }
  // Personalizado ainda não aplicado se comporta como "Do início".
  if (range === 'personalizado') {
    return personalizado?.inicio ?? firstDate;
  }

  let calculatedStart: number | undefined;

  // Janelas ancoradas em mês-calendário (dia 1º), como o Kinvo. Ex.: "2 anos" em
  // jun/2026 começa em 01/07/2024, não 08/06/2024 (janela rolante dia-a-dia).
  const RANGE_TO_MONTHS: Partial<Record<RentabilidadeRangeValue, number>> = {
    '12m': 12,
    '2y': 24,
    '3y': 36,
    '5y': 60,
    '10y': 120,
  };

  if (range === 'ano') {
    calculatedStart = normalizeStartDate(inicioDoAno(now));
  } else if (RANGE_TO_MONTHS[range]) {
    calculatedStart = normalizeStartDate(inicioUltimosNMeses(RANGE_TO_MONTHS[range]!, now));
  } else {
    calculatedStart = normalizedNow;
  }

  // Se temos uma data de início da carteira e o range calculado é anterior a ela,
  // usar a data de início da carteira como limite mínimo
  if (firstDate && calculatedStart && calculatedStart < firstDate) {
    return firstDate;
  }

  return calculatedStart;
};

export default function RentabilidadeGeral() {
  const [selectedRange, setSelectedRange] = useState<RentabilidadeRangeValue>('inicio');
  // TWR como padrão: é a rentabilidade por cota (time-weighted) que o Kinvo e os
  // benchmarks usam — comparação apples-to-apples. O toggle MWR continua disponível.
  const [metric, setMetric] = useState<RentabilidadeMetric>('twr');
  // Período personalizado: rascunho dos inputs (ISO) × intervalo APLICADO. Só o
  // aplicado dispara refetch — evita uma chamada por clique no calendário.
  const [personalizadoDraft, setPersonalizadoDraft] = useState<{ inicio: string; fim: string }>({
    inicio: '',
    fim: '',
  });
  const [personalizado, setPersonalizado] = useState<PeriodoPersonalizado | null>(null);
  const [personalizadoErro, setPersonalizadoErro] = useState<string | null>(null);
  const [personalizadoAviso, setPersonalizadoAviso] = useState<string | null>(null);
  const { resumo, loading: carteiraLoading } = useCarteiraResumoContext();

  // Calcular data do primeiro investimento (primeira data com valor não-zero do histórico)
  const firstInvestmentDate = useMemo(() => {
    if (!resumo?.historicoPatrimonio || resumo.historicoPatrimonio.length === 0) {
      return undefined;
    }
    // Encontrar o primeiro valor não-zero (ignorar pontos iniciais com valor zero)
    const firstNonZeroItem = resumo.historicoPatrimonio.find(
      (item) => item.saldoBruto > 0 || item.valorAplicado > 0,
    );
    return firstNonZeroItem?.data;
  }, [resumo?.historicoPatrimonio]);

  const selectedRangeStart = useMemo(() => {
    const rangeStart = getRangeStartDate(selectedRange, firstInvestmentDate, personalizado);
    if (!rangeStart && firstInvestmentDate) {
      return firstInvestmentDate;
    }
    if (!rangeStart) {
      return undefined;
    }
    if (firstInvestmentDate) {
      return Math.max(rangeStart, firstInvestmentDate);
    }
    return rangeStart;
  }, [firstInvestmentDate, selectedRange, personalizado]);

  /** Fim da janela (ms UTC, inclusive) — só no personalizado; presets vão até o último fechamento. */
  const selectedRangeEnd =
    selectedRange === 'personalizado' && personalizado ? personalizado.fim : undefined;

  const hasHistoricoTWR = Array.isArray(resumo?.historicoTWR) && resumo.historicoTWR.length > 0;
  const isPeriodoInicio =
    selectedRange === 'inicio' || (selectedRange === 'personalizado' && !personalizado);
  const {
    data: carteiraHistoricoDiario,
    mwr: carteiraHistoricoDiarioMwr,
    loading: loadingCarteiraHistorico,
    error: errorCarteiraHistorico,
  } = useCarteiraHistorico(selectedRangeStart, { enabled: !hasHistoricoTWR });
  const {
    data: rentabilidadePeriodo,
    mwr: rentabilidadePeriodoMwr,
    loading: loadingRentabilidadePeriodo,
    error: errorRentabilidadePeriodo,
  } = useRentabilidadePeriodo(isPeriodoInicio ? undefined : selectedRangeStart, {
    enabled: hasHistoricoTWR && !isPeriodoInicio,
  });

  // Range dos índices deve cobrir o período selecionado para evitar dados incompletos
  const indicesDailyRange = useMemo(() => {
    if (selectedRange === '12m' || selectedRange === 'ano') return '1y';
    if (selectedRange === '2y') return '2y';
    if (selectedRange === '3y') return '3y';
    if (selectedRange === '5y') return '5y';
    if (selectedRange === '10y') return '10y';
    if (selectedRange === 'personalizado' && personalizado) {
      return indicesRangeParaInicio(personalizado.inicio, todayUtcMidnight());
    }
    return '1y'; // "inicio" e default: 1y (indices API expande conforme startDate)
  }, [selectedRange, personalizado]);
  // Para os períodos "1d" e "1mo", passar a data do primeiro investimento
  const {
    indices: indices1d,
    loading: loading1d,
    error: error1d,
  } = useIndices(indicesDailyRange, selectedRangeStart);
  const {
    indices: indices1mo,
    loading: loading1mo,
    error: error1mo,
  } = useIndices('1mo', selectedRangeStart);
  const {
    indices: indices1y,
    loading: loading1y,
    error: error1y,
  } = useIndices('1y', selectedRangeStart);

  const filterDataByStart = <T extends { date: number } | { data: number }>(
    data: T[],
    startDate?: number,
    dateKey: 'date' | 'data' = 'date',
  ): T[] => {
    if (!Array.isArray(data) || data.length === 0) return [];
    if (!startDate) return data;
    const key = dateKey;
    const filtered = data.filter(
      (item) =>
        item &&
        typeof (item as Record<string, number>)[key] === 'number' &&
        (item as Record<string, number>)[key] >= startDate,
    );
    return filtered;
  };

  // Remove o DIA CORRENTE da série (preço intraday/incompleto), igual ao Kinvo:
  // o gráfico termina no último dia fechado. Datas são UTC-midnight (normalizeDateStart
  // no backend), então comparamos contra a meia-noite UTC de hoje.
  const dropCurrentDay = <T extends { date: number }>(series: T[]): T[] => {
    const now = new Date();
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return series.filter((p) => p.date < todayUtc);
  };

  /**
   * Dados de rentabilidade pro gráfico — TWR ou MWR conforme o toggle.
   * SEMPRE recalculados por período (nunca filtro visual):
   * - "inicio": série cumulativa desde a primeira transação (resumo ou carteira-historico)
   * - 12m, 2y, etc: API recalcula desde o início do período (primeiro ponto = 0%)
   */
  const carteiraParaChart = useMemo((): IndexData[] => {
    const useMwr = metric === 'mwr';
    // Personalizado: TWR/MWR são cumulativos desde o início da janela, então
    // cortar no fim escolhido devolve o retorno exato de [início, fim].
    const fechar = (serie: IndexData[]) => cortarNoFim(dropCurrentDay(serie), selectedRangeEnd);
    if (hasHistoricoTWR && !isPeriodoInicio) {
      const periodo = useMwr ? rentabilidadePeriodoMwr : rentabilidadePeriodo;
      if (periodo.length > 0) return fechar(periodo);
    }
    if (hasHistoricoTWR && isPeriodoInicio) {
      const serie = useMwr ? (resumo?.historicoMWR ?? []) : (resumo?.historicoTWR ?? []);
      return fechar(serie.map((item) => ({ date: item.data, value: item.value })));
    }
    const fallback = useMwr ? carteiraHistoricoDiarioMwr : carteiraHistoricoDiario;
    if (fallback && fallback.length > 0) {
      return fechar(fallback.map((item) => ({ date: item.date, value: item.value })));
    }
    return [];
  }, [
    metric,
    hasHistoricoTWR,
    isPeriodoInicio,
    selectedRangeEnd,
    rentabilidadePeriodo,
    rentabilidadePeriodoMwr,
    resumo?.historicoTWR,
    resumo?.historicoMWR,
    carteiraHistoricoDiario,
    carteiraHistoricoDiarioMwr,
  ]);

  // Resumo (cards % e donut) acompanha o filtro: retorno da carteira NO período
  // (= último ponto do gráfico, já recalculado com proventos) + início da janela.
  // "Do início" mantém o comportamento atual (acumulado total).
  const periodReturn = useMemo(() => {
    if (isPeriodoInicio) return undefined;
    return carteiraParaChart.length > 0
      ? carteiraParaChart[carteiraParaChart.length - 1]?.value
      : undefined;
  }, [isPeriodoInicio, carteiraParaChart]);
  const periodLabel = isPeriodoInicio
    ? undefined
    : selectedRange === 'personalizado' && personalizado
      ? rotuloPeriodo(personalizado)
      : RENTABILIDADE_RANGE_OPTIONS.find((o) => o.value === selectedRange)?.label;

  const filteredIndices1d = useMemo(
    () =>
      Array.isArray(indices1d)
        ? indices1d
            .filter((index) => index && Array.isArray(index.data) && index.data.length > 0)
            .map((index) => ({
              ...index,
              data: cortarNoFim(
                dropCurrentDay(filterDataByStart(index.data, selectedRangeStart)),
                selectedRangeEnd,
              ),
            }))
            .filter((index) => Array.isArray(index.data) && index.data.length > 0)
        : [],
    [indices1d, selectedRangeStart, selectedRangeEnd],
  );

  const filteredIndices1mo = useMemo(
    () =>
      Array.isArray(indices1mo)
        ? indices1mo
            .filter((index) => index && Array.isArray(index.data) && index.data.length > 0)
            .map((index) => ({
              ...index,
              data: cortarNoFim(
                dropCurrentDay(filterDataByStart(index.data, selectedRangeStart)),
                selectedRangeEnd,
              ),
            }))
            .filter((index) => Array.isArray(index.data) && index.data.length > 0)
        : [],
    [indices1mo, selectedRangeStart, selectedRangeEnd],
  );

  const filteredIndices1y = useMemo(
    () =>
      Array.isArray(indices1y)
        ? indices1y
            .filter((index) => index && Array.isArray(index.data) && index.data.length > 0)
            .map((index) => ({
              ...index,
              data: cortarNoFim(
                dropCurrentDay(filterDataByStart(index.data, selectedRangeStart)),
                selectedRangeEnd,
              ),
            }))
            .filter((index) => Array.isArray(index.data) && index.data.length > 0)
        : [],
    [indices1y, selectedRangeStart, selectedRangeEnd],
  );

  // Alinhamento canônico (alinhamentoSeries.ts): janela = janela da carteira,
  // toda série ancorada em 0% no mesmo t0. É o contrato que impede o bug
  // crônico de "carteira começando no meio" com benchmarks em janelas próprias.
  const alinhado1d = useMemo(
    () =>
      alinharSeriesComparativas({
        carteira: carteiraParaChart,
        benchmarks: filteredIndices1d,
        periodoInicio: selectedRangeStart,
      }),
    [carteiraParaChart, filteredIndices1d, selectedRangeStart],
  );
  const alinhado1mo = useMemo(
    () =>
      alinharSeriesComparativas({
        carteira: carteiraParaChart,
        benchmarks: filteredIndices1mo,
        periodoInicio: selectedRangeStart,
      }),
    [carteiraParaChart, filteredIndices1mo, selectedRangeStart],
  );
  const alinhado1y = useMemo(
    () =>
      alinharSeriesComparativas({
        carteira: carteiraParaChart,
        benchmarks: filteredIndices1y,
        periodoInicio: selectedRangeStart,
      }),
    [carteiraParaChart, filteredIndices1y, selectedRangeStart],
  );

  const handleRangeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value as RentabilidadeRangeValue;
    setSelectedRange(value);
    if (value === 'personalizado' && !personalizadoDraft.inicio && !personalizadoDraft.fim) {
      // Sugestão inicial: 1º investimento → último fechamento.
      const hoje = todayUtcMidnight();
      setPersonalizadoDraft({
        inicio: firstInvestmentDate ? toIsoDateUtc(firstInvestmentDate) : '',
        fim: toIsoDateUtc(hoje),
      });
    }
  };

  const aplicarPersonalizado = () => {
    const r = resolverPeriodoPersonalizado({
      inicioIso: personalizadoDraft.inicio,
      fimIso: personalizadoDraft.fim,
      firstInvestmentDate,
      hojeUtc: todayUtcMidnight(),
    });
    if (!r.ok) {
      setPersonalizadoErro(r.erro);
      return;
    }
    setPersonalizadoErro(null);
    const avisos: string[] = [];
    if (r.inicioClampado && firstInvestmentDate) {
      avisos.push(
        `A carteira começa em ${new Date(firstInvestmentDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}; o início foi ajustado.`,
      );
    }
    if (r.fimClampado) avisos.push('A data final foi ajustada para hoje.');
    setPersonalizadoAviso(avisos.length > 0 ? avisos.join(' ') : null);
    setPersonalizado(r.periodo);
  };

  const loading =
    loading1d ||
    loading1mo ||
    loading1y ||
    carteiraLoading ||
    loadingCarteiraHistorico ||
    loadingRentabilidadePeriodo;

  // Tolera falhas parciais: enquanto pelo menos UMA fonte retornou dados, renderiza o gráfico
  // (mesmo que CDI ou IBOV venham faltando). Antes, qualquer error1d/error1mo/error1y
  // bloqueava o painel inteiro e o usuário via "Erro ao carregar dados" sem nada plotado.
  const allErrored =
    !!error1d && !!error1mo && !!error1y && !!errorCarteiraHistorico && !!errorRentabilidadePeriodo;
  const noDataAtAll =
    filteredIndices1d.length === 0 &&
    filteredIndices1mo.length === 0 &&
    filteredIndices1y.length === 0 &&
    carteiraParaChart.length === 0;

  if (loading) {
    return <LoadingSpinner text="Carregando dados de rentabilidade..." />;
  }

  if (allErrored && noDataAtAll) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
            Erro ao carregar dados
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {error1d || error1mo || error1y || errorCarteiraHistorico || errorRentabilidadePeriodo}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div
          role="group"
          aria-label="Métrica de rentabilidade"
          className="inline-flex h-11 overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700"
          title={
            metric === 'mwr'
              ? 'MWR (Money-Weighted Return / TIR): pondera o timing dos aportes — o que seu dinheiro rendeu de fato.'
              : 'TWR (Time-Weighted Return): isola o desempenho do mercado — comparável com benchmark (CDI, IBOV).'
          }
        >
          <button
            type="button"
            aria-pressed={metric === 'mwr'}
            onClick={() => setMetric('mwr')}
            className={`px-4 text-sm font-medium transition-colors ${
              metric === 'mwr'
                ? 'bg-brand-500 text-white'
                : 'bg-transparent text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
            }`}
          >
            MWR
          </button>
          <button
            type="button"
            aria-pressed={metric === 'twr'}
            onClick={() => setMetric('twr')}
            className={`px-4 text-sm font-medium transition-colors ${
              metric === 'twr'
                ? 'bg-brand-500 text-white'
                : 'bg-transparent text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
            }`}
          >
            TWR
          </button>
        </div>
        <div className="w-full max-w-[220px]">
          <label htmlFor="rentabilidade-range" className="sr-only">
            Filtro de período
          </label>
          <select
            id="rentabilidade-range"
            aria-label="Filtro de período"
            value={selectedRange}
            onChange={handleRangeChange}
            className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 pr-10 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            {RENTABILIDADE_RANGE_OPTIONS.map((option) => (
              <option
                key={option.value}
                value={option.value}
                className="text-gray-700 dark:bg-gray-900 dark:text-gray-400"
              >
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {selectedRange === 'personalizado' ? (
        <div
          className="flex flex-wrap items-end justify-end gap-3"
          data-testid="rentabilidade-periodo-personalizado"
        >
          <div className="w-full max-w-[180px]">
            <DatePicker
              id="rentabilidade-periodo-inicio"
              label="Data inicial"
              placeholder="dd/mm/aaaa"
              maxDate="today"
              defaultDate={personalizadoDraft.inicio || undefined}
              onChange={(_dates, dateStr) =>
                setPersonalizadoDraft((d) => ({ ...d, inicio: dateStr }))
              }
            />
          </div>
          <div className="w-full max-w-[180px]">
            <DatePicker
              id="rentabilidade-periodo-fim"
              label="Data final"
              placeholder="dd/mm/aaaa"
              maxDate="today"
              defaultDate={personalizadoDraft.fim || undefined}
              onChange={(_dates, dateStr) => setPersonalizadoDraft((d) => ({ ...d, fim: dateStr }))}
            />
          </div>
          <Button size="sm" onClick={aplicarPersonalizado}>
            Aplicar
          </Button>
          {personalizadoErro ? (
            <p className="w-full text-right text-xs text-red-500">{personalizadoErro}</p>
          ) : personalizadoAviso ? (
            <p className="w-full text-right text-xs text-gray-500 dark:text-gray-400">
              {personalizadoAviso}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráficos à esquerda — métrica controlada pelo toggle (MWR padrão / TWR comparativo) */}
        <div className="lg:col-span-2 space-y-6">
          <ComponentCard title={`Rentabilidade Por Dia · ${metric.toUpperCase()}`}>
            <RentabilidadeChart
              carteiraData={alinhado1d.carteira}
              indicesData={alinhado1d.benchmarks}
              period="1d"
            />
          </ComponentCard>

          <ComponentCard title={`Rentabilidade Por Mês · ${metric.toUpperCase()}`}>
            <RentabilidadeChart
              carteiraData={alinhado1mo.carteira}
              indicesData={alinhado1mo.benchmarks}
              period="1mo"
            />
          </ComponentCard>

          <ComponentCard title={`Rentabilidade Por Ano · ${metric.toUpperCase()}`}>
            <RentabilidadeChart
              carteiraData={alinhado1y.carteira}
              indicesData={alinhado1y.benchmarks}
              period="1y"
            />
          </ComponentCard>
        </div>

        {/* Resumo de Rentabilidade à direita — fecha na MESMA janela do gráfico */}
        <div className="lg:col-span-1">
          <RentabilidadeResumo
            periodStart={isPeriodoInicio ? undefined : selectedRangeStart}
            periodReturn={periodReturn}
            periodLabel={periodLabel}
            fimJanela={alinhado1d.janela?.fim}
            fimPersonalizado={selectedRangeEnd != null}
          />
        </div>
      </div>
    </div>
  );
}
