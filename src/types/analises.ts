/**
 * Tipos compartilhados por endpoints e componentes de /analises.
 */

export type SensibilidadeBucket = 'alta' | 'media' | 'baixa' | 'negativa';

export interface SensibilidadeCarteiraItem {
  ticker: string;
  nome: string;
  peso: number; // decimal (0.15 = 15%)
  correlacao: number; // Pearson, faixa [-1, 1]
  contribuicaoRisco: number; // MRC em decimal; soma ≈ 1 sobre ativos incluídos
  bucket: SensibilidadeBucket;
  mesesUsados: number;
}

export interface SensibilidadeCarteiraExcluido {
  ticker: string;
  nome: string;
  motivo: 'insuficiente-historico' | 'sem-preco';
  mesesDisponiveis: number;
}

export interface SensibilidadeCarteiraResponse {
  windowMonths: number; // janela solicitada (default 24)
  mesesUtilizados: number; // real n de meses da série da carteira após intersecção
  calculadoEm: string; // ISO
  carteira: {
    volatilidadeAnual: number; // em %
  };
  ativos: SensibilidadeCarteiraItem[];
  excluidos: SensibilidadeCarteiraExcluido[];
}
