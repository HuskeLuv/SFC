/**
 * Caixa para Investir — parte PURA (sem banco), compartilhada entre servidor
 * e tela. Modelo "bolso total com reservas por aba" (decisão 17/09/2026):
 *
 *   - `caixa_para_investir_consolidado` é o BOLSO TOTAL;
 *   - cada `caixa_para_investir_<aba>` é uma RESERVA dentro do bolso;
 *   - LIVRE = total − Σ reservas.
 *
 * Não interage com o Fluxo de Caixa.
 */
import type { CategoriaCarteira } from '@/services/portfolio/itemValuation';

export const CAIXA_CONSOLIDADO_METRIC = 'caixa_para_investir_consolidado';

export const CAIXA_ABAS = {
  acoes: { metric: 'caixa_para_investir_acoes', label: 'Ações' },
  fii: { metric: 'caixa_para_investir_fii', label: 'FIIs' },
  etf: { metric: 'caixa_para_investir_etf', label: 'ETFs' },
  reit: { metric: 'caixa_para_investir_reit', label: 'REITs' },
  stocks: { metric: 'caixa_para_investir_stocks', label: 'Stocks' },
  moedasCriptos: { metric: 'caixa_para_investir_moedas_criptos', label: 'Moedas e Criptos' },
  previdenciaSeguros: {
    metric: 'caixa_para_investir_previdencia_seguros',
    label: 'Previdência e Seguros',
  },
  opcoes: { metric: 'caixa_para_investir_opcoes', label: 'Opções' },
  fimFia: { metric: 'caixa_para_investir_fim_fia', label: 'FIM/FIA' },
  rendaFixa: { metric: 'caixa_para_investir_renda_fixa', label: 'Renda Fixa' },
} as const;

export type CaixaAbaKey = keyof typeof CAIXA_ABAS;

export const CAIXA_ABA_KEYS = Object.keys(CAIXA_ABAS) as CaixaAbaKey[];

export const CAIXA_METRICS: readonly string[] = [
  CAIXA_CONSOLIDADO_METRIC,
  ...CAIXA_ABA_KEYS.map((key) => CAIXA_ABAS[key].metric),
];

const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface CaixaResumo {
  /** Bolso total informado pelo usuário (métrica consolidada). */
  total: number;
  /** Σ das reservas por aba. */
  reservado: number;
  /** total − reservado. Negativo só em dado inconsistente (legado/undo). */
  livre: number;
  /** Número que entra nos totais do patrimônio: max(total, reservado). */
  bolso: number;
  porAba: Record<CaixaAbaKey, number>;
}

type MetricRow = { metric: string; value: number | null };

export function computeCaixaResumo(rows: readonly MetricRow[]): CaixaResumo {
  const byMetric = new Map<string, number>();
  for (const row of rows) byMetric.set(row.metric, row.value || 0);

  const porAba = {} as Record<CaixaAbaKey, number>;
  let reservado = 0;
  for (const key of CAIXA_ABA_KEYS) {
    const valor = byMetric.get(CAIXA_ABAS[key].metric) ?? 0;
    porAba[key] = valor;
    reservado += valor;
  }
  const total = byMetric.get(CAIXA_CONSOLIDADO_METRIC) ?? 0;

  return {
    total: round2(total),
    reservado: round2(reservado),
    livre: round2(total - reservado),
    bolso: round2(Math.max(total, reservado)),
    porAba,
  };
}

/**
 * Categoria da carteira (itemValuation.categorizarAsset) → aba com reserva de
 * caixa. Reservas de emergência/oportunidade e imóveis/bens não têm reserva
 * própria: operações nelas só usam o caixa LIVRE.
 */
export const CATEGORIA_TO_CAIXA_ABA: Record<CategoriaCarteira, CaixaAbaKey | null> = {
  acoes: 'acoes',
  fiis: 'fii',
  etfs: 'etf',
  reits: 'reit',
  stocks: 'stocks',
  moedasCriptos: 'moedasCriptos',
  previdenciaSeguros: 'previdenciaSeguros',
  opcoes: 'opcoes',
  fimFia: 'fimFia',
  rendaFixaFundos: 'rendaFixa',
  reservaEmergencia: null,
  reservaOportunidade: null,
  imoveisBens: null,
};

export interface PlanoDebito {
  /** Quanto sai da reserva da aba. */
  daReserva: number;
  /** Quanto sai do caixa livre (depois de esgotar a reserva). */
  doLivre: number;
  /** daReserva + doLivre. */
  coberto: number;
  /** Parte do valor que o caixa não cobre (não é descontada de lugar nenhum). */
  faltou: number;
  /** Reserva da aba antes da operação (0 quando a operação não tem aba). */
  reservaAba: number;
  /** Caixa livre antes da operação (nunca negativo). */
  livre: number;
}

/**
 * Como um investimento de `valor` (R$) consome o caixa: primeiro a reserva da
 * própria aba, depois o caixa livre — nunca a reserva de OUTRA aba. O total
 * baixa em `coberto`, então a invariante Σ reservas ≤ total se mantém.
 */
export function planejarDebito(
  caixa: { total: number; porAba: Partial<Record<CaixaAbaKey, number>> },
  aba: CaixaAbaKey | null,
  valor: number,
): PlanoDebito {
  const reservado = CAIXA_ABA_KEYS.reduce((sum, key) => sum + (caixa.porAba[key] ?? 0), 0);
  const reservaAba = aba ? Math.max(0, caixa.porAba[aba] ?? 0) : 0;
  const livre = Math.max(0, round2(caixa.total - reservado));
  const alvo = Math.max(0, valor);

  const daReserva = round2(Math.min(alvo, reservaAba));
  const doLivre = round2(Math.min(alvo - daReserva, livre));
  const coberto = round2(daReserva + doLivre);

  return {
    daReserva,
    doLivre,
    coberto,
    faltou: round2(Math.max(0, alvo - coberto)),
    reservaAba,
    livre,
  };
}

/**
 * Movimento do caixa gravado junto da operação (snapshot do histórico) — o
 * Desfazer devolve exatamente estes valores.
 */
export interface MovimentoCaixa {
  aba: CaixaAbaKey | null;
  /** Valor da operação em R$ (o que se tentou debitar/creditar). */
  valorOperacao: number;
  debitoReserva: number;
  debitoLivre: number;
  /** Resgate: quanto voltou ao total como caixa livre. */
  credito: number;
  /**
   * Quanto o TOTAL mudou de fato (negativo no débito, positivo no crédito).
   * Difere de −(debitoReserva + debitoLivre) só em dado legado com total menor
   * que as reservas, onde o total não desce abaixo de zero.
   */
  deltaTotal: number;
}

/** A operação moveu algum dinheiro do caixa? */
export const movimentouCaixa = (m: MovimentoCaixa | null | undefined): m is MovimentoCaixa =>
  !!m && (m.debitoReserva > 0 || m.debitoLivre > 0 || m.credito > 0 || m.deltaTotal !== 0);
