"use client";
import React, { useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import RentabilidadeGeral from "./RentabilidadeGeral";
import ProventosTabs from "./ProventosTabs";

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

const tabs = [
  { id: "rentabilidade-geral", label: "Rentabilidade Geral" },
  { id: "proventos", label: "Proventos" },
];

export default function AnalisesTabs() {
  const [activeTab, setActiveTab] = useState("rentabilidade-geral");

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Análises
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Análise de rentabilidade e proventos da sua carteira
        </p>
      </div>

      {/* Tabs */}
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-6 dark:border-gray-800">
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
          {/* Rentabilidade Geral */}
          <TabContent id="rentabilidade-geral" isActive={activeTab === "rentabilidade-geral"}>
            <RentabilidadeGeral />
          </TabContent>

          {/* Proventos */}
          <TabContent id="proventos" isActive={activeTab === "proventos"}>
            <ProventosTabs />
          </TabContent>
        </div>
      </div>
    </div>
  );
}


