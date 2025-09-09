"use client";
import React, { useState } from "react";
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
import AddInvestmentSidebar from "./AddInvestmentSidebar";
import { PlusIcon } from "@/icons";
import { useReservaEmergencia } from "@/hooks/useReservaEmergencia";
import { useCarteira } from "@/hooks/useCarteira";

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
  const { resumo, loading, error, formatCurrency, formatPercentage, refetch } = useCarteira();
  const { data: reservaEmergenciaData } = useReservaEmergencia();

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


  return (
    <div>
      {/* Header com botão de adicionar investimento */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Carteira de Investimentos
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Gerencie e acompanhe seus investimentos por categoria
          </p>
        </div>
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          <span>Adicionar Investimento</span>
        </button>
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
          {/* Carteira Consolidada */}
          <TabContent id="consolidada" isActive={activeTab === "consolidada"}>
            <div className="space-y-4">
              {/* Grid de Cards de Métricas */}
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                <CarteiraConsolidadaMetricCard
                  title="Saldo Bruto"
                  value={formatCurrency(resumo.saldoBruto)}
                />
                <CarteiraConsolidadaMetricCard
                  title="Valor Aplicado"
                  value={formatCurrency(resumo.valorAplicado)}
                  color="primary"
                />
                <CarteiraConsolidadaMetricCard
                  title="Rentabilidade"
                  value={formatPercentage(resumo.rentabilidade)}
                  color={resumo.rentabilidade >= 0 ? "success" : "error"}
                />
                <CarteiraConsolidadaMetricCard
                  title="Meta de Patrimônio"
                  value={formatCurrency(resumo.metaPatrimonio)}
                  color="warning"
                />
              </div>

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
              <AlocacaoAtivosTable distribuicao={resumo.distribuicao} />
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
          {tabs.slice(2).filter(tab => tab.id !== "renda-fixa" && tab.id !== "reserva-oportunidade" && tab.id !== "fim-fia" && tab.id !== "fiis" && tab.id !== "acoes" && tab.id !== "stocks" && tab.id !== "reit" && tab.id !== "etf" && tab.id !== "moedas-criptos" && tab.id !== "previdencia" && tab.id !== "opcoes" && tab.id !== "imoveis").map((tab) => (
            <TabContent key={tab.id} id={tab.id} isActive={activeTab === tab.id}>
              <BlankPage title={tab.label} />
            </TabContent>
          ))}
        </div>
      </div>

      {/* Sidebar para adicionar investimento */}
      <AddInvestmentSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onSuccess={() => {
          refetch(); // Recarrega os dados da carteira
        }}
      />
    </div>
  );
}
