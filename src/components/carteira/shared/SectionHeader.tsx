/**
 * Componente genérico de cabeçalho de seção expansível
 * Usado para agrupar ativos por estratégia, segmento, etc.
 */

import { ChevronDownIcon, ChevronUpIcon } from "@/icons";
import Badge from "@/components/ui/badge/Badge";
import CategoryBadge from "./CategoryBadge";

interface SectionHeaderProps {
  title: string;
  category?: string;
  categoryLabel?: string;
  itemCount: number;
  itemLabel: string;
  isExpanded: boolean;
  onToggle: () => void;
  columns: React.ReactNode[];
  categoryColorMap?: Record<string, string>;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  category,
  categoryLabel,
  itemCount,
  itemLabel,
  isExpanded,
  onToggle,
  columns,
  categoryColorMap,
}) => {
  return (
    <tr 
      className="bg-gray-100 dark:bg-gray-800 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
      onClick={onToggle}
    >
      <td className="px-2 py-2 text-xs font-bold text-gray-900 dark:text-white">
        <div className="flex items-center space-x-2">
          {isExpanded ? (
            <ChevronUpIcon className="w-4 h-4" />
          ) : (
            <ChevronDownIcon className="w-4 h-4" />
          )}
          <span>{title}</span>
          {category && categoryLabel && (
            <CategoryBadge 
              category={category} 
              colorMap={categoryColorMap}
              formatLabel={() => categoryLabel}
            />
          )}
          <Badge color="primary" size="sm">
            {itemCount} {itemLabel}
          </Badge>
        </div>
      </td>
      {columns.map((column, index) => (
        <td key={index} className="px-2 py-2">
          {column}
        </td>
      ))}
    </tr>
  );
};

export default SectionHeader;

