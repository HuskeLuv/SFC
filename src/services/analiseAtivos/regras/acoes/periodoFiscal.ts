/**
 * Ano e trimestre FISCAIS de um período (regra 19): ~10 companhias do DFP 2026 encerram o exercício
 * fora de dezembro (Camil em fevereiro, BrasilAgro em junho, sucroalcooleiras em março).
 *
 * Convenção: o ano fiscal é o ano civil em que o exercício TERMINA (a mesma do campo `fy` da SEC para
 * WMT/NVDA). Camil: exercício mar/2025–fev/2026 = anoFiscal 2026; ITR de 31/05/2025 = 1º trimestre
 * do anoFiscal 2026. Fim do exercício ⇒ trimestreFiscal null (é o FY do DFP).
 */

const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

export function periodoFiscal(
  dtFim: string,
  mesFimExercicio: number | null,
): { anoFiscal: number; trimestreFiscal: number | null } {
  const m = RE_DATA.exec(dtFim);
  if (!m) throw new Error(`Data inválida (AAAA-MM-DD): ${dtFim}`);
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const mesFim =
    mesFimExercicio && mesFimExercicio >= 1 && mesFimExercicio <= 12 ? mesFimExercicio : 12;
  const anoFiscal = mes <= mesFim ? ano : ano + 1;
  const mesInicio = (mesFim % 12) + 1;
  const mesDoExercicio = ((mes - mesInicio + 12) % 12) + 1; // 1..12
  const trimestre = Math.ceil(mesDoExercicio / 3);
  return { anoFiscal, trimestreFiscal: trimestre === 4 ? null : trimestre };
}

/** Último dia do mês (UTC) 'AAAA-MM-DD'. */
export function fimDoMes(ano: number, mes: number): string {
  return new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
}

/** Fim do mês `meses` antes do mês de `dtFim` (ex.: 2026-06-30, 3 ⇒ 2026-03-31). */
export function fimDoMesAnterior(dtFim: string, meses: number): string {
  const m = RE_DATA.exec(dtFim);
  if (!m) throw new Error(`Data inválida (AAAA-MM-DD): ${dtFim}`);
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) - meses;
  return fimDoMes(Math.floor(total / 12), (total % 12) + 1);
}

/** Meses inteiros entre o início e o fim de um período (2026-04-01 → 2026-06-30 = 3). */
export function mesesDoPeriodo(dtIni: string, dtFim: string): number {
  const a = RE_DATA.exec(dtIni);
  const b = RE_DATA.exec(dtFim);
  if (!a || !b) throw new Error(`Período inválido: ${dtIni}..${dtFim}`);
  return (Number(b[1]) - Number(a[1])) * 12 + (Number(b[2]) - Number(a[2])) + 1;
}
