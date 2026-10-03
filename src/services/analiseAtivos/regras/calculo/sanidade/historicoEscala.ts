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
 *
 * Régua: a mediana da série só serve quando a MAIORIA dos anos está na escala certa. Quando a série
 * tem anos com P/VP ∈ (0; pvpMin) — o limite ABSOLUTO da R1, "nº de ações em outra escala" — e
 * também anos com P/VP ≥ pvpMin, a régua passa a ser a mediana só desses anos plausíveis (âncora
 * externa à contagem errada; basta 1 ano). Sem isso, numa série com a maior parte dos anos na escala
 * errada (CBAV3 2021/2024/2025, LAND3 2022–2025) a mediana vira a escala errada e a regra
 * esconderia justamente os anos certos.
 * Exemplos do DEV: POMO3/4 e EALT3/4 2015–19, SMTO3 2015–17, CBAV3 2021/2024/2025, LAND3 2022–25.
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
  cfg: Pick<CfgConferencia, 'historicoRazao' | 'historicoMinMultiplos' | 'pvpMin'>,
): DeteccaoConf[] {
  const positivo = (x: number | null): x is number => typeof x === 'number' && x > 0;
  const plausiveis = pontos.filter((p) => positivo(p.pvp) && p.pvp >= cfg.pvpMin);
  const temImplausivel = pontos.some((p) => positivo(p.pvp) && p.pvp < cfg.pvpMin);
  // âncora absoluta: anos com P/VP plausível (ver o cabeçalho); senão, a série inteira
  const ancorada = temImplausivel && plausiveis.length > 0;
  const regua = ancorada ? plausiveis : pontos;
  const minPontos = ancorada ? 1 : MIN_PONTOS_MEDIANA;
  const medianas: Partial<Record<(typeof MULTIPLOS)[number], number>> = {};
  for (const k of MULTIPLOS) {
    const vals = regua.map((p) => p[k]).filter(positivo);
    if (vals.length < minPontos) continue;
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
