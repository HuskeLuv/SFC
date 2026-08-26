/**
 * Rentabilidade agregada de um conjunto de posições (total/subtotal de tabela).
 *
 * Auditoria Pedro 25/08/2026 (item B2): totais e subtotais calculavam a MÉDIA
 * ARITMÉTICA das rentabilidades das linhas — Ações mostrava 499,48% =
 * (181,72 + 817,24) / 2 quando o certo, ponderado pelo capital, é 522,51%.
 * Fórmula única: Σ(valor atual) / Σ(valor aplicado) − 1. Cada rota passa os
 * campos que usa como base da rentabilidade da PRÓPRIA linha, para o subtotal
 * ser coerente com as linhas filhas (critério T1 do relatório).
 */
export const rentabilidadeAgregada = <T>(
  itens: readonly T[],
  aplicado: (item: T) => number,
  atual: (item: T) => number,
): number => {
  let totalAplicado = 0;
  let totalAtual = 0;
  for (const item of itens) {
    const a = aplicado(item);
    const v = atual(item);
    if (Number.isFinite(a) && a > 0) {
      totalAplicado += a;
      totalAtual += Number.isFinite(v) ? v : 0;
    }
  }
  return totalAplicado > 0 ? ((totalAtual - totalAplicado) / totalAplicado) * 100 : 0;
};
