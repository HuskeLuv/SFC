// Tipos para Renda Fixa & Fundos

export type TipoRendaFixa = 'pos-fixada' | 'prefixada' | 'hibrida';

export interface RendaFixaAtivo {
  id: string;
  nome: string;
  percentualRentabilidade: number;
  cotizacaoResgate: string; // Ex: "D+0", "D+1", "D+30"
  liquidacaoResgate: string; // Ex: "D+0", "D+1"
  vencimento: Date;
  benchmark: string; // Ex: "CDI", "IPCA + Spread"
  valorInicialAplicado: number;
  aporte: number;
  resgate: number;
  valorAtualizado: number;
  percentualCarteira: number;
  riscoPorAtivo: number;
  rentabilidade: number;
  observacoes?: string;
  tipo: TipoRendaFixa;
}

export interface RendaFixaSecao {
  tipo: TipoRendaFixa;
  nome: string;
  ativos: RendaFixaAtivo[];
  totalValorAplicado: number;
  totalAporte: number;
  totalResgate: number;
  totalValorAtualizado: number;
  percentualTotal: number;
  rentabilidadeMedia: number;
}

export interface RendaFixaResumo {
  necessidadeAporte: number;
  caixaParaInvestir: number;
  saldoInicioMes: number;
  saldoAtual: number;
  rendimento: number;
  rentabilidade: number;
}

export interface RendaFixaData {
  resumo: RendaFixaResumo;
  secoes: RendaFixaSecao[];
  totalGeral: {
    valorAplicado: number;
    aporte: number;
    resgate: number;
    valorAtualizado: number;
    rentabilidade: number;
  };
}
