'use client';
import React, { useMemo } from 'react';
import ComponentCard from '@/components/common/ComponentCard';
import { useCarteiraResumoContext } from '@/context/CarteiraResumoContext';
import { useIndices } from '@/hooks/useIndices';
import { useCarteiraHistorico } from '@/hooks/useCarteiraHistorico';
import { inicioUltimosNMeses } from '@/utils/periodWindow';
import dynamic from 'next/dynamic';
import { ApexOptions } from 'apexcharts';
import ErrorBoundary from '@/components/common/ErrorBoundary';

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

/**
 * Remove o ponto do dia corrente (parcial) — mesma regra do gráfico em
 * RentabilidadeGeral, para card e gráfico fecharem no mesmo ponto.
 * As datas da série são meia-noite UTC (normalizeDateStart no backend), então o
 * corte é contra a meia-noite UTC de hoje — meia-noite LOCAL em UTC-3 cai às
 * 03:00 UTC e deixava o ponto parcial de hoje passar (card 1 dia à frente).
 */
export const dropCurrentDay = <T extends { date: number }>(series: T[]): T[] => {
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const drop = series.filter((item) => item.date < todayUtc);
  return drop.length > 0 ? drop : series;
};

/** Último valor com date <= ref (mesma semântica do twrAt do backend). */
export const valorEm = (
  data: Array<{ date: number; value: number }>,
  ref: number,
): number | null => {
  let v: number | null = null;
  for (const item of data) {
    if (item.date > ref) break;
    v = item.value;
  }
  return v;
};

/**
 * Retorno acumulado da janela [dataInicio, dataFim] sobre uma série de
 * acumulados em %: (1+fim)/(1+inicio)-1. Usa o último ponto <= cada borda
 * (janela que começa entre dois pontos herda o anterior — antes exigia
 * pontos DENTRO da janela e devolvia 0% ou pegava um ponto tardio).
 *
 * Janela que começa NA primeira data da série (ou antes) usa base 0, não o
 * valor do 1º ponto: o TWR do backend carrega no 1º ponto o "ganho
 * instantâneo" do dia da compra (preço pago vs mercado, padrão Kinvo —
 * calculateHistoricoTWR). Rebasear no 1º ponto descartava esse ganho e o
 * card "Do início" divergia do último ponto plotado no gráfico (que exibe a
 * série bruta): card -1,35% vs gráfico -16,44% no cenário auditado.
 */
export const calcularRentabilidade = (
  data: Array<{ date: number; value: number }>,
  dataInicio: number,
  dataFim: number,
): number => {
  if (data.length === 0) return 0;
  const valorInicio = dataInicio <= data[0].date ? 0 : (valorEm(data, dataInicio) ?? 0);
  const valorFim = valorEm(data, dataFim);
  if (valorFim === null) return 0;
  const cumInicio = 1 + valorInicio / 100;
  if (cumInicio <= 0) return 0;
  return ((1 + valorFim / 100) / cumInicio - 1) * 100;
};

/**
 * Retorno do último dia FECHADO: último ponto da série vs o anterior.
 * (A janela [ontem, hoje] quebrou quando dropCurrentDay passou a cortar o dia
 * corrente: a série termina ontem, as duas bordas resolvem pro MESMO ponto e o
 * resultado era sempre 0,00%. Ancorar nos dois últimos pontos também cobre
 * fim de semana/feriado: mostra o retorno do último pregão.)
 */
export const retornoUltimoDia = (data: Array<{ date: number; value: number }>): number => {
  if (data.length < 2) return 0;
  const prev = data[data.length - 2];
  const last = data[data.length - 1];
  const cumPrev = 1 + prev.value / 100;
  if (cumPrev <= 0) return 0;
  return ((1 + last.value / 100) / cumPrev - 1) * 100;
};

/**
 * "% sobre CDI" é uma RAZÃO (carteira rendeu X% do CDI), não um delta — acima
 * de 100% já significa "acima do CDI", então não leva o prefixo "+" do
 * formatPercentage (ex.: 110% do CDI = rendeu 10% a mais que o CDI).
 */
const formatRatio = (value: number): string =>
  Number.isFinite(value) ? `${value.toFixed(2)}%` : '0.00%';

