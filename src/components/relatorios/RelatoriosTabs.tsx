"use client";
import React, { useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";

interface TabButtonProps {
  id: string;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

const TabButton: React.FC<TabButtonProps> = ({
  label,
  isActive,
  onClick,
}) => {
  return (
    <button
      className={`inline-flex items-center border-b-2 px-3 py-3 text-sm font-medium transition-colors duration-200 ease-in-out whitespace-nowrap ${
        isActive
          ? "text-brand-500 dark:text-brand-400 border-brand-500 dark:border-brand-400"
          : "bg-transparent text-gray-500 border-transparent hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
};

interface TabContentProps {
  id: string;
  isActive: boolean;
  children: React.ReactNode;
}

const TabContent: React.FC<TabContentProps> = ({ isActive, children }) => {
  if (!isActive) return null;
  return <div className="pt-6">{children}</div>;
};

// Componente para páginas placeholder das tabs
const BlankPage: React.FC<{ title: string }> = ({ title }) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
        <svg
          className="w-8 h-8 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </div>
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          {title}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
          Esta seção está em desenvolvimento. Em breve você poderá visualizar e gerar relatórios em {title.toLowerCase()}.
        </p>
      </div>
    </div>
  );
};

const tabs = [
  { id: "resumo", label: "Resumo" },
  { id: "ativos", label: "Ativos" },
  { id: "analise", label: "Análise" },
  { id: "extrato", label: "Extrato" },
  { id: "relatorio", label: "Relatório" },
];

export default function RelatoriosTabs() {
  const [activeTab, setActiveTab] = useState("resumo");

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Relatórios
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Visualize e gere relatórios detalhados da sua carteira de investimentos
        </p>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-white/[0.05]">
        <div className="border-b border-gray-200 dark:border-gray-800 px-6">
          <nav className="-mb-px flex space-x-2 overflow-x-auto [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 dark:[&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:h-1.5">
            {tabs.map((tab) => (
              <TabButton
                key={tab.id}
                id={tab.id}
                label={tab.label}
                isActive={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              />
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {/* Resumo */}
          <TabContent id="resumo" isActive={activeTab === "resumo"}>
            <ComponentCard title="Resumo">
              <BlankPage title="Resumo" />
            </ComponentCard>
          </TabContent>

          {/* Ativos */}
          <TabContent id="ativos" isActive={activeTab === "ativos"}>
            <ComponentCard title="Ativos">
              <BlankPage title="Ativos" />
            </ComponentCard>
          </TabContent>

          {/* Análise */}
          <TabContent id="analise" isActive={activeTab === "analise"}>
            <ComponentCard title="Análise">
              <BlankPage title="Análise" />
            </ComponentCard>
          </TabContent>

          {/* Extrato */}
          <TabContent id="extrato" isActive={activeTab === "extrato"}>
            <ComponentCard title="Extrato">
              <BlankPage title="Extrato" />
            </ComponentCard>
          </TabContent>

          {/* Relatório */}
          <TabContent id="relatorio" isActive={activeTab === "relatorio"}>
            <ComponentCard title="Relatório">
              <BlankPage title="Relatório" />
            </ComponentCard>
          </TabContent>
        </div>
      </div>
    </div>
  );
}



