// Tipos para FIIs (Fundos Imobiliários)

export type TipoFii = 'fofi' | 'tvm' | 'tijolo' | 'fof' | 'ijol' | 'hibrido' | 'renda' | 'outros'; // Mantém tipos antigos para compatibilidade

export type SegmentoFii = 'logistica' | 'shoppings' | 'residencial' | 'hibrido' | 'escritorios' | 'outros';

export interface FiiAtivo {
  id: string;
  ticker: string; // Ex: "HGLG11", "BCFF11"
  nome: string; // Nome completo do FII
  mandato: string; // Ex: "Tático", "Estratégico", "Especulativo"
  segmento: SegmentoFii;
  quantidade: number; // Número de cotas
  precoAquisicao: number; // Preço de aquisição ou preço médio
  valorTotal: number; // Calculado = quantidade * precoAquisicao
  cotacaoAtual: number; // Cotação em tempo real
  valorAtualizado: number; // Calculado = quantidade * cotacaoAtual
  riscoPorAtivo: number; // Calculado em % do total da carteira de FIIs
  percentualCarteira: number; // Calculado em % da carteira total
  objetivo: number; // Percentual desejado definido pelo usuário
  quantoFalta: number; // Calculado = objetivo% - percentual atual
  necessidadeAporte: number; // Calculado em R$ para atingir o objetivo
  rentabilidade: number; // Calculada automaticamente em %
  tipo: TipoFii;
  observacoes?: string;
  dataUltimaAtualizacao?: Date;
}

export interface FiiSecao {
  tipo: TipoFii;
  nome: string;
  ativos: FiiAtivo[];
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

export interface FiiResumo {
  necessidadeAporteTotal: number;
  caixaParaInvestir: number;
  saldoInicioMes: number;
  rendimento: number;
  rentabilidade: number;
}

export interface FiiAlocacaoSegmento {
  segmento: string;
  valor: number;
  percentual: number;
  cor: string;
}

export interface FiiAlocacaoAtivo {
  ticker: string;
  valor: number;
  percentual: number;
  cor: string;
}

export interface FiiTabelaAuxiliar {
  ticker: string;
  nome: string;
  cotacaoAtual: number;
  necessidadeAporte: number;
  loteAproximado: number; // Quantidade de cotas necessárias
}

export interface FiiData {
  resumo: FiiResumo;
  secoes: FiiSecao[];
  alocacaoSegmento: FiiAlocacaoSegmento[];
  alocacaoAtivo: FiiAlocacaoAtivo[];
  tabelaAuxiliar: FiiTabelaAuxiliar[];
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
