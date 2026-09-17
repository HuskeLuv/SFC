import prisma from '@/lib/prisma';
import { deleteTtlCacheKeyPrefix } from '@/lib/simpleTtlCache';
import { round2 } from '@/utils/alocacaoPercents';

/**
 * Caixa para Investir — modelo "bolso total com reservas por aba" (decisão de
 * produto 17/09/2026):
 *
 *   - `caixa_para_investir_consolidado` é o BOLSO TOTAL (todo o dinheiro parado
 *     esperando investimento);
 *   - cada `caixa_para_investir_<aba>` é uma RESERVA dentro desse bolso
 *     (dinheiro já destinado àquela classe);
 *   - LIVRE = total − Σ reservas.
 *
 * Invariante: Σ reservas ≤ total. É garantida na ESCRITA (salvarCaixa*); a
 * LEITURA é defensiva (dado legado ou undo podem deixar Σ reservas > total):
 * `bolso` = max(total, reservado) é o número que entra nos totais do
 * patrimônio, contado UMA vez.
 *
 * Não interage com o Fluxo de Caixa — abastecer ou gastar o caixa não gera
 * linha de Aporte/Resgate.
 */
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

type CaixaDb = Pick<typeof prisma, 'dashboardData'>;

export async function loadCaixaResumo(userId: string, db: CaixaDb = prisma): Promise<CaixaResumo> {
  const rows = await db.dashboardData.findMany({
    where: { userId, metric: { in: [...CAIXA_METRICS] } },
    select: { metric: true, value: true },
  });
  return computeCaixaResumo(rows);
}

/** Grava a métrica e devolve o valor anterior — `null` quando a row não existia (locator do undo). */
async function upsertMetric(
  db: CaixaDb,
  userId: string,
  metric: string,
  value: number,
): Promise<number | null> {
  const existing = await db.dashboardData.findFirst({ where: { userId, metric } });
  if (existing) {
    // Lê o anterior ANTES de gravar: é o número que o Desfazer restaura.
    const anterior = existing.value ?? 0;
    await db.dashboardData.update({ where: { id: existing.id }, data: { value } });
    return anterior;
  }
  await db.dashboardData.create({ data: { userId, metric, value } });
  return null;
}

export type SalvarCaixaErro =
  | {
      ok: false;
      code: 'RESERVA_EXCEDE_TOTAL';
      /** Bolso total atual. */
      total: number;
      /** Σ das reservas das OUTRAS abas. */
      reservadoOutrasAbas: number;
      /** Máximo que esta aba pode reservar sem mexer no total. */
      maximoAba: number;
      /** Total necessário para caber a reserva pedida. */
      totalNecessario: number;
    }
  | {
      ok: false;
      code: 'TOTAL_ABAIXO_DAS_RESERVAS';
      reservado: number;
    };

export type SalvarCaixaAbaOk = {
  ok: true;
  /** `null` = a métrica ainda não existia. */
  valorAnterior: number | null;
  /** Preenchido quando `ajustarTotal` subiu o bolso total junto. */
  totalAjustado?: { anterior: number | null; novo: number };
};

/**
 * Grava a reserva de uma aba. Se a nova Σ reservas passar do bolso total:
 * devolve RESERVA_EXCEDE_TOTAL — ou, com `ajustarTotal`, sobe o total até caber.
 */
export async function salvarCaixaAba(
  userId: string,
  aba: CaixaAbaKey,
  valor: number,
  opts: { ajustarTotal?: boolean } = {},
): Promise<SalvarCaixaAbaOk | SalvarCaixaErro> {
  const result = await prisma.$transaction(async (tx) => {
    const atual = await loadCaixaResumo(userId, tx);
    const valorAnterior = atual.porAba[aba];
    const reservadoOutrasAbas = round2(atual.reservado - valorAnterior);
    const totalNecessario = round2(reservadoOutrasAbas + valor);

    // Reduzir a reserva nunca quebra a invariante — sempre permitido, mesmo
    // com dado legado inconsistente (é justamente o caminho pra consertar).
    const excede = valor > valorAnterior && totalNecessario > atual.total;
    if (excede && !opts.ajustarTotal) {
      return {
        ok: false as const,
        code: 'RESERVA_EXCEDE_TOTAL' as const,
        total: atual.total,
        reservadoOutrasAbas,
        maximoAba: round2(Math.max(0, atual.total - reservadoOutrasAbas)),
        totalNecessario,
      };
    }

    const anterior = await upsertMetric(tx, userId, CAIXA_ABAS[aba].metric, valor);
    if (excede) {
      const totalAnterior = await upsertMetric(
        tx,
        userId,
        CAIXA_CONSOLIDADO_METRIC,
        totalNecessario,
      );
      return {
        ok: true as const,
        valorAnterior: anterior,
        totalAjustado: { anterior: totalAnterior, novo: totalNecessario },
      };
    }
    return { ok: true as const, valorAnterior: anterior };
  });

  if (result.ok) invalidateCaixaCaches(userId);
  return result;
}

/** Grava o bolso total. Não pode ficar abaixo do que já está reservado nas abas. */
export async function salvarCaixaTotal(
  userId: string,
  valor: number,
): Promise<{ ok: true; valorAnterior: number | null } | SalvarCaixaErro> {
  const result = await prisma.$transaction(async (tx) => {
    const atual = await loadCaixaResumo(userId, tx);
    if (valor < atual.reservado && valor < atual.total) {
      return {
        ok: false as const,
        code: 'TOTAL_ABAIXO_DAS_RESERVAS' as const,
        reservado: atual.reservado,
      };
    }
    const anterior = await upsertMetric(tx, userId, CAIXA_CONSOLIDADO_METRIC, valor);
    return { ok: true as const, valorAnterior: anterior };
  });

  if (result.ok) invalidateCaixaCaches(userId);
  return result;
}

/** O resumo da carteira é cacheado (TTL) e embute os números do caixa. */
export function invalidateCaixaCaches(userId: string): void {
  deleteTtlCacheKeyPrefix('carteiraResumo', `${userId}:`);
}
