"use client";
import React, { useEffect, useMemo, useState } from "react";
import AlocacaoAtivosTable from "./AlocacaoAtivosTable";
import ReservaEmergenciaTable from "./ReservaEmergenciaTable";
import RendaFixaTable from "./RendaFixaTable";
import ReservaOportunidadeTable from "./ReservaOportunidadeTable";
import FimFiaTable from "./FimFiaTable";
import FiiTable from "./FiiTable";
import AcoesTable from "./AcoesTable";
import StocksTable from "./StocksTable";
import ReitTable from "./ReitTable";
import EtfTable from "./EtfTable";
import MoedasCriptosTable from "./MoedasCriptosTable";
import PrevidenciaSegurosTable from "./PrevidenciaSegurosTable";
import OpcoesTable from "./OpcoesTable";
import ImoveisBensTable from "./ImoveisBensTable";
import LineChartCarteiraHistorico from "@/components/charts/line/LineChartCarteiraHistorico";
import PieChartCarteiraInvestimentos from "@/components/charts/pie/PieChartCarteiraInvestimentos";
import ComponentCard from "@/components/common/ComponentCard";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import AddAssetWizard from "./AddAssetWizard";
import AddReservaModal from "./AddReservaModal";
import { PencilIcon, PlusIcon } from "@/icons";
import { useReservaEmergencia } from "@/hooks/useReservaEmergencia";
import { useCarteira } from "@/hooks/useCarteira";
import { useAlocacaoConfig } from "@/hooks/useAlocacaoConfig";
import { CarteiraResumoProvider } from "@/context/CarteiraResumoContext";
import type { NecessidadeAporteMap } from "@/context/CarteiraResumoContext";

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

// Componente para metric cards da carteira consolidada
interface CarteiraConsolidadaMetricCardProps {
  title: string;
  value: string;
  color?: "primary" | "success" | "warning" | "error";
}

const CarteiraConsolidadaMetricCard: React.FC<CarteiraConsolidadaMetricCardProps> = ({
  title,
  value,
  color = "primary",
}) => {
  const colorClasses = {
    primary: "bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:text-blue-100",
    success: "bg-green-50 text-green-900 dark:bg-green-900/20 dark:text-green-100",
    warning: "bg-yellow-50 text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-100",
    error: "bg-red-50 text-red-900 dark:bg-red-900/20 dark:text-red-100",
  };

  return (
    <div className={`rounded-lg p-4 ${colorClasses[color]}`}>
      <p className="text-xs font-medium opacity-80 mb-1">{title}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
};

const formatMetaInputValue = (value: number): string => {
  if (!Number.isFinite(value)) {
    return "0,00";
  }

  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const parseMetaInputValue = (value: string): number => {
  if (!value) {
    return Number.NaN;
  }

  const sanitizedValue = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  return Number(sanitizedValue);
};

interface MetaPatrimonioCardProps {
  formattedValue: string;
  inputValue: string;
  isEditing: boolean;
  isSaving: boolean;
  errorMessage: string | null;
  onStartEdit: () => void;
  onChangeInput: (value: string) => void;
  onCancelEdit: () => void;
  onSubmitEdit: () => void;
  onKeyDownInput: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}

const MetaPatrimonioCard: React.FC<MetaPatrimonioCardProps> = ({
  formattedValue,
  inputValue,
  isEditing,
  isSaving,
  errorMessage,
  onStartEdit,
  onChangeInput,
  onCancelEdit,
  onSubmitEdit,
  onKeyDownInput,
}) => {
  return (
    <div className="rounded-lg bg-yellow-50 p-4 text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-100">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="mb-1 text-xs font-medium opacity-80">Meta de Patrimônio</p>
          {isEditing ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">R$</span>
                <input
                  value={inputValue}
                  onChange={(event) => onChangeInput(event.target.value)}
                  inputMode="decimal"
                  aria-label="Editar meta de patrimônio"
                  onKeyDown={onKeyDownInput}
                  className="w-full rounded-md border border-yellow-200 bg-white px-3 py-2 text-sm font-semibold text-yellow-900 shadow-sm outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-400/40 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-50"
                  autoFocus
                  disabled={isSaving}
                />
              </div>
              {errorMessage ? (
                <p className="text-xs text-red-600 dark:text-red-400">{errorMessage}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onSubmitEdit}
                  disabled={isSaving}
                  className="inline-flex items-center justify-center rounded-md bg-yellow-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-yellow-500 dark:hover:bg-yellow-400"
                  aria-label="Salvar meta de patrimônio"
                >
                  {isSaving ? "Salvando..." : "Salvar"}
                </button>
                <button
                  type="button"
                  onClick={onCancelEdit}
                  disabled={isSaving}
                  className="inline-flex items-center justify-center rounded-md border border-yellow-400 px-3 py-2 text-xs font-semibold text-yellow-800 transition hover:bg-yellow-100 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 dark:border-yellow-700 dark:text-yellow-200 dark:hover:bg-yellow-800/30"
                  aria-label="Cancelar edição da meta de patrimônio"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xl font-semibold">{formattedValue}</p>
          )}
        </div>
        {isEditing ? null : (
          <button
            type="button"
            onClick={onStartEdit}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-yellow-200 text-yellow-700 transition hover:bg-yellow-100 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 dark:border-yellow-700 dark:text-yellow-200 dark:hover:bg-yellow-800/40"
            aria-label="Abrir edição da meta de patrimônio"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onStartEdit();
              }
            }}
          >
            <PencilIcon className="h-4 w-4" />
          </button>
        )}
      </div>
      {isEditing && isSaving ? (
        <p className="mt-2 text-xs font-medium text-yellow-700 dark:text-yellow-200">Atualizando meta...</p>
      ) : null}
    </div>
  );
};

