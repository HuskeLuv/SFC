// Tipos para Ações

import {
  BaseQuantityAtivo,
  BaseSecao,
  BaseQuantitySecaoTotals,
  BaseResumo,
  BaseQuantityTotalGeral,
} from './base';

export type EstrategiaAcao = 'value' | 'growth' | 'risk';

export type SetorAcao =
  | 'financeiro'
  | 'energia'
  | 'consumo'
  | 'saude'
  | 'tecnologia'
  | 'industria'
  | 'materiais'
  | 'utilidades'
  | 'outros';

export interface AcaoAtivo extends BaseQuantityAtivo {
  setor: SetorAcao;
  subsetor: string; // Ex: "Bancos", "Comércio", "Seguros", "Serviços Médicos"
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
