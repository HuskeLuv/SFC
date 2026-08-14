'use client';

import Link from 'next/link';
import { useState } from 'react';
import type {
  BenchmarkPatrimonial,
  SaudeFinanceiraConfig,
  SaudeFinanceiraIndicadores,
} from '@/hooks/useSaudeFinanceira';
import { DEFAULT_SAUDE_CONFIG } from '@/services/saudeFinanceira/indicadores';
import MetasConfigForm from './MetasConfigForm';
import { formatBRL, formatPercent } from './utils';

interface MetasPatrimoniaisProps {
  indicadores: SaudeFinanceiraIndicadores;
  /** Idade usada no patrimônio ideal; null exibe o CTA de preencher. */
  idade: number | null;
  /** Parâmetros efetivos (defaults + overrides do user). */
  config: SaudeFinanceiraConfig;
}

interface MetaRowProps {
  titulo: string;
  descricao: string;
  benchmark: BenchmarkPatrimonial;
  /** Conteúdo alternativo quando o benchmark é incalculável. */
  indisponivel?: React.ReactNode;
}

function MetaRow({ titulo, descricao, benchmark, indisponivel }: MetaRowProps) {
  const { necessario, atual, atingido } = benchmark;
  const pct = atingido != null ? Math.max(0, Math.min(1, atingido)) : 0;
  const completo = atingido != null && atingido >= 1;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white/90">{titulo}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{descricao}</p>
        </div>
        {necessario != null ? (
          <p className="shrink-0 text-right text-xs text-gray-500 dark:text-gray-400">
            <span
              className={`block text-sm font-semibold ${
                completo ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-white/90'
              }`}
            >
              {formatPercent(atingido, 0)}
            </span>
            {formatBRL(atual)} de {formatBRL(necessario)}
          </p>
        ) : null}
      </div>
      {necessario != null ? (
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          <div
            className={`h-full rounded-full transition-all ${
              completo ? 'bg-green-500' : 'bg-blue-500'
            }`}
            style={{ width: `${pct * 100}%` }}
          />
        </div>
      ) : (
        <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">{indisponivel}</div>
      )}
    </div>
  );
}

/**
 * Bloco ③ — as 4 metas patrimoniais da metodologia, com progresso
 * (correlação real/benchmark da planilha).
 */
export default function MetasPatrimoniais({ indicadores, idade, config }: MetasPatrimoniaisProps) {
  const { benchmarks, economia } = indicadores;
  const [configurando, setConfigurando] = useState(false);
  const isCustom = (Object.keys(DEFAULT_SAUDE_CONFIG) as (keyof SaudeFinanceiraConfig)[]).some(
    (k) => config[k] !== DEFAULT_SAUDE_CONFIG[k],
  );
  const fatorIdealPct = `${(config.fatorIdeal * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

  const rentabilidadeNota =
    economia.rentabilidadeFonte === 'carteira'
      ? 'rentabilidade real da carteira (12m)'
      : economia.rentabilidadeFonte === 'cdi'
        ? 'CDI como referência (carteira sem 12m de histórico)'
        : null;

  return (
    <div className="print:break-inside-avoid rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white/90">
          Metas Patrimoniais
          {isCustom ? (
            <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              personalizado
            </span>
          ) : null}
        </h3>
        {!configurando ? (
          <button
            type="button"
            className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400 print:hidden"
            onClick={() => setConfigurando(true)}
          >
            Personalizar
          </button>
        ) : null}
      </div>

      {configurando ? (
        <MetasConfigForm
          config={config}
          defaults={DEFAULT_SAUDE_CONFIG}
          onClose={() => setConfigurando(false)}
        />
      ) : null}

      <div className="mt-4 space-y-5">
        <MetaRow
          titulo="Reserva de Emergência"
          descricao={`${config.multReserva}× o gasto mensal, em reserva dedicada`}
          benchmark={benchmarks.reservaEmergencia}
          indisponivel="Preencha o fluxo de caixa para calcular o gasto mensal."
        />
        <MetaRow
          titulo="Patrimônio de Segurança"
          descricao={`${config.multSeguranca} meses de gastos em ativos de alta liquidez`}
          benchmark={benchmarks.patrimonioSeguranca}
          indisponivel="Preencha o fluxo de caixa para calcular o gasto mensal."
        />
        <MetaRow
          titulo="Patrimônio Ideal"
          descricao={
            idade != null
              ? `${fatorIdealPct} × renda anual × idade (${idade} anos)`
              : `${fatorIdealPct} × renda anual × idade`
          }
          benchmark={benchmarks.patrimonioIdeal}
          indisponivel={
            idade == null ? (
              <>
                Informe sua idade no{' '}
                <Link
                  href="/planejamento-financeiro?modo=aposentadoria"
                  className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  plano de aposentadoria
                </Link>{' '}
                para habilitar esta meta.
              </>
            ) : (
              'Preencha o fluxo de caixa para calcular a renda mensal.'
            )
          }
        />
        <MetaRow
          titulo="Independência Financeira"
          descricao="Patrimônio que sustenta seus gastos só com o ganho real"
          benchmark={benchmarks.independencia}
          indisponivel="Requer ganho real positivo (rentabilidade acima da inflação)."
        />
      </div>
      {rentabilidadeNota ? (
        <p className="mt-4 text-[11px] text-gray-400 dark:text-gray-500">
          Ganho real calculado com {rentabilidadeNota} e inflação de{' '}
          {formatPercent(economia.inflacaoAA)} a.a.
        </p>
      ) : null}
    </div>
  );
}
