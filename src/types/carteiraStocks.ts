// Tipos para Carteira Stocks (Ações Internacionais)

export type EstrategiaCarteiraStock = 'value' | 'growth' | 'risk';

export type SectorCarteiraStock = 'technology' | 'financials' | 'healthcare' | 'consumer' | 'energy' | 'industrials' | 'materials' | 'utilities' | 'communication' | 'real_estate' | 'other';

export interface CarteiraStockAtivo {
  id: string;
  ticker: string; // Ex: "AAPL", "MSFT", "GOOGL"
  nome: string; // Nome completo da empresa
  sector: SectorCarteiraStock;
  industryCategory: string; // Ex: "Software", "Banks", "Pharma"
  quantidade: number; // Número de ações
  precoAquisicao: number; // Preço de aquisição ou preço médio (USD)
  valorTotal: number; // Calculado = quantidade * precoAquisicao (USD)
  cotacaoAtual: number; // Cotação em tempo real (USD)
  valorAtualizado: number; // Calculado = quantidade * cotacaoAtual (USD)
  riscoPorAtivo: number; // Calculado em % do total da carteira de stocks
  percentualCarteira: number; // Calculado em % da carteira total
  objetivo: number; // Percentual desejado definido pelo usuário
  quantoFalta: number; // Calculado = objetivo% - percentual atual
  necessidadeAporte: number; // Calculado em USD para atingir o objetivo
  rentabilidade: number; // Calculada automaticamente em %
  estrategia: EstrategiaCarteiraStock;
  observacoes?: string;
  dataUltimaAtualizacao?: Date;
}

export interface CarteiraStockSecao {
  estrategia: EstrategiaCarteiraStock;
  nome: string;
  ativos: CarteiraStockAtivo[];
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

export interface CarteiraStockResumo {
  necessidadeAporteTotal: number;
  caixaParaInvestir: number;
  saldoInicioMes: number;
  valorAtualizado: number;
  rendimento: number;
  rentabilidade: number;
}

export interface CarteiraStockTabelaAuxiliar {
  ticker: string;
  nome: string;
  cotacaoAtual: number;
  necessidadeAporte: number;
  loteAproximado: number; // Quantidade de ações necessárias
}

export interface CarteiraStockAlocacaoAtivo {
  ticker: string;
  valor: number;
  percentual: number;
  cor: string;
}

export interface CarteiraStockData {
  resumo: CarteiraStockResumo;
  secoes: CarteiraStockSecao[];
  tabelaAuxiliar: CarteiraStockTabelaAuxiliar[];
  alocacaoAtivo: CarteiraStockAlocacaoAtivo[];
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