// Componente para páginas em branco das outras tabs
const BlankPage: React.FC<{ title: string }> = ({ title }) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
        <div className="w-8 h-8 bg-gray-300 dark:bg-gray-600 rounded"></div>
      </div>
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          {title}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
          Esta seção está em desenvolvimento. Em breve você poderá visualizar e gerenciar seus investimentos em {title.toLowerCase()}.
        </p>
      </div>
    </div>
  );
};


const tabs = [
  { id: "consolidada", label: "Carteira Consolidada" },
  { id: "reserva-emergencia", label: "Reserva Emergência" },
  { id: "reserva-oportunidade", label: "Reserva Oportunidade" },
  { id: "renda-fixa", label: "Renda Fixa & Fundos" },
  { id: "fim-fia", label: "FIM/FIA" },
  { id: "fiis", label: "FII's" },
  { id: "acoes", label: "Ações" },
  { id: "stocks", label: "Stocks" },
  { id: "reit", label: "REIT's" },
  { id: "etf", label: "ETF's" },
  { id: "moedas-criptos", label: "Moedas, Criptomoedas & outros" },
  { id: "previdencia", label: "Previdência & Seguros" },
  { id: "opcoes", label: "Opções" },
  { id: "imoveis", label: "Imóveis & Bens" },
];

