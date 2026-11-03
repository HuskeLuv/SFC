import type { CashflowGroup } from '@/types/cashflow';

/**
 * Orçamento v2: a linha está numa categoria que tem a subcategoria "Geral"? É nesse caso que
 * excluir a linha mexe na Geral (fusão, `excluirSubcategoria.ts`) e a Planilha pergunta para onde
 * vão os valores (ticket 86e3vxd5r). A Geral mora direto no grupo da categoria; as linhas de
 * subgrupos dela também contam. A própria Geral não conta (não é excluível).
 */
export function linhaTemGeralNaCategoria(groups: CashflowGroup[], itemId: string): boolean {
  const contem = (g: CashflowGroup): boolean =>
    (g.items ?? []).some((i) => i.id === itemId && !i.isGeral) || (g.children ?? []).some(contem);

  const visitar = (gs: CashflowGroup[]): boolean => {
    for (const g of gs) {
      const temGeral = (g.items ?? []).some((i) => i.isGeral);
      if (temGeral && contem(g)) return true;
      if (visitar(g.children ?? [])) return true;
    }
    return false;
  };
  return visitar(groups);
}
