/**
 * Eventos corporativos (splits/grupamentos/bonificações) como cidadãos de
 * primeira classe no cálculo de custo médio e na timeline de quantidade.
 *
 * Antes, o ajuste era feito gravando uma transação sintética com um DELTA
 * ABSOLUTO de quantidade (qty × (fator−1)) congelado no momento do cron. Isso
 * quebrava em qualquer edição posterior: editar a compra de 100→200 ações
 * deixava o delta velho (+100) defasado → 200+100=300 em vez de 400. Aqui o
 * fator é aplicado MULTIPLICATIVAMENTE durante o replay cronológico, então o
 * resultado é sempre coerente com as transações atuais.
 *
 * Tipos aplicados (factor é multiplicador da quantidade; custo total intacto →
 * preço médio se ajusta inversamente):
 *   - DESDOBRAMENTO (split): factor > 1
 *   - BONIFICACAO: factor > 1
 *   - GRUPAMENTO (reverse split): 0 < factor < 1
 *
 * Demais tipos (CIS RED CAP, INCORPORACAO, RESG TOTAL RV, REST CAP...) NÃO são
 * aplicados — o factor da BRAPI nesses casos nem sempre é multiplicador de
 * quantidade. Ficam de fora do replay (e logados pelo chamador, se quiser).
 *
 * Convenção de data: a data do evento é a data EX (a partir dela o papel já
 * negocia ajustado). Logo, o fator incide sobre o que era detido ANTES da
 * data ex; transações na própria data ex já estão em termos pós-evento. Por
 * isso, no replay, o evento é processado ANTES das transações do mesmo dia.
 */

/** Marcador no campo `notes` das linhas de auditoria de evento corporativo. */
export const CORPORATE_ACTION_NOTE_MARKER = '"corporateActionId"';

/** Tipos cujo `factor` é multiplicador simples de quantidade. */
export const APPLICABLE_CORPORATE_ACTION_TYPES = new Set([
  'DESDOBRAMENTO',
  'BONIFICACAO',
  'GRUPAMENTO',
]);

export interface CorporateActionFactor {
  id: string;
  date: Date;
  type: string;
  factor: number;
}

export interface TimelinePoint {
  date: number;
  quantity: number;
}

export interface PositionReplay {
  quantity: number;
  cost: number;
  timeline: TimelinePoint[];
}

/** True se a transação é uma linha de auditoria de evento corporativo. */
export const isCorporateActionAuditTx = (notes: string | null | undefined): boolean =>
  typeof notes === 'string' && notes.includes(CORPORATE_ACTION_NOTE_MARKER);

const isApplicable = (ca: { type: string; factor: number }): boolean =>
  APPLICABLE_CORPORATE_ACTION_TYPES.has(ca.type) && Number.isFinite(ca.factor) && ca.factor > 0;

type ReplayEvent =
  | { date: number; rank: 0; kind: 'ca'; factor: number }
  | { date: number; rank: 1; kind: 'tx'; type: string; quantity: number; value: number };

// rank 0 (ca) antes de rank 1 (tx) no mesmo dia — ver convenção de data acima.
const sortEvents = (a: ReplayEvent, b: ReplayEvent): number => a.date - b.date || a.rank - b.rank;

/**
 * Replay cronológico de custo médio ponderado considerando eventos
 * corporativos. Linhas de auditoria devem ser filtradas ANTES (o fator é
 * aplicado aqui, não o delta congelado).
 *
 * - compra: acumula qty + custo total
 * - venda: remove qty E o custo proporcional (qty × avg na venda)
 * - evento: qty × factor (custo intacto)
 */
