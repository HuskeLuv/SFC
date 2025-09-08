// Tipos para ETF (Exchange-Traded Funds)

export type RegiaoEtf = 'brasil' | 'estados_unidos';

export type IndiceRastreado = 'ibovespa' | 'sp500' | 'nasdaq' | 'dow_jones' | 'small_caps' | 'dividendos' | 'tecnologia' | 'energia' | 'materiais' | 'financeiro' | 'saude' | 'consumo' | 'outros';

export interface EtfAtivo {
  id: string;
  ticker: string; // Ex: "BOVA11", "SPY", "QQQ"
  nome: string; // Nome completo do ETF
  indiceRastreado: IndiceRastreado;
  regiao: RegiaoEtf;
  quantidade: number; // Número de cotas
  precoAquisicao: number; // Preço de aquisição ou preço médio (BRL ou USD)
  valorTotal: number; // Calculado = quantidade * precoAquisicao
  cotacaoAtual: number; // Cotação em tempo real
  valorAtualizado: number; // Calculado = quantidade * cotacaoAtual
  riscoPorAtivo: number; // Calculado em % do total da carteira
  percentualCarteira: number; // Calculado em % da carteira total
  objetivo: number; // Percentual desejado definido pelo usuário
  quantoFalta: number; // Calculado = objetivo% - percentual atual
  necessidadeAporte: number; // Calculado em BRL ou USD para atingir o objetivo
  rentabilidade: number; // Calculada automaticamente em %
  observacoes?: string;
  dataUltimaAtualizacao?: Date;
}

export interface EtfSecao {
  regiao: RegiaoEtf;
  nome: string;
  ativos: EtfAtivo[];
  totalQuantidade: number;
  totalValorAplicado: number;
  totalValorAtualizado: number;
  totalPercentualCarteira: number;
  totalRisco: number;
  totalObjetivo: number;
  totalQuantoFalta: number;
  totalNecessidadeAporte: number;
  rentabilidadeMedia: number;
}

export interface EtfResumo {
  necessidadeAporteTotal: number;
  caixaParaInvestir: number;
  saldoInicioMes: number;
  valorAtualizado: number;
  rendimento: number;
  rentabilidade: number;
}

export interface EtfTabelaAuxiliar {
  ticker: string;
  nome: string;
  cotacaoAtual: number;
  necessidadeAporte: number;
  loteAproximado: number; // Quantidade de cotas necessárias
}

export interface EtfAlocacaoAtivo {
  ticker: string;
  valor: number;
  percentual: number;
  cor: string;
}

export interface EtfData {
  resumo: EtfResumo;
  secoes: EtfSecao[];
  tabelaAuxiliar: EtfTabelaAuxiliar[];
  alocacaoAtivo: EtfAlocacaoAtivo[];
  totalGeral: {
    quantidade: number;
    valorAplicado: number;
    valorAtualizado: number;
    percentualCarteira: number;
    risco: number;
    objetivo: number;
    quantoFalta: number;
    necessidadeAporte: number;
    rentabilidade: number;
  };
}
