'use client';
import React, { useState } from 'react';
import { useCoberturaFgc } from '@/hooks/useCoberturaFgc';
import LoadingSpinner from '@/components/common/LoadingSpinner';

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function ProgressBar({ percent, color }: { percent: number; color: string }) {
  const clamped = Math.min(percent, 100);
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${clamped}%`, backgroundColor: color }}
      />
    </div>
  );
}

function getBarColor(percent: number): string {
  if (percent >= 100) return '#EF4444'; // red — over limit
  if (percent >= 80) return '#F59E0B'; // amber — approaching limit
  return '#10B981'; // green — safe
}

function getStatusLabel(percent: number): { text: string; className: string } {
  if (percent >= 100)
    return { text: 'Limite excedido', className: 'text-red-600 dark:text-red-400' };
  if (percent >= 80) return { text: 'Atenção', className: 'text-amber-600 dark:text-amber-400' };
  return { text: 'Dentro do limite', className: 'text-emerald-600 dark:text-emerald-400' };
}

export default function CoberturaFgc() {
  const { data, loading, error } = useCoberturaFgc();
  const [expandedInstitutions, setExpandedInstitutions] = useState<Set<string>>(new Set());

  if (loading) {
    return <LoadingSpinner text="Carregando dados de cobertura FGC..." />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-16">
        <div className="text-center">
          <h3 className="mb-2 text-lg font-semibold text-red-600 dark:text-red-400">
            Erro ao carregar dados
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!data || data.instituicoes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-16">
        <svg
          className="text-gray-300 dark:text-gray-600"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
            Nenhum ativo de renda fixa encontrado
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Adicione investimentos de renda fixa para visualizar a cobertura do FGC.
          </p>
        </div>
      </div>
    );
  }

  const { resumo, instituicoes } = data;

  const toggleInstitution = (key: string) => {
    setExpandedInstitutions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-900/20">
        <div className="flex items-start gap-3">
          <svg
            className="mt-0.5 shrink-0 text-blue-500 dark:text-blue-400"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <p className="font-medium">O que o FGC cobre?</p>
            <p className="mt-1 text-blue-700 dark:text-blue-300">
              O Fundo Garantidor de Créditos protege até{' '}
              <strong>{formatBRL(resumo.limitePorInstituicao)}</strong> por CPF por instituição
              financeira (mesmo CNPJ), com teto global de{' '}
              <strong>{formatBRL(resumo.limiteGlobal)}</strong> a cada 4 anos. Produtos cobertos:
              CDB, LC, LCI, LCA, RDB, DPGE, LIG e Poupança. <strong>Não</strong> são cobertos: CRI,
              CRA, debêntures, LF, Tesouro Direto e fundos de investimento.
            </p>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Total coberto pelo FGC"
          value={formatBRL(resumo.totalEfetivamenteCoberto)}
          subtext={`de ${formatBRL(resumo.limiteGlobal)} (teto global)`}
          color="text-emerald-600 dark:text-emerald-400"
        />
        <SummaryCard
          label="Não coberto pelo FGC"
          value={formatBRL(resumo.totalNaoCoberto)}
          subtext="Produtos sem cobertura (CRI, CRA, etc.)"
          color="text-gray-700 dark:text-gray-300"
        />
        <SummaryCard
          label="Excedente (acima do limite)"
          value={formatBRL(resumo.totalExcedente)}
          subtext="Valor acima de R$ 250 mil por instituição"
          color={
            resumo.totalExcedente > 0
              ? 'text-red-600 dark:text-red-400'
              : 'text-gray-700 dark:text-gray-300'
          }
        />
        <SummaryCard
          label="Cobertura da carteira"
          value={formatPercent(resumo.percentualCoberto)}
          subtext={`${resumo.totalAtivos} ativos em ${resumo.totalInstituicoes} ${resumo.totalInstituicoes === 1 ? 'instituição' : 'instituições'}`}
          color="text-brand-500 dark:text-brand-400"
        />
      </div>

      {/* Global coverage bar */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Utilização do teto global FGC
          </h3>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {formatBRL(resumo.totalEfetivamenteCoberto)} / {formatBRL(resumo.limiteGlobal)}
          </span>
        </div>
        <ProgressBar
          percent={(resumo.totalEfetivamenteCoberto / resumo.limiteGlobal) * 100}
          color={getBarColor((resumo.totalEfetivamenteCoberto / resumo.limiteGlobal) * 100)}
        />
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {formatPercent((resumo.totalEfetivamenteCoberto / resumo.limiteGlobal) * 100)} utilizado
          do teto global de {formatBRL(resumo.limiteGlobal)} (renovado a cada 4 anos)
        </p>
      </div>

      {/* Institution breakdown */}
      <div className="space-y-3">
        <h3 className="text-base font-medium text-gray-800 dark:text-white/90">
          Cobertura por instituição
        </h3>

        {instituicoes.map((inst) => {
          const key = inst.cnpj || inst.instituicaoId;
          const isExpanded = expandedInstitutions.has(key);
          const status = getStatusLabel(inst.percentualUtilizado);
          const barColor = getBarColor(inst.percentualUtilizado);

          return (
            <div
              key={key}
              className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
            >
              {/* Institution header */}
              <button
                className="flex w-full items-center justify-between p-5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                onClick={() => toggleInstitution(key)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
                      <svg
                        className="text-gray-500 dark:text-gray-400"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 21h18" />
                        <path d="M3 10h18" />
                        <path d="M5 6l7-3 7 3" />
                        <path d="M4 10v11" />
                        <path d="M20 10v11" />
                        <path d="M8 14v4" />
                        <path d="M12 14v4" />
                        <path d="M16 14v4" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                        {inst.instituicaoNome}
                      </h4>
                      <div className="flex items-center gap-2">
                        {inst.cnpj && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            CNPJ: {inst.cnpj}
                          </span>
                        )}
                        <span className={`text-xs font-medium ${status.className}`}>
                          {status.text}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-gray-500 dark:text-gray-400">
                        {formatBRL(inst.totalCoberto)} coberto
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">
                        {formatPercent(inst.percentualUtilizado)} de {formatBRL(inst.limiteFgc)}
                      </span>
                    </div>
                    <ProgressBar percent={inst.percentualUtilizado} color={barColor} />
                  </div>

                  {inst.excedente > 0 && (
                    <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                      {formatBRL(inst.excedente)} acima do limite FGC
                    </p>
                  )}

                  {inst.totalNaoCoberto > 0 && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      + {formatBRL(inst.totalNaoCoberto)} em produtos não cobertos
                    </p>
                  )}
                </div>

                {/* Expand icon */}
                <div className="ml-4 shrink-0">
                  <svg
                    className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </button>

              {/* Expanded asset list */}
              {isExpanded && (
                <div className="border-t border-gray-100 dark:border-gray-800">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-900/30">
                          <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Ativo
                          </th>
                          <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Produto
                          </th>
                          <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Valor investido
                          </th>
                          <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Valor atual
                          </th>
                          <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Vencimento
                          </th>
                          <th className="px-5 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            FGC
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {inst.ativos.map((ativo) => (
                          <tr
                            key={ativo.id}
                            className="transition-colors hover:bg-gray-50/50 dark:hover:bg-white/[0.02]"
                          >
                            <td className="whitespace-nowrap px-5 py-3">
                              <div className="font-medium text-gray-900 dark:text-white">
                                {ativo.nome}
                              </div>
                              {ativo.isentoIR && (
                                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                                  Isento de IR
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-5 py-3">
                              <span className="inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                                {ativo.produto}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-5 py-3 text-right text-gray-700 dark:text-gray-300">
                              {formatBRL(ativo.valorInvestido)}
                            </td>
                            <td className="whitespace-nowrap px-5 py-3 text-right font-medium text-gray-900 dark:text-white">
                              {formatBRL(ativo.valorAtual)}
                            </td>
                            <td className="whitespace-nowrap px-5 py-3 text-gray-700 dark:text-gray-300">
                              {new Date(ativo.vencimento).toLocaleDateString('pt-BR')}
                            </td>
                            <td className="whitespace-nowrap px-5 py-3 text-center">
                              {ativo.coberto ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                  Coberto
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                  </svg>
                                  Não coberto
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  subtext,
  color,
}: {
  label: string;
  value: string;
  subtext: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{subtext}</p>
    </div>
  );
}
