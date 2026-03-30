// Tipos para Carteira Stocks (Ações Internacionais)

import {
  BaseQuantityAtivo,
  BaseSecao,
  BaseQuantitySecaoTotals,
  BaseResumo,
  BaseQuantityTotalGeral,
  AlocacaoAtivo,
  TabelaAuxiliar,
} from './base';

export type EstrategiaCarteiraStock = 'value' | 'growth' | 'risk';

export type SectorCarteiraStock =
  | 'technology'
  | 'financials'
  | 'healthcare'
  | 'consumer'
  | 'energy'
  | 'industrials'
  | 'materials'
  | 'utilities'
  | 'communication'
  | 'real_estate'
  | 'other';

export interface CarteiraStockAtivo extends BaseQuantityAtivo {
  dataCompra?: string | null; // Data da primeira compra (YYYY-MM-DD)
  sector: SectorCarteiraStock;
  industryCategory: string; // Ex: "Software", "Banks", "Pharma"
  estrategia: EstrategiaCarteiraStock;
}

export interface CarteiraStockSecao extends BaseSecao<CarteiraStockAtivo>, BaseQuantitySecaoTotals {
  estrategia: EstrategiaCarteiraStock;
}

export interface CarteiraStockResumo extends BaseResumo {
  necessidadeAporteTotal: number;
  valorAtualizado: number;
}

export interface CarteiraStockTabelaAuxiliar extends TabelaAuxiliar {
  ticker: string;
  nome: string;
  dataCompra?: string | null;
}

export interface CarteiraStockAlocacaoAtivo extends AlocacaoAtivo {
  ticker: string;
  cor: string;
}

export interface CarteiraStockData {
  resumo: CarteiraStockResumo;
  secoes: CarteiraStockSecao[];
  tabelaAuxiliar: CarteiraStockTabelaAuxiliar[];
  alocacaoAtivo: CarteiraStockAlocacaoAtivo[];
  totalGeral: BaseQuantityTotalGeral & {
    percentualCarteira: number;
  };
}
