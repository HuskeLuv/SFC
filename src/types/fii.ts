// Tipos para FIIs (Fundos Imobiliários)

import {
  BaseQuantityAtivo,
  BaseSecao,
  BaseQuantitySecaoTotals,
  BaseResumo,
  BaseQuantityTotalGeral,
  AlocacaoAtivo,
  TabelaAuxiliar,
} from './base';

export type TipoFii = 'fofi' | 'tvm' | 'tijolo' | 'fof' | 'ijol' | 'hibrido' | 'renda' | 'outros'; // Mantém tipos antigos para compatibilidade

export type SegmentoFii =
  | 'logistica'
  | 'shoppings'
  | 'residencial'
  | 'hibrido'
  | 'escritorios'
  | 'outros';

export interface FiiAtivo extends BaseQuantityAtivo {
  mandato: string; // Ex: "Tático", "Estratégico", "Especulativo"
  segmento: SegmentoFii;
  tipo: TipoFii;
}

export interface FiiSecao extends BaseSecao<FiiAtivo>, BaseQuantitySecaoTotals {
  tipo: TipoFii;
}

export interface FiiResumo extends BaseResumo {
  necessidadeAporteTotal: number;
}

export interface FiiAlocacaoSegmento {
  segmento: string;
  valor: number;
  percentual: number;
  cor: string;
}

export interface FiiAlocacaoAtivo extends AlocacaoAtivo {
  ticker: string;
  cor: string;
}

export interface FiiTabelaAuxiliar extends TabelaAuxiliar {
  ticker: string;
  nome: string;
}

export interface FiiData {
  resumo: FiiResumo;
  secoes: FiiSecao[];
  alocacaoSegmento: FiiAlocacaoSegmento[];
  alocacaoAtivo: FiiAlocacaoAtivo[];
  tabelaAuxiliar: FiiTabelaAuxiliar[];
  totalGeral: BaseQuantityTotalGeral & {
    percentualCarteira: number;
  };
}
