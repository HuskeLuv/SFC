/**
 * Escala declarada errada no documento (ESCALA_MOEDA): PDTC3 DFP 2024/2025 dizem UNIDADE, mas os
 * valores estão em milhares (receita 298.759, PL 121.931 contra 368,7 mi e 152,5 mi no DFP 2023).
 *
 * Dois sinais, cada um 1 (escala certa), 1000 / 0,001 (valores 1000× pequenos / grandes) ou null:
 *  - vizinho: ativo total (e PL, quando dá para comparar) contra o documento anterior do mesmo
 *    emissor e escopo — balanço é comparável entre trimestres e exercícios. ~1000× = salto de escala;
 *    até 10× = mesma escala;
 *  - LPA: Σ(LPA publicado × ações)/lucro ≈ 1000 (ou 0,001) com a contagem de ações já conhecida.
 * Decisão: LPA coerente com os valores (razão ≈ 1) ⇒ o documento está certo, mesmo que o vizinho
 * não esteja (VAMOS3 2019 contra o DFP 2018 declarado UNIDADE em milhares); vizinho diz salto e o LPA
 * confirma ou não tem como conferir ⇒ corrige ('escala_corrigida'); vizinho e LPA em sentidos
 * opostos ⇒ ambígua; sem vizinho conclusivo e LPA ≈ 1000 ⇒ ambígua (pode ser só o LPA publicado em
 * escala errada, regra 11 — que o vizinho OK resolve).
 * Documento ambíguo NÃO é corrigido: fica com 'escala_ambigua' e o Índice sai incompleto.
 * Faixas fixas no código (ScoringParams v2): SALTO_ESCALA e MESMA_ESCALA.
 */
import type { ScoringParams } from '@/services/analiseAtivos/tipos';

export type SinalEscala = 1 | 1000 | 0.001 | null;

/** razão atual/vizinho de um salto de escala ×1000 (valores 1000× menores ⇒ [1/3000; 1/300]) */
const SALTO_ESCALA: readonly [number, number] = [300, 3000];
/** razão atual/vizinho que ainda é a mesma escala (crescimento/queda real) */
const MESMA_ESCALA: readonly [number, number] = [0.1, 10];

export interface BalancoEscala {
  ativoTotal: number | null;
  pl: number | null;
}

function classificarRazao(r: number): SinalEscala {
  if (!(r > 0) || !Number.isFinite(r)) return null;
  if (r >= 1 / SALTO_ESCALA[1] && r <= 1 / SALTO_ESCALA[0]) return 1000;
  if (r >= SALTO_ESCALA[0] && r <= SALTO_ESCALA[1]) return 0.001;
  if (r >= MESMA_ESCALA[0] && r <= MESMA_ESCALA[1]) return 1;
  return null;
}

/** Sinal do vizinho: o ativo total decide; o PL (mesmo sinal, ≠ 0) só pode contradizer. */
export function sinalVizinho(atual: BalancoEscala, vizinho: BalancoEscala | null): SinalEscala {
  if (!vizinho) return null;
  const { ativoTotal: a, pl } = atual;
  const { ativoTotal: va, pl: vpl } = vizinho;
  if (a === null || va === null || !(a > 0) || !(va > 0)) return null;
  const sAtivo = classificarRazao(a / va);
  if (sAtivo === null || sAtivo === 1) return sAtivo;
  if (pl !== null && vpl !== null && pl !== 0 && vpl !== 0 && pl > 0 === vpl > 0) {
    const sPl = classificarRazao(pl / vpl);
    if (sPl !== null && sPl !== sAtivo) return null;
  }
  return sAtivo;
}

/** Sinal do LPA: Σ(LPA × ações)/lucro na escala declarada. */
export function sinalLpa(
  lucro: number | null,
  lpa: number | null,
  acoes: number | null,
  p: ScoringParams,
): SinalEscala {
  if (lucro === null || lpa === null || acoes === null) return null;
  if (lucro === 0 || lpa === 0 || !(acoes > 0)) return null;
  const q = (lpa * acoes) / lucro;
  const s = p.sanidade.acoes;
  const dentro = (x: number, [a, b]: readonly [number, number]) => x > a && x < b;
  if (dentro(q, s.razaoLpaAceita)) return 1;
  if (dentro(q, s.escalaLpaMil)) return 1000;
  if (dentro(q, s.escalaLpaMilesimo)) return 0.001;
  return null;
}

export interface DecisaoEscala {
  /** multiplicador dos valores monetários (1 = não mexe) */
  fator: number;
  flag: 'escala_corrigida' | 'escala_ambigua' | null;
}

export function decidirEscala(vizinho: SinalEscala, lpa: SinalEscala): DecisaoEscala {
  if (lpa === 1) return { fator: 1, flag: null };
  if (vizinho === 1000 || vizinho === 0.001) {
    if (lpa === null || lpa === vizinho) return { fator: vizinho, flag: 'escala_corrigida' };
    return { fator: 1, flag: 'escala_ambigua' };
  }
  if (vizinho === null && (lpa === 1000 || lpa === 0.001)) {
    return { fator: 1, flag: 'escala_ambigua' };
  }
  return { fator: 1, flag: null };
}

/** Campos monetários dos fundamentos (LPA fica de fora: é R$/ação e tem a regra 11). */
export const CAMPOS_MONETARIOS = [
  'receita',
  'lucroBruto',
  'ebit',
  'depreciacaoAmortizacao',
  'lucroLiquido',
  'lucroAtribuivel',
  'ativoTotal',
  'ativoCirculante',
  'passivoCirculante',
  'caixa',
  'aplicacoesFinanceiras',
  'dividaBrutaCp',
  'dividaBrutaLp',
  'pl',
  'plControladora',
  'fco',
  'fci',
  'fcf',
  'capex',
  'dividendosJcpPagos',
  'dmplDeclarado',
] as const;

type ComMonetarios = { [K in (typeof CAMPOS_MONETARIOS)[number]]: number | null } & {
  flags: string[];
};

/** Aplica a decisão: multiplica os valores (fator ≠ 1) e acrescenta a flag. Devolve cópia. */
export function aplicarDecisaoEscala<T extends ComMonetarios>(f: T, d: DecisaoEscala): T {
  if (d.flag === null) return f;
  const out: T = { ...f, flags: [...f.flags, d.flag] };
  if (d.fator !== 1) {
    for (const c of CAMPOS_MONETARIOS) {
      const v = f[c];
      (out as Record<string, unknown>)[c] = v === null ? null : v * d.fator;
    }
  }
  return out;
}
