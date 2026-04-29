'use client';
import React from 'react';
import { useIRComecotas } from '@/hooks/useIR';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import IRSummaryCard from './IRSummaryCard';
import IRStateMessage from './IRStateMessage';
import { FUNDO_TIPO_LABEL, formatBRL, formatDate, formatPercent } from './irFormatters';

export default function IRComecotas() {
  const { data, isLoading, error } = useIRComecotas();

  if (isLoading) return <LoadingSpinner text="Projetando come-cotas..." />;
  if (error)
    return (
      <IRStateMessage
        variant="error"
        title="Erro ao carregar come-cotas"
        description={(error as Error).message}
      />
    );
  if (!data || data.fundos.length === 0)
    return (
      <IRStateMessage
        variant="empty"
        title="Sem fundos cadastrados"
        description="Cadastre fundos de investimento para ver a projeção de come-cotas."
      />
    );

  const fundosTributaveis = data.fundos.filter((f) => !f.isentoComeCotas);
  const fundosIsentos = data.fundos.filter((f) => f.isentoComeCotas);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-900/20">
        <p className="text-sm text-blue-800 dark:text-blue-200">
          Come-cotas é a retenção automática de IR feita pelo custodiante no último dia útil de{' '}
          <strong>maio</strong> e <strong>novembro</strong>. Você não emite DARF — o impacto aparece
          no patrimônio do fundo. FIIs, ETFs e fundos de ações <strong>não</strong> têm come-cotas.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <IRSummaryCard
          label="Próxima cobrança"
          value={formatDate(data.proximaCobrancaGlobal)}
          subtext="Retida automaticamente pelo custodiante"
          highlight
        />
        <IRSummaryCard
          label="Total estimado"
          value={formatBRL(data.totalProximaCobranca)}
          subtext={`${fundosTributaveis.length} fundos tributáveis`}
          color={
            data.totalProximaCobranca > 0
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-emerald-600 dark:text-emerald-400'
          }
        />
        <IRSummaryCard
          label="Fundos isentos"
          value={fundosIsentos.length.toString()}
          subtext="FIA — tributação só no resgate"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-900/30">
              <Th>Fundo</Th>
              <Th>Tipo</Th>
              <Th align="right">Rendimento</Th>
              <Th align="right">Alíquota</Th>
              <Th align="right">IR estimado</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.fundos.map((f) => (
              <tr
                key={f.symbol}
                className="transition-colors hover:bg-gray-50/50 dark:hover:bg-white/[0.02]"
              >
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="font-medium text-gray-900 dark:text-white">{f.nome}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {f.symbol} · {f.diasDecorridos} dias na carteira
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-700 dark:text-gray-300">
                  <span className="inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                    {FUNDO_TIPO_LABEL[f.tipo]}
                  </span>
                </td>
                <td
                  className={`whitespace-nowrap px-4 py-3 text-right font-medium ${
                    f.rendimentoEstimado > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {formatBRL(f.rendimentoEstimado)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                  {f.isentoComeCotas ? '—' : formatPercent(f.aliquota, 0)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">
                  {f.isentoComeCotas ? (
                    <span className="text-emerald-600 dark:text-emerald-400">Isento</span>
                  ) : (
                    formatBRL(f.irEstimado)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
}) {
  const alignClass =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  return (
    <th
      className={`px-4 py-3 ${alignClass} text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400`}
    >
      {children}
    </th>
  );
}
