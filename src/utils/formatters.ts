export const formatCurrency = (value: number): string => {
  return value.toLocaleString("pt-BR", { 
    style: "currency", 
    currency: "BRL" 
  });
};

export const formatPercent = (value: number): string => {
  return `${value.toFixed(2)}%`;
};

export const isReceitaGroup = (groupName: string): boolean => {
  return groupName.includes("Entradas") || groupName.includes("Receitas");
}; 

// Simplified function that uses the explicit type field
export const isReceitaGroupByType = (groupType: string): boolean => {
  return groupType === "entrada" || groupType === "Entradas";
}; 