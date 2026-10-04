/**
 * R9 — divergência provedor × CVM/B3: SÓ caso de revisão (decisão 1; nada muda na tela nem no
 * Índice — COTAHIST e CVM já prevalecem no cálculo). Funções puras. Limiares em
 * ScoringParams.sanidade.conferencia.rev.
 *
 *  - rev:dpa_dmpl: no último ano fechado, o payout por ação (DPA do provedor × ações ÷ lucro) contra o
 *    payout da DMPL ≥ dpaDmplFator× (ou ≤ 1/×). Chave = ano.
 *  - rev:rend_fii_cvm: rendimento do FII no provedor × informe da CVM ≥ rendFiiCvmFator× (ou ≤ 1/×).
 *    Chave = mês.
 *  - rev:preco_brapi: cotação do provedor a > precoBrapiPct% da COTAHIST do mesmo dia E do pregão
 *    anterior (o provedor costuma publicar o D-1 como D). Chave = data.
 */
import type { CfgConferencia, DeteccaoRev } from './aplicarConferencia';

function foraDoFator(a: number, b: number, fator: number): number | null {
  if (!(a > 0) || !(b > 0)) return null;
  const r = a / b;
  return r >= fator || r <= 1 / fator ? r : null;
}

export interface AnoPayout {
  anoFiscal: number;
  payoutPorAcaoPct: number | null;
  payoutDmplPct: number | null;
}

/**
 * Só o ano fiscal ANTERIOR ao de hoje (o último fechado), com os dois payouts > 0 — sem cair para anos
 * mais antigos (um caso de revisão por ano antigo já conferido seria ruído; no DEV o recuo levava de
 * 16 para 26 tickers).
 */
export function revisaoDpaDmpl(
  porAno: readonly AnoPayout[],
  hoje: string,
  cfg: Pick<CfgConferencia['rev'], 'dpaDmplFator'>,
): DeteccaoRev | null {
  const anoFechado = Number(hoje.slice(0, 4)) - 1;
  const ultimo = porAno.find(
    (a) =>
      a.anoFiscal === anoFechado &&
      typeof a.payoutPorAcaoPct === 'number' &&
      typeof a.payoutDmplPct === 'number' &&
      a.payoutPorAcaoPct > 0 &&
      a.payoutDmplPct > 0,
  );
  if (!ultimo) return null;
  const r = foraDoFator(ultimo.payoutPorAcaoPct!, ultimo.payoutDmplPct!, cfg.dpaDmplFator);
  return r === null
    ? null
    : { tipo: 'rev', regra: 'dpa_dmpl', chave: String(ultimo.anoFiscal), valor: r };
}

export function revisaoRendFiiCvm(
  e: { rendProvedor: number | null; rendCvm: number | null; mes: string },
  cfg: Pick<CfgConferencia['rev'], 'rendFiiCvmFator'>,
): DeteccaoRev | null {
  if (typeof e.rendProvedor !== 'number' || typeof e.rendCvm !== 'number') return null;
  const r = foraDoFator(e.rendProvedor, e.rendCvm, cfg.rendFiiCvmFator);
  return r === null ? null : { tipo: 'rev', regra: 'rend_fii_cvm', chave: e.mes, valor: r };
}

export function revisaoPrecoBrapi(
  e: {
    data: string;
    precoProvedor: number | null;
    cotahistDia: number | null;
    cotahistAnterior: number | null;
  },
  cfg: Pick<CfgConferencia['rev'], 'precoBrapiPct'>,
): DeteccaoRev | null {
  const p = e.precoProvedor;
  if (typeof p !== 'number' || !(p > 0)) return null;
  const desvio = (c: number | null) =>
    typeof c === 'number' && c > 0 ? Math.abs(p / c - 1) * 100 : null;
  const d0 = desvio(e.cotahistDia);
  if (d0 === null || d0 <= cfg.precoBrapiPct) return null;
  const d1 = desvio(e.cotahistAnterior);
  // bate com o pregão anterior: é o D-1 publicado como D, não divergência
  if (d1 !== null && d1 <= cfg.precoBrapiPct) return null;
  return { tipo: 'rev', regra: 'preco_brapi', chave: e.data, valor: d0 };
}
