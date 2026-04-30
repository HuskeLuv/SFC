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
import {
  simulateAposentadoria,
  PERFIL_LABELS,
  PERFIS_RETORNO,
  type PerfilInvestidor,
} from '@/services/planejamento/aposentadoriaSimulator';

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

const PERFIL_OPTIONS: PerfilInvestidor[] = [
  'conservador',
  'moderado-conservador',
  'moderado',
  'moderado-arrojado',
  'arrojado',
  'personalizado',
];

const formatBR = (v: number) => `R$ ${formatCurrency(v)}`;
const compactBR = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}K`;
  return `R$ ${v.toFixed(0)}`;
};

export default function Aposentadoria() {
  const { resumo, loading: carteiraLoading } = useCarteira();
  const { data: riscoRetorno, loading: riscoLoading } = useRiscoRetorno();
  const dataLoading = carteiraLoading || riscoLoading;

  const editedRef = useRef({
    patrimonioInicial: false,
    retornoCustomAcumulacao: false,
  });

  const [idadeAtual, setIdadeAtual] = useState('30');
  const [idadeAposentadoria, setIdadeAposentadoria] = useState('60');
  const [expectativaVida, setExpectativaVida] = useState('90');
  const [perfil, setPerfil] = useState<PerfilInvestidor>('moderado');
  const [patrimonioInicial, setPatrimonioInicial] = useState('');
  const [aporteMensal, setAporteMensal] = useState('1000');
  const [rendaDesejadaMensal, setRendaDesejadaMensal] = useState('5000');
  const [inflacao, setInflacao] = useState('4.5');
  const [retornoCustomAcumulacao, setRetornoCustomAcumulacao] = useState('');
  const [retornoCustomRetirada, setRetornoCustomRetirada] = useState('');

  // Auto-fill patrimônio from saldoBruto
  useEffect(() => {
    if (
      resumo?.saldoBruto != null &&
      resumo.saldoBruto > 0 &&
      !editedRef.current.patrimonioInicial
    ) {
      setPatrimonioInicial(resumo.saldoBruto.toFixed(2));
    }
  }, [resumo]);

  // Auto-fill custom return when perfil = personalizado
  useEffect(() => {
    if (
      perfil === 'personalizado' &&
      riscoRetorno?.carteira?.retornoAnual != null &&
      !editedRef.current.retornoCustomAcumulacao
    ) {
      setRetornoCustomAcumulacao(riscoRetorno.carteira.retornoAnual.toFixed(2));
      // Default: retirada = acumulação - 2pp (postura conservadora pós-aposentadoria)
      const retiradaDefault = Math.max(riscoRetorno.carteira.retornoAnual - 2, 0);
      setRetornoCustomRetirada(retiradaDefault.toFixed(2));
    }
  }, [perfil, riscoRetorno]);

  const handleUseCarteiraData = () => {
    if (resumo?.saldoBruto != null) {
      setPatrimonioInicial(resumo.saldoBruto.toFixed(2));
      editedRef.current.patrimonioInicial = false;
    }
    if (riscoRetorno?.carteira?.retornoAnual != null) {
      setPerfil('personalizado');
      setRetornoCustomAcumulacao(riscoRetorno.carteira.retornoAnual.toFixed(2));
      const retiradaDefault = Math.max(riscoRetorno.carteira.retornoAnual - 2, 0);
      setRetornoCustomRetirada(retiradaDefault.toFixed(2));
      editedRef.current.retornoCustomAcumulacao = false;
    }
  };

  const numericInputs = useMemo(() => {
    const parse = (v: string) => parseFloat(v);
    return {
      idadeAtual: parse(idadeAtual),
      idadeAposentadoria: parse(idadeAposentadoria),
      expectativaVida: parse(expectativaVida),
      patrimonioInicial: parse(patrimonioInicial || '0'),
      aporteMensal: parse(aporteMensal || '0'),
      rendaDesejadaMensal: parse(rendaDesejadaMensal || '0'),
      inflacao: parse(inflacao || '0'),
      retornoCustomAcumulacao: parse(retornoCustomAcumulacao || '0'),
      retornoCustomRetirada: parse(retornoCustomRetirada || '0'),
    };
  }, [
    idadeAtual,
    idadeAposentadoria,
    expectativaVida,
    patrimonioInicial,
    aporteMensal,
    rendaDesejadaMensal,
    inflacao,
    retornoCustomAcumulacao,
    retornoCustomRetirada,
  ]);

  const allValid = useMemo(() => {
    const n = numericInputs;
    return (
      Number.isFinite(n.idadeAtual) &&
      Number.isFinite(n.idadeAposentadoria) &&
      Number.isFinite(n.expectativaVida) &&
      Number.isFinite(n.patrimonioInicial) &&
      Number.isFinite(n.aporteMensal) &&
      Number.isFinite(n.rendaDesejadaMensal) &&
      Number.isFinite(n.inflacao) &&
      (perfil !== 'personalizado' ||
        (Number.isFinite(n.retornoCustomAcumulacao) && Number.isFinite(n.retornoCustomRetirada)))
    );
  }, [numericInputs, perfil]);

  const resultado = useMemo(() => {
    if (!allValid) return null;
    return simulateAposentadoria({
      idadeAtual: numericInputs.idadeAtual,
      idadeAposentadoria: numericInputs.idadeAposentadoria,
      expectativaVida: numericInputs.expectativaVida,
      patrimonioInicial: numericInputs.patrimonioInicial,
      aporteMensal: numericInputs.aporteMensal,
      rendaDesejadaMensal: numericInputs.rendaDesejadaMensal,
      perfil,
      inflacao: numericInputs.inflacao,
      retornoCustomAcumulacao: numericInputs.retornoCustomAcumulacao,
      retornoCustomRetirada: numericInputs.retornoCustomRetirada,
    });
  }, [allValid, numericInputs, perfil]);

  const chartOptions: ApexOptions = useMemo(() => {
    if (!resultado || resultado.anos.length === 0) return {};
    const idadeAposentadoriaNum = numericInputs.idadeAposentadoria;
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
        categories: resultado.anos.map((a) => a.idade),
        title: { text: 'Idade', style: { color: '#64748B', fontSize: '12px' } },
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
        x: { formatter: (val: number) => `Idade ${val}` },
      },
      annotations: {
        xaxis: [
          {
            x: idadeAposentadoriaNum,
            borderColor: '#f59e0b',
            label: {
              borderColor: '#f59e0b',
              style: { color: '#fff', background: '#f59e0b' },
              text: 'Aposentadoria',
            },
          },
        ],
      },
    };
  }, [resultado, numericInputs.idadeAposentadoria]);

  const chartSeries = useMemo(() => {
    if (!resultado || resultado.anos.length === 0) return [];
    return [
      {
        name: 'Patrimônio (em valor de hoje)',
        data: resultado.anos.map((a) => Math.round(a.patrimonioFim * 100) / 100),
      },
    ];
  }, [resultado]);

  const hasCarteiraData = !!resumo || !!riscoRetorno;
  const isPersonalizado = perfil === 'personalizado';

  return (
    <div className="space-y-6">
      <ComponentCard
        title="Como usar:"
        desc="Esta simulação projeta seu patrimônio ano a ano em valores de hoje (descontada a inflação). Informe sua idade, quando deseja se aposentar, expectativa de vida e quanto deseja receber por mês na aposentadoria. O cálculo combina a fase de acumulação (com aportes) e a fase de retirada (com saques) usando taxas reais derivadas do perfil escolhido."
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

          {/* Idades */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div>
              <label
                htmlFor="idadeAtual"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
              >
                Idade atual
              </label>
              <Input
                id="idadeAtual"
                type="number"
                min="0"
                max="120"
                value={idadeAtual}
                onChange={(e) => setIdadeAtual(e.target.value)}
              />
            </div>
            <div>
              <label
                htmlFor="idadeAposentadoria"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
              >
                Idade alvo de aposentadoria
              </label>
              <Input
                id="idadeAposentadoria"
                type="number"
                min="0"
                max="120"
                value={idadeAposentadoria}
                onChange={(e) => setIdadeAposentadoria(e.target.value)}
              />
            </div>
            <div>
              <label
                htmlFor="expectativaVida"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
              >
                Expectativa de vida
              </label>
              <Input
                id="expectativaVida"
                type="number"
                min="0"
                max="120"
                value={expectativaVida}
                onChange={(e) => setExpectativaVida(e.target.value)}
              />
            </div>
          </div>

          {/* Perfil + inflação */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label
                htmlFor="perfil"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
              >
                Perfil de investidor
              </label>
              <select
                id="perfil"
                value={perfil}
                onChange={(e) => setPerfil(e.target.value as PerfilInvestidor)}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              >
                {PERFIL_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {PERFIL_LABELS[p]}
                    {p !== 'personalizado' &&
                      ` (acum. ${PERFIS_RETORNO[p].retornoAcumulacao}% / ret. ${PERFIS_RETORNO[p].retornoRetirada}%)`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="inflacao"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
              >
                Expectativa de inflação anual (%)
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
          </div>

          {/* Retornos custom (perfil = personalizado) */}
          {isPersonalizado && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <label
                  htmlFor="retornoAcumulacao"
                  className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
                >
                  Retorno na acumulação (% a.a., nominal)
                </label>
                <div className="relative">
                  <Input
                    id="retornoAcumulacao"
                    type="number"
                    step={0.01}
                    value={retornoCustomAcumulacao}
                    onChange={(e) => {
                      editedRef.current.retornoCustomAcumulacao = true;
                      setRetornoCustomAcumulacao(e.target.value);
                    }}
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
                    %
                  </span>
                </div>
              </div>
              <div>
                <label
                  htmlFor="retornoRetirada"
                  className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
                >
                  Retorno na retirada (% a.a., nominal)
                </label>
                <div className="relative">
                  <Input
                    id="retornoRetirada"
                    type="number"
                    step={0.01}
                    value={retornoCustomRetirada}
                    onChange={(e) => setRetornoCustomRetirada(e.target.value)}
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
                    %
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Patrimônio + aporte + renda */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
                htmlFor="aporteMensal"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
              >
                Aporte mensal (em valor de hoje)
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
                  R$
                </span>
                <Input
                  id="aporteMensal"
                  type="number"
                  step={0.01}
                  value={aporteMensal}
                  onChange={(e) => setAporteMensal(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <label
                htmlFor="rendaDesejadaMensal"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
              >
                Renda mensal desejada na aposentadoria
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
                  R$
                </span>
                <Input
                  id="rendaDesejadaMensal"
                  type="number"
                  step={0.01}
                  value={rendaDesejadaMensal}
                  onChange={(e) => setRendaDesejadaMensal(e.target.value)}
                  className="pl-10"
                />
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
      {resultado && resultado.warnings.length === 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-sm text-gray-500 dark:text-gray-400">Anos de acumulação</p>
            <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
              {numericInputs.idadeAposentadoria - numericInputs.idadeAtual} anos
            </p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-sm text-gray-500 dark:text-gray-400">Patrimônio na aposentadoria</p>
            <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
              {formatBR(resultado.patrimonioNaAposentadoria)}
            </p>
            <p className="mt-1 text-xs text-gray-400">em valor de hoje</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-sm text-gray-500 dark:text-gray-400">Anos de renda</p>
            <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
              {resultado.anosDeRenda} anos
            </p>
            <p
              className={`mt-1 text-xs ${
                resultado.metaAtingida
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {resultado.metaAtingida
                ? `dura até ${numericInputs.expectativaVida} anos`
                : `esgota aos ${resultado.idadeEsgotamento}`}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-sm text-gray-500 dark:text-gray-400">Capital p/ renda perpétua</p>
            <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
              {Number.isFinite(resultado.capitalAlvoPerpetuidade)
                ? formatBR(resultado.capitalAlvoPerpetuidade)
                : '—'}
            </p>
            <p className="mt-1 text-xs text-gray-400">para nunca esgotar</p>
          </div>
        </div>
      )}

      {/* Chart */}
      <ComponentCard title="Evolução do patrimônio">
        {!resultado || resultado.anos.length === 0 ? (
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
      <ComponentCard title="Projeção ano a ano">
        {!resultado || resultado.anos.length === 0 ? (
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
                    Idade
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300"
                  >
                    Fase
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
                {resultado.anos.map((row) => (
                  <TableRow
                    key={row.idade}
                    className="border-t border-gray-100 dark:border-gray-800"
                  >
                    <TableCell className="px-4 py-2.5 text-sm font-medium text-gray-800 dark:text-white/90">
                      {row.idade}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-sm">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          row.fase === 'acumulacao'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                        }`}
                      >
                        {row.fase === 'acumulacao' ? 'Acumulação' : 'Retirada'}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-right text-sm text-gray-700 dark:text-gray-300">
                      {formatBR(row.patrimonioInicio)}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-right text-sm text-gray-700 dark:text-gray-300">
                      {row.aportes > 0 ? formatBR(row.aportes) : '—'}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-right text-sm text-gray-700 dark:text-gray-300">
                      {formatBR(row.juros)}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-right text-sm text-gray-700 dark:text-gray-300">
                      {row.saques > 0 ? formatBR(row.saques) : '—'}
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
