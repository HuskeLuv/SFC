'use client';
import { useAssetData } from './useAssetData';
import { MoedaCriptoData } from '@/types/moedas-criptos';

interface UseMoedasCriptosReturn {
  data: MoedaCriptoData | null;
  loading: boolean;
  error: string | null;
  formatCurrency: (value: number, currency?: 'BRL' | 'USD') => string;
  formatPercentage: (value: number) => string;
  formatNumber: (value: number) => string;
  updateObjetivo: (ativoId: string, novoObjetivo: number) => Promise<void>;
  updateCotacao: (ativoId: string, novaCotacao: number) => Promise<void>;
  updateCaixaParaInvestir: (novoCaixa: number) => Promise<boolean>;
  refetch: () => void;
}

export const useMoedasCriptos = (): UseMoedasCriptosReturn => {
  const assetData = useAssetData<MoedaCriptoData>({
    apiPath: '/api/carteira/moedas-criptos',
    objetivoPath: '/api/carteira/moedas-criptos/objetivo',
    cotacaoPath: '/api/carteira/moedas-criptos/cotacao',
    label: 'moedas e criptomoedas',
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
    updateCotacao: assetData.updateCotacao as (
      ativoId: string,
      novaCotacao: number,
    ) => Promise<void>,
    updateCaixaParaInvestir: assetData.updateCaixaParaInvestir,
    refetch: assetData.refetch,
  };
};
