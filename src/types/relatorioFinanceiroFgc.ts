/**
 * Cobertura do FGC na seção 4b do Relatório financeiro (plano Advanced). Mesma apuração de
 * Análises > Cobertura FGC (services/analises/coberturaFgc.ts): limite por banco emissor (raiz
 * do CNPJ) e teto global por CPF.
 */

/** Mesmos cortes da tela: < 80% dentro, 80% a < 100% atenção, ≥ 100% acima do limite. */
export type StatusEmissorFgc = 'dentro' | 'atencao' | 'acima';

export interface EmissorFgcRelatorio {
  /** Chave do grupo na tela (raiz do CNPJ do emissor, ou id da corretora no fallback). */
  chave: string;
  /** Banco emissor; sem emissor informado, a corretora (ou 'Emissor não identificado'). */
  nome: string;
  /** Soma dos investimentos protegidos pelo FGC neste emissor, em R$. */
  valorCoberto: number;
  /** Quantos investimentos protegidos somam o valor. */
  nTitulos: number;
  /** valorCoberto / limite por emissor, em %. */
  pctLimite: number;
  /** O que passa do limite por emissor, em R$ (0 quando dentro). */
  excedente: number;
  status: StatusEmissorFgc;
  /** O limite está vindo da corretora (emissor não informado em algum título). */
  usaCorretora: boolean;
}

/** Avisos que a tela já mostra, sem os botões de edição. */
export type AvisoFgcRelatorio =
  | {
      tipo: 'conglomerado';
      /** Bancos do mesmo conglomerado prudencial do Bacen. */
      nomes: string[];
      /** Soma do coberto nesses bancos, em R$. */
      total: number;
      /** O que passa de um limite só, em R$. */
      acima: number;
    }
  | {
      tipo: 'emissorPendente';
      /** Investimentos protegidos sem o banco emissor informado (o limite pode estar errado). */
      n: number;
    };

export interface BlocoFgcRelatorio {
  /** Limite por CPF por banco emissor (R$ 250 mil). */
  limitePorEmissor: number;
  /** Teto global por CPF (R$ 1 milhão, renovado a cada 4 anos). */
  tetoGlobal: number;
  /** Só os emissores com algum investimento protegido, do maior para o menor. */
  emissores: EmissorFgcRelatorio[];
  /** Efetivamente coberto: cada emissor até o limite, o total até o teto global, em R$. */
  totalCoberto: number;
  /** totalCoberto / tetoGlobal, em %. */
  pctTetoGlobal: number;
  /** Soma do que passa do limite em cada emissor, em R$. */
  totalExcedente: number;
  /** Renda fixa sem proteção do FGC (CRI, CRA, debêntures, LF…), em R$. Tesouro fica fora. */
  rendaFixaSemCobertura: number;
  avisos: AvisoFgcRelatorio[];
}
