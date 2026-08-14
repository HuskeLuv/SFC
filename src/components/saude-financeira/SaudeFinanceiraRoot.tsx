'use client';

import LoadingSpinner from '@/components/common/LoadingSpinner';
import Button from '@/components/ui/button/Button';
import { useAuth } from '@/hooks/useAuth';
import { useSaudeFinanceira } from '@/hooks/useSaudeFinanceira';
import { STATUS_META } from './utils';
import StatusHero from './StatusHero';
import ClienteHeader from './ClienteHeader';
import DadosEconomicos from './DadosEconomicos';
import FluxoCards from './FluxoCards';
import MetasPatrimoniais from './MetasPatrimoniais';
import BalancoPatrimonial from './BalancoPatrimonial';
import EvolucaoChart from './EvolucaoChart';

/**
 * Container raiz da Saúde Financeira: diagnóstico live derivado de carteira +
 * fluxo de caixa + dívidas (metodologia da planilha "Saúde Financeira Após
 * Recomendações" — ver docs/plano-saude-financeira-ago2026.md).
 */
export default function SaudeFinanceiraRoot() {
  const { data, loading, error } = useSaudeFinanceira();
  const { user, actingClient } = useAuth();

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

  const nomeCliente = actingClient?.name ?? user?.name ?? '';

  return (
    <div className="space-y-6">
      {/* Cabeçalho de relatório — só aparece na impressão/PDF */}
      <div className="hidden print:block">
        <h1 className="text-xl font-bold text-gray-900">Relatório de Saúde Financeira</h1>
        <p className="mt-1 text-sm text-gray-600">
          {nomeCliente ? `${nomeCliente} · ` : ''}
          {new Date(data.asOf).toLocaleDateString('pt-BR')} · Status:{' '}
          {STATUS_META[indicadores.status.codigo].label}
        </p>
      </div>

      <div className="flex items-start justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white/90">
            Saúde Financeira
          </h2>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Diagnóstico calculado com seus dados de carteira, fluxo de caixa e dívidas.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => window.print()}>
          Exportar PDF
        </Button>
      </div>

      {semFluxo ? (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300 print:hidden">
          Seu fluxo de caixa ainda não tem lançamentos — os indicadores de renda, gasto e as metas
          patrimoniais dependem dele. Preencha o Fluxo de Caixa para um diagnóstico completo.
        </div>
      ) : null}

      {/* Ordem das seções segue a aba "Saúde Financeira" da planilha-base. */}
      <ClienteHeader nome={nomeCliente} fontes={fontes} asOf={data.asOf} />
      <DadosEconomicos indicadores={indicadores} />
      <FluxoCards
        indicadores={indicadores}
        tendencias={tendencias}
        cashflowYear={fontes.cashflow.year}
      />
      <MetasPatrimoniais indicadores={indicadores} idade={fontes.idade} config={data.config} />
      <BalancoPatrimonial
        indicadores={indicadores}
        composicao={composicao}
        tendencias={tendencias}
      />
      <StatusHero indicadores={indicadores} tendencias={tendencias} />
      <EvolucaoChart />
    </div>
  );
}
