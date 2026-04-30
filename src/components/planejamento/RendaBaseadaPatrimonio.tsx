'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { ApexOptions } from 'apexcharts';
import ComponentCard from '@/components/common/ComponentCard';
import Input from '@/components/form/input/InputField';
import { Table, TableHeader, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { formatCurrency, formatPercent } from '@/utils/formatters';
import { useCarteira } from '@/hooks/useCarteira';
import { useRiscoRetorno } from '@/hooks/useRiscoRetorno';
import {
  calcularRendaPatrimonio,
  type EstrategiaRenda,
} from '@/services/planejamento/rendaPatrimonioCalculator';

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

const formatBR = (v: number) => `R$ ${formatCurrency(v)}`;
const compactBR = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}K`;
  return `R$ ${v.toFixed(0)}`;
};

const ESTRATEGIA_COLORS: Record<EstrategiaRenda, string> = {
  perpetua: '#465fff',
  programado: '#10b981',
  'regra-4-pct': '#f59e0b',
};

const formatDuracao = (duracao: 'perpetua' | { anos: number }): string =>
  duracao === 'perpetua' ? 'Perpétua' : `${duracao.anos} anos`;

export default function RendaBaseadaPatrimonio() {
  const { resumo, loading: carteiraLoading } = useCarteira();
  const { data: riscoRetorno, loading: riscoLoading } = useRiscoRetorno();
  const dataLoading = carteiraLoading || riscoLoading;

  const editedRef = useRef({
    patrimonio: false,
    retornoNominal: false,
  });

  const [patrimonio, setPatrimonio] = useState('');
  const [retornoNominal, setRetornoNominal] = useState('10');
  const [inflacao, setInflacao] = useState('4.5');
  const [horizonte, setHorizonte] = useState('30');
  const [taxaSaque, setTaxaSaque] = useState('4');
  const [estrategiaSelecionada, setEstrategiaSelecionada] = useState<EstrategiaRenda>('programado');

  useEffect(() => {
    if (resumo?.saldoBruto != null && resumo.saldoBruto > 0 && !editedRef.current.patrimonio) {
      setPatrimonio(resumo.saldoBruto.toFixed(2));
    }
  }, [resumo]);

  useEffect(() => {
    if (riscoRetorno?.carteira?.retornoAnual != null && !editedRef.current.retornoNominal) {
      setRetornoNominal(riscoRetorno.carteira.retornoAnual.toFixed(2));
    }
  }, [riscoRetorno]);

  const handleUseCarteiraData = () => {
    if (resumo?.saldoBruto != null) {
      setPatrimonio(resumo.saldoBruto.toFixed(2));
      editedRef.current.patrimonio = false;
    }
    if (riscoRetorno?.carteira?.retornoAnual != null) {
      setRetornoNominal(riscoRetorno.carteira.retornoAnual.toFixed(2));
      editedRef.current.retornoNominal = false;
    }
  };

  const numericInputs = useMemo(() => {
    const parse = (v: string) => parseFloat(v);
    return {
      patrimonio: parse(patrimonio || '0'),
      retornoNominal: parse(retornoNominal || '0'),
      inflacao: parse(inflacao || '0'),
      horizonte: parse(horizonte || '0'),
      taxaSaque: parse(taxaSaque || '0'),
    };
  }, [patrimonio, retornoNominal, inflacao, horizonte, taxaSaque]);

  const allValid = useMemo(() => {
    const n = numericInputs;
    return (
      Number.isFinite(n.patrimonio) &&
      Number.isFinite(n.retornoNominal) &&
      Number.isFinite(n.inflacao) &&
      Number.isFinite(n.horizonte) &&
      Number.isFinite(n.taxaSaque) &&
      n.patrimonio > 0 &&
      n.horizonte > 0
    );
  }, [numericInputs]);

  const resultado = useMemo(() => {
    if (!allValid) return null;
    return calcularRendaPatrimonio({
      patrimonio: numericInputs.patrimonio,
      retornoNominalAnual: numericInputs.retornoNominal,
      inflacaoAnual: numericInputs.inflacao,
      horizonteAnos: numericInputs.horizonte,
      taxaSaqueAnualPct: numericInputs.taxaSaque,
    });
  }, [allValid, numericInputs]);

  const chartOptions: ApexOptions = useMemo(() => {
    if (!resultado) return {};
    const horizonteAnos = numericInputs.horizonte;
    const categorias = Array.from({ length: horizonteAnos }, (_, i) => i + 1);
    return {
      colors: [
        ESTRATEGIA_COLORS.perpetua,
        ESTRATEGIA_COLORS.programado,
        ESTRATEGIA_COLORS['regra-4-pct'],
      ],
      chart: {
        fontFamily: 'Outfit, sans-serif',
        type: 'line',
        height: 350,
        toolbar: { show: false },
        zoom: { enabled: false },
      },
      stroke: { curve: 'smooth', width: 2 },
      dataLabels: { enabled: false },
      legend: { show: true, position: 'top', horizontalAlign: 'left' },
      xaxis: {
        categories: categorias,
        title: { text: 'Anos', style: { color: '#64748B', fontSize: '12px' } },
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: { style: { colors: '#64748B', fontSize: '12px' } },
      },
      yaxis: {
        labels: { style: { colors: '#64748B', fontSize: '12px' }, formatter: compactBR },
      },
      grid: { borderColor: '#E5E7EB', yaxis: { lines: { show: true } } },
      tooltip: {
        y: { formatter: (val: number) => formatBR(val) },
        x: { formatter: (val: number) => `Ano ${val}` },
      },
    };
  }, [resultado, numericInputs.horizonte]);

  const chartSeries = useMemo(() => {
    if (!resultado) return [];
    const horizonteAnos = numericInputs.horizonte;
    const padTrajetoria = (traj: { saldoFim: number }[]) => {
      const arr = traj.map((t) => Math.round(t.saldoFim * 100) / 100);
      while (arr.length < horizonteAnos) arr.push(0);
      return arr;
    };
    return [
      { name: 'Perpétua', data: padTrajetoria(resultado.trajetorias.perpetua) },
      { name: 'Esgotamento programado', data: padTrajetoria(resultado.trajetorias.programado) },
      {
        name: `Regra dos ${numericInputs.taxaSaque}%`,
        data: padTrajetoria(resultado.trajetorias['regra-4-pct']),
      },
    ];
  }, [resultado, numericInputs.horizonte, numericInputs.taxaSaque]);

  const trajetoriaSelecionada = resultado ? resultado.trajetorias[estrategiaSelecionada] : [];

  const hasCarteiraData = !!resumo || !!riscoRetorno;

  return (
    <div className="space-y-6">
      <ComponentCard
        title="Como usar:"
        desc="A partir do patrimônio acumulado hoje, calculamos a renda mensal sustentável em três estratégias: (1) Perpétua — só consome o rendimento real, capital nunca esgota; (2) Esgotamento programado — distribui o capital ao longo do horizonte via PMT, renda maior mas o saldo zera no fim; (3) Regra dos 4% — saque inicial fixo corrigido pela inflação, heurística clássica do FIRE. Todos os valores em poder de compra de hoje (descontada a inflação)."
      >
        <div />
      </ComponentCard>

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
                htmlFor="patrimonio"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
              >
                Patrimônio acumulado
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
                  R$
                </span>
                <Input
                  id="patrimonio"
                  type="number"
                  step={0.01}
                  value={patrimonio}
                  onChange={(e) => {
                    editedRef.current.patrimonio = true;
                    setPatrimonio(e.target.value);
                  }}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <label
                htmlFor="retornoNominal"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
              >
                Rentabilidade nominal anual esperada (%)
              </label>
              <div className="relative">
                <Input
                  id="retornoNominal"
                  type="number"
                  step={0.01}
                  value={retornoNominal}
                  onChange={(e) => {
                    editedRef.current.retornoNominal = true;
                    setRetornoNominal(e.target.value);
                  }}
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
                  %
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div>
              <label
                htmlFor="inflacao"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
              >
                Inflação anual (%)
              </label>
              <div className="relative">
                <Input
                  id="inflacao"
                  type="number"
                  step={0.01}
                  value={inflacao}
                  onChange={(e) => setInflacao(e.target.value)}
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
                  %
                </span>
              </div>
            </div>
            <div>
              <label
                htmlFor="horizonte"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
              >
                Horizonte (anos)
              </label>
              <Input
                id="horizonte"
                type="number"
                min="1"
                max="100"
                value={horizonte}
                onChange={(e) => setHorizonte(e.target.value)}
              />
            </div>
            <div>
              <label
                htmlFor="taxaSaque"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
              >
                Taxa de saque inicial (%)
              </label>
              <div className="relative">
                <Input
                  id="taxaSaque"
                  type="number"
                  step={0.1}
                  value={taxaSaque}
                  onChange={(e) => setTaxaSaque(e.target.value)}
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
                  %
                </span>
              </div>
            </div>
          </div>
        </div>
      </ComponentCard>

      {resultado && resultado.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
          <ul className="list-inside list-disc text-sm text-amber-700 dark:text-amber-400">
            {resultado.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {resultado && resultado.estrategias.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {resultado.estrategias.map((e) => (
            <div
              key={e.estrategia}
              className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
              style={{ borderTop: `3px solid ${ESTRATEGIA_COLORS[e.estrategia]}` }}
            >
              <p className="text-sm text-gray-500 dark:text-gray-400">{e.label}</p>
              <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
                {formatBR(e.rendaMensal)}
                <span className="ml-1 text-xs font-normal text-gray-400">/ mês</span>
              </p>
              <p className="mt-1 text-xs text-gray-400">{formatDuracao(e.duracao)}</p>
            </div>
          ))}
        </div>
      )}

      {resultado && resultado.estrategias.length > 0 && (
        <ComponentCard title="Comparação de estratégias">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >
                    Estratégia
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >
                    Renda mensal
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >
                    Duração
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >
                    Trade-off
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resultado.estrategias.map((e) => (
                  <TableRow
                    key={e.estrategia}
                    className="border-t border-gray-100 dark:border-gray-800"
                  >
                    <TableCell className="px-4 py-2.5 text-sm font-medium text-gray-800 dark:text-white/90">
                      <span
                        className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: ESTRATEGIA_COLORS[e.estrategia] }}
                      />
                      {e.label}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-right text-sm text-gray-700 dark:text-gray-300">
                      {formatBR(e.rendaMensal)}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300">
                      {formatDuracao(e.duracao)}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400">
                      {e.observacao}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </ComponentCard>
      )}

      <ComponentCard title="Trajetória do patrimônio (3 estratégias)">
        {!resultado || resultado.estrategias.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
            Preencha os campos acima para visualizar a comparação.
          </div>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <div className="min-w-[500px]">
              <ReactApexChart
                options={chartOptions}
                series={chartSeries}
                type="line"
                height={350}
              />
            </div>
          </div>
        )}
      </ComponentCard>

      <ComponentCard title="Trajetória ano a ano">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label
            htmlFor="estrategiaSelecionada"
            className="text-sm font-medium text-gray-700 dark:text-gray-400"
          >
            Estratégia:
          </label>
          <select
            id="estrategiaSelecionada"
            value={estrategiaSelecionada}
            onChange={(e) => setEstrategiaSelecionada(e.target.value as EstrategiaRenda)}
            className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            <option value="perpetua">Perpétua</option>
            <option value="programado">Esgotamento programado</option>
            <option value="regra-4-pct">Regra dos {numericInputs.taxaSaque}%</option>
          </select>
        </div>
        {!resultado || trajetoriaSelecionada.length === 0 ? (
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
                    className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >
                    Saldo início
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
                    Saques
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
                {trajetoriaSelecionada.map((row) => (
                  <TableRow key={row.ano} className="border-t border-gray-100 dark:border-gray-800">
                    <TableCell className="px-4 py-2.5 text-sm font-medium text-gray-800 dark:text-white/90">
                      {row.ano}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-right text-sm text-gray-700 dark:text-gray-300">
                      {formatBR(row.saldoInicio)}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-right text-sm text-gray-700 dark:text-gray-300">
                      {formatBR(row.juros)}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-right text-sm text-gray-700 dark:text-gray-300">
                      {row.saques > 0 ? formatBR(row.saques) : '—'}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-right text-sm font-medium text-gray-800 dark:text-white/90">
                      {formatBR(row.saldoFim)}
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