export default function CarteiraTabs() {
  const [activeTab, setActiveTab] = useState("consolidada");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isReservaOportunidadeModalOpen, setIsReservaOportunidadeModalOpen] = useState(false);
  const { resumo, loading, error, formatCurrency, formatPercentage, refetch, updateMeta } = useCarteira();
  const alocacaoConfig = useAlocacaoConfig();
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [metaInputValue, setMetaInputValue] = useState("");
  const [isSavingMeta, setIsSavingMeta] = useState(false);
  const [metaErrorMessage, setMetaErrorMessage] = useState<string | null>(null);
  const { data: reservaEmergenciaData } = useReservaEmergencia();

  useEffect(() => {
    if (!resumo) {
      return;
    }

    setMetaInputValue(formatMetaInputValue(resumo.metaPatrimonio));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumo?.metaPatrimonio]);

  const handleStartEditMeta = () => {
    if (!resumo) {
      return;
    }

    setMetaErrorMessage(null);
    setMetaInputValue(formatMetaInputValue(resumo.metaPatrimonio));
    setIsEditingMeta(true);
  };

  const handleMetaInputChange = (value: string) => {
    const sanitizedValue = value.replace(/[^\d,.]/g, "");
    setMetaInputValue(sanitizedValue);
  };

  const handleCancelEditMeta = () => {
    if (resumo) {
      setMetaInputValue(formatMetaInputValue(resumo.metaPatrimonio));
    }

    setMetaErrorMessage(null);
    setIsEditingMeta(false);
    setIsSavingMeta(false);
  };

  const handleSubmitMeta = async () => {
    if (isSavingMeta) {
      return;
    }

    const parsedValue = parseMetaInputValue(metaInputValue);

    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      setMetaErrorMessage("Informe um valor válido maior que zero.");
      return;
    }

    setIsSavingMeta(true);
    setMetaErrorMessage(null);

    const sucesso = await updateMeta(parsedValue);

    if (sucesso) {
      setIsEditingMeta(false);
    } else {
      setMetaErrorMessage("Não foi possível atualizar a meta de patrimônio. Tente novamente.");
    }

    setIsSavingMeta(false);
  };

  const handleMetaInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleSubmitMeta();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      handleCancelEditMeta();
    }
  };

  const necessidadeAporteMap = useMemo<NecessidadeAporteMap>(() => {
    if (!resumo) {
      return {};
    }

    const totalCarteira = Object.values(resumo.distribuicao).reduce((sum, item) => sum + item.valor, 0);

    if (totalCarteira <= 0) {
      return {};
    }

    const targetMap = alocacaoConfig.configuracoes.reduce<Record<string, number>>((accumulator, config) => {
      accumulator[config.categoria] = config.target;
      return accumulator;
    }, {});

    return Object.entries(resumo.distribuicao).reduce<NecessidadeAporteMap>((accumulator, [categoria, info]) => {
      const targetPercentual = targetMap[categoria];

      if (targetPercentual === undefined) {
        accumulator[categoria] = 0;
        return accumulator;
      }

      const percentualAtual = totalCarteira > 0 ? (info.valor / totalCarteira) * 100 : 0;
      const diferenca = targetPercentual - percentualAtual;
      const necessidade = diferenca > 0 ? (diferenca / 100) * totalCarteira : 0;

      accumulator[categoria] = Number.isFinite(necessidade) ? necessidade : 0;
      return accumulator;
    }, {});
  }, [resumo, alocacaoConfig.configuracoes]);

  if (loading) {
    return <LoadingSpinner text="Carregando dados da carteira..." />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
            Erro ao carregar dados
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!resumo) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Nenhum dado encontrado
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Adicione seus primeiros investimentos para começar a acompanhar sua carteira.
          </p>
        </div>
      </div>
    );
  }

  const carteiraResumoProviderValue = {
    resumo,
    formatCurrency,
    formatPercentage,
    updateMeta,
    refetch,
    necessidadeAporteMap,
    isAlocacaoLoading: alocacaoConfig.loading,
  };

  return (
    <CarteiraResumoProvider value={carteiraResumoProviderValue}>
      <div>
        {/* Header com botão de adicionar investimento */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Carteira de Investimentos
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Gerencie e acompanhe seus investimentos por categoria
            </p>
          </div>
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="flex items-center space-x-2 rounded-lg bg-brand-500 px-4 py-2 text-white transition-colors hover:bg-brand-600"
          >
            <PlusIcon className="h-4 w-4" />
            <span>Adicionar Investimento</span>
          </button>
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
            {/* Carteira Consolidada */}
            <TabContent id="consolidada" isActive={activeTab === "consolidada"}>
              <div className="space-y-4">
                {/* Grid de Gráficos */}
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                  <div className="xl:col-span-8">
                    <ComponentCard title="Histórico de Patrimônio">
                      <LineChartCarteiraHistorico data={resumo.historicoPatrimonio} />
                    </ComponentCard>
                  </div>
                  <div className="xl:col-span-4">
                    <ComponentCard title="Tipos de Investimento">
                      <PieChartCarteiraInvestimentos distribuicao={resumo.distribuicao} />
                    </ComponentCard>
                  </div>
                </div>

                {/* Tabela de Alocação de Ativos */}
                <AlocacaoAtivosTable
                  distribuicao={resumo.distribuicao}
                  alocacaoConfig={alocacaoConfig}
                />
              </div>
            </TabContent>

            {/* Reserva de Emergência */}
            <TabContent id="reserva-emergencia" isActive={activeTab === "reserva-emergencia"}>
              <ReservaEmergenciaTable
                ativos={reservaEmergenciaData.ativos}
                saldoInicioMes={reservaEmergenciaData.saldoInicioMes}
                rendimento={reservaEmergenciaData.rendimento}
                rentabilidade={reservaEmergenciaData.rentabilidade}
              />
            </TabContent>

            {/* Reserva de Oportunidade */}
            <TabContent id="reserva-oportunidade" isActive={activeTab === "reserva-oportunidade"}>
              <div className="mb-4 flex justify-end">
                <button
                  onClick={() => setIsReservaOportunidadeModalOpen(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors"
                >
                  <PlusIcon className="w-4 h-4" />
                  <span>Adicionar Reserva de Oportunidade</span>
                </button>
              </div>
              <ReservaOportunidadeTable />
            </TabContent>

            {/* Renda Fixa & Fundos */}
            <TabContent id="renda-fixa" isActive={activeTab === "renda-fixa"}>
              <RendaFixaTable />
            </TabContent>

            {/* FIM/FIA */}
            <TabContent id="fim-fia" isActive={activeTab === "fim-fia"}>
              <FimFiaTable />
            </TabContent>

            {/* FIIs */}
            <TabContent id="fiis" isActive={activeTab === "fiis"}>
              <FiiTable />
            </TabContent>

            {/* Ações */}
            <TabContent id="acoes" isActive={activeTab === "acoes"}>
              <AcoesTable />
            </TabContent>

            {/* Stocks */}
            <TabContent id="stocks" isActive={activeTab === "stocks"}>
              <StocksTable />
            </TabContent>

            {/* REIT */}
            <TabContent id="reit" isActive={activeTab === "reit"}>
              <ReitTable />
            </TabContent>

            {/* ETF's */}
            <TabContent id="etf" isActive={activeTab === "etf"}>
              <EtfTable />
            </TabContent>

            {/* Moedas, Criptomoedas & Outros */}
            <TabContent id="moedas-criptos" isActive={activeTab === "moedas-criptos"}>
              <MoedasCriptosTable />
            </TabContent>

            {/* Previdência & Seguros */}
            <TabContent id="previdencia" isActive={activeTab === "previdencia"}>
              <PrevidenciaSegurosTable />
            </TabContent>

            {/* Opções */}
            <TabContent id="opcoes" isActive={activeTab === "opcoes"}>
              <OpcoesTable />
            </TabContent>

            {/* Imóveis & Bens */}
            <TabContent id="imoveis" isActive={activeTab === "imoveis"}>
              <ImoveisBensTable />
            </TabContent>

            {/* Outras tabs - páginas em branco */}
            {tabs
              .slice(2)
              .filter(
                (tab) =>
                  tab.id !== "renda-fixa" &&
                  tab.id !== "reserva-oportunidade" &&
                  tab.id !== "fim-fia" &&
                  tab.id !== "fiis" &&
                  tab.id !== "acoes" &&
                  tab.id !== "stocks" &&
                  tab.id !== "reit" &&
                  tab.id !== "etf" &&
                  tab.id !== "moedas-criptos" &&
                  tab.id !== "previdencia" &&
                  tab.id !== "opcoes" &&
                  tab.id !== "imoveis"
              )
              .map((tab) => (
                <TabContent key={tab.id} id={tab.id} isActive={activeTab === tab.id}>
                  <BlankPage title={tab.label} />
                </TabContent>
              ))}
          </div>
        </div>

        {/* Wizard para adicionar ativo */}
        <AddAssetWizard
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          onSuccess={() => {
            refetch();
          }}
        />

        {/* Modal para adicionar Reserva de Oportunidade */}
        <AddReservaModal
          isOpen={isReservaOportunidadeModalOpen}
          onClose={() => setIsReservaOportunidadeModalOpen(false)}
          onSuccess={() => {
            refetch();
          }}
          tipo="opportunity"
        />
      </div>
    </CarteiraResumoProvider>
  );
}

