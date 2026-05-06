'use client';
import { useAssetData } from './useAssetData';
import { OpcaoData } from '@/types/opcoes';

interface UseOpcoesReturn {
  data: OpcaoData | null;
  loading: boolean;
  error: string | null;
  formatCurrency: (value: number, currency?: 'BRL' | 'USD') => string;
  formatPercentage: (value: number) => string;
  formatNumber: (value: number) => string;
  updateObjetivo: (ativoId: string, novoObjetivo: number) => Promise<void>;
  updateCaixaParaInvestir: (novoCaixa: number) => Promise<boolean>;
  refetch: () => void;
}

export const useOpcoes = (): UseOpcoesReturn => {
  const assetData = useAssetData<OpcaoData>({
    apiPath: '/api/carteira/opcoes',
    objetivoPath: '/api/carteira/opcoes/objetivo',
    label: 'opções',
    throwOnError: true,
  });

  return {
    data: assetData.data,
    loading: assetData.loading,
    error: assetData.error,
    formatCurrency: assetData.formatCurrency,
    formatPercentage: assetData.formatPercentage,
    formatNumber: assetData.formatNumber,
    updateObjetivo: assetData.updateObjetivo as (
      ativoId: string,
      novoObjetivo: number,
    ) => Promise<void>,
    updateCaixaParaInvestir: assetData.updateCaixaParaInvestir,
    refetch: assetData.refetch,
  };
};
