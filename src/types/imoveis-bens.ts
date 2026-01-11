export interface ImovelBemAtivo {
  id: string;
  nome: string;
  cidade: string;
  mandato: string; // Período de mandato ou gestão
  quantidade: number;
  precoAquisicao: number;
  melhorias: number; // Valor investido em melhorias
  valorTotal: number; // Preço de aquisição + melhorias
  valorAtualizado: number;
  riscoPorAtivo: number;
  percentualCarteira: number;
  rentabilidade: number;
  observacoes?: string;
}

export interface ImovelBemResumo {
  valorTotalAquisicoes: number;
  valorTotalMelhorias: number;
  valorAtualizado: number;
  rendimento: number;
  rentabilidade: number;
}

export interface ImovelBemTotalGeral {
  quantidade: number;
  valorAplicado: number;
  valorAtualizado: number;
  risco: number;
  percentualCarteira?: number;
  rentabilidade: number;
}

export interface ImovelBemData {
  resumo: ImovelBemResumo;
  ativos: ImovelBemAtivo[];
  totalGeral: ImovelBemTotalGeral;
}

