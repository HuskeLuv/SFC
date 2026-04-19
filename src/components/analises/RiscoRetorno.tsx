'use client';
import React from 'react';
import { useRiscoRetorno } from '@/hooks/useRiscoRetorno';
import { useSensibilidadeCarteira } from '@/hooks/useSensibilidadeCarteira';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import RiscoRetornoCarteira from './RiscoRetornoCarteira';
import RiscoRetornoAnual from './RiscoRetornoAnual';
import SensibilidadeAtivos from './SensibilidadeAtivos';
import SensibilidadeCarteira from './SensibilidadeCarteira';

const emptyCarteira = { retornoAnual: 0, retornoCDI: 0, volatilidade: 0, sharpe: 0 };
const WINDOW_MONTHS = 24;

export default function RiscoRetorno() {
  const { data, loading, error } = useRiscoRetorno();
  const { data: sensibilidade } = useSensibilidadeCarteira(WINDOW_MONTHS);

  if (loading) {
    return <LoadingSpinner text="Carregando dados de risco x retorno..." />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
            Erro ao carregar dados
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        <RiscoRetornoCarteira data={data?.carteira ?? emptyCarteira} />
        <RiscoRetornoAnual
          data={data?.anual ?? {}}
          anosDisponiveis={data?.anosDisponiveis ?? [new Date().getFullYear()]}
        />
        <SensibilidadeAtivos data={data?.sensibilidade ?? []} />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SensibilidadeCarteira
          ativos={sensibilidade?.ativos ?? []}
          excluidos={sensibilidade?.excluidos ?? []}
          mesesUtilizados={sensibilidade?.mesesUtilizados ?? 0}
          windowMonths={sensibilidade?.windowMonths ?? WINDOW_MONTHS}
        />
      </div>
    </div>
  );
}
