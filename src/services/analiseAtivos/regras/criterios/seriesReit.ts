/**
 * Séries anuais de REITs (EUA) para os critérios substitutos — fatia B da feature Stocks e REITs
 * (desenho final.criterios; decisão do Wellington de 17/10: Stocks e REITs juntos, n de 6, ocupação
 * inativa sem dado). Mesma leitura FY da SEC de seriesStock (lerBrutosSec, fysSecPorAno):
 *  - revenue: receita (> 0), US$ mi — a fatia A já inclui RealEstateRevenueNet → lease revenue;
 *  - dividend_per_share (US$/ação): DPA gravado pela fatia A (CashPaid → Declared → derivado, com a
 *    sanidade do Declared). Sem DPA, dividendos pagos ÷ média diluída (o mesmo derivado);
 *  - ocf_per_share (US$/ação): FCO ÷ média de ações diluídas (no lugar do FFO/ação, que não está no
 *    XBRL; o tooltip diz que difere do FFO do relatório);
 *  - net_debt_ebitda: a MESMA dívida líquida e o MESMO EBITDA em 3 degraus das stocks (não é o
 *    EBITDAre do 10-K);
 *  - cash_payout_pct: dividendos pagos ÷ FCO × 100 (no lugar do payout sobre o AFFO). Dividendos
 *    pagos ausentes = DPA × média diluída (SPG/PSA). FCO ≤ 0 = +Infinity (fora do limite; o job
 *    troca o fato para 'caixa operacional ≤ 0 em AAAA');
 *  - occupancy: NÃO existe no companyfacts → nenhum ponto (o critério 'ocup' é inativo na v3).
 * Pura.
 */
import {
  dividaLiquidaSec,
  dlEbitdaSec,
  ebitdaSec,
  emMi,
  fysSecPorAno,
  type BrutoSec,
  type FySec,
  type SeriesCriteriosEua,
} from '@/services/analiseAtivos/regras/criterios/seriesStock';

export type SerieReit =
  | 'revenue'
  | 'dividend_per_share'
  | 'ocf_per_share'
  | 'net_debt_ebitda'
  | 'cash_payout_pct';

export const SERIES_REIT: readonly SerieReit[] = [
  'revenue',
  'dividend_per_share',
  'ocf_per_share',
  'net_debt_ebitda',
  'cash_payout_pct',
];

const finito = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const acoesValidas = (f: Pick<FySec, 'acoesMediaDiluida'>): number | null =>
  finito(f.acoesMediaDiluida) && f.acoesMediaDiluida > 0 ? f.acoesMediaDiluida : null;

/** Dividendo por ação (US$): o gravado; sem ele, dividendos pagos ÷ média diluída. */
export function dpaSec(
  f: Pick<FySec, 'dpa' | 'dividendosJcpPagos' | 'acoesMediaDiluida'>,
): number | null {
  if (finito(f.dpa)) return f.dpa;
  const acoes = acoesValidas(f);
  return acoes !== null && finito(f.dividendosJcpPagos) ? f.dividendosJcpPagos / acoes : null;
}

/** Dividendos pagos (US$): os do fluxo de caixa; sem eles, DPA × média diluída. */
export function dividendosPagosSec(
  f: Pick<FySec, 'dpa' | 'dividendosJcpPagos' | 'acoesMediaDiluida'>,
): number | null {
  if (finito(f.dividendosJcpPagos)) return f.dividendosJcpPagos;
  const acoes = acoesValidas(f);
  return acoes !== null && finito(f.dpa) ? f.dpa * acoes : null;
}

/** FCO ÷ média diluída (US$/ação). */
export function fcoPorAcaoSec(f: Pick<FySec, 'fco' | 'acoesMediaDiluida'>): number | null {
  const acoes = acoesValidas(f);
  return acoes !== null && finito(f.fco) ? f.fco / acoes : null;
}

/** Dividendos ÷ FCO × 100; FCO ≤ 0 com dividendos conhecidos = +Infinity. */
export function dividendosFcoPctSec(
  f: Pick<FySec, 'fco' | 'dpa' | 'dividendosJcpPagos' | 'acoesMediaDiluida'>,
): number | null {
  const div = dividendosPagosSec(f);
  if (div === null || !finito(f.fco)) return null;
  return f.fco > 0 ? (div / f.fco) * 100 : Number.POSITIVE_INFINITY;
}

/** Valores de um FY de REIT (US$ mi, US$/ação, ×, %). Pura. */
export function valoresAnoReit(f: FySec): Record<SerieReit, number | null> {
  const receita = finito(f.receita) && f.receita > 0 ? f.receita : null;
  return {
    revenue: emMi(receita),
    dividend_per_share: dpaSec(f),
    ocf_per_share: fcoPorAcaoSec(f),
    net_debt_ebitda: dlEbitdaSec(dividaLiquidaSec(f), ebitdaSec(f)),
    cash_payout_pct: dividendosFcoPctSec(f),
  };
}

/** Séries anuais de um REIT (occupancy fica de fora: sem fonte). Pura. */
export function seriesReit(b: BrutoSec): SeriesCriteriosEua {
  const out: Record<SerieReit, Record<number, number | null>> = {
    revenue: {},
    dividend_per_share: {},
    ocf_per_share: {},
    net_debt_ebitda: {},
    cash_payout_pct: {},
  };
  for (const [ano, f] of fysSecPorAno(b.fys)) {
    const v = valoresAnoReit(f);
    for (const k of SERIES_REIT) out[k][ano] = v[k];
  }
  return out;
}
