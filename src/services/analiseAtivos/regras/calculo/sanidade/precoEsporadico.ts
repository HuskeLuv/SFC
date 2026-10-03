/**
 * R4 — cotação esporádica (grupo preco_esporadico; escopo TICKER; valor com selo). Função pura.
 * Limiares: ScoringParams.sanidade.conferencia.esporadico.
 *
 * Só olha ticker com < `pregoesMin` pregões com negócio nos últimos `janelaPregoes` (21). Bloqueia
 * (C_div e C_preço em conferência) quando há um 2º sinal:
 *  - faixa_pvp: P/VP fora da faixa da classe (FII [0,25; 1,6]; ação [0,1; 15]); o piso de FII baixou
 *    de 0,5 para 0,25 porque há FIIs líquidos com P/VP 0,30–0,49 (KNRE11, RECT11, CBOP11);
 *  - desvio_mediana (só FII): |último fechamento ÷ mediana dos `medianaPregoes` pregões com negócio
 *    anteriores − 1| > `desvioMediana60`.
 * Sem 2º sinal: só 'info:cotacao_esporadica' (selo informativo, decisão 5). Chave = data do último
 * pregão. CGAS3 (P/VP 10,4) está dentro da faixa de ações e não marca; INHF11 (P/VP 1,08) só selo.
 */
import { mediana } from './historicoEscala';
import type { PregaoSerie } from './precoBase';
import type { CfgConferencia, DeteccaoConf, DeteccaoInfo } from './aplicarConferencia';
import type { Valor } from '@/services/analiseAtivos/tipos';

export interface EntradaPrecoEsporadico {
  classe: 'acao' | 'fii';
  pregoesComNegocio21: number;
  ultimoPregao: string;
  pvp: Valor<number> | undefined;
  /** série recente (pregões com e sem negócio); só a FII usa (mediana) */
  serie: readonly PregaoSerie[];
}

/** Pregões com negócio usados como régua da mediana abaixo deste número não dão sinal. */
const MIN_PREGOES_MEDIANA = 5;

export function desvioDaMediana(serie: readonly PregaoSerie[], n: number): number | null {
  const s = serie
    .filter((p) => p.negocios > 0 && p.closeRaw > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (s.length < MIN_PREGOES_MEDIANA + 1) return null;
  const ultimo = s[s.length - 1];
  const anteriores = s.slice(Math.max(0, s.length - 1 - n), s.length - 1).map((p) => p.closeRaw);
  const m = mediana(anteriores);
  return m && m > 0 ? ultimo.closeRaw / m - 1 : null;
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
    if (d !== null && Math.abs(d) > cfg.desvioMediana60) {
      return { ...base, regra: 'desvio_mediana', valor: d };
    }
  }
  return { tipo: 'info', codigo: 'cotacao_esporadica' };
}
