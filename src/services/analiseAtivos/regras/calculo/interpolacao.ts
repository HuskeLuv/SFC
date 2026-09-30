/**
 * Interpolação linear dos componentes do Índice MF (spec §4.1): piso ⇒ 0, teto ⇒ 10, limitado a
 * [0, 10]. Funciona com piso > teto ("menor é melhor": DL/EBITDA 6 ⇒ 0, 0 ⇒ 10).
 */
export function interpolar(v: number, piso: number, teto: number): number {
  if (!Number.isFinite(v)) throw new Error(`valor inválido para interpolar: ${v}`);
  if (piso === teto) throw new Error('piso = teto');
  const nota = (10 * (v - piso)) / (teto - piso);
  return Math.min(10, Math.max(0, nota));
}
