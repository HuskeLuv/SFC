export interface MoedaCriptoAtivo {
  id: string;
  ticker: string;
  nome: string;
  tipo: 'moeda' | 'criptomoeda' | 'metal' | 'outro';
  regiao: 'brasil' | 'estados_unidos' | 'internacional';
  indiceRastreado: string;
  quantidade: number;
  precoAquisicao: number;
  valorTotal: number;
  cotacaoAtual: number;
  valorAtualizado: number;
  riscoPorAtivo: number;
  percentualCarteira: number;
  objetivo: number;
  quantoFalta: number;
  necessidadeAporte: number;
  rentabilidade: number;
  observacoes?: string;
}

export interface MoedaCriptoSecao {
  nome: string;
  tipo: 'moedas_metais' | 'etf_estados_unidos';
  regiao: 'brasil' | 'estados_unidos' | 'internacional';
  ativos: MoedaCriptoAtivo[];
  totalQuantidade: number;
  totalValorAplicado: number;
  totalValorAtualizado: number;
  totalRisco: number;
  totalPercentualCarteira: number;
  totalObjetivo: number;
  totalQuantoFalta: number;
  totalNecessidadeAporte: number;
  rentabilidadeMedia: number;
}

export interface MoedaCriptoResumo {
  necessidadeAporteTotal: number;
  caixaParaInvestir: number;
  saldoInicioMes: number;
  valorAtualizado: number;
  rendimento: number;
  rentabilidade: number;
}

export interface MoedaCriptoTotalGeral {
  quantidade: number;
  valorAplicado: number;
  valorAtualizado: number;
  risco: number;
  objetivo: number;
  quantoFalta: number;
  necessidadeAporte: number;
  rentabilidade: number;
}

export interface MoedaCriptoAlocacaoAtivo {
  ticker: string;
  percentual: number;
  valor: number;
}

export interface MoedaCriptoTabelaAuxiliar {
  ticker: string;
  cotacaoAtual: number;
  necessidadeAporte: number;
  loteAproximado: number;
}

export interface MoedaCriptoData {
  resumo: MoedaCriptoResumo;
  secoes: MoedaCriptoSecao[];
  totalGeral: MoedaCriptoTotalGeral;
  alocacaoAtivo: MoedaCriptoAlocacaoAtivo[];
  tabelaAuxiliar: MoedaCriptoTabelaAuxiliar[];
}

