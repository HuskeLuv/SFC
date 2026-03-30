// Tipos para ETF (Exchange-Traded Funds)

import {
  BaseQuantityAtivo,
  BaseSecao,
  BaseQuantitySecaoTotals,
  BaseResumo,
  BaseQuantityTotalGeral,
  AlocacaoAtivo,
  TabelaAuxiliar,
} from './base';

export type RegiaoEtf = 'brasil' | 'estados_unidos';

export type IndiceRastreado =
  | 'ibovespa'
  | 'sp500'
  | 'nasdaq'
  | 'dow_jones'
  | 'small_caps'
  | 'dividendos'
  | 'tecnologia'
  | 'energia'
  | 'materiais'
  | 'financeiro'
  | 'saude'
  | 'consumo'
  | 'outros';

export interface EtfAtivo extends BaseQuantityAtivo {
  indiceRastreado: IndiceRastreado;
  regiao: RegiaoEtf;
}

export interface EtfSecao extends BaseSecao<EtfAtivo>, BaseQuantitySecaoTotals {
  regiao: RegiaoEtf;
}

export interface EtfResumo extends BaseResumo {
  necessidadeAporteTotal: number;
  valorAtualizado: number;
}

export interface EtfTabelaAuxiliar extends TabelaAuxiliar {
  ticker: string;
  nome: string;
}

export interface EtfAlocacaoAtivo extends AlocacaoAtivo {
  ticker: string;
  cor: string;
}

export interface EtfData {
  resumo: EtfResumo;
  secoes: EtfSecao[];
  tabelaAuxiliar: EtfTabelaAuxiliar[];
  alocacaoAtivo: EtfAlocacaoAtivo[];
  totalGeral: BaseQuantityTotalGeral & {
    percentualCarteira: number;
  };
}
