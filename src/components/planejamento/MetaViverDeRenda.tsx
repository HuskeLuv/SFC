'use client';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { ApexOptions } from 'apexcharts';
import ComponentCard from '@/components/common/ComponentCard';
import Input from '@/components/form/input/InputField';
import { Table, TableHeader, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { formatCurrency, formatPercent } from '@/utils/formatters';
import { useCarteira } from '@/hooks/useCarteira';
import { useRiscoRetorno } from '@/hooks/useRiscoRetorno';
import { useProventos } from '@/hooks/useProventos';

const ReactApexChart = dynamic(() => import('react-apexcharts'), {
  ssr: false,
});

export default function MetaViverDeRenda() {
  const { resumo, loading: carteiraLoading } = useCarteira();
  const { data: riscoRetorno, loading: riscoLoading } = useRiscoRetorno();
  const { media: proventosMedia, loading: proventosLoading } = useProventos();

  const dataLoading = carteiraLoading || riscoLoading || proventosLoading;

  // Track whether the user has manually edited each field
  const editedRef = useRef({
    rentabilidade: false,
    inflacao: false,
    quantiaPoupada: false,
    rendaMensal: false,
  });

  const [rentabilidade, setRentabilidade] = useState('');
  const [inflacao, setInflacao] = useState('');
  const [quantiaPoupada, setQuantiaPoupada] = useState('');
  const [rendaMensal, setRendaMensal] = useState('');

  // Auto-populate from portfolio data (only fields the user hasn't touched)
  useEffect(() => {
    if (riscoRetorno?.carteira?.retornoAnual != null && !editedRef.current.rentabilidade) {
      setRentabilidade(riscoRetorno.carteira.retornoAnual.toFixed(2));
    }
  }, [riscoRetorno]);

  useEffect(() => {
    if (resumo?.saldoBruto != null && resumo.saldoBruto > 0 && !editedRef.current.quantiaPoupada) {
      setQuantiaPoupada(resumo.saldoBruto.toFixed(2));
    }
  }, [resumo]);

  useEffect(() => {
    if (proventosMedia > 0 && !editedRef.current.rendaMensal) {
      setRendaMensal(proventosMedia.toFixed(2));
    }
  }, [proventosMedia]);

  const handleChange = (
    field: keyof typeof editedRef.current,
    setter: (v: string) => void,
    value: string,
  ) => {
    editedRef.current[field] = true;
    setter(value);
  };

  const handleUseCarteiraData = () => {
    if (riscoRetorno?.carteira?.retornoAnual != null) {
      setRentabilidade(riscoRetorno.carteira.retornoAnual.toFixed(2));
      editedRef.current.rentabilidade = false;
    }
    if (resumo?.saldoBruto != null) {
      setQuantiaPoupada(resumo.saldoBruto.toFixed(2));
      editedRef.current.quantiaPoupada = false;
    }
    if (proventosMedia > 0) {
      setRendaMensal(proventosMedia.toFixed(2));
      editedRef.current.rendaMensal = false;
    }
  };

  const rentabilidadeReal = useMemo(() => {
    const r = parseFloat(rentabilidade);
    const i = parseFloat(inflacao);
    if (isNaN(r) || isNaN(i)) return null;
    return (1 + r / 100) / (1 + i / 100) - 1;
  }, [rentabilidade, inflacao]);

  const allFieldsFilled = useMemo(() => {
    return (
      rentabilidade !== '' &&
      !isNaN(parseFloat(rentabilidade)) &&
      inflacao !== '' &&
      !isNaN(parseFloat(inflacao)) &&
      quantiaPoupada !== '' &&
      !isNaN(parseFloat(quantiaPoupada)) &&
      rendaMensal !== '' &&
      !isNaN(parseFloat(rendaMensal))
    );
  }, [rentabilidade, inflacao, quantiaPoupada, rendaMensal]);

  const isValid = useMemo(() => {
    return allFieldsFilled && rentabilidadeReal !== null && rentabilidadeReal > 0;
  }, [allFieldsFilled, rentabilidadeReal]);

  const scenarios = useMemo(() => {
    if (!isValid || rentabilidadeReal === null) return [];

    const renda = parseFloat(rendaMensal);
    const poupado = parseFloat(quantiaPoupada);

    const calcCapital = (rendaAlvo: number) => {
      const capitalNeeded = (rendaAlvo * 12) / rentabilidadeReal;
      const falta = capitalNeeded - poupado;
      const progresso = Math.min((poupado / capitalNeeded) * 100, 100);
      return { capitalNeeded, rendaAlvo, falta, progresso };
    };

    return [
      { label: 'Seu plano', ...calcCapital(renda) },
      { label: 'Renda menor', ...calcCapital(renda * 0.75) },
      { label: 'Renda maior', ...calcCapital(renda * 1.25) },
    ];
  }, [isValid, rentabilidadeReal, rendaMensal, quantiaPoupada]);

  const chartOptions: ApexOptions = useMemo(
    () => ({
      colors: ['#465fff'],
      chart: {
        fontFamily: 'Outfit, sans-serif',
        type: 'bar',
        height: 350,
        toolbar: {
          show: false,
        },
      },
      plotOptions: {
        bar: {
          horizontal: false,
          columnWidth: '50%',
          borderRadius: 6,
          borderRadiusApplication: 'end',
        },
      },
      dataLabels: {
        enabled: true,
        formatter: (val: number) => `R$ ${formatCurrency(val)}`,
        style: {
          fontSize: '12px',
          fontFamily: 'Outfit, sans-serif',
          fontWeight: 600,
        },
        offsetY: -20,
      },
      stroke: {
        show: true,
        width: 4,
        colors: ['transparent'],
      },
      xaxis: {
        categories: ['Seu plano', 'Renda menor', 'Renda maior'],
        axisBorder: {
          show: false,
        },
        axisTicks: {
          show: false,
        },
        labels: {
          style: {
            colors: '#64748B',
            fontSize: '13px',
            fontFamily: 'Outfit, sans-serif',
          },
        },
      },
      yaxis: {
        labels: {
          style: {
            colors: '#64748B',
            fontSize: '12px',
          },
          formatter: (val: number) => {
            if (val >= 1_000_000) return `R$ ${(val / 1_000_000).toFixed(1)}M`;
            if (val >= 1_000) return `R$ ${(val / 1_000).toFixed(0)}K`;
            return `R$ ${val.toFixed(0)}`;
          },
        },
      },
      grid: {
        yaxis: {
          lines: {
            show: true,
          },
        },
        borderColor: '#E5E7EB',
      },
      fill: {
        opacity: 1,
      },
      tooltip: {
        y: {
          formatter: (val: number) => `R$ ${formatCurrency(val)}`,
        },
      },
    }),
    [],
  );

  const chartSeries = useMemo(() => {
    if (scenarios.length === 0) return [];
    return [
      {
        name: 'Capital necessário',
        data: scenarios.map((s) => Math.round(s.capitalNeeded * 100) / 100),
      },
    ];
  }, [scenarios]);

  const hasCarteiraData = resumo || riscoRetorno || proventosMedia > 0;

  return (
    <div className="space-y-6">
      {/* Info Block */}
      <ComponentCard
        title="Como usar:"
        desc="Esta página calcula o capital necessário para você viver de renda, de acordo com a quantia que você deseja receber dos seus investimentos mensalmente, com base na quantia poupada até o momento e na rentabilidade ao ano dos seus investimentos."
      >
        <div />
      </ComponentCard>

      {/* Portfolio Summary */}
      {dataLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="mt-2 h-6 w-32 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      ) : hasCarteiraData ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-sm text-gray-500 dark:text-gray-400">Patrimônio atual</p>
            <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
              {resumo ? `R$ ${formatCurrency(resumo.saldoBruto)}` : '—'}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-sm text-gray-500 dark:text-gray-400">Rentabilidade anual</p>
            <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
              {riscoRetorno?.carteira?.retornoAnual != null
                ? formatPercent(riscoRetorno.carteira.retornoAnual)
                : '—'}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-sm text-gray-500 dark:text-gray-400">Proventos médios/mês</p>
            <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
              {proventosMedia > 0 ? `R$ ${formatCurrency(proventosMedia)}` : '—'}
            </p>
          </div>
        </div>
      ) : null}

      {/* Calculations Section */}
      <ComponentCard title="Cálculos">
        <div className="space-y-4">
          {hasCarteiraData && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleUseCarteiraData}
                className="rounded-lg border border-brand-500 px-3 py-1.5 text-sm font-medium text-brand-500 transition-colors hover:bg-brand-50 dark:border-brand-400 dark:text-brand-400 dark:hover:bg-brand-500/10"
              >
                Usar dados da carteira
              </button>
            </div>
          )}

          {/* Row 1: 2 columns on lg */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label
                htmlFor="rentabilidade"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
              >
                Rentabilidade últimos 12 meses (%)
              </label>
              <div className="relative">
                <Input
                  id="rentabilidade"
                  type="number"
                  step={0.01}
                  placeholder="Ex: 12.50"
                  value={rentabilidade}
                  onChange={(e) => handleChange('rentabilidade', setRentabilidade, e.target.value)}
                  inputMode="decimal"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
                  %
                </span>
              </div>
            </div>
            <div>
              <label
                htmlFor="inflacao"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
              >
                Expectativa de inflação (%)
              </label>
              <div className="relative">
                <Input
                  id="inflacao"
                  type="number"
                  step={0.01}
                  placeholder="Ex: 4.50"
                  value={inflacao}
                  onChange={(e) => handleChange('inflacao', setInflacao, e.target.value)}
                  inputMode="decimal"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
                  %
                </span>
              </div>
            </div>
          </div>

          {/* Row 2: 3 columns on lg */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div>
              <label
                htmlFor="quantiaPoupada"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
              >
                Quantia poupada até o momento
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
                  R$
                </span>
                <Input
                  id="quantiaPoupada"
                  type="number"
                  step={0.01}
                  placeholder="Ex: 100000.00"
                  value={quantiaPoupada}
                  onChange={(e) =>
                    handleChange('quantiaPoupada', setQuantiaPoupada, e.target.value)
                  }
                  inputMode="decimal"
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Rentabilidade real dos seus investimentos ao ano
              </label>
              <Input
                type="text"
                value={rentabilidadeReal !== null ? formatPercent(rentabilidadeReal * 100) : ''}
                disabled
                className="bg-gray-50 dark:bg-gray-800"
                placeholder="Calculado automaticamente"
              />
            </div>
            <div>
              <label
                htmlFor="rendaMensal"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
              >
                Capital que você deseja receber ao mês para viver de renda
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
                  R$
                </span>
                <Input
                  id="rendaMensal"
                  type="number"
                  step={0.01}
                  placeholder="Ex: 5000.00"
                  value={rendaMensal}
                  onChange={(e) => handleChange('rendaMensal', setRendaMensal, e.target.value)}
                  inputMode="decimal"
                  className="pl-10"
                />
              </div>
            </div>
          </div>
        </div>
      </ComponentCard>

      {/* Results Section */}
      <ComponentCard title="Resultados">
        {!isValid ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {allFieldsFilled && rentabilidadeReal !== null && rentabilidadeReal <= 0
                ? 'A rentabilidade informada é menor ou igual à inflação, resultando em uma rentabilidade real negativa. Para calcular o capital necessário, a rentabilidade deve superar a inflação.'
                : 'Preencha todos os campos para visualizar os resultados.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >
                    Descrição
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >
                    Capital necessário
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >
                    Renda mensal
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >
                    Quanto falta
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >
                    Progresso
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scenarios.map((scenario) => (
                  <TableRow
                    key={scenario.label}
                    className="border-t border-gray-100 dark:border-gray-800"
                  >
                    <TableCell className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-white/90">
                      {scenario.label}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right text-sm text-gray-700 dark:text-gray-300">
                      R$ {formatCurrency(scenario.capitalNeeded)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right text-sm text-gray-700 dark:text-gray-300">
                      R$ {formatCurrency(scenario.rendaAlvo)}
                    </TableCell>
                    <TableCell
                      className={`px-4 py-3 text-right text-sm font-medium ${
                        scenario.falta <= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {scenario.falta <= 0
                        ? 'Meta atingida!'
                        : `R$ ${formatCurrency(scenario.falta)}`}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-2 w-20 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                          <div
                            className={`h-full rounded-full transition-all ${
                              scenario.progresso >= 100
                                ? 'bg-green-500'
                                : scenario.progresso >= 50
                                  ? 'bg-brand-500'
                                  : 'bg-amber-500'
                            }`}
                            style={{ width: `${scenario.progresso}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                          {scenario.progresso.toFixed(1)}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </ComponentCard>

      {/* Chart Section */}
      <ComponentCard title="Capital necessário por cenário">
        {scenarios.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
            Preencha os campos acima para visualizar o gráfico.
          </div>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <div className="min-w-[400px]">
              <ReactApexChart options={chartOptions} series={chartSeries} type="bar" height={350} />
            </div>
          </div>
        )}
      </ComponentCard>
    </div>
  );
}
