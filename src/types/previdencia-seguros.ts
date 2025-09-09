export interface PrevidenciaSegurosAtivo {
  id: string;
  nome: string;
  carencia: number; // em meses
  cotacaoResgate: number;
  liquidacaoResgate: number; // em dias
  modalidade: 'vida' | 'previdencia' | 'pensao' | 'outro';
  subclasse: 'whole_life' | 'term_life' | 'vgbl' | 'pgbl' | 'fundo_prev' | 'outro';
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

export interface PrevidenciaSegurosSecao {
  nome: string;
  tipo: 'seguro' | 'growth_fundos_prev';
  ativos: PrevidenciaSegurosAtivo[];
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

export interface PrevidenciaSegurosResumo {
  necessidadeAporteTotal: number;
  caixaParaInvestir: number;
  saldoInicioMes: number;
  valorAtualizado: number;
  rendimento: number;
  rentabilidade: number;
}

export interface PrevidenciaSegurosTotalGeral {
  quantidade: number;
  valorAplicado: number;
  valorAtualizado: number;
  risco: number;
  objetivo: number;
  quantoFalta: number;
  necessidadeAporte: number;
  rentabilidade: number;
}

export interface PrevidenciaSegurosAlocacaoAtivo {
  nome: string;
  percentual: number;
  valor: number;
}

export interface PrevidenciaSegurosTabelaAuxiliar {
  nome: string;
  cotacaoAtual: number;
  necessidadeAporte: number;
  loteAproximado: number;
}

export interface PrevidenciaSegurosData {
  resumo: PrevidenciaSegurosResumo;
  secoes: PrevidenciaSegurosSecao[];
  totalGeral: PrevidenciaSegurosTotalGeral;
  alocacaoAtivo: PrevidenciaSegurosAlocacaoAtivo[];
  tabelaAuxiliar: PrevidenciaSegurosTabelaAuxiliar[];
}

