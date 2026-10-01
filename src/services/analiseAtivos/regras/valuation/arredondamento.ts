/**
 * Arredondamento da Análise de Ativos (spec §4.5 "Unidades, arredondamento").
 *
 * `arredondar` é half-up (metade para longe do zero) sobre a REPRESENTAÇÃO DECIMAL do número, não
 * sobre o binário: 1,005 vira 1,01 (Math.round(1,005 × 100) daria 1,00 porque 1,005 é 1,00499… em
 * binário) e 57,4545 vira 57,45. Resultados monetários com 2 casas; "vs. cotação" inteiro; barra
 * com 0 casas em % e 1 casa em p.p.; multiplicadores com 1 casa (P/L, P/FFO) ou 2 (P/VP).
 */

/** Half-up (longe do zero) em `casas` decimais. NaN/±Infinity passam intactos. */
export function arredondar(x: number, casas: number): number {
  if (!Number.isFinite(x)) return x;
  if (!Number.isInteger(casas) || casas < 0 || casas > 15) {
    throw new Error(`casas inválidas: ${casas}`);
  }
  const sinal = x < 0 ? -1 : 1;
  const abs = Math.abs(x);
  // Deslocamento pela notação exponencial: opera na representação decimal curta do número
  // (a mesma que o usuário vê), sem o erro de multiplicar por 10^casas em binário.
  const texto = String(abs);
  if (texto.includes('e')) {
    // notação exponencial (muito grande/pequeno): cai no cálculo binário, sem ganho de precisão
    const f = 10 ** casas;
    const r = Math.round(abs * f) / f;
    return r === 0 ? 0 : sinal * r;
  }
  const deslocado = Math.round(Number(`${texto}e${casas}`));
  const volta = Number(`${deslocado}e-${casas}`);
  return volta === 0 ? 0 : sinal * volta;
}

/** Formata no padrão brasileiro (vírgula decimal, ponto de milhar), com `casas` fixas. */
export function formatarNumeroBR(x: number, casas: number): string {
  const r = arredondar(x, casas);
  const [inteiro, frac] = Math.abs(r).toFixed(casas).split('.');
  const milhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sinal = r < 0 ? '−' : '';
  return frac ? `${sinal}${milhar},${frac}` : `${sinal}${milhar}`;
}

/** Com sinal explícito ("+40", "−72", "0"). */
export function formatarComSinalBR(x: number, casas: number): string {
  const r = arredondar(x, casas);
  const base = formatarNumeroBR(Math.abs(r), casas);
  if (r > 0) return `+${base}`;
  if (r < 0) return `−${base}`;
  return base;
}
