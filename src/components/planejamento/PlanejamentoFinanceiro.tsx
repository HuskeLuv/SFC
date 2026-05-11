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
  PERFIS_RETORNO,
  type PerfilInvestidor,
  type EventoPontual,
} from '@/services/planejamento/aposentadoriaSimulator';

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

const PERFIL_OPTIONS: { value: PerfilInvestidor; label: string }[] = [
  { value: 'conservador', label: 'Perfil 1 (Conservador)' },
  { value: 'moderado-conservador', label: 'Perfil 2' },
  { value: 'moderado', label: 'Perfil 3 (Moderado)' },
  { value: 'moderado-arrojado', label: 'Perfil 4' },
  { value: 'arrojado', label: 'Perfil 5 (Arrojado)' },
  { value: 'personalizado', label: 'Personalizado (carteira)' },
];

type Modo = 'simples' | 'avancado';
type ResultadoTab = 'grafico' | 'tabela' | 'saques';

const formatBR = (v: number) => `R$ ${formatCurrency(v)}`;
const compactBR = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}K`;
  return `R$ ${v.toFixed(0)}`;
};

interface EventoForm {
  id: string;
  idade: string;
  valor: string;
  tipo: 'aporte' | 'saque';
  descricao: string;
}

const novoEvento = (): EventoForm => ({
  id: Math.random().toString(36).slice(2),
  idade: '',
  valor: '',
  tipo: 'saque',
  descricao: '',
});

export default function PlanejamentoFinanceiro() {
  const { resumo, loading: carteiraLoading } = useCarteira();
  const { data: riscoRetorno, loading: riscoLoading } = useRiscoRetorno();
  const dataLoading = carteiraLoading || riscoLoading;

  const editedRef = useRef({
    patrimonioInicial: false,
    retornoCustomAcumulacao: false,
  });

  const [modo, setModo] = useState<Modo>('simples');
  const [resultadoTab, setResultadoTab] = useState<ResultadoTab>('grafico');

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
  const [eventos, setEventos] = useState<EventoForm[]>([]);

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
    if (
      perfil === 'personalizado' &&
      riscoRetorno?.carteira?.retornoAnual != null &&
      !editedRef.current.retornoCustomAcumulacao
    ) {
      setRetornoCustomAcumulacao(riscoRetorno.carteira.retornoAnual.toFixed(2));
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

  const eventosPontuais = useMemo<EventoPontual[]>(() => {
    return eventos
      .map((e) => ({
        idade: parseFloat(e.idade),
        valor: parseFloat(e.valor),
        tipo: e.tipo,
        descricao: e.descricao.trim() || undefined,
      }))
      .filter((e) => Number.isFinite(e.idade) && Number.isFinite(e.valor) && e.valor > 0);
  }, [eventos]);

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
      eventosPontuais,
    });
  }, [allValid, numericInputs, perfil, eventosPontuais]);

  const retiradaIdeal = useMemo(() => {
    if (!resultado || resultado.warnings.length > 0) return null;
    const realRet =
      (1 +
        (perfil === 'personalizado'
          ? numericInputs.retornoCustomRetirada
          : PERFIS_RETORNO[perfil].retornoRetirada) /
          100) /
        (1 + numericInputs.inflacao / 100) -
      1;
    if (realRet <= 0) return null;
    return (resultado.patrimonioNaAposentadoria * realRet) / 12;
  }, [resultado, perfil, numericInputs.retornoCustomRetirada, numericInputs.inflacao]);

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
  const isAvancado = modo === 'avancado';

  const addEvento = () => setEventos((prev) => [...prev, novoEvento()]);
  const removeEvento = (id: string) => setEventos((prev) => prev.filter((e) => e.id !== id));
  const updateEvento = (id: string, patch: Partial<EventoForm>) =>
    setEventos((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-white/[0.05] dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">
              Planejamento de Aposentadoria
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Simule, ano a ano, quanto seu patrimônio dura na aposentadoria — em valores de hoje
              (já descontada a inflação).
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-800">
            <button
              type="button"
              onClick={() => setModo('simples')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                modo === 'simples'
                  ? 'bg-white text-gray-800 shadow-sm dark:bg-gray-700 dark:text-white'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Simples
            </button>
            <button
              type="button"
              onClick={() => setModo('avancado')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                modo === 'avancado'
                  ? 'bg-white text-gray-800 shadow-sm dark:bg-gray-700 dark:text-white'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Variáveis Avançadas
            </button>
          </div>
        </div>
      </div>

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
                Qual é sua idade?
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
                Idade alvo (aposentadoria)
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

          {/* Perfil + inflação (avançado) */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label
                htmlFor="perfil"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
              >
                Qual é seu perfil de investidor?
              </label>
              <select
                id="perfil"
                value={perfil}
                onChange={(e) => setPerfil(e.target.value as PerfilInvestidor)}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              >
                {PERFIL_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                    {p.value !== 'personalizado' &&
                      ` — ${PERFIS_RETORNO[p.value].retornoAcumulacao}% / ${PERFIS_RETORNO[p.value].retornoRetirada}% a.a.`}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-400">
                {isPersonalizado
                  ? 'Defina retornos nominais customizados abaixo.'
                  : `Acumulação ${PERFIS_RETORNO[perfil].retornoAcumulacao}% a.a. / Retirada ${PERFIS_RETORNO[perfil].retornoRetirada}% a.a. (nominal).`}
              </p>
            </div>
            {isAvancado && (
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
            )}
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
                Patrimônio Inicial
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
                Aportes Mensais
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
                Renda desejada (aposentadoria)
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
            <p className="text-sm text-gray-500 dark:text-gray-400">Retirada mensal ideal</p>
            <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
              {retiradaIdeal != null ? formatBR(retiradaIdeal) : '—'}
            </p>
            <p className="mt-1 text-xs text-gray-400">para renda perpétua</p>
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
        </div>
      )}

      {/* Resultados em sub-abas: Gráfico / Tabelas / Saques Desejados */}
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-6 dark:border-gray-800">
          <nav className="-mb-px flex space-x-2 overflow-x-auto">
            {[
              { id: 'grafico' as const, label: 'Gráfico' },
              { id: 'tabela' as const, label: 'Tabelas' },
              { id: 'saques' as const, label: 'Saques Desejados' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setResultadoTab(tab.id)}
                className={`inline-flex items-center border-b-2 px-3 py-3 text-sm font-medium transition-colors duration-200 ease-in-out whitespace-nowrap ${
                  resultadoTab === tab.id
                    ? 'text-brand-500 dark:text-brand-400 border-brand-500 dark:border-brand-400'
                    : 'border-transparent bg-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {resultadoTab === 'grafico' && (
            <>
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
            </>
          )}

          {resultadoTab === 'tabela' && (
            <>
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
                          Eventos
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
                      {resultado.anos.map((row) => {
                        const evento = row.aportesPontuais - row.saquesPontuais;
                        return (
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
                            <TableCell
                              className={`px-4 py-2.5 text-right text-sm ${
                                evento > 0
                                  ? 'text-green-600 dark:text-green-400'
                                  : evento < 0
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-gray-700 dark:text-gray-300'
                              }`}
                            >
                              {evento !== 0
                                ? `${evento > 0 ? '+' : '−'}${formatBR(Math.abs(evento))}`
                                : '—'}
                            </TableCell>
                            <TableCell className="px-4 py-2.5 text-right text-sm font-medium text-gray-800 dark:text-white/90">
                              {formatBR(row.patrimonioFim)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}

          {resultadoTab === 'saques' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                    Aportes e saques pontuais
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Inclua eventos extraordinários (compra de imóvel, herança, viagem) em valores de
                    hoje. Eles ajustam o patrimônio no ano da idade informada.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addEvento}
                  className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-600"
                >
                  + Adicionar
                </button>
              </div>

              {eventos.length === 0 ? (
                <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  Nenhum aporte ou saque pontual cadastrado.
                </div>
              ) : (
                <div className="space-y-3">
                  {eventos.map((ev) => (
                    <div
                      key={ev.id}
                      className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700 md:grid-cols-[100px_120px_1fr_150px_auto] md:items-end"
                    >
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                          Idade
                        </label>
                        <Input
                          type="number"
                          min="0"
                          max="120"
                          value={ev.idade}
                          onChange={(e) => updateEvento(ev.id, { idade: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                          Tipo
                        </label>
                        <select
                          value={ev.tipo}
                          onChange={(e) =>
                            updateEvento(ev.id, {
                              tipo: e.target.value as 'aporte' | 'saque',
                            })
                          }
                          className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                        >
                          <option value="aporte">Aporte</option>
                          <option value="saque">Saque</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                          Descrição
                        </label>
                        <Input
                          type="text"
                          placeholder="Ex.: Compra do carro"
                          value={ev.descricao}
                          onChange={(e) => updateEvento(ev.id, { descricao: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                          Valor
                        </label>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
                            R$
                          </span>
                          <Input
                            type="number"
                            step={0.01}
                            value={ev.valor}
                            onChange={(e) => updateEvento(ev.id, { valor: e.target.value })}
                            className="pl-9"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeEvento(ev.id)}
                        className="h-11 rounded-lg border border-red-200 px-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-900/20"
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
