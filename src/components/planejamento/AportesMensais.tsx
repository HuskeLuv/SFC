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
import { simulateAportes } from '@/services/planejamento/aportesMensaisCalculator';

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

const formatBR = (v: number) => `R$ ${formatCurrency(v)}`;
const compactBR = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}K`;
  return `R$ ${v.toFixed(0)}`;
};

export default function AportesMensais() {
  const { resumo, loading: carteiraLoading } = useCarteira();
  const { data: riscoRetorno, loading: riscoLoading } = useRiscoRetorno();
  const dataLoading = carteiraLoading || riscoLoading;

  const editedRef = useRef({
    patrimonioInicial: false,
    retornoNominalAnual: false,
  });

  const [patrimonioInicial, setPatrimonioInicial] = useState('');
  const [metaPatrimonio, setMetaPatrimonio] = useState('1000000');
  const [prazoAnos, setPrazoAnos] = useState('20');
  const [retornoNominalAnual, setRetornoNominalAnual] = useState('');
  const [inflacaoAnual, setInflacaoAnual] = useState('4.5');

  useEffect(() => {
    if (
      resumo?.saldoBruto != null &&
      resumo.saldoBruto > 0 &&
      !editedRef.current.patrimonioInicial
    ) {
      setPatrimonioInicial(resumo.saldoBruto.toFixed(2));
    }
  }, [resumo]);

  useEffect(() => {
    if (riscoRetorno?.carteira?.retornoAnual != null && !editedRef.current.retornoNominalAnual) {
      setRetornoNominalAnual(riscoRetorno.carteira.retornoAnual.toFixed(2));
    }
  }, [riscoRetorno]);

  const handleUseCarteiraData = () => {
    if (resumo?.saldoBruto != null) {
      setPatrimonioInicial(resumo.saldoBruto.toFixed(2));
      editedRef.current.patrimonioInicial = false;
    }
    if (riscoRetorno?.carteira?.retornoAnual != null) {
      setRetornoNominalAnual(riscoRetorno.carteira.retornoAnual.toFixed(2));
      editedRef.current.retornoNominalAnual = false;
    }
  };

  const numericInputs = useMemo(() => {
    const parse = (v: string) => parseFloat(v);
    return {
      patrimonioInicial: parse(patrimonioInicial || '0'),
      metaPatrimonio: parse(metaPatrimonio || '0'),
      prazoAnos: parse(prazoAnos || '0'),
      retornoNominalAnual: parse(retornoNominalAnual || '0'),
      inflacaoAnual: parse(inflacaoAnual || '0'),
    };
  }, [patrimonioInicial, metaPatrimonio, prazoAnos, retornoNominalAnual, inflacaoAnual]);

  const allValid = useMemo(() => {
    const n = numericInputs;
    return (
      Number.isFinite(n.patrimonioInicial) &&
      Number.isFinite(n.metaPatrimonio) &&
      Number.isFinite(n.prazoAnos) &&
      Number.isFinite(n.retornoNominalAnual) &&
      Number.isFinite(n.inflacaoAnual) &&
      retornoNominalAnual !== '' &&
      metaPatrimonio !== ''
    );
  }, [numericInputs, retornoNominalAnual, metaPatrimonio]);

  const resultado = useMemo(() => {
    if (!allValid) return null;
    return simulateAportes(numericInputs);
  }, [allValid, numericInputs]);

  const cenarioBase = resultado?.cenarios.find((c) => c.label === 'Base') ?? null;

  const capitalAdicional = useMemo(() => {
    if (!resultado || !cenarioBase) return null;
    const fvSemAporte =
      numericInputs.patrimonioInicial *
      Math.pow(1 + cenarioBase.retornoReal, numericInputs.prazoAnos);
    return Math.max(0, numericInputs.metaPatrimonio - fvSemAporte);
  }, [resultado, cenarioBase, numericInputs]);

  const chartOptions: ApexOptions = useMemo(() => {
    if (!resultado || resultado.projecaoBase.length === 0) return {};
    return {
      colors: ['#465fff'],
      chart: {
        fontFamily: 'Outfit, sans-serif',
        type: 'area',
        height: 350,
        toolbar: { show: false },
        zoom: { enabled: false },
      },
      stroke: { curve: 'smooth', width: 2 },
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.45,
          opacityTo: 0.05,
          stops: [0, 90, 100],
        },
      },
      dataLabels: { enabled: false },
      xaxis: {
        categories: resultado.projecaoBase.map((a) => a.idadeOuPrazo),
        title: { text: 'Anos a partir de hoje', style: { color: '#64748B', fontSize: '12px' } },
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: {
          style: { colors: '#64748B', fontSize: '12px' },
          formatter: (val: string) => `${val}`,
        },
      },
      yaxis: {
        labels: {
          style: { colors: '#64748B', fontSize: '12px' },
          formatter: compactBR,
        },
      },
      grid: { borderColor: '#E5E7EB', yaxis: { lines: { show: true } } },
      tooltip: {
        y: { formatter: (val: number) => formatBR(val) },
        x: { formatter: (val: number) => `Ano ${val}` },
      },
      annotations: {
        yaxis: [
          {
            y: numericInputs.metaPatrimonio,
            borderColor: '#10b981',
            strokeDashArray: 4,
            label: {
              borderColor: '#10b981',
              style: { color: '#fff', background: '#10b981' },
              text: `Meta ${compactBR(numericInputs.metaPatrimonio)}`,
            },
          },
        ],
      },
    };
  }, [resultado, numericInputs.metaPatrimonio]);

  const chartSeries = useMemo(() => {
    if (!resultado || resultado.projecaoBase.length === 0) return [];
    return [
      {
        name: 'Patrimônio (em valor de hoje)',
        data: resultado.projecaoBase.map((a) => Math.round(a.patrimonioFim * 100) / 100),
      },
    ];
  }, [resultado]);

  const hasCarteiraData = !!resumo || !!riscoRetorno;

  return (
    <div className="space-y-6">
      <ComponentCard
        title="Como usar:"
        desc="Esta aba calcula quanto você precisa aportar por mês para atingir uma meta de patrimônio em N anos. O cálculo é feito em valores de hoje (poder de compra atual): retorno e inflação são combinados via fórmula de Fisher para obter a taxa real, e a fórmula PMT de uma série de pagamentos ao final do mês determina o aporte. São apresentados três cenários — Pessimista (-2pp), Base (informado) e Otimista (+2pp)."
      >
        <div />
      </ComponentCard>

      {/* Carteira summary */}
      {dataLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[1, 2].map((i) => (
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-sm text-gray-500 dark:text-gray-400">Patrimônio atual</p>
            <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
              {resumo ? formatBR(resumo.saldoBruto) : '—'}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Rentabilidade anual da carteira
            </p>
            <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
              {riscoRetorno?.carteira?.retornoAnual != null
                ? formatPercent(riscoRetorno.carteira.retornoAnual)
                : '—'}
            </p>
          </div>
        </div>
      ) : null}

      {/* Inputs */}
      <ComponentCard title="Suas informações">
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

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label
                htmlFor="patrimonioInicial"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
              >
                Patrimônio inicial
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
                  R$
                </span>
                <Input
                  id="patrimonioInicial"
                  type="number"
                  step={0.01}
                  value={patrimonioInicial}
                  onChange={(e) => {
                    editedRef.current.patrimonioInicial = true;
                    setPatrimonioInicial(e.target.value);
                  }}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <label
                htmlFor="metaPatrimonio"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
              >
                Meta de patrimônio
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
                  R$
                </span>
                <Input
                  id="metaPatrimonio"
                  type="number"
                  step={0.01}
                  placeholder="Ex: 1000000.00"
                  value={metaPatrimonio}
                  onChange={(e) => setMetaPatrimonio(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div>
              <label
                htmlFor="prazoAnos"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
              >
                Prazo (anos)
              </label>
              <Input
                id="prazoAnos"
                type="number"
                min="1"
                max="80"
                value={prazoAnos}
                onChange={(e) => setPrazoAnos(e.target.value)}
              />
            </div>
            <div>
              <label
                htmlFor="retornoNominalAnual"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
              >
                Rentabilidade anual esperada (%)
              </label>
              <div className="relative">
                <Input
                  id="retornoNominalAnual"
                  type="number"
                  step={0.01}
                  placeholder="Ex: 12.00"
                  value={retornoNominalAnual}
                  onChange={(e) => {
                    editedRef.current.retornoNominalAnual = true;
                    setRetornoNominalAnual(e.target.value);
                  }}
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
                  %
                </span>
              </div>
            </div>
            <div>
              <label
                htmlFor="inflacaoAnual"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
              >
                Inflação esperada (%)
              </label>
              <div className="relative">
                <Input
                  id="inflacaoAnual"
                  type="number"
                  step={0.01}
                  value={inflacaoAnual}
                  onChange={(e) => setInflacaoAnual(e.target.value)}
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
                  %
                </span>
              </div>
            </div>
          </div>
        </div>
      </ComponentCard>

      {/* Validation warnings */}
      {resultado && resultado.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
          <ul className="list-inside list-disc text-sm text-amber-700 dark:text-amber-400">
            {resultado.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* KPIs */}
      {resultado && resultado.warnings.length === 0 && cenarioBase && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5 dark:border-brand-500/40 dark:bg-brand-500/10">
            <p className="text-sm text-brand-600 dark:text-brand-300">Aporte mensal necessário</p>
            <p className="mt-1 text-2xl font-semibold text-brand-700 dark:text-brand-200">
              {cenarioBase.metaJaAtingida
                ? 'Meta já atingida!'
                : formatBR(cenarioBase.aporteMensal)}
            </p>
            <p className="mt-1 text-xs text-brand-500 dark:text-brand-300">cenário base</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-sm text-gray-500 dark:text-gray-400">Anos até a meta</p>
            <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
              {numericInputs.prazoAnos} anos
            </p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-sm text-gray-500 dark:text-gray-400">Capital adicional necessário</p>
            <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
              {capitalAdicional != null ? formatBR(capitalAdicional) : '—'}
            </p>
            <p className="mt-1 text-xs text-gray-400">acima do que o PV rende sozinho</p>
          </div>
        </div>
      )}

      {/* Cenários */}
      <ComponentCard title="Cenários de retorno">
        {!resultado || resultado.warnings.length > 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
            Preencha os campos acima para ver os cenários.
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
                    Cenário
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >
                    Retorno usado (%)
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >
                    Retorno real (%)
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >
                    Aporte mensal
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resultado.cenarios.map((c) => (
                  <TableRow key={c.label} className="border-t border-gray-100 dark:border-gray-800">
                    <TableCell className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-white/90">
                      {c.label}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right text-sm text-gray-700 dark:text-gray-300">
                      {formatPercent(c.retornoNominal)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right text-sm text-gray-700 dark:text-gray-300">
                      {formatPercent(c.retornoReal * 100)}
                    </TableCell>
                    <TableCell
                      className={`px-4 py-3 text-right text-sm font-medium ${
                        c.metaJaAtingida
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-gray-800 dark:text-white/90'
                      }`}
                    >
                      {c.metaJaAtingida ? 'Meta já atingida' : formatBR(c.aporteMensal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </ComponentCard>

      {/* Chart */}
      <ComponentCard title="Evolução do patrimônio (cenário base)">
        {!resultado || resultado.projecaoBase.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
            Preencha os campos acima para visualizar a projeção.
          </div>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <div className="min-w-[500px]">
              <ReactApexChart
                options={chartOptions}
                series={chartSeries}
                type="area"
                height={350}
              />
            </div>
          </div>
        )}
      </ComponentCard>

      {/* Year-by-year table */}
      <ComponentCard title="Projeção ano a ano (cenário base)">
        {!resultado || resultado.projecaoBase.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
            Sem dados para exibir.
          </div>
        ) : (
          <div className="max-h-[480px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="sticky top-0 bg-white dark:bg-gray-900">
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >
                    Ano
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >
                    Anos a partir de hoje
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >
                    Saldo início
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >
                    Aportes
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >
                    Juros
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >
                    Saldo fim
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resultado.projecaoBase.map((row) => (
                  <TableRow
                    key={row.idadeOuPrazo}
                    className="border-t border-gray-100 dark:border-gray-800"
                  >
                    <TableCell className="px-4 py-2.5 text-sm font-medium text-gray-800 dark:text-white/90">
                      {row.ano}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-sm">
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                        Ano {row.idadeOuPrazo}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-right text-sm text-gray-700 dark:text-gray-300">
                      {formatBR(row.patrimonioInicio)}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-right text-sm text-gray-700 dark:text-gray-300">
                      {row.aportesAno > 0 ? formatBR(row.aportesAno) : '—'}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-right text-sm text-gray-700 dark:text-gray-300">
                      {formatBR(row.juros)}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-right text-sm font-medium text-gray-800 dark:text-white/90">
                      {formatBR(row.patrimonioFim)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </ComponentCard>
    </div>
  );
}
