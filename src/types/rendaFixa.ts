// Tipos para Renda Fixa & Fundos

import { BaseFundAtivo, BaseSecao, BaseResumo, BaseFundTotalGeral } from './base';

export type TipoRendaFixa = 'pos-fixada' | 'prefixada' | 'hibrida';

export interface RendaFixaIRProjection {
  isento: boolean;
  motivoIsencao: string | null;
  category: 'isento' | 'tabela_regressiva';
  diasDecorridos: number;
  aliquota: number;
  rendimentoBruto: number;
  ir: number;
  valorLiquido: number;
}

export interface RendaFixaAtivo extends BaseFundAtivo {
  percentualRentabilidade: number;
  cotizacaoResgate: string; // Ex: "D+0", "D+1", "D+30"
  liquidacaoResgate: string; // Ex: "D+0", "D+1"
  vencimento: Date;
  benchmark: string; // Ex: "CDI", "IPCA + Spread"
  tipo: TipoRendaFixa;
  isAutoUpdated?: boolean; // true para Tesouro Direto sincronizado (PU oficial)
  /** IR projetado se resgatar hoje. Calculado pelo serviço fixedIncomeIR. */
  ir?: RendaFixaIRProjection;
}

export interface RendaFixaSecao extends BaseSecao<RendaFixaAtivo> {
  tipo: TipoRendaFixa;
  totalValorAplicado: number;
  totalAporte: number;
  totalResgate: number;
  totalValorAtualizado: number;
  percentualTotal: number;
}

export interface RendaFixaResumo extends BaseResumo {
  necessidadeAporte: number;
  saldoAtual: number;
}

export interface RendaFixaData {
  resumo: RendaFixaResumo;
  secoes: RendaFixaSecao[];
  totalGeral: BaseFundTotalGeral;
}
