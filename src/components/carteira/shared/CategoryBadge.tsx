/**
 * Componente genérico de badge com cores por categoria
 * Usado para setores, segmentos, estratégias, etc.
 */

interface CategoryBadgeProps {
  category: string;
  colorMap?: Record<string, string>;
  defaultColor?: string;
  formatLabel?: (category: string) => string;
}

const defaultColorMap: Record<string, string> = {
  // Setores financeiros
  'financeiro': 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
  'energia': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
  'consumo': 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
  'saude': 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
  'tecnologia': 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300',
  'industria': 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300',
  'materiais': 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300',
  'utilidades': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300',
  
  // Segmentos internacionais
  'technology': 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
  'financials': 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
  'healthcare': 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
  'consumer': 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300',
  'energy': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
  'industrials': 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300',
  'materials': 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300',
  'utilities': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300',
  'communication': 'bg-pink-100 text-pink-800 dark:bg-pink-900/20 dark:text-pink-300',
  'real_estate': 'bg-teal-100 text-teal-800 dark:bg-teal-900/20 dark:text-teal-300',
  
  // Estratégias
  'value': 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
  'growth': 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
  'risk': 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
  
  // Segmentos FII
  'logistica': 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
  'shoppings': 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300',
  'residencial': 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
  'hibrido': 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300',
  'escritorios': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300',
  
  // Padrão
  'outros': 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300',
  'other': 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300',
};

const CategoryBadge: React.FC<CategoryBadgeProps> = ({
  category,
  colorMap,
  defaultColor = "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300",
  formatLabel,
}) => {
  const finalColorMap = colorMap || defaultColorMap;
  const color = finalColorMap[category.toLowerCase()] || defaultColor;
  
  const label = formatLabel 
    ? formatLabel(category) 
    : category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' ');

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  );
};

export default CategoryBadge;