export function replayPosition(
  transactions: Array<{ date: Date; type: string; quantity: number; price: number; total: number }>,
  corporateActions: Array<{ date: Date; type: string; factor: number }>,
): PositionReplay {
  const events: ReplayEvent[] = [];
  for (const ca of corporateActions) {
    if (!isApplicable(ca)) continue;
    events.push({ date: ca.date.getTime(), rank: 0, kind: 'ca', factor: ca.factor });
  }
  for (const tx of transactions) {
    const quantity = Number(tx.quantity);
    const price = Number(tx.price);
    const total = Number(tx.total);
    const value = total > 0 ? total : quantity * price;
    events.push({ date: tx.date.getTime(), rank: 1, kind: 'tx', type: tx.type, quantity, value });
  }
  events.sort(sortEvents);

  let quantity = 0;
  let cost = 0;
  const timeline: TimelinePoint[] = [];
  for (const ev of events) {
    if (ev.kind === 'ca') {
      quantity = quantity * ev.factor;
      // custo total permanece igual
    } else if (ev.type === 'compra') {
      quantity += ev.quantity;
      cost += ev.value;
    } else if (quantity > 0) {
      const avgAtSale = cost / quantity;
      const sellQty = Math.min(ev.quantity, quantity);
      cost -= avgAtSale * sellQty;
      quantity -= sellQty;
    }
    timeline.push({ date: ev.date, quantity: Math.max(quantity, 0) });
  }

  return { quantity, cost, timeline };
}

/**
 * Timeline de quantidade (sem custo) ciente de fator — usada pelo cálculo de
 * proventos pra saber quantos papéis o usuário detinha na data do provento.
 */
export function buildQuantityTimeline(
  transactions: Array<{ date: Date; type: string; quantity: number }>,
  corporateActions: Array<{ date: Date; type: string; factor: number }>,
): TimelinePoint[] {
  return replayPosition(
    transactions.map((t) => ({ ...t, price: 0, total: 0 })),
    corporateActions,
  ).timeline;
}

/** Busca binária: última quantidade conhecida em `dateMs` ou antes. */
export function quantityAtDate(timeline: TimelinePoint[], dateMs: number): number {
  if (timeline.length === 0) return 0;
  let left = 0;
  let right = timeline.length - 1;
  let result = 0;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (timeline[mid].date <= dateMs) {
      result = timeline[mid].quantity;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  return Math.max(result, 0);
}

/**
 * Para cada evento corporativo aplicável, calcula a quantidade antes/depois
 * (forward pass) — usado pra criar/atualizar a linha de auditoria visível no
 * histórico. Eventos anteriores à primeira compra (quantityBefore = 0) saem
 * com delta 0 e são ignorados pelo chamador.
 */
export function computeCorporateActionAudit(
  transactions: Array<{ date: Date; type: string; quantity: number }>,
  corporateActions: CorporateActionFactor[],
): Array<{
  id: string;
  date: Date;
  type: string;
  factor: number;
  quantityBefore: number;
  quantityAfter: number;
}> {
  type Ev =
    | { date: number; rank: 0; ca: CorporateActionFactor }
    | { date: number; rank: 1; type: string; quantity: number };
  const events: Ev[] = [];
  for (const ca of corporateActions) {
    if (!isApplicable(ca)) continue;
    events.push({ date: ca.date.getTime(), rank: 0, ca });
  }
  for (const tx of transactions) {
    events.push({ date: tx.date.getTime(), rank: 1, type: tx.type, quantity: Number(tx.quantity) });
  }
  events.sort((a, b) => a.date - b.date || a.rank - b.rank);

  let quantity = 0;
  const out: Array<{
    id: string;
    date: Date;
    type: string;
    factor: number;
    quantityBefore: number;
    quantityAfter: number;
  }> = [];
  for (const ev of events) {
    if (ev.rank === 0) {
      const before = quantity;
      quantity = quantity * ev.ca.factor;
      out.push({
        id: ev.ca.id,
        date: ev.ca.date,
        type: ev.ca.type,
        factor: ev.ca.factor,
        quantityBefore: before,
        quantityAfter: quantity,
      });
    } else {
      quantity += ev.type === 'compra' ? ev.quantity : -ev.quantity;
    }
  }
  return out;
}
