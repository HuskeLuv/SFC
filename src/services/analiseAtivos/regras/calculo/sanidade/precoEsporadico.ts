/**
 * R4 — cotação esporádica (grupo preco_esporadico; escopo TICKER; valor com selo). Função pura.
 * Limiares: ScoringParams.sanidade.conferencia.esporadico.
 *
 * Só olha ticker com < `pregoesMin` pregões com negócio nos últimos `janelaPregoes` (21). Bloqueia
 * (C_div e C_preço em conferência) quando há um 2º sinal:
 *  - faixa_pvp: P/VP fora da faixa da classe (FII [0,25; 1,6]; ação [0,1; 15]); o piso de FII baixou
 *    de 0,5 para 0,25 porque há FIIs líquidos com P/VP 0,30–0,49 (KNRE11, RECT11, CBOP11);
 *  - desvio_mediana (só FII): |último fechamento ÷ mediana dos `medianaPregoes` pregões com negócio
 *    anteriores − 1| > `desvioMediana60` E o mesmo desvio medido em P/VP (fechamento ÷ VP/cota do
 *    informe mensal do mês do pregão, ou o anterior mais recente) também passa do limite. Num FII
 *    ilíquido 60 pregões com negócio cobrem quase um ano, e uma reprecificação REAL que acompanhou o
 *    VP (RBLG11: VP/cota 66 → 33 em abr/26; BICE11, GCOI11) disparava pelo preço cru — o P/VP
 *    coerente mostra que o preço é plausível. Sem VP/cota para algum pregão da régua, vale só o
 *    preço (comportamento anterior).
 * Sem 2º sinal: só 'info:cotacao_esporadica' (selo informativo, decisão 5). Chave = data do último
 * pregão. CGAS3 (P/VP 10,4) está dentro da faixa de ações e não marca; INHF11 (P/VP 1,08) só selo.
 */
import { mediana } from './historicoEscala';
import type { PregaoSerie } from './precoBase';
import type { CfgConferencia, DeteccaoConf, DeteccaoInfo } from './aplicarConferencia';
import type { Valor } from '@/services/analiseAtivos/tipos';

/** VP/cota de um informe mensal (refMonth 'AAAA-MM-01'). */
export interface VpMes {
  refMonth: string;
  vpCota: number | null;
}

export interface EntradaPrecoEsporadico {
  classe: 'acao' | 'fii';
  pregoesComNegocio21: number;
  ultimoPregao: string;
  pvp: Valor<number> | undefined;
  /** série recente (pregões com e sem negócio); só a FII usa (mediana) */
  serie: readonly PregaoSerie[];
  /** FII: VP/cota dos informes mensais — a mediana passa a ser de P/VP */
  vps?: readonly VpMes[];
}

/** Pregões com negócio usados como régua da mediana abaixo deste número não dão sinal. */
const MIN_PREGOES_MEDIANA = 5;

/** VP/cota do mês do pregão ou do informe anterior mais recente; null sem informe até lá. */
function vpNaData(vps: readonly VpMes[], data: string): number | null {
  const mes = `${data.slice(0, 7)}-01`;
  let melhor: VpMes | null = null;
  for (const v of vps) {
    if (!(typeof v.vpCota === 'number' && v.vpCota > 0) || v.refMonth.slice(0, 10) > mes) continue;
    if (!melhor || v.refMonth > melhor.refMonth) melhor = v;
  }
  return melhor ? (melhor.vpCota as number) : null;
}

export function desvioDaMediana(
  serie: readonly PregaoSerie[],
  n: number,
  vps?: readonly VpMes[],
): number | null {
  const s = serie
    .filter((p) => p.negocios > 0 && p.closeRaw > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (s.length < MIN_PREGOES_MEDIANA + 1) return null;
  const regua = s.slice(Math.max(0, s.length - 1 - n));
  // P/VP de cada pregão quando há VP para todos; senão, o preço cru
  const porVp = vps && vps.length > 0 ? regua.map((p) => vpNaData(vps, p.date)) : null;
  const valores =
    porVp && porVp.every((v) => v !== null)
      ? regua.map((p, i) => p.closeRaw / (porVp[i] as number))
      : regua.map((p) => p.closeRaw);
  const ultimo = valores[valores.length - 1];
  const m = mediana(valores.slice(0, -1));
  return m && m > 0 ? ultimo / m - 1 : null;
}

export function detectarPrecoEsporadico(
  e: EntradaPrecoEsporadico,
  cfg: CfgConferencia['esporadico'],
): DeteccaoConf | DeteccaoInfo | null {
  if (e.pregoesComNegocio21 >= cfg.pregoesMin) return null;
  const base = {
    tipo: 'conf' as const,
    grupo: 'preco_esporadico' as const,
    chave: e.ultimoPregao,
  };
  const [min, max] = e.classe === 'fii' ? cfg.faixaPvpFii : cfg.faixaPvpAcao;
  if (e.pvp?.estado === 'ok' && e.pvp.valor > 0 && (e.pvp.valor < min || e.pvp.valor > max)) {
    return { ...base, regra: 'faixa_pvp', valor: e.pvp.valor };
  }
  if (e.classe === 'fii') {
    const d = desvioDaMediana(e.serie, cfg.medianaPregoes);
    // desvio explicado pelo VP (P/VP perto da mediana) não é sinal de cotação errada
    const dPvp = e.vps?.length ? desvioDaMediana(e.serie, cfg.medianaPregoes, e.vps) : d;
    if (
      d !== null &&
      Math.abs(d) > cfg.desvioMediana60 &&
      (dPvp === null || Math.abs(dPvp) > cfg.desvioMediana60)
    ) {
      return { ...base, regra: 'desvio_mediana', valor: d };
    }
  }
  return { tipo: 'info', codigo: 'cotacao_esporadica' };
}
