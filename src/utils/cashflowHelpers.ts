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

/**
 * Busca um item pelo ID em todos os grupos recursivamente
 */
export const findItemById = (groups: CashflowGroup[], itemId: string): CashflowItem | null => {
  for (const group of groups) {
    // Buscar nos itens diretos do grupo
    if (group.items) {
      const foundItem = group.items.find(item => item.id === itemId);
      if (foundItem) return foundItem;
    }
    
    // Buscar recursivamente nos subgrupos
    if (group.children && group.children.length > 0) {
      const foundItem = findItemById(group.children, itemId);
      if (foundItem) return foundItem;
    }
  }
  
  return null;
};

