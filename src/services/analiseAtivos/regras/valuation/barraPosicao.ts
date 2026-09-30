/**
 * Barra de posição de um múltiplo nos últimos 10 anos (spec §4.5 + regra 7 do relatório da Fase A).
 *
 * - Variação de múltiplos: (v − média) ÷ |média| — nunca v/média − 1, que inverte o sinal quando a
 *   média é negativa (Net debt/EBITDA −0,25 contra média −0,908 é "+72%", acima da média).
 * - |média| ≤ 0,5 (ex.: dívida líquida negativa): só "acima/abaixo" (na média se |Δ| < 0,05).
 * - Percentuais (margens, ROE, DY): diferença em pontos percentuais.
 * - |variação| < 3% ou < 0,15 p.p. ⇒ "na média"; igual ao máximo/mínimo ⇒ extremo "maior/menor".
 * - Menos de 5 pontos ⇒ barra oculta (só o valor). Com `excluirNaoPositivos` (P/L, P/VP…), anos ≤ 0
 *   saem de mín/média/máx e não contam para o mínimo de pontos.
 * Os números saem crus (a exibição arredonda); o status já vem arredondado nas casas da spec.
 */
import { arredondar } from '@/services/analiseAtivos/regras/valuation/arredondamento';
import type { ScoringParams } from '@/services/analiseAtivos/tipos';

export type StatusBarra = (
  | { tipo: 'variacao_pct'; valor: number }
  | { tipo: 'variacao_pp'; valor: number }
  | { tipo: 'acima' | 'abaixo' }
  | { tipo: 'na_media' }
) & { extremo?: 'maior' | 'menor' };

export interface BarraPosicao {
  visivel: boolean;
  min?: number;
  media?: number;
  max?: number;
  nPontos: number;
  /** null quando a barra está oculta ou o valor atual não é comparável (≤ 0 com exclusão). */
  status: StatusBarra | null;
}

export function barraPosicao(
  atual: number,
  historico: number[],
  tipo: 'multiplo' | 'percentual',
  p: ScoringParams,
  opts?: { excluirNaoPositivos?: boolean },
): BarraPosicao {
  const cfg = p.valuation.barra;
  const arr = p.valuation.arredondamento;
  const pontos = historico.filter(
    (h) => Number.isFinite(h) && (!opts?.excluirNaoPositivos || h > 0),
  );
  const nPontos = pontos.length;
  if (nPontos < cfg.minPontos) return { visivel: false, nPontos, status: null };

  const min = Math.min(...pontos);
  const max = Math.max(...pontos);
  const media = pontos.reduce((a, b) => a + b, 0) / nPontos;
  const base = { visivel: true, min, media, max, nPontos };

  if (!Number.isFinite(atual) || (opts?.excluirNaoPositivos && atual <= 0)) {
    return { ...base, status: null };
  }

  let status: StatusBarra;
  if (tipo === 'percentual') {
    const pp = atual - media;
    status =
      Math.abs(pp) < cfg.naMediaPp
        ? { tipo: 'na_media' }
        : { tipo: 'variacao_pp', valor: arredondar(pp, arr.barraPp) };
  } else if (Math.abs(media) <= cfg.mediaPertoDeZeroAbs) {
    const d = atual - media;
    status =
      Math.abs(d) < cfg.naMediaPertoDeZeroAbs
        ? { tipo: 'na_media' }
        : { tipo: d > 0 ? 'acima' : 'abaixo' };
  } else {
    const variacao = ((atual - media) / Math.abs(media)) * 100;
    status =
      Math.abs(variacao) < cfg.naMediaPct
        ? { tipo: 'na_media' }
        : { tipo: 'variacao_pct', valor: arredondar(variacao, arr.barraPct) };
  }

  if (atual >= max) status.extremo = 'maior';
  else if (atual <= min) status.extremo = 'menor';
  return { ...base, status };
}
