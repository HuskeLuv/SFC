// Tipos para Opções

import {
  BaseQuantityAtivo,
  BaseSecao,
  BaseQuantitySecaoTotals,
  BaseResumo,
  BaseQuantityTotalGeral,
} from './base';

export interface OpcaoAtivo extends BaseQuantityAtivo {
  compraVenda: 'compra' | 'venda';
  vencimento: string; // Data de vencimento no formato YYYY-MM-DD
}

export interface OpcaoSecao extends BaseSecao<OpcaoAtivo>, BaseQuantitySecaoTotals {
  tipo: 'put' | 'call';
}

export interface OpcaoResumo extends BaseResumo {
  necessidadeAporteTotal: number;
  valorAtualizado: number;
}

export type OpcaoTotalGeral = BaseQuantityTotalGeral;

export interface OpcaoData {
  resumo: OpcaoResumo;
  secoes: OpcaoSecao[];
  totalGeral: OpcaoTotalGeral;
}
