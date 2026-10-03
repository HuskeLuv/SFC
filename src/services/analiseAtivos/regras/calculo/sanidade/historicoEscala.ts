/**
 * R2 — ponto histórico em escala errada (grupo historico; escopo empresa; ocultar o ponto).
 * Função pura. Limiares: ScoringParams.sanidade.conferencia.historicoRazao (20) e
 * historicoMinMultiplos (2).
 *
 * Um ano fiscal é marcado quando ≥ historicoMinMultiplos de {P/L, P/VP, P/Receita} estão a
 * ≥ historicoRazao× (ou ≤ 1/historicoRazao) da MEDIANA do próprio ativo (só valores > 0). Um múltiplo
 * sozinho fora não marca (MGEL4, ECOR3: PL minúsculo é real). Efeito (regras_sanidade R2): o ponto
 * sai da média de 10 anos e da barra (C_preço recalculado; < mínimo de pontos ⇒ historico_curto) —
 * nunca troca o componente por "em conferência". Chave = ano fiscal (liberação por ano).
 * Exemplos do DEV: POMO3/4 e EALT3/4 2015–19, SMTO3 2015–17, CBAV3 2022, LAND3 2021.
 */
import type { CfgConferencia, DeteccaoConf } from './aplicarConferencia';

export interface PontoHistorico {
  anoFiscal: number;
  pl: number | null;
  pvp: number | null;
  pReceita: number | null;
}

const MULTIPLOS = ['pl', 'pvp', 'pReceita'] as const;
/** mediana com menos pontos que isto não serve de régua */
const MIN_PONTOS_MEDIANA = 3;

export function mediana(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Anos fora de escala (detecções 'conf:historico:escala_ano@<ano>'), em ordem crescente. */
export function detectarHistoricoEscala(
  pontos: readonly PontoHistorico[],
  cfg: Pick<CfgConferencia, 'historicoRazao' | 'historicoMinMultiplos'>,
): DeteccaoConf[] {
  const medianas: Partial<Record<(typeof MULTIPLOS)[number], number>> = {};
  for (const k of MULTIPLOS) {
    const vals = pontos.map((p) => p[k]).filter((x): x is number => typeof x === 'number' && x > 0);
    if (vals.length < MIN_PONTOS_MEDIANA) continue;
    const m = mediana(vals);
    if (m !== null && m > 0) medianas[k] = m;
  }
  const out: DeteccaoConf[] = [];
  for (const p of [...pontos].sort((a, b) => a.anoFiscal - b.anoFiscal)) {
    let fora = 0;
    let maior = 1;
    for (const k of MULTIPLOS) {
      const v = p[k];
      const m = medianas[k];
      if (typeof v !== 'number' || !(v > 0) || m === undefined) continue;
      const r = v / m;
      if (r >= cfg.historicoRazao || r <= 1 / cfg.historicoRazao) {
        fora++;
        maior = Math.max(maior, r >= 1 ? r : 1 / r);
      }
    }
    if (fora >= cfg.historicoMinMultiplos) {
      out.push({
        tipo: 'conf',
        grupo: 'historico',
        regra: 'escala_ano',
        chave: String(p.anoFiscal),
        valor: maior,
      });
    }
  }
  return out;
}
