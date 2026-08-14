'use client';

import LoadingSpinner from '@/components/common/LoadingSpinner';
import { useSaudeFinanceira } from '@/hooks/useSaudeFinanceira';
import StatusHero from './StatusHero';
import FluxoCards from './FluxoCards';
import MetasPatrimoniais from './MetasPatrimoniais';
import BalancoPatrimonial from './BalancoPatrimonial';
import EvolucaoChart from './EvolucaoChart';
import GestaoRisco from './GestaoRisco';

/**
 * Container raiz da Saúde Financeira: diagnóstico live derivado de carteira +
 * fluxo de caixa + dívidas (metodologia da planilha "Saúde Financeira Após
 * Recomendações" — ver docs/plano-saude-financeira-ago2026.md).
 */
export default function SaudeFinanceiraRoot() {
  const { data, loading, error } = useSaudeFinanceira();

  if (loading) {
    return <LoadingSpinner size="lg" text="Calculando sua saúde financeira..." />;
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
        {error ?? 'Não foi possível carregar o diagnóstico.'}
      </div>
    );
  }

  const { indicadores, fontes, composicao, tendencias } = data;
  const semFluxo = fontes.cashflow.activeMonths === 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white/90">Saúde Financeira</h2>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          Diagnóstico calculado com seus dados de carteira, fluxo de caixa e dívidas.
        </p>
      </div>

      {semFluxo ? (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">
          Seu fluxo de caixa ainda não tem lançamentos — os indicadores de renda, gasto e as metas
          patrimoniais dependem dele. Preencha o Fluxo de Caixa para um diagnóstico completo.
        </div>
      ) : null}

      <StatusHero indicadores={indicadores} tendencias={tendencias} />
      <FluxoCards
        indicadores={indicadores}
        tendencias={tendencias}
        cashflowYear={fontes.cashflow.year}
      />
      <MetasPatrimoniais indicadores={indicadores} idade={fontes.idade} config={data.config} />
      <BalancoPatrimonial indicadores={indicadores} composicao={composicao} />
      <EvolucaoChart />
      <GestaoRisco />
    </div>
  );
}
