// Tipos para Moedas e Criptomoedas

import {
  BaseQuantityAtivo,
  BaseSecao,
  BaseQuantitySecaoTotals,
  BaseResumo,
  BaseQuantityTotalGeral,
  AlocacaoAtivo,
  TabelaAuxiliar,
} from './base';

export interface MoedaCriptoAtivo extends BaseQuantityAtivo {
  tipo: 'moeda' | 'criptomoeda' | 'metal' | 'outro';
  regiao: 'brasil' | 'estados_unidos' | 'internacional';
  indiceRastreado: string;
}

export interface MoedaCriptoSecao extends BaseSecao<MoedaCriptoAtivo>, BaseQuantitySecaoTotals {
  tipo:
    | 'moedas_metais'
    | 'etf_estados_unidos'
    | 'moedas'
    | 'criptomoedas'
    | 'metais'
    | 'joias'
    | 'metais_joias';
  regiao: 'brasil' | 'estados_unidos' | 'internacional';
}

export interface MoedaCriptoResumo extends BaseResumo {
  necessidadeAporteTotal: number;
  valorAtualizado: number;
}

export type MoedaCriptoTotalGeral = BaseQuantityTotalGeral;

export interface MoedaCriptoAlocacaoAtivo extends AlocacaoAtivo {
  ticker: string;
}

export interface MoedaCriptoTabelaAuxiliar extends TabelaAuxiliar {
  ticker: string;
}

export interface MoedaCriptoData {
  resumo: MoedaCriptoResumo;
  secoes: MoedaCriptoSecao[];
  totalGeral: MoedaCriptoTotalGeral;
  alocacaoAtivo: MoedaCriptoAlocacaoAtivo[];
  tabelaAuxiliar: MoedaCriptoTabelaAuxiliar[];
}
