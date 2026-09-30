/**
 * CRIs distintos da carteira de um FII (regra 25): o mesmo CRI aparece em várias linhas do informe
 * trimestral (lotes/aquisições) — KNCR11 2T26 tem 147 linhas e 96 CRIs. Conta por código CETIP
 * (ex.: 23L1952070) achado em emissor + nome do ativo; sem código, por emissor|emissão|série.
 * Função pura.
 */

export interface LinhaAtivoFii {
  tipo: string;
  emissor: string;
  nomeAtivo: string;
  emissao: string;
  serie: string;
  valor: number | null;
}

const RE_CETIP = /\b(\d{2}[A-L]\d{7,})\b/;
const RE_CRI = /CRI/i;

export function ehLinhaCri(tipo: string): boolean {
  return RE_CRI.test(tipo);
}

export function chaveCri(l: Pick<LinhaAtivoFii, 'emissor' | 'nomeAtivo' | 'emissao' | 'serie'>) {
  const cod = RE_CETIP.exec(`${l.emissor} ${l.nomeAtivo}`)?.[1];
  return cod ?? `${l.emissor.trim().toUpperCase()}|${l.emissao.trim()}|${l.serie.trim()}`;
}

/**
 * @returns nCri (distintos), valorCri (Σ valor das linhas de CRI) e maiorCriPct (% do maior CRI
 * sobre o total de CRIs; null se o total não é positivo).
 */
export function contarCrisDistintos(linhas: LinhaAtivoFii[]): {
  nCri: number;
  valorCri: number;
  maiorCriPct: number | null;
} {
  const porCri = new Map<string, number>();
  for (const l of linhas) {
    if (!ehLinhaCri(l.tipo)) continue;
    const k = chaveCri(l);
    const v = typeof l.valor === 'number' && Number.isFinite(l.valor) ? l.valor : 0;
    porCri.set(k, (porCri.get(k) ?? 0) + v);
  }
  const valores = [...porCri.values()];
  const total = valores.reduce((a, b) => a + b, 0);
  return {
    nCri: porCri.size,
    valorCri: total,
    maiorCriPct: total > 0 ? (Math.max(...valores) / total) * 100 : null,
  };
}

/** Cotas de FII distintas (FoF): por código de negociação ou nome do ativo. */
export function contarFiisDistintos(
  linhas: Array<{ tipo: string; codigo: string; nomeAtivo: string }>,
): number {
  const s = new Set<string>();
  for (const l of linhas) {
    if (l.tipo.trim().toUpperCase() !== 'FII') continue;
    s.add((l.codigo || l.nomeAtivo).trim().toUpperCase());
  }
  return s.size;
}
