"use client";

import React, { useMemo } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import Button from "@/components/ui/button/Button";
import DatePicker from "@/components/form/date-picker";
import { useReportPeriod, REPORT_PERIOD_OPTIONS, ReportPeriodValue } from "@/hooks/useReportPeriod";
import { useIndices } from "@/hooks/useIndices";
import { useCarteiraHistorico } from "@/hooks/useCarteiraHistorico";
import { useCarteira } from "@/hooks/useCarteira";
import { useProventos } from "@/hooks/useProventos";
import { useCashflowData, useProcessedData } from "@/hooks/useCashflow";
import { useInstituicaoDistribuicao } from "@/hooks/useInstituicaoDistribuicao";
import RentabilidadeChart from "@/components/analises/RentabilidadeChart";
import ProventosHistoricoChart from "@/components/analises/ProventosHistoricoChart";
import ProventosDistribuicaoChart from "@/components/analises/ProventosDistribuicaoChart";
import PieChartCarteiraInvestimentos from "@/components/charts/pie/PieChartCarteiraInvestimentos";
import LineChartCarteiraHistorico from "@/components/charts/line/LineChartCarteiraHistorico";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import {
  DollarLineIcon,
  PieChartIcon,
  GridIcon,
  TableIcon,
  DocsIcon,
} from "@/icons";

type ReportId =
  | "rentabilidade"
  | "proventos"
  | "distribuicao"
  | "evolucao"
  | "fluxo"
  | "comparativo";

type ReportCard = {
  id: ReportId;
  title: string;
  description: string;
  icon: React.ReactNode;
};

const REPORT_CARDS: ReportCard[] = [
  {
    id: "rentabilidade",
    title: "Rentabilidade da Carteira",
    description: "Evolução do retorno acumulado da carteira no período.",
    icon: <DollarLineIcon />,
  },
  {
    id: "proventos",
    title: "Proventos Recebidos",
    description: "Histórico e distribuição de proventos recebidos.",
    icon: <DocsIcon />,
  },
  {
    id: "distribuicao",
    title: "Distribuição de Ativos",
    description: "Composição atual da carteira por classe de ativos.",
    icon: <PieChartIcon />,
  },
  {
    id: "evolucao",
    title: "Evolução Patrimonial",
    description: "Histórico de patrimônio consolidado no período.",
    icon: <GridIcon />,
  },
  {
    id: "fluxo",
    title: "Fluxo de Caixa Consolidado",
    description: "Totais consolidados de entradas e saídas no período.",
    icon: <TableIcon />,
  },
  {
    id: "comparativo",
    title: "Comparativo com Índices",
    description: "Comparação da carteira com CDI, IBOV e IPCA.",
    icon: <DollarLineIcon />,
  },
];

const formatDateLabel = (date: Date | null) =>
  date ? date.toLocaleDateString("pt-BR") : "--";

