import { logger } from '@/lib/logger';
import { resolveProventoEvents, type ProventoEvent } from '@/services/portfolio/resolveProventos';
import { carregarSerieCambio, type SerieCambio } from '@/services/market/cambioUsdBrl';

export interface ProventosByDayResult {
  /** Proventos por dia (chave = dia normalizado UTC, valor = soma BRUTA do dia). */
  proventosByDay: Map<number, number>;
  /** Total bruto do período (inclui provisionados com data-com passada). */
  total: number;
  /** Eventos em US$ sem câmbio na data de pagamento — fora do map e do total. */
  semCambio: number;
}

/**
 * Valor bruto do evento em R$. Contrato de proventos (F0): `gross` vem NATIVO na `moeda`;
 * este é o ÚNICO ponto que converte para a série — US$ pela taxa da data de PAGAMENTO
 * (câmbio de mercado, série USD-BRL). Sem taxa = null (fora da soma).
 */
export const proventoBrutoEmReais = (
  e: Pick<ProventoEvent, 'moeda' | 'gross' | 'paymentDay'>,
  serieCambio: SerieCambio | null,
): number | null => {
  if (e.moeda !== 'USD') return e.gross;
  const fx = serieCambio?.(e.paymentDay) ?? null;
  return fx == null ? null : e.gross * fx;
};

/** Série USD-BRL só quando há provento em US$ (desde o 1º pagamento). Falha = null. */
const carregarCambioDosProventos = async (
  events: ReadonlyArray<Pick<ProventoEvent, 'moeda' | 'paymentDay'>>,
): Promise<SerieCambio | null> => {
  const dias = events.filter((e) => e.moeda === 'USD').map((e) => e.paymentDay);
  if (dias.length === 0) return null;
  try {
    return await carregarSerieCambio(new Date(Math.min(...dias)));
  } catch (error) {
    logger.warn('[proventosByDay] série USD-BRL indisponível; proventos em US$ fora da soma', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

/**
 * Carrega os proventos de um usuário agrupados pelo dia de PROVISIONAMENTO da
 * série (`e.bookingDay` = DATA-COM snapada pro pregão B3) e em valor BRUTO
 * (antes do IRRF de JCP).
 *
 * Usado para que a SÉRIE de rentabilidade (historicoTWR/MWR) e o card do resumo
 * sejam retorno TOTAL (capital + renda) na CONVENÇÃO GORILA — decisão de produto
 * de 31/08/2026 ("as rentabilidades devem bater com o Gorila"): provento bruto,
 * alocado na data-com, incluindo provisionados (data-com passada, pagamento
 * futuro). Antes (convenção Kinvo) usava líquido de IRRF creditado no pagamento.
 *
 * Consumidores de CAIXA REAL (dinheiro recebido de fato) NÃO devem usar este
 * módulo — devem ler os events de `resolveProventoEvents` filtrando
 * `paymentDay <= hoje` e somando `net`.
 *
 * A fonte é o HISTÓRICO GLOBAL (`resolveProventoEvents` → `asset_dividend_history`),
 * não a materialização por-usuário `PortfolioProvento`, para eliminar a janela em
 * que usuário novo via drawdown-fantasma antes da materialização rodar.
 *
 * Carteira EUA em US$: provento de ativo em dólar (moeda 'USD') entra em R$ pela taxa
 * da data de pagamento, uma vez só (`proventoBrutoEmReais`); sem taxa fica fora.
 */
export const loadProventosByDay = async (userId: string): Promise<ProventosByDayResult> => {
  const { events } = await resolveProventoEvents(userId);
  const serieCambio = await carregarCambioDosProventos(events);
  const proventosByDay = new Map<number, number>();
  let total = 0;
  let semCambio = 0;
  for (const e of events) {
    const bruto = proventoBrutoEmReais(e, serieCambio);
    if (bruto == null) {
      semCambio += 1;
      continue;
    }
    proventosByDay.set(e.bookingDay, (proventosByDay.get(e.bookingDay) ?? 0) + bruto);
    total += bruto;
  }
  if (semCambio > 0) {
    logger.warn(`[proventosByDay] ${semCambio} provento(s) em US$ sem câmbio: fora da soma`);
  }
  return { proventosByDay, total, semCambio };
};
