// Tipos para Previdencia e Seguros

import {
  BaseQuantityAtivo,
  BaseSecao,
  BaseQuantitySecaoTotals,
  BaseResumo,
  BaseQuantityTotalGeral,
  AlocacaoAtivo,
  TabelaAuxiliar,
} from './base';

export interface PrevidenciaSegurosAtivo extends BaseQuantityAtivo {
  carencia: number; // em meses
  cotacaoResgate: number;
  liquidacaoResgate: number; // em dias
  modalidade: 'vida' | 'previdencia' | 'pensao' | 'outro';
  subclasse: 'whole_life' | 'term_life' | 'vgbl' | 'pgbl' | 'fundo_prev' | 'outro';
}

export interface PrevidenciaSegurosSecao
  extends BaseSecao<PrevidenciaSegurosAtivo>, BaseQuantitySecaoTotals {
  tipo: 'seguro' | 'growth_fundos_prev';
}

export interface PrevidenciaSegurosResumo extends BaseResumo {
  necessidadeAporteTotal: number;
  valorAtualizado: number;
}

export type PrevidenciaSegurosTotalGeral = BaseQuantityTotalGeral;

export interface PrevidenciaSegurosAlocacaoAtivo extends AlocacaoAtivo {
  nome: string;
}

export interface PrevidenciaSegurosTabelaAuxiliar extends TabelaAuxiliar {
  nome: string;
}

export interface PrevidenciaSegurosData {
  resumo: PrevidenciaSegurosResumo;
  secoes: PrevidenciaSegurosSecao[];
  totalGeral: PrevidenciaSegurosTotalGeral;
  alocacaoAtivo: PrevidenciaSegurosAlocacaoAtivo[];
  tabelaAuxiliar: PrevidenciaSegurosTabelaAuxiliar[];
}