export default function RelatoriosPage() {
  const {
    selected,
    setSelected,
    startDate,
    endDate,
    startDateISO,
    endDateISO,
    label,
    customStart,
    customEnd,
    setCustomStart,
    setCustomEnd,
  } = useReportPeriod();
  const startTimestamp = startDate ? startDate.getTime() : undefined;
  const endTimestamp = endDate ? endDate.getTime() : undefined;

  const { resumo, loading: carteiraLoading } = useCarteira();
  const { data: carteiraHistorico, loading: loadingCarteiraHistorico } =
    useCarteiraHistorico(startTimestamp);
  const { indices: indices1d, loading: loadingIndices } = useIndices("1d", startTimestamp);
  const { indices: indices1mo } = useIndices("1mo", startTimestamp);
  const { indices: indices1y } = useIndices("1y", startTimestamp);
  const { proventos, grouped, loading: loadingProventos } = useProventos(
    startDateISO,
    endDateISO,
    "ativo"
  );
  const { data: cashflowData, loading: loadingCashflow } = useCashflowData();
  const cashflowProcessed = useProcessedData(cashflowData);
  const {
    grouped: instituicaoGrouped,
    loading: loadingInstituicaoDistribuicao,
  } = useInstituicaoDistribuicao();

  const filterByRange = <T extends { date: number }>(data: T[]) => {
    if (!endTimestamp) return data;
    return data.filter((item) => item.date <= endTimestamp);
  };

  const filteredCarteiraHistorico = useMemo(
    () => filterByRange(carteiraHistorico),
    [carteiraHistorico, endTimestamp]
  );

  const filteredIndices1d = useMemo(
    () =>
      indices1d.map((index) => ({
        ...index,
        data: filterByRange(index.data),
      })),
    [indices1d, endTimestamp]
  );

  const filteredIndices1mo = useMemo(
    () =>
      indices1mo.map((index) => ({
        ...index,
        data: filterByRange(index.data),
      })),
    [indices1mo, endTimestamp]
  );

  const filteredIndices1y = useMemo(
    () =>
      indices1y.map((index) => ({
        ...index,
        data: filterByRange(index.data),
      })),
    [indices1y, endTimestamp]
  );

  const filteredPatrimonio = useMemo(() => {
    if (!resumo?.historicoPatrimonio) return [];
    const historico = resumo.historicoPatrimonio;
    const filtered = historico.filter((item) => {
      if (startTimestamp && item.data < startTimestamp) return false;
      if (endTimestamp && item.data > endTimestamp) return false;
      return true;
    });

    if (!startTimestamp) {
      return filtered;
    }

    const lastBeforeStart = historico
      .filter((item) => item.data < startTimestamp)
      .sort((a, b) => b.data - a.data)[0];

    if (!lastBeforeStart) {
      return filtered;
    }

    if (filtered.some((item) => item.data === lastBeforeStart.data)) {
      return filtered;
    }

    return [lastBeforeStart, ...filtered];
  }, [resumo?.historicoPatrimonio, startTimestamp, endTimestamp]);

  const cashflowTotals = useMemo(() => {
    if (!startDate || !endDate) {
      return {
        entradas: cashflowProcessed.entradasTotal,
        despesas: cashflowProcessed.despesasTotal,
        total: cashflowProcessed.totalAnnual,
      };
    }

    const startMonth = startDate.getMonth();
    const endMonth = endDate.getMonth();
    const entradas = cashflowProcessed.entradasByMonth
      .slice(startMonth, endMonth + 1)
      .reduce((sum, value) => sum + value, 0);
    const despesas = cashflowProcessed.despesasByMonth
      .slice(startMonth, endMonth + 1)
      .reduce((sum, value) => sum + value, 0);

    return {
      entradas,
      despesas,
      total: entradas - despesas,
    };
  }, [cashflowProcessed, startDate, endDate]);

  const cashflowCategoryRows = useMemo(() => {
    const groups = cashflowProcessed.groups || [];
    if (groups.length === 0) {
      return [];
    }

    const startMonth = startDate?.getMonth();
    const endMonth = endDate?.getMonth();
    const hasValidRange =
      startMonth !== undefined &&
      endMonth !== undefined &&
      (!startDate || !endDate || startDate.getFullYear() === endDate.getFullYear());

    const getTotal = (groupId: string) => {
      const monthlyTotals = cashflowProcessed.groupTotals[groupId] || [];
      if (hasValidRange && startMonth !== undefined && endMonth !== undefined) {
        return monthlyTotals.slice(startMonth, endMonth + 1).reduce((sum, value) => sum + value, 0);
      }
      return cashflowProcessed.groupAnnualTotals[groupId] || 0;
    };

    const ignoredGroupNames = new Set([
      "despesas",
      "despesas fixas",
      "despesas variaveis",
      "despesas variáveis",
      "entradas",
      "entradas fixas",
      "entradas variaveis",
      "entradas variáveis",
    ]);

    const buildRows = (
      groupList: typeof groups,
      depth = 0
    ): Array<{ id: string; name: string; total: number; depth: number }> => {
      return groupList.flatMap((group) => {
        const normalizedName = group.name.toLowerCase();
        const isIgnored = ignoredGroupNames.has(normalizedName);
        const children = group.children || [];
        const childDepth = isIgnored ? depth : depth + 1;
        const childRows = children.length > 0 ? buildRows(children, childDepth) : [];
        const total = getTotal(group.id);
        const hasData = total !== 0 || childRows.length > 0;

        if (!hasData) {
          return [];
        }

        if (isIgnored) {
          return childRows;
        }

        return [
          {
            id: group.id,
            name: group.name,
            total,
            depth,
          },
          ...childRows,
        ];
      });
    };

    return buildRows(groups);
  }, [cashflowProcessed, startDate, endDate]);

  const formatCurrencyValue = (value: number) =>
    value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const isLoading =
    carteiraLoading ||
    loadingCarteiraHistorico ||
    loadingIndices ||
    loadingProventos ||
    loadingCashflow ||
    loadingInstituicaoDistribuicao;

  const handleExportPdf = () => {
    window.print();
  };

  const periodLabel = `${label} • ${formatDateLabel(startDate)} - ${formatDateLabel(endDate)}`;

  return (
    <div className="space-y-6" id="relatorios-print">
      <style jsx global>{`
        @media print {
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          #relatorios-print .print-hidden {
            display: none !important;
          }
          #relatorios-print .avoid-break {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Relatórios</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Visualize relatórios detalhados da carteira conforme o período selecionado.
          </p>
        </div>
        <div className="w-full max-w-[260px] print-hidden">
          <label htmlFor="report-period" className="sr-only">
            Filtro de período
          </label>
          <select
            id="report-period"
            aria-label="Filtro de período"
            value={selected}
            onChange={(event) => setSelected(event.target.value as ReportPeriodValue)}
            className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 pr-10 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            {REPORT_PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selected === "custom" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <DatePicker
            id="report-start-date"
            label="Data inicial"
            mode="single"
            defaultDate={customStart ?? undefined}
            onChange={(dates) => {
              const date = dates?.[0];
              if (date instanceof Date) {
                setCustomStart(date);
              }
            }}
          />
          <DatePicker
            id="report-end-date"
            label="Data final"
            mode="single"
            defaultDate={customEnd ?? undefined}
            onChange={(dates) => {
              const date = dates?.[0];
              if (date instanceof Date) {
                setCustomEnd(date);
              }
            }}
          />
        </div>
      )}

      {isLoading ? (
        <LoadingSpinner text="Carregando relatórios..." />
      ) : (
        <>
          <div className="space-y-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Rentabilidade da Carteira
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{periodLabel}</p>
              </div>
              <Button size="sm" variant="primary" onClick={handleExportPdf} className="print-hidden">
                Exportar PDF
              </Button>
            </div>
            <div className="space-y-6">
              <ComponentCard title="Rentabilidade Por Dia" className="avoid-break">
                <RentabilidadeChart
                  carteiraData={filteredCarteiraHistorico}
                  indicesData={filteredIndices1d}
                  period="1d"
                />
              </ComponentCard>
              <ComponentCard title="Rentabilidade Por Mês" className="avoid-break">
                <RentabilidadeChart
                  carteiraData={filteredCarteiraHistorico}
                  indicesData={filteredIndices1mo}
                  period="1mo"
                />
              </ComponentCard>
              <ComponentCard title="Rentabilidade Por Ano" className="avoid-break">
                <RentabilidadeChart
                  carteiraData={filteredCarteiraHistorico}
                  indicesData={filteredIndices1y}
                  period="1y"
                />
              </ComponentCard>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Proventos Recebidos
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{periodLabel}</p>
              </div>
            </div>
            <div className="space-y-6">
              <ComponentCard title="Histórico de Proventos" className="avoid-break">
                {proventos.length > 0 ? (
                  <ProventosHistoricoChart proventos={proventos} />
                ) : (
                  <div className="flex h-64 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                    Sem dados para o período selecionado.
                  </div>
                )}
              </ComponentCard>
              <ComponentCard title="Distribuição de Proventos" className="avoid-break">
                {Object.keys(grouped).length > 0 ? (
                  <ProventosDistribuicaoChart grouped={grouped} viewMode="total" />
                ) : (
                  <div className="flex h-64 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                    Sem dados para o período selecionado.
                  </div>
                )}
              </ComponentCard>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Distribuição de Ativos
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{periodLabel}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ComponentCard title="Distribuição Atual de Ativos" className="avoid-break">
                {resumo?.distribuicao && Object.values(resumo.distribuicao).length > 0 ? (
                  <PieChartCarteiraInvestimentos distribuicao={resumo.distribuicao} />
                ) : (
                  <div className="flex h-64 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                    Sem dados para exibir.
                  </div>
                )}
              </ComponentCard>
              <ComponentCard title="Divisão por Instituição Financeira" className="avoid-break">
                {Object.keys(instituicaoGrouped).length > 0 ? (
                  <ProventosDistribuicaoChart grouped={instituicaoGrouped} viewMode="total" />
                ) : (
                  <div className="flex h-64 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                    Sem dados para exibir.
                  </div>
                )}
              </ComponentCard>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Evolução Patrimonial
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{periodLabel}</p>
              </div>
            </div>
            <ComponentCard title="Evolução Patrimonial" className="avoid-break">
              {filteredPatrimonio.length > 0 ? (
                <LineChartCarteiraHistorico data={filteredPatrimonio} />
              ) : (
                <div className="flex h-64 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                  Sem dados para o período selecionado.
                </div>
              )}
            </ComponentCard>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Fluxo de Caixa Consolidado
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{periodLabel}</p>
              </div>
            </div>
            <ComponentCard title="Fluxo de Caixa Consolidado" className="avoid-break">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Entradas</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    R$ {formatCurrencyValue(cashflowTotals.entradas)}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Saídas</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    R$ {formatCurrencyValue(cashflowTotals.despesas)}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Saldo</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    R$ {formatCurrencyValue(cashflowTotals.total)}
                  </p>
                </div>
              </div>
              <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
                <Table className="w-full">
                  <TableHeader className="bg-gray-50 dark:bg-gray-900">
                    <TableRow>
                      <TableCell
                        isHeader
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                      >
                        Categoria
                      </TableCell>
                      <TableCell
                        isHeader
                        className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                      >
                        Orçamento
                      </TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cashflowCategoryRows.length > 0 ? (
                      cashflowCategoryRows.map((row) => (
                        <TableRow key={row.id} className="border-t border-gray-200 dark:border-gray-800">
                          <TableCell className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                            <span
                              className="inline-flex items-center"
                              style={{ paddingLeft: `${row.depth * 16}px` }}
                            >
                              {row.depth > 0 && <span className="mr-2 h-2 w-2 rounded-full bg-gray-300" />}
                              {row.name}
                            </span>
                          </TableCell>
                          <TableCell className="px-4 py-3 text-right text-sm font-medium text-gray-900 dark:text-white">
                            R$ {formatCurrencyValue(row.total)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow className="border-t border-gray-200 dark:border-gray-800">
                        <TableCell
                          colSpan={2}
                          className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400"
                        >
                          Sem dados para o período selecionado.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </ComponentCard>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Comparativo com Índices
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{periodLabel}</p>
              </div>
            </div>
            <ComponentCard title="Comparativo com Índices" className="avoid-break">
              <RentabilidadeChart carteiraData={[]} indicesData={filteredIndices1d} period="1d" />
            </ComponentCard>
          </div>
        </>
      )}
    </div>
  );
}
