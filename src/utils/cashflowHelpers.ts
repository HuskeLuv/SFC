import { CashflowGroup, CashflowItem } from "@/types/cashflow";

/**
 * Coleta recursivamente todos os itens de um grupo e seus subgrupos
 */
export const getAllItemsInGroup = (group: CashflowGroup): CashflowItem[] => {
  const items: CashflowItem[] = [];
  
  // Adicionar itens diretos do grupo
  if (group.items && group.items.length > 0) {
    items.push(...group.items);
  }
  
  // Adicionar itens dos subgrupos recursivamente
  if (group.children && group.children.length > 0) {
    group.children.forEach(child => {
      items.push(...getAllItemsInGroup(child));
    });
  }
  
  return items;
};

