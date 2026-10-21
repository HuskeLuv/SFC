/**
 * Indicadores de Stocks e REITs para o Quadro EUA (fatia B; desenho final.fatias[B]: "multiplosEua:
 * só fundamentos; os de preço só com AssetQuoteDailyUs + flag"). Puro.
 *
 * Do ÚLTIMO FY fechado da SEC (fysSecPorAno), na moeda do relatório (US$):
 *  - margemLiquidaPct = lucro ÷ receita × 100 (receita ≤ 0 = null);
 *  - roePct = lucro ÷ PL × 100 (PL ≤ 0 = null: ROE '—', regra do desenho);
 *  - divLiqEbitda = dívida líquida ÷ EBITDA calculado (EBITDA ≤ 0 = null; a coluna não guarda ∞);
 *  - divLiqPl = dívida líquida ÷ PL (PL ≤ 0 = null);
 *  - payoutPct = dividendos pagos ÷ lucro × 100 (lucro ≤ 0 = null);
 *  - dpa (US$/ação), fcoPorAcao (US$/ação), dividendosFcoPct (%; FCO ≤ 0 = null);
 *  - anosLucroConsecutivos / anosDividendo: anos fechados seguidos com lucro > 0 / DPA > 0, do
 *    último para trás;
 *  - serie10a: lucro líquido dos 10 últimos FY em US$ mi (contrato do Quadro EUA, analiseAtivosEua);
 *  - fundamentei-regras (F3, A2.d): fcoAjustadoPorAcao (US$/ação) e dividendosFcoAjustadoPct (%) do
 *    mesmo FY com o caixa operacional ajustado pela remuneração em ações (FCO − SBC; funções puras de
 *    seriesStock). SBC nula no FY = null (a leitura cai no não ajustado com a nota
 *    'sbc_indisponivel'); caixa ajustado ≤ 0 = null (a coluna não guarda ∞, como dividendosFcoPct).
 *    Nenhuma coluna antiga muda.
 * Preço (só com ANALISE_ATIVOS_EUA_PRECO_HABILITADO e fechamento em AssetQuoteDailyUs): pl = preço ÷
 * LPA (lucro ÷ média diluída; LPA ≤ 0 = null), pvp = preço ÷ (PL ÷ ações), dy12mPct = DPA ÷ preço ×
 * 100. Sem cotação (ou sem a chave), as três ficam null — a Análise EUA não exibe preço.
 */
import {
  dividaLiquidaSec,
  dividendosFcoAjustadoPctSec,
  ebitdaSec,
  emMi,
  fcoAjustadoPorAcaoSec,
  fysSecPorAno,
  lucroSec,
  type FySec,
} from '@/services/analiseAtivos/regras/criterios/seriesStock';
import {
  dividendosPagosSec,
  dpaSec,
  fcoPorAcaoSec,
} from '@/services/analiseAtivos/regras/criterios/seriesReit';
import type { PontoSerieAnual } from '@/types/analiseAtivosApi';

/** Anos da série de lucro do Quadro (serie10a). */
export const ANOS_SERIE_EUA = 10;

export interface MultiplosEua {
  /** ano fiscal do último FY usado (null = empresa sem FY) */
  anoFiscal: number | null;
  roePct: number | null;
  margemLiquidaPct: number | null;
  divLiqEbitda: number | null;
  divLiqPl: number | null;
  payoutPct: number | null;
  dpa: number | null;
  fcoPorAcao: number | null;
  dividendosFcoPct: number | null;
  /** F3: caixa operacional ajustado pela SBC ÷ média diluída (US$/ação); null sem SBC no FY */
  fcoAjustadoPorAcao: number | null;
  /** F3: dividendos ÷ caixa operacional ajustado (%); null sem SBC ou com o ajustado ≤ 0 */
  dividendosFcoAjustadoPct: number | null;
  anosLucroConsecutivos: number | null;
  anosDividendo: number | null;
  serie10a: PontoSerieAnual[];
  /** só com preço (chave EUA_PRECO + AssetQuoteDailyUs) */
  pl: number | null;
  pvp: number | null;
  dy12mPct: number | null;
}

