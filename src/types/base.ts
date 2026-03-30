// Base interfaces for all asset types.
// Asset types extend these bases instead of redeclaring shared fields.
// See docs/conventions.md for usage guidance.

// Base interface for all asset types
export interface BaseAtivo {
  id: string;
  nome: string;
  valorAtualizado: number;
  riscoPorAtivo: number;
  percentualCarteira: number;
  rentabilidade: number;
  observacoes?: string;
}

// Extended base for quantity-tracked assets (acoes, fii, etf, reit, stocks, opcoes, moedas, previdencia)
export interface BaseQuantityAtivo extends BaseAtivo {
  ticker: string;
  quantidade: number;
  precoAquisicao: number;
  valorTotal: number;
  cotacaoAtual: number;
  objetivo: number;
  quantoFalta: number;
  necessidadeAporte: number;
  dataUltimaAtualizacao?: Date;
}

// Extended base for fund-type assets (rendaFixa, fimFia) that track by value, not quantity
export interface BaseFundAtivo extends BaseAtivo {
  valorInicialAplicado: number;
  aporte: number;
  resgate: number;
}

// Base section (group of assets)
export interface BaseSecao<T> {
  nome: string;
  ativos: T[];
  rentabilidadeMedia: number;
}

// Quantity sections add these totals
export interface BaseQuantitySecaoTotals {
  totalQuantidade: number;
  totalValorAplicado: number;
  totalValorAtualizado: number;
  totalPercentualCarteira: number;
  totalRisco: number;
  totalObjetivo: number;
  totalQuantoFalta: number;
  totalNecessidadeAporte: number;
}

// Fund sections add these totals
export interface BaseFundSecaoTotals {
  totalValorAplicado: number;
  totalAporte: number;
  totalResgate: number;
  totalValorAtualizado: number;
  totalPercentualCarteira: number;
  totalRisco: number;
  totalObjetivo: number;
  totalQuantoFalta: number;
  totalNecessidadeAporte: number;
}

// Base resumo (summary)
export interface BaseResumo {
  caixaParaInvestir: number;
  saldoInicioMes: number;
  rendimento: number;
  rentabilidade: number;
}

// Base total geral for quantity-tracked assets
export interface BaseQuantityTotalGeral {
  quantidade: number;
  valorAplicado: number;
  valorAtualizado: number;
  risco: number;
  objetivo: number;
  quantoFalta: number;
  necessidadeAporte: number;
  rentabilidade: number;
}

// Base total geral for fund-type assets
export interface BaseFundTotalGeral {
  valorAplicado: number;
  aporte: number;
  resgate: number;
  valorAtualizado: number;
  rentabilidade: number;
}

// Common helper types
export interface AlocacaoAtivo {
  ticker?: string;
  nome?: string;
  valor: number;
  percentual: number;
  cor?: string;
}

export interface TabelaAuxiliar {
  ticker?: string;
  nome?: string;
  cotacaoAtual: number;
  necessidadeAporte: number;
  loteAproximado: number;
}
