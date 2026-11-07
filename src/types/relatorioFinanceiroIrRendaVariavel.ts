/**
 * Contrato da tabela "Imposto de renda: apuração mensal de renda variável" da seção 4b
 * (Advanced) do Relatório financeiro. A apuração é a MESMA da aba Análises > IR
 * (services/ir/rendaVariavelIR.ts): preço médio, isenção de R$ 20 mil em vendas de ações,
 * 15% em ações e ETFs, 20% em FIIs e prejuízo compensado por categoria.
 */

/** Situação do DARF do mês (código 6015, pessoa física, operações comuns). */
export type StatusDarfRelatorio =
  /** Imposto do mês (+ acumulado) ≥ R$ 10: DARF a pagar até o último dia útil do mês seguinte. */
  | 'pagar'
  /** Imposto abaixo de R$ 10: soma ao do mês seguinte. */
  | 'acumula'
  /** Nada a recolher no mês. */
  | 'sem';

export interface MesIrRendaVariavelRelatorio {
  /** 'YYYY-MM'. */
  mes: string;
  /** Vendas de ações no mês (receita líquida das taxas): a base da isenção de R$ 20 mil. */
  vendasAcoes: number;
  /** Vendas de ETFs de ações no mês (sem isenção; o IR entra com o das ações). */
  vendasEtf: number;
  /** Lucro de ações isento (vendas de ações até R$ 20 mil no mês). */
  isentoAcoes: boolean;
  /** Lucro (negativo = prejuízo) de ações + ETFs, antes de compensar meses anteriores. */
  lucroAcoes: number;
  /** Prejuízo de meses anteriores abatido do lucro de ações + ETFs neste mês. */
  prejuizoCompensadoAcoes: number;
  /** IR de ações + ETFs (15%). */
  irAcoes: number;
  /** Vendas de FIIs no mês (receita líquida das taxas). */
  vendasFii: number;
  /** Lucro (negativo = prejuízo) de FIIs, antes de compensar meses anteriores. */
  lucroFii: number;
  /** Prejuízo de FIIs de meses anteriores abatido neste mês. */
  prejuizoCompensadoFii: number;
  /** IR de FIIs (20%). */
  irFii: number;
  /** IR apurado no mês (irAcoes + irFii). */
  irMes: number;
  /** IR de meses anteriores abaixo de R$ 10 que soma no DARF deste mês. */
  acumuladoAnterior: number;
  darf: {
    status: StatusDarfRelatorio;
    /** 'pagar': valor do DARF; 'acumula': o que passa para o mês seguinte; 'sem': 0. */
    valor: number;
  };
}

export interface BlocoIrRendaVariavelRelatorio {
  /** Um item por mês do período, do mais antigo ao corrente (mês sem venda vem zerado). */
  meses: MesIrRendaVariavelRelatorio[];
}