interface RentabilidadeResumoProps {
  /** Início do período selecionado (ms). undefined/igual ao 1º investimento = desde o início. */
  periodStart?: number;
  /** Retorno da carteira NO período selecionado (% acumulado, já recalculado pelo gráfico). */
  periodReturn?: number;
  /** Rótulo do período pra exibição (ex.: "24 meses"). */
  periodLabel?: string;
}

export default function RentabilidadeResumo({
  periodStart,
  periodReturn,
  periodLabel,
}: RentabilidadeResumoProps = {}) {
  const { resumo, formatPercentage } = useCarteiraResumoContext();

  // Calcular data do primeiro investimento
  const firstInvestmentDate = useMemo(() => {
    if (!resumo?.historicoPatrimonio || resumo.historicoPatrimonio.length === 0) {
      return undefined;
    }
    const firstNonZeroItem = resumo.historicoPatrimonio.find(
      (item) => item.saldoBruto > 0 || item.valorAplicado > 0,
    );
    return firstNonZeroItem?.data;
  }, [resumo?.historicoPatrimonio]);

  const hasHistoricoTWR = Array.isArray(resumo?.historicoTWR) && resumo.historicoTWR.length > 0;
  // Série de benchmarks EXPANDIDA desde o 1º investimento — é a única usada:
  // tanto a tabela quanto os cards de resumo precisam do acumulado completo.
  // (Antes os cards usavam useIndices('1y') sem startDate: CDI/IPCA de só 12
  // meses no denominador inflavam "% sobre CDI" e "% Real" p/ carteira >1 ano.)
  const { indices: indicesDesdeInicio } = useIndices('1y', firstInvestmentDate);
  const { data: carteiraHistoricoDiario } = useCarteiraHistorico(firstInvestmentDate, {
    enabled: !hasHistoricoTWR,
  });

  // Série TWR da carteira (mesma fonte do gráfico), sem o dia corrente parcial.
  const carteiraData = useMemo(() => {
    const serie = hasHistoricoTWR
      ? (resumo?.historicoTWR ?? []).map((t) => ({ date: t.data, value: t.value }))
      : (carteiraHistoricoDiario ?? []);
    return dropCurrentDay(serie);
  }, [hasHistoricoTWR, resumo?.historicoTWR, carteiraHistoricoDiario]);

  // Calcular rentabilidades por período (janelas mês-calendário, padrão do app)
  const rentabilidades = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const hojeTimestamp = hoje.getTime();

    // Primeiro dia do mês
    const primeiroDiaMesTimestamp = new Date(hoje.getFullYear(), hoje.getMonth(), 1).getTime();

    // Primeiro dia do ano
    const primeiroDiaAnoTimestamp = new Date(hoje.getFullYear(), 0, 1).getTime();

    // 12 meses: mês-calendário (dia 1º), como periodWindow/rentabilidade-janelas —
    // antes era janela rolante dia-a-dia, divergindo do resto do sistema.
    const dozeMesesAtrasTimestamp = inicioUltimosNMeses(12, hoje).getTime();

    const cdiData = dropCurrentDay(indicesDesdeInicio.find((i) => i.name === 'CDI')?.data ?? []);
    const ibovData = dropCurrentDay(indicesDesdeInicio.find((i) => i.name === 'IBOV')?.data ?? []);

    const janela = (data: Array<{ date: number; value: number }>) => ({
      ultimoDia: retornoUltimoDia(data),
      mes: calcularRentabilidade(data, primeiroDiaMesTimestamp, hojeTimestamp),
      ano: calcularRentabilidade(data, primeiroDiaAnoTimestamp, hojeTimestamp),
      dozeMeses: calcularRentabilidade(data, dozeMesesAtrasTimestamp, hojeTimestamp),
    });

    return {
      carteira: janela(carteiraData),
      cdi: janela(cdiData),
      ibov: janela(ibovData),
    };
  }, [carteiraData, indicesDesdeInicio]);

  // Cards de resumo refletem rentabilidade ACUMULADA no período selecionado
  // (ou desde o início da carteira) — SEMPRE em TWR, a mesma metodologia da
  // tabela ao lado e do gráfico. Antes, "Do início" caía no retorno simples
  // do dashboard (resumo.rentabilidade), então o card mudava de metodologia
  // conforme o seletor e "% sobre CDI" comparava retorno simples com CDI
  // composto. O benchmark usa a série expandida desde o 1º investimento.
  const valoresResumo = useMemo(() => {
    const hojeTs = (() => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    })();
    // Início efetivo: o período selecionado (ou desde o 1º investimento).
    const startTs = periodStart ?? firstInvestmentDate ?? 0;
    // Carteira NO período: o retorno já recalculado pelo gráfico quando há
    // seletor; senão o TWR acumulado desde o início (mesma série da tabela).
    const twrDesdeInicio =
      carteiraData.length > 0 ? calcularRentabilidade(carteiraData, startTs, hojeTs) : undefined;
    const carteiraTotal = periodReturn ?? twrDesdeInicio ?? resumo?.rentabilidade ?? 0;

    // Acumulado de um benchmark (CDI/IPCA/IBOV) no período, sobre a série
    // completa (não a de 1 ano — CDI truncado inflava "% sobre CDI").
    const acumuladoNoPeriodo = (nome: string): number => {
      if (!startTs) return 0;
      const serie = dropCurrentDay(indicesDesdeInicio.find((i) => i.name === nome)?.data ?? []);
      if (serie.length === 0) return 0;
      return calcularRentabilidade(serie, startTs, hojeTs);
    };

    const cdiAcumulado = acumuladoNoPeriodo('CDI');
    const ipcaAcumulado = acumuladoNoPeriodo('IPCA');
    const ibovAcumulado = acumuladoNoPeriodo('IBOV');

    // % SOBRE CDI: razão (carteira rendeu X% do CDI) — mesma definição do Kinvo.
    const sobreCDI = cdiAcumulado > 0 ? (carteiraTotal / cdiAcumulado) * 100 : 0;
    // % REAL: retorno ajustado pela INFLAÇÃO (IPCA), descontando a inflação
    // acumulada do período: (1 + nominal) / (1 + ipca) - 1. (Antes subtraía o
    // CDI — errado: dava -88% num nominal de -12% pq CDI acumulado ~76% em 5a.)
    const real = ((1 + carteiraTotal / 100) / (1 + ipcaAcumulado / 100) - 1) * 100;

    return {
      real,
      total: carteiraTotal,
      sobreCDI,
      cdiPeriodo: cdiAcumulado,
      ibovPeriodo: ibovAcumulado,
    };
  }, [
    resumo?.rentabilidade,
    firstInvestmentDate,
    indicesDesdeInicio,
    carteiraData,
    periodStart,
    periodReturn,
  ]);

  // Dados para o gráfico donut (Carteira, CDI, IBOV baseado na rentabilidade de 12 meses)
  const donutData = useMemo(() => {
    // Usar valores reais (positivos) do PERÍODO selecionado; negativos ficam de fora
    const carteiraValor = Math.max(0, valoresResumo.total || 0);
    const cdiValor = Math.max(0, valoresResumo.cdiPeriodo || 0);
    const ibovValor = Math.max(0, valoresResumo.ibovPeriodo || 0);

    const valores = [
      { nome: 'CARTEIRA', valor: carteiraValor, cor: '#465FFF' },
      { nome: 'CDI', valor: cdiValor, cor: '#10B981' },
      { nome: 'IBOV', valor: ibovValor, cor: '#F59E0B' },
    ];

    // Filtrar apenas valores maiores que zero
    const valoresFiltrados = valores.filter((item) => item.valor > 0);

    // Se não houver nenhum valor válido, retornar dados vazios
    if (valoresFiltrados.length === 0) {
      return {
        labels: [],
        series: [],
        colors: [],
      };
    }

    // Calcular percentuais relativos para o gráfico
    const total = valoresFiltrados.reduce((sum, item) => sum + item.valor, 0);
    if (total === 0) {
      return {
        labels: [],
        series: [],
        colors: [],
      };
    }

    const percentuais = valoresFiltrados.map((item) => ({
      ...item,
      percentual: (item.valor / total) * 100,
    }));

    return {
      labels: percentuais.map((d) => d.nome),
      series: percentuais.map((d) => d.percentual),
      colors: percentuais.map((d) => d.cor),
    };
  }, [valoresResumo]);

  const donutOptions: ApexOptions = useMemo(() => {
    if (donutData.labels.length === 0) {
      return {
        chart: {
          type: 'donut',
          fontFamily: 'Outfit, sans-serif',
        },
        labels: [],
        series: [],
      };
    }

    return {
      chart: {
        type: 'donut',
        fontFamily: 'Outfit, sans-serif',
        width: '100%',
      },
      labels: donutData.labels,
      colors: donutData.colors,
      plotOptions: {
        pie: {
          donut: {
            size: '65%',
            background: 'transparent',
          },
        },
      },
      dataLabels: {
        enabled: false,
      },
      legend: {
        show: true,
        position: 'bottom',
        horizontalAlign: 'center',
      },
      tooltip: {
        y: {
          formatter: (val: number) => `${val.toFixed(2)}%`,
        },
      },
    };
  }, [donutData]);

  if (!resumo) {
    return null;
  }

  return (
    <ComponentCard title="Resumo de Rentabilidade">
      <div className="space-y-6">
        {/* Gráfico Donut */}
        <div className="flex justify-center w-full min-h-[250px]">
          <div id="chartRentabilidadeResumo" className="w-full max-w-md">
            {donutData.series.length > 0 ? (
              <ErrorBoundary
                fallback={
                  <div className="flex h-[250px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                    Erro ao carregar o grafico
                  </div>
                }
              >
                <ReactApexChart
                  options={donutOptions}
                  series={donutData.series}
                  type="donut"
                  height={250}
                />
              </ErrorBoundary>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm">
                Aguardando dados...
              </div>
            )}
          </div>
        </div>

        {/* Valores de Resumo (acompanham o filtro de período) */}
        {periodLabel ? (
          <div className="text-center text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Acumulado · {periodLabel}
          </div>
        ) : null}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-sm text-gray-500 dark:text-gray-400">% REAL</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatPercentage(valoresResumo.real)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-sm text-gray-500 dark:text-gray-400">% TOTAL</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatPercentage(valoresResumo.total)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-sm text-gray-500 dark:text-gray-400">% SOBRE CDI</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatRatio(valoresResumo.sobreCDI)}
            </div>
          </div>
        </div>

        {/* Tabela Comparativa - Períodos nas linhas, Carteira/CDI/IBOV nas colunas */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400"></th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                  CARTEIRA
                </th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                  CDI
                </th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                  IBOV
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-white">
                  Último dia
                </td>
                <td className="py-3 px-4 text-sm text-right text-[#465FFF]">
                  {formatPercentage(rentabilidades.carteira.ultimoDia)}
                </td>
                <td className="py-3 px-4 text-sm text-right text-[#10B981]">
                  {formatPercentage(rentabilidades.cdi.ultimoDia)}
                </td>
                <td className="py-3 px-4 text-sm text-right text-[#F59E0B]">
                  {formatPercentage(rentabilidades.ibov.ultimoDia)}
                </td>
              </tr>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-white">
                  No mês
                </td>
                <td className="py-3 px-4 text-sm text-right text-[#465FFF]">
                  {formatPercentage(rentabilidades.carteira.mes)}
                </td>
                <td className="py-3 px-4 text-sm text-right text-[#10B981]">
                  {formatPercentage(rentabilidades.cdi.mes)}
                </td>
                <td className="py-3 px-4 text-sm text-right text-[#F59E0B]">
                  {formatPercentage(rentabilidades.ibov.mes)}
                </td>
              </tr>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-white">
                  No ano
                </td>
                <td className="py-3 px-4 text-sm text-right text-[#465FFF]">
                  {formatPercentage(rentabilidades.carteira.ano)}
                </td>
                <td className="py-3 px-4 text-sm text-right text-[#10B981]">
                  {formatPercentage(rentabilidades.cdi.ano)}
                </td>
                <td className="py-3 px-4 text-sm text-right text-[#F59E0B]">
                  {formatPercentage(rentabilidades.ibov.ano)}
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-white">
                  12 meses
                </td>
                <td className="py-3 px-4 text-sm text-right text-[#465FFF]">
                  {formatPercentage(rentabilidades.carteira.dozeMeses)}
                </td>
                <td className="py-3 px-4 text-sm text-right text-[#10B981]">
                  {formatPercentage(rentabilidades.cdi.dozeMeses)}
                </td>
                <td className="py-3 px-4 text-sm text-right text-[#F59E0B]">
                  {formatPercentage(rentabilidades.ibov.dozeMeses)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </ComponentCard>
  );
}
