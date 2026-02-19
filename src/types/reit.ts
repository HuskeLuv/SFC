// Tipos para REIT (Real Estate Investment Trusts)

export type EstrategiaReit = 'value' | 'growth' | 'risk';

export type SetorReit = 'residential' | 'commercial' | 'retail' | 'healthcare' | 'industrial' | 'office' | 'data_center' | 'self_storage' | 'hotel' | 'other';

export interface ReitAtivo {
  id: string;
  ticker: string; // Ex: "O", "AMT", "PLD"
  nome: string; // Nome completo do REIT
  setor: SetorReit;
  quantidade: number; // Número de cotas
  precoAquisicao: number; // Preço de aquisição ou preço médio (USD)
  valorTotal: number; // Calculado = quantidade * precoAquisicao (USD)
  cotacaoAtual: number; // Cotação em tempo real (USD)
  valorAtualizado: number; // Calculado = quantidade * cotacaoAtual (USD)
  riscoPorAtivo: number; // Calculado em % do total da carteira
  percentualCarteira: number; // Calculado em % da carteira total
  objetivo: number; // Percentual desejado definido pelo usuário
  quantoFalta: number; // Calculado = objetivo% - percentual atual
  necessidadeAporte: number; // Calculado em USD para atingir o objetivo
  rentabilidade: number; // Calculada automaticamente em %
  estrategia: EstrategiaReit;
  observacoes?: string;
  dataUltimaAtualizacao?: Date;
}

export interface ReitSecao {
  estrategia: EstrategiaReit;
  nome: string;
  ativos: ReitAtivo[];
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

export interface ReitResumo {
  necessidadeAporteTotal: number;
  caixaParaInvestir: number;
  saldoInicioMes: number;
  valorAtualizado: number;
  rendimento: number;
  rentabilidade: number;
}

export interface ReitTabelaAuxiliar {
  ticker: string;
  nome: string;
  cotacaoAtual: number;
  necessidadeAporte: number;
  loteAproximado: number; // Quantidade de cotas necessárias
}

export interface ReitAlocacaoAtivo {
  ticker: string;
  valor: number;
  percentual: number;
  cor: string;
}

export interface ReitData {
  cotacaoDolar?: number | null;
  resumo: ReitResumo;
  secoes: ReitSecao[];
  tabelaAuxiliar: ReitTabelaAuxiliar[];
  alocacaoAtivo: ReitAlocacaoAtivo[];
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
