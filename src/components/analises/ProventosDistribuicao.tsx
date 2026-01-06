"use client";
import React, { useState } from "react";
import { GroupedProventoData } from "@/hooks/useProventos";
import ProventosDistribuicaoChart from "./ProventosDistribuicaoChart";
import ProventosDistribuicaoTable from "./ProventosDistribuicaoTable";

interface ProventosDistribuicaoProps {
  grouped: Record<string, GroupedProventoData>;
  viewMode: "total" | "yield";
}

export default function ProventosDistribuicao({ grouped, viewMode }: ProventosDistribuicaoProps) {
  const [displayMode, setDisplayMode] = useState<"chart" | "table">("chart");

  return (
    <div className="space-y-4">
      {/* Toggle entre Gráfico e Tabela */}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => setDisplayMode("chart")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            displayMode === "chart"
              ? "bg-brand-500 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          }`}
        >
          Gráfico
        </button>
        <button
          onClick={() => setDisplayMode("table")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            displayMode === "table"
              ? "bg-brand-500 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          }`}
        >
          Tabela
        </button>
      </div>

      {/* Conteúdo */}
      {displayMode === "chart" ? (
        <ProventosDistribuicaoChart grouped={grouped} viewMode={viewMode} />
      ) : (
        <ProventosDistribuicaoTable grouped={grouped} viewMode={viewMode} />
      )}
    </div>
  );
}


