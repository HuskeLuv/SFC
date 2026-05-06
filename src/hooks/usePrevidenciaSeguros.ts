'use client';
import { useAssetData } from './useAssetData';
import { PrevidenciaSegurosData } from '@/types/previdencia-seguros';

interface UsePrevidenciaSegurosReturn {
  data: PrevidenciaSegurosData | null;
  loading: boolean;
  error: string | null;
  formatCurrency: (value: number, currency?: 'BRL' | 'USD') => string;
  formatPercentage: (value: number) => string;
  formatNumber: (value: number) => string;
  updateObjetivo: (ativoId: string, novoObjetivo: number) => Promise<void>;
  updateCaixaParaInvestir: (novoCaixa: number) => Promise<boolean>;
  refetch: () => void;
}

export const usePrevidenciaSeguros = (): UsePrevidenciaSegurosReturn => {
  const assetData = useAssetData<PrevidenciaSegurosData>({
    apiPath: '/api/carteira/previdencia-seguros',
    objetivoPath: '/api/carteira/previdencia-seguros/objetivo',
    label: 'previdência e seguros',
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