const finito = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const arred = (v: number | null, casas = 4): number | null => {
  if (!finito(v)) return null;
  const f = 10 ** casas;
  return Math.round(v * f) / f;
};

const razao = (num: number | null, den: number | null, fator = 1): number | null =>
  finito(num) && finito(den) && den > 0 ? (num / den) * fator : null;

function seguidos(valores: ReadonlyArray<number | null>): number {
  let n = 0;
  for (let i = valores.length - 1; i >= 0; i--) {
    const v = valores[i];
    if (!finito(v) || !(v > 0)) break;
    n++;
  }
  return n;
}

/** Indicadores do Quadro EUA a partir dos FY da SEC (+ preço opcional). Pura. */
export function multiplosEua(fys: readonly FySec[], preco: number | null = null): MultiplosEua {
  const porAno = [...fysSecPorAno(fys).values()];
  const ult: FySec | undefined = porAno[porAno.length - 1];
  const vazio: MultiplosEua = {
    anoFiscal: null,
    roePct: null,
    margemLiquidaPct: null,
    divLiqEbitda: null,
    divLiqPl: null,
    payoutPct: null,
    dpa: null,
    fcoPorAcao: null,
    dividendosFcoPct: null,
    fcoAjustadoPorAcao: null,
    dividendosFcoAjustadoPct: null,
    anosLucroConsecutivos: null,
    anosDividendo: null,
    serie10a: [],
    pl: null,
    pvp: null,
    dy12mPct: null,
  };
  if (!ult) return vazio;

  const lucro = lucroSec(ult);
  const receita = finito(ult.receita) && ult.receita > 0 ? ult.receita : null;
  const pl = finito(ult.pl) ? ult.pl : null;
  const dl = dividaLiquidaSec(ult);
  const eb = ebitdaSec(ult);
  const dividendos = dividendosPagosSec(ult);
  const dpa = dpaSec(ult);
  const acoes =
    finito(ult.acoesMediaDiluida) && ult.acoesMediaDiluida > 0 ? ult.acoesMediaDiluida : null;

  const lucros = porAno.map((f) => lucroSec(f));
  const dpas = porAno.map((f) => dpaSec(f));
  const precoOk = finito(preco) && preco > 0 ? preco : null;
  const lpa = razao(lucro, acoes);
  const vpa = razao(pl, acoes);

  return {
    anoFiscal: ult.anoFiscal,
    roePct: arred(razao(lucro, pl, 100)),
    margemLiquidaPct: arred(razao(lucro, receita, 100)),
    divLiqEbitda: arred(razao(dl, eb)),
    divLiqPl: arred(razao(dl, pl)),
    payoutPct: arred(razao(dividendos, lucro, 100)),
    dpa: arred(dpa),
    fcoPorAcao: arred(fcoPorAcaoSec(ult)),
    dividendosFcoPct: arred(razao(dividendos, ult.fco, 100)),
    fcoAjustadoPorAcao: arred(fcoAjustadoPorAcaoSec(ult)),
    dividendosFcoAjustadoPct: arred(dividendosFcoAjustadoPctSec(ult, dividendos)),
    anosLucroConsecutivos: seguidos(lucros),
    anosDividendo: seguidos(dpas),
    serie10a: porAno.slice(-ANOS_SERIE_EUA).map((f) => ({
      ano: f.anoFiscal,
      valor: arred(emMi(lucroSec(f)), 2),
    })),
    pl: precoOk !== null && lpa !== null && lpa > 0 ? arred(precoOk / lpa) : null,
    pvp: precoOk !== null && vpa !== null && vpa > 0 ? arred(precoOk / vpa) : null,
    dy12mPct: precoOk !== null && finito(dpa) ? arred((dpa / precoOk) * 100) : null,
  };
}
