/**
 * Conversões usadas pelos repositórios: Decimal → number e Date → 'AAAA-MM-DD' (UTC).
 * Os tipos de tipos.ts nunca carregam Decimal/Date do Prisma.
 */

type DecimalLike = { toNumber(): number };

export function paraNumero(v: DecimalLike | number | bigint | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'bigint') return Number(v);
  const n = v.toNumber();
  return Number.isFinite(n) ? n : null;
}

export function paraData(d: Date): string;
export function paraData(d: Date | null | undefined): string | null;
export function paraData(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** 'AAAA-MM-DD' → Date UTC meia-noite (para filtros em colunas @db.Date). */
export function deData(s: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`Data inválida (AAAA-MM-DD): ${s}`);
  return new Date(`${s}T00:00:00.000Z`);
}

export function raizTicker(symbol: string): string {
  return symbol.slice(0, 4).toUpperCase();
}
