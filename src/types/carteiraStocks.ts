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

/**
 * Carteira EUA em US$ (out/2026): campos por linha das abas Stocks e REIT's
 * (/api/carteira/_lib/linhaEua.ts). Os valores da linha estão SEMPRE em US$.
 */
export interface CamposLinhaEua {
  /** Unidade gravada da posição: 'BRL' = legado em R$, exibido ÷ câmbio. */
  moedaRegistro?: 'USD' | 'BRL';
  /** Posição em R$ convertida pela cotação de hoje (valores em US$ aproximados). */
  aproximado?: boolean;
  /** Posição em R$ sem câmbio: zerada e fora dos totais. */
  semCambio?: boolean;
  /** Custo em R$ (câmbio de cada compra). */
  valorTotalBRL?: number | null;
  /** Valor atual em R$ pela cotação de hoje. */
  valorAtualizadoBRL?: number | null;
}

/** Totais de uma aba EUA numa moeda. */
export interface TotaisAbaEua {
  valorAplicado: number;
  valorAtualizado: number;
  proventos: number;
  rendimento: number;
  rentabilidade: number;
}

/** Campos de topo das rotas /api/carteira/stocks e /api/carteira/reit. */
export interface CamposAbaEua {
  /** R$ por US$ 1 (câmbio de mercado do dia); null = sem câmbio. */
  cotacaoDolar?: number | null;
  /** Dia da taxa (YYYY-MM-DD). */
  taxaData?: string | null;
  /** Chave CARTEIRA_EUA_DOLAR_HABILITADO: layout novo (total em US$ + "equivale a R$"). */
  layoutUsd?: boolean;
  /** Caixa para Investir da aba, em R$ — fora do total em US$. */
  caixaParaInvestirBRL?: number;
  totalUSD?: TotaisAbaEua;
  /** Equivalente em R$; null = sem câmbio. */
  totalBRL?: TotaisAbaEua | null;
  /** Posições fora da soma por falta de câmbio. */
  posicoesSemCambio?: number;
}

export interface CarteiraStockAtivo extends BaseQuantityAtivo, CamposLinhaEua {
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

export interface CarteiraStockData extends CamposAbaEua {
  resumo: CarteiraStockResumo;
  secoes: CarteiraStockSecao[];
  tabelaAuxiliar: CarteiraStockTabelaAuxiliar[];
  alocacaoAtivo: CarteiraStockAlocacaoAtivo[];
  totalGeral: BaseQuantityTotalGeral & {
    percentualCarteira: number;
  };
}
