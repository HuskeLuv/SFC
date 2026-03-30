// Tipos para REIT (Real Estate Investment Trusts)

import {
  BaseQuantityAtivo,
  BaseSecao,
  BaseQuantitySecaoTotals,
  BaseResumo,
  BaseQuantityTotalGeral,
  AlocacaoAtivo,
  TabelaAuxiliar,
} from './base';

export type EstrategiaReit = 'value' | 'growth' | 'risk';

export type SetorReit =
  | 'residential'
  | 'commercial'
  | 'retail'
  | 'healthcare'
  | 'industrial'
  | 'office'
  | 'data_center'
  | 'self_storage'
  | 'hotel'
  | 'other';

export interface ReitAtivo extends BaseQuantityAtivo {
  setor: SetorReit;
  estrategia: EstrategiaReit;
}

export interface ReitSecao extends BaseSecao<ReitAtivo>, BaseQuantitySecaoTotals {
  estrategia: EstrategiaReit;
}

export interface ReitResumo extends BaseResumo {
  necessidadeAporteTotal: number;
  valorAtualizado: number;
}

export interface ReitTabelaAuxiliar extends TabelaAuxiliar {
  ticker: string;
  nome: string;
}

export interface ReitAlocacaoAtivo extends AlocacaoAtivo {
  ticker: string;
  cor: string;
}

export interface ReitData {
  cotacaoDolar?: number | null;
  resumo: ReitResumo;
  secoes: ReitSecao[];
  tabelaAuxiliar: ReitTabelaAuxiliar[];
  alocacaoAtivo: ReitAlocacaoAtivo[];
  totalGeral: BaseQuantityTotalGeral & {
    percentualCarteira: number;
  };
}
