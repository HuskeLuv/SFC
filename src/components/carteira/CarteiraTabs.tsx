"use client";
import React, { useState, lazy, Suspense } from "react";
import LoadingSpinner from "@/components/common/LoadingSpinner";

// Lazy loading dos componentes de conteúdo
const CarteiraResumo = lazy(() => import("./CarteiraResumo"));
const CarteiraAnalise = lazy(() => import("./CarteiraAnalise"));

interface MainTabButtonProps {
  id: string;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

const MainTabButton: React.FC<MainTabButtonProps> = ({
  label,
  isActive,
  onClick,
}) => {
  return (
    <button
      className={`inline-flex items-center rounded-t-xl px-6 py-3 text-sm font-semibold transition-all duration-200 ease-in-out whitespace-nowrap ${
        isActive
          ? "bg-gray-900 text-white dark:bg-gray-800 dark:text-gray-100 shadow-md"
          : "bg-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/50"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
};

interface MainTabContentProps {
  id: string;
  isActive: boolean;
  children: React.ReactNode;
}

const MainTabContent: React.FC<MainTabContentProps> = ({ isActive, children }) => {
  if (!isActive) return null;
  return <div>{children}</div>;
};

const mainTabs = [
  { id: "resumo", label: "Resumo" },
  { id: "analise", label: "Análise" },
];

export default function CarteiraTabs() {
  const [activeMainTab, setActiveMainTab] = useState("resumo");

  return (
    <div>
      {/* Main Tabs Navigation */}
      <div className="mb-6">
        <div className="border-b border-gray-200 dark:border-gray-800">
          <nav className="flex space-x-1">
            {mainTabs.map((tab) => (
              <MainTabButton
                key={tab.id}
                id={tab.id}
                label={tab.label}
                isActive={activeMainTab === tab.id}
                onClick={() => setActiveMainTab(tab.id)}
              />
            ))}
          </nav>
        </div>
      </div>

      {/* Main Tab Content with Lazy Loading */}
      <div>
        <MainTabContent id="resumo" isActive={activeMainTab === "resumo"}>
          <Suspense fallback={<LoadingSpinner text="Carregando resumo da carteira..." />}>
            <CarteiraResumo />
          </Suspense>
        </MainTabContent>

        <MainTabContent id="analise" isActive={activeMainTab === "analise"}>
          <Suspense fallback={<LoadingSpinner text="Carregando análises..." />}>
            <CarteiraAnalise />
          </Suspense>
        </MainTabContent>
      </div>
    </div>
  );
}
