"use client";
import React from "react";
import { GroupedProventoData } from "@/hooks/useProventos";

interface ProventosDistribuicaoTableProps {
  grouped: Record<string, GroupedProventoData>;
  viewMode: "total" | "yield";
}

export default function ProventosDistribuicaoTable({ grouped, viewMode }: ProventosDistribuicaoTableProps) {
  const entries = Object.entries(grouped).sort((a, b) => b[1].total - a[1].total);
  const total = entries.reduce((sum, [, data]) => sum + data.total, 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
              {viewMode === "yield" ? "Ativo" : "Categoria"}
            </th>
            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">
              {viewMode === "yield" ? "Yield on Cost" : "Total"}
            </th>
            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">
              Média
            </th>
            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">
              %
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([name, data]) => {
            const percentage = total > 0 ? (data.total / total) * 100 : 0;
            const average = data.count > 0 ? data.total / data.count : 0;
            
            return (
              <tr key={name} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                  {name}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white font-medium">
                  {viewMode === "yield" 
                    ? `${((data.total / 1000) * 100).toFixed(2)}%` // Placeholder para yield real
                    : `R$ ${data.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  }
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-400">
                  R$ {average.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-400">
                  {percentage.toFixed(2)}%
                </td>
              </tr>
            );
          })}
          {entries.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                Nenhum provento encontrado no período selecionado
              </td>
            </tr>
          )}
        </tbody>
        {entries.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50">
              <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">
                Total
              </td>
              <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900 dark:text-white">
                {viewMode === "yield" 
                  ? "-"
                  : `R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                }
              </td>
              <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900 dark:text-white">
                R$ {(total / entries.length).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900 dark:text-white">
                100.00%
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}


