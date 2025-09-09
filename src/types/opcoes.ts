export interface OpcaoAtivo {
  id: string;
  nome: string;
  compraVenda: 'compra' | 'venda';
  vencimento: string; // Data de vencimento no formato YYYY-MM-DD
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

export interface OpcaoSecao {
  nome: string;
  tipo: 'put' | 'call';
  ativos: OpcaoAtivo[];
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

export interface OpcaoResumo {
  necessidadeAporteTotal: number;
  caixaParaInvestir: number;
  saldoInicioMes: number;
  valorAtualizado: number;
  rendimento: number;
  rentabilidade: number;
}

export interface OpcaoTotalGeral {
  quantidade: number;
  valorAplicado: number;
  valorAtualizado: number;
  risco: number;
  objetivo: number;
  quantoFalta: number;
  necessidadeAporte: number;
  rentabilidade: number;
}

export interface OpcaoData {
  resumo: OpcaoResumo;
  secoes: OpcaoSecao[];
  totalGeral: OpcaoTotalGeral;
}

