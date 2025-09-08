// Tipos para Ações

export type EstrategiaAcao = 'value' | 'growth' | 'risk';

export type SetorAcao = 'financeiro' | 'energia' | 'consumo' | 'saude' | 'tecnologia' | 'industria' | 'materiais' | 'utilidades' | 'outros';

export interface AcaoAtivo {
  id: string;
  ticker: string; // Ex: "PETR4", "VALE3", "ITUB4"
  nome: string; // Nome completo da empresa
  setor: SetorAcao;
  subsetor: string; // Ex: "Bancos", "Comércio", "Seguros", "Serviços Médicos"
  quantidade: number; // Número de ações
  precoAquisicao: number; // Preço de aquisição ou preço médio
  valorTotal: number; // Calculado = quantidade * precoAquisicao
  cotacaoAtual: number; // Cotação em tempo real
  valorAtualizado: number; // Calculado = quantidade * cotacaoAtual
  riscoPorAtivo: number; // Calculado em % do total da carteira de ações
  percentualCarteira: number; // Calculado em % da carteira total
  objetivo: number; // Percentual desejado definido pelo usuário
  quantoFalta: number; // Calculado = objetivo% - percentual atual
  necessidadeAporte: number; // Calculado em R$ para atingir o objetivo
  rentabilidade: number; // Calculada automaticamente em %
  estrategia: EstrategiaAcao;
  observacoes?: string;
  dataUltimaAtualizacao?: Date;
}

export interface AcaoSecao {
  estrategia: EstrategiaAcao;
  nome: string;
  ativos: AcaoAtivo[];
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

export interface AcaoResumo {
  necessidadeAporteTotal: number;
  caixaParaInvestir: number;
  saldoInicioMes: number;
  valorAtualizado: number;
  rendimento: number;
  rentabilidade: number;
}

export interface AcaoData {
  resumo: AcaoResumo;
  secoes: AcaoSecao[];
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
