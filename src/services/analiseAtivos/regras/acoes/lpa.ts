/**
 * LPA publicado (regra 11).
 *
 * - Só o LPA BÁSICO por classe (3.99.01.x, descrição ON/PN/PNA…). O 3.99/3.99.01 "geral" é ignorado:
 *   BB 2024 publica 9,24 no 3.99 e 4,62 (o certo) no 3.99.01.01 ON. Zero = linha não preenchida.
 * - Escala errada: Σ(LPA × ações)/lucro ≈ 1000 ou ≈ 0,001 com um candidato de ações coerente indica LPA
 *   publicado em escala errada (43 casos; ITUB4 2019 = 2.780 ⇒ 2,78). |LPA| > lpaAbsMax sem correção
 *   possível ⇒ ausente. Nunca usar o LPA da BRAPI.
 */
import type { LinhaDemonstrativo } from '@/services/analiseAtivos/regras/acoes/extrairFundamentos';
import { ausente, ok } from '@/services/analiseAtivos/regras/comum/valor';
import type { ScoringParams, Valor } from '@/services/analiseAtivos/tipos';

const RE_BASICO_CLASSE = /^3\.99\.01\.\d+$/;
const RE_ON = /^(A[çc][õo]es\s+)?(ON|ORDIN)/i;
const RE_PN = /^(A[çc][õo]es\s+)?(PN|PREF)/i;

export function lpaPublicado(linhasDre: LinhaDemonstrativo[]): {
  on: number | null;
  pn: number | null;
} {
  let on: number | null = null;
  let pn: number | null = null;
  for (const l of linhasDre) {
    if (l.demonstrativo !== 'DRE' || !RE_BASICO_CLASSE.test(l.cdConta)) continue;
    if (!Number.isFinite(l.valor) || l.valor === 0) continue;
    const ds = l.dsConta.trim();
    if (on === null && RE_ON.test(ds)) on = l.valor;
    else if (pn === null && RE_PN.test(ds)) pn = l.valor;
  }
  return { on, pn };
}

export type FatorEscalaLpa = 1 | 0.001 | 1000;

const dentro = (x: number, [a, b]: [number, number] | number[]) => x > a && x < b;

/** Fator que corrige o LPA a partir da razão Σ(LPA×ações)/lucro; null = razão sem padrão de escala. */
export function fatorEscalaPorRazao(razao: number, p: ScoringParams): FatorEscalaLpa | null {
  const s = p.sanidade.acoes;
  if (dentro(razao, s.razaoLpaAceita)) return 1;
  if (dentro(razao, s.escalaLpaMil)) return 0.001;
  if (dentro(razao, s.escalaLpaMilesimo)) return 1000;
  return null;
}

export function corrigirEscalaLpa(
  lpa: number,
  lucro: number,
  acoes: number,
  p: ScoringParams,
): { lpa: Valor; corrigido: boolean } {
  const s = p.sanidade.acoes;
  if (!Number.isFinite(lpa)) return { lpa: ausente('sem_dado_fonte'), corrigido: false };
  let fator: FatorEscalaLpa = 1;
  if (Number.isFinite(lucro) && Math.abs(lucro) >= s.lucroMinVerificavel && acoes > 0) {
    fator = fatorEscalaPorRazao((lpa * acoes) / lucro, p) ?? 1;
  }
  return aplicarFatorLpa(lpa, fator, p);
}

export function aplicarFatorLpa(
  lpa: number,
  fator: FatorEscalaLpa,
  p: ScoringParams,
): { lpa: Valor; corrigido: boolean } {
  const v = lpa * fator;
  if (Math.abs(v) > p.sanidade.acoes.lpaAbsMax) {
    return {
      lpa: ausente('outro', `|LPA| ${v} > ${p.sanidade.acoes.lpaAbsMax}`),
      corrigido: false,
    };
  }
  return { lpa: ok(v), corrigido: fator !== 1 };
}
