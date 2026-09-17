import type { SaveCaixaFn } from '@/lib/caixaParaInvestirClient';
import { createContext, useContext } from 'react';
import type { CarteiraResumo } from '@/hooks/useCarteira';

export type NecessidadeAporteMap = Record<string, number>;

interface CarteiraResumoContextValue {
  resumo: CarteiraResumo;
  loading: boolean;
  error: string | null;
  formatCurrency: (value: number | null | undefined) => string;
  formatPercentage: (value: number | null | undefined) => string;
  updateMeta: (novaMetaPatrimonio: number) => Promise<boolean>;
  updateCaixaParaInvestir: SaveCaixaFn;
  refetch: () => Promise<void>;
  necessidadeAporteMap: NecessidadeAporteMap;
  isAlocacaoLoading: boolean;
  /** Invalida todas as queries de assets — usado após add/resgate para forçar refetch nas tabs */
  invalidateAssets: () => void;
}

const CarteiraResumoContext = createContext<CarteiraResumoContextValue | null>(null);

interface CarteiraResumoProviderProps {
  value: CarteiraResumoContextValue;
  children: React.ReactNode;
}

export const CarteiraResumoProvider = ({ value, children }: CarteiraResumoProviderProps) => {
  return <CarteiraResumoContext.Provider value={value}>{children}</CarteiraResumoContext.Provider>;
};

export const useCarteiraResumoContext = () => {
  const context = useContext(CarteiraResumoContext);

  if (!context) {
    throw new Error('useCarteiraResumoContext deve ser usado dentro de CarteiraResumoProvider');
  }

  return context;
};

/**
 * Versão tolerante: `null` fora do provider. Pra componentes compartilhados
 * (ex.: CaixaParaInvestirCard) que também renderizam isolados em testes.
 */
export const useCarteiraResumoContextOptional = () => useContext(CarteiraResumoContext);
