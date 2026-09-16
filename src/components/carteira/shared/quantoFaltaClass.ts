/**
 * Cor do valor da coluna "Quanto Falta" nas abas da carteira (pedido do
 * Wellington, 16/09/2026):
 *   ≥ 1%            → azul `outside` (falta comprar; mesma convenção de valor
 *                     positivo do Fluxo de Caixa)
 *   entre 0% e 1%   → âmbar (quase no objetivo)
 *   < 0%            → vermelho (acima do objetivo)
 *   exatamente 0%   → sem cor (no objetivo)
 * Azul e vermelho seguem `VALUE_POSITIVE_CLASS`/`VALUE_NEGATIVE_CLASS`; o
 * âmbar é semântico (fora da paleta, como o verde/vermelho já aceitos).
 */
export function quantoFaltaClass(valor: number | null | undefined): string {
  const v = Number(valor);
  if (!Number.isFinite(v) || v === 0) return '';
  if (v >= 1) return 'text-[#0079F2] dark:text-[#80BCF8]';
  if (v > 0) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}
