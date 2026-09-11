/**
 * Datas civis sem fuso. Tudo aqui usa os getters UTC de propósito: a data
 * civil "2026-09-30" é guardada como 2026-09-30T00:00:00Z e nunca deve
 * virar 29/09 por causa do fuso da máquina (bug já visto no projeto).
 */

export const DATA_CIVIL_RE = /^\d{4}-\d{2}-\d{2}$/;

export function dataCivil(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function deDataCivil(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

export function ehDataCivilValida(s: string): boolean {
  if (!DATA_CIVIL_RE.test(s)) return false;
  const d = deDataCivil(s);
  return !Number.isNaN(d.getTime()) && dataCivil(d) === s;
}

export function partes(s: string): { ano: number; mes: number; dia: number } {
  const [ano, mes, dia] = s.split('-').map(Number);
  return { ano, mes: mes - 1, dia };
}

export function montar(ano: number, mes: number, dia: number): string {
  return dataCivil(new Date(Date.UTC(ano, mes, dia)));
}

export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
}

export function somarDias(s: string, dias: number): string {
  const { ano, mes, dia } = partes(s);
  return montar(ano, mes, dia + dias);
}

/** Diferença em dias (b − a). */
export function diffDias(a: string, b: string): number {
  return Math.round((deDataCivil(b).getTime() - deDataCivil(a).getTime()) / 86_400_000);
}

export function hojeCivil(agora: Date = new Date()): string {
  // Dia civil no Brasil (UTC-3, sem horário de verão desde 2019).
  return dataCivil(new Date(agora.getTime() - 3 * 3_600_000));
}
