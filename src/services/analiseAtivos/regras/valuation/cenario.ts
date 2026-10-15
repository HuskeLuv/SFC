/**
 * Premissas de "Meus cenários" (spec §4.5): validação dos inputs e a parte pura do caso 22 da §4.6
 * (salvar/restaurar cenário). A persistência fica em analise_cenarios (Bloco D, fatia B:
 * cenarios/cenarioService.ts).
 *
 * Bloco D (fatia B): PremissasFii, P/L alvo explícito (pode ficar vazio: histórico curto),
 * validarPremissa também para plAlvo/pvpAlvo/rendaMensal (limites de LIMITES_CENARIO),
 * lerNumeroDigitado (o que o usuário digita no campo) e diffDadosEditados (salvar só os dados do
 * ativo que o usuário mudou).
 *
 * v2.4 (fatia C2, spec §4.4 — parecer de compliance de 10/10/2026: "os campos do simulador nunca
 * vêm pré-preenchidos com chutes da plataforma"): as premissas do usuário têm tipos PRÓPRIOS e
 * ANULÁVEIS (PremissasAcaoV2/PremissasFiiV2), desacoplados do ScoringParams. Abrem EM BRANCO
 * (premissasIniciais*): yield, g, k, P/VP alvo e renda = null; margem 0; o único pré-preenchido é o
 * P/L alvo, com a média de 10 anos do PRÓPRIO ativo (um fato). "Limpar minhas premissas" volta a
 * esse estado (limparPremissas) e apaga o registro salvo.
 */
import { LIMITES_CENARIO } from '@/services/analiseAtivos/cenarios/contrato';
import { arredondar } from '@/services/analiseAtivos/regras/valuation/arredondamento';
import type { LimitesValuation } from '@/services/analiseAtivos/regras/valuation/metodos';
import type { PremissasAcaoV2, PremissasFiiV2 } from '@/types/analiseAtivosCriterios';

export type Premissas = PremissasAcaoV2;
export type PremissasFii = PremissasFiiV2;

/** Ação: premissas em branco; P/L alvo = média 10a do ativo (fato) ou null; margem 0. */
export function premissasIniciaisAcao(plMedia10a: number | null): PremissasAcaoV2 {
  return {
    yieldPct: null,
    gPct: null,
    kPct: null,
    margemPct: 0,
    plAlvo: typeof plMedia10a === 'number' && Number.isFinite(plMedia10a) ? plMedia10a : null,
  };
}

/** FII: premissas em branco; margem 0. */
export function premissasIniciaisFii(): PremissasFiiV2 {
  return { yieldPct: null, pvpAlvo: null, rendaMensal: null, margemPct: 0 };
}
export type NomePremissa =
  | 'yieldPct'
  | 'gPct'
  | 'kPct'
  | 'margemPct'
  | 'plAlvo'
  | 'pvpAlvo'
  | 'rendaMensal';

/** Limites das premissas (LIMITES_CENARIO): yield, g, k, margem + P/L alvo, P/VP alvo e renda. */
export type LimitesPremissas = LimitesValuation &
  Partial<Record<'plAlvo' | 'pvpAlvo' | 'rendaMensal', readonly [number, number]>>;

const LIMITES_PREMISSAS_PADRAO: LimitesPremissas = {
  yieldPct: [...LIMITES_CENARIO.yieldPct],
  gPct: [...LIMITES_CENARIO.gPct],
  kPct: [...LIMITES_CENARIO.kPct],
  margemPct: [...LIMITES_CENARIO.margemPct],
  margemPasso: LIMITES_CENARIO.margemPasso,
  plAlvo: LIMITES_CENARIO.plAlvo,
  pvpAlvo: LIMITES_CENARIO.pvpAlvo,
  rendaMensal: LIMITES_CENARIO.rendaMensal,
};

/**
 * Número digitado num campo dos cenários. Aceita vírgula ou ponto como decimal ("6", "6,5",
 * "6.5", "−1,04"). Com vírgula, os pontos são separadores de milhar ("1.000,50"). Sem vírgula, o
 * ponto é decimal ("1.195" = 1,195), exceto com `milhar` (campo de reais inteiros, como a renda
 * mensal: "1.000" = 1000). Vazio ⇒ null; texto que não é número ⇒ NaN.
 */
