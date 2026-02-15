"use client";
import React, { useState, lazy, Suspense, useMemo, useCallback } from "react";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { useCarteira } from "@/hooks/useCarteira";
import { useAlocacaoConfig } from "@/hooks/useAlocacaoConfig";
import { CarteiraResumoProvider } from "@/context/CarteiraResumoContext";
import type { NecessidadeAporteMap } from "@/context/CarteiraResumoContext";

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
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { resumo, loading, error, formatCurrency, formatPercentage, refetch, updateMeta, updateCaixaParaInvestir } = useCarteira();
  const alocacaoConfig = useAlocacaoConfig();

  const incrementRefreshTrigger = useCallback(() => {
    setRefreshTrigger((t) => t + 1);
  }, []);

  const necessidadeAporteMap = useMemo<NecessidadeAporteMap>(() => {
    if (!resumo) return {};
    const totalCarteira = Object.values(resumo.distribuicao).reduce((sum, item) => sum + item.valor, 0);
    if (totalCarteira <= 0) return {};
    const targetMap = alocacaoConfig.configuracoes.reduce<Record<string, number>>((acc, config) => {
      acc[config.categoria] = config.target;
      return acc;
    }, {});
    return Object.entries(resumo.distribuicao).reduce<NecessidadeAporteMap>((acc, [categoria, info]) => {
      const targetPercentual = targetMap[categoria];
      if (targetPercentual === undefined) {
        acc[categoria] = 0;
        return acc;
      }
      const percentualAtual = totalCarteira > 0 ? (info.valor / totalCarteira) * 100 : 0;
      const diferenca = targetPercentual - percentualAtual;
      const necessidade = diferenca > 0 ? (diferenca / 100) * totalCarteira : 0;
      acc[categoria] = Number.isFinite(necessidade) ? necessidade : 0;
      return acc;
    }, {});
  }, [resumo, alocacaoConfig.configuracoes]);

  const providerValue = useMemo(
    () =>
      resumo
        ? {
            resumo,
            loading,
            error,
            formatCurrency,
            formatPercentage,
            updateMeta,
            updateCaixaParaInvestir,
            refetch,
            necessidadeAporteMap,
            isAlocacaoLoading: alocacaoConfig.loading,
            refreshTrigger,
            incrementRefreshTrigger,
          }
        : null,
    [
      resumo,
      loading,
      error,
      formatCurrency,
      formatPercentage,
      updateMeta,
      updateCaixaParaInvestir,
      refetch,
      necessidadeAporteMap,
      alocacaoConfig.loading,
      refreshTrigger,
      incrementRefreshTrigger,
    ]
  );

  if (loading) {
    return <LoadingSpinner text="Carregando dados da carteira..." />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">Erro ao carregar dados</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!resumo || !providerValue) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Nenhum dado encontrado</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Adicione seus primeiros investimentos para começar a acompanhar sua carteira.
          </p>
        </div>
      </div>
    );
  }

  return (
    <CarteiraResumoProvider value={providerValue}>
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
    </CarteiraResumoProvider>
  );
}
