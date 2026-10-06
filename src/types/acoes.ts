// Tipos para Ações

import {
  BaseQuantityAtivo,
  BaseSecao,
  BaseQuantitySecaoTotals,
  BaseResumo,
  BaseQuantityTotalGeral,
} from './base';

export type EstrategiaAcao = 'value' | 'growth' | 'risk';

/** Setor da classificação setorial da B3 ("Financeiro", "Bens Industriais"…); '' = sem classificação. */
export type SetorAcao = string;

export interface AcaoAtivo extends BaseQuantityAtivo {
  setor: SetorAcao;
  subsetor: string; // Subsetor B3, ex.: "Intermediários Financeiros", "Comércio Varejista"
  estrategia: EstrategiaAcao;
}

export interface AcaoSecao extends BaseSecao<AcaoAtivo>, BaseQuantitySecaoTotals {
  estrategia: EstrategiaAcao;
}

export interface AcaoResumo extends BaseResumo {
  necessidadeAporteTotal: number;
  valorAtualizado: number;
}

export interface AcaoData {
  resumo: AcaoResumo;
  secoes: AcaoSecao[];
  totalGeral: BaseQuantityTotalGeral & {
    percentualCarteira: number;
  };
}
