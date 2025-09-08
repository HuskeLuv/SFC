// Tipos para FIM/FIA (Fundos Multimercado e Fundos de Ações)

export type TipoFimFia = 'fim' | 'fia';

export interface FimFiaAtivo {
  id: string;
  nome: string;
  cotizacaoResgate: string; // Ex: "D+0", "D+8", "D+30"
  liquidacaoResgate: string; // Ex: "D+1", "D+2", "D+10"
  categoriaNivel1: string; // Ex: "Ativos", "Alocação", "Estratégia", "Específicos", "Investimentos no Exterior"
  subcategoriaNivel2: string; // Ex: "Macro", "Dividendos", "Small Caps"
  valorInicialAplicado: number;
  aporte: number;
  resgate: number;
  valorAtualizado: number;
  percentualCarteira: number;
  riscoPorAtivo: number;
  objetivo: number; // Percentual desejado definido pelo usuário
  quantoFalta: number; // Calculado = objetivo% - percentual atual
  necessidadeAporte: number; // Calculado = diferença para atingir o objetivo
  rentabilidade: number;
  tipo: TipoFimFia;
  observacoes?: string;
}

export interface FimFiaSecao {
  tipo: TipoFimFia;
  nome: string;
  ativos: FimFiaAtivo[];
  totalValorAplicado: number;
  totalAporte: number;
  totalResgate: number;
  totalValorAtualizado: number;
  totalPercentualCarteira: number;
  totalRisco: number;
  totalObjetivo: number;
  totalQuantoFalta: number;
  totalNecessidadeAporte: number;
  rentabilidadeMedia: number;
}

export interface FimFiaResumo {
  necessidadeAporteTotal: number;
  caixaParaInvestir: number;
  saldoInicioMes: number;
  valorAtualizado: number;
  rendimento: number;
  rentabilidade: number;
}

export interface FimFiaData {
  resumo: FimFiaResumo;
  secoes: FimFiaSecao[];
  totalGeral: {
    valorAplicado: number;
    aporte: number;
    resgate: number;
    valorAtualizado: number;
    percentualCarteira: number;
    risco: number;
    objetivo: number;
    quantoFalta: number;
    necessidadeAporte: number;
    rentabilidade: number;
  };
}