export function lerNumeroDigitado(texto: string, opts: { milhar?: boolean } = {}): number | null {
  let t = texto
    .trim()
    .replace(/\s+/g, '')
    .replace(/^\u2212/, '-');
  if (t === '') return null;
  if (t.includes(',')) {
    t = t.replace(/\./g, '').replace(',', '.');
  } else if (opts.milhar && /^[+-]?\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, '');
  }
  if (!/^[+-]?\d+(\.\d+)?$/.test(t)) return Number.NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

/**
 * Aceita número ou texto com vírgula ou ponto ("6", "6,5", "6.5"). Fora do limite da spec (yield
 * 0,1–30; g 0–20; k 1–30; margem 0–50 em passos de 5; P/L alvo 0,1–200; P/VP alvo 0,1–5; renda
 * 1–1.000.000) ⇒ null.
 */
export function validarPremissa(
  nome: NomePremissa,
  valor: string | number,
  limites: LimitesPremissas = LIMITES_PREMISSAS_PADRAO,
): number | null {
  let n: number;
  if (typeof valor === 'number') {
    n = valor;
  } else {
    const t = valor.trim().replace(/\s+/g, '');
    if (!/^[+-]?\d+([.,]\d+)?$/.test(t)) return null;
    n = Number(t.replace(',', '.'));
  }
  if (!Number.isFinite(n)) return null;
  const faixa = limites[nome] ?? LIMITES_PREMISSAS_PADRAO[nome];
  if (!faixa) return null;
  const [min, max] = faixa;
  if (n < min || n > max) return null;
  if (nome === 'margemPct') {
    const passos = n / limites.margemPasso;
    if (Math.abs(passos - Math.round(passos)) > 1e-9) return null;
  }
  return n;
}

/**
 * Ao reabrir o ativo: o cenário salvo (se houver) vence as premissas iniciais, campo a campo.
 * v2.4: o null SALVO vale em todo campo (o usuário deixou em branco); só `undefined` (campo que o
 * registro não tem, ex.: P/L alvo de um salvo antigo) mantém o inicial. `anulaveis` restringe os
 * campos em que o null vale (padrão: todos).
 */
export function aplicarCenarioSalvo<P extends object = Premissas>(
  padrao: P,
  salvo: Partial<P> | null,
  anulaveis?: ReadonlyArray<keyof P>,
): { premissas: P; origem: 'salvo' | 'ativo' } {
  if (!salvo || Object.keys(salvo).length === 0)
    return { premissas: { ...padrao }, origem: 'ativo' };
  const premissas: P = { ...padrao };
  for (const [k, v] of Object.entries(salvo) as Array<[keyof P, unknown]>) {
    if (v === undefined) continue;
    if (v === null && anulaveis && !anulaveis.includes(k)) continue;
    (premissas as Record<string, unknown>)[k as string] = v;
  }
  return { premissas, origem: 'salvo' };
}

/**
 * "Limpar minhas premissas" (v2.4): volta às premissas iniciais (em branco) e pede para apagar o
 * registro salvo (DELETE).
 */
export function limparPremissas<P extends object = Premissas>(
  iniciais: P,
): { premissas: P; apagarRegistro: true } {
  return { premissas: { ...iniciais }, apagarRegistro: true };
}

/** Nome antigo de limparPremissas (Bloco D). */
export const restaurarPadrao = limparPremissas;

/**
 * Só os dados do ativo que o usuário mudou (o que vai em dadosEditados ao salvar). Compara com o
 * valor do ativo como a tela mostra (arredondado a `casas[campo]`, padrão 2): digitar "1,490" no
 * LPA 1,49 não é edição. Valor atual vazio ou inválido não entra (o campo volta ao do ativo).
 */
export function diffDadosEditados<K extends string>(
  base: Readonly<Partial<Record<K, number | null>>>,
  atuais: Readonly<Partial<Record<K, number | null>>>,
  casas: Readonly<Partial<Record<K, number>>> = {} as Partial<Record<K, number>>,
): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const [campo, v] of Object.entries(atuais) as Array<[K, number | null | undefined]>) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const b = base[campo];
    const c = casas[campo] ?? 2;
    if (typeof b === 'number' && Number.isFinite(b) && arredondar(b, c) === arredondar(v, c)) {
      continue;
    }
    out[campo] = v;
  }
  return out;
}
