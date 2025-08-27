"use client";
import React, { useState } from "react";
import AlocacaoAtivosTable from "./AlocacaoAtivosTable";
import LineChartCarteiraHistorico from "@/components/charts/line/LineChartCarteiraHistorico";
import PieChartCarteiraInvestimentos from "@/components/charts/pie/PieChartCarteiraInvestimentos";
import ComponentCard from "@/components/common/ComponentCard";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import AddInvestmentModal from "./AddInvestmentModal";
import Badge from "@/components/ui/badge/Badge";
import { DollarLineIcon, ShootingStarIcon, PieChartIcon, BoxIconLine, PlusIcon } from "@/icons";
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
interface CarteiraMetricCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  change: string;
  changeDirection: "up" | "down";
}

const CarteiraMetricCard: React.FC<CarteiraMetricCardProps> = ({
  title,
  value,
  icon,
  change,
  changeDirection,
}) => {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-white/[0.05] dark:bg-white/[0.03]">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-500 dark:bg-brand-500/10">
            {icon}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {title}
            </p>
            <p className="text-2xl font-semibold text-gray-900 dark:text-white">
              {value}
            </p>
          </div>
        </div>
        <div className="text-right">
          <Badge
            color={changeDirection === "up" ? "success" : "error"}
            size="sm"
          >
            {change}
          </Badge>
        </div>
      </div>
    </div>
  );
};

// Componente para páginas em branco das outras tabs
const BlankPage: React.FC<{ title: string }> = ({ title }) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
        <BoxIconLine className="w-8 h-8 text-gray-400" />
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
  { id: "reits", label: "REIT's" },
  { id: "etfs", label: "ETF's" },
  { id: "moedas-criptos", label: "Moedas, Criptomoedas & outros" },
  { id: "previdencia", label: "Previdência & Seguros" },
  { id: "opcoes", label: "Opções" },
  { id: "imoveis", label: "Imóveis & Bens" },
];

export default function CarteiraTabs() {
  const [activeTab, setActiveTab] = useState("consolidada");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { resumo, loading, error, formatCurrency, formatPercentage, refetch } = useCarteira();

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

  const rentabilidadeAnterior = resumo.rentabilidade * 0.8; // Simulated
  const variacao = resumo.rentabilidade - rentabilidadeAnterior;

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
          onClick={() => setIsModalOpen(true)}
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
            <div className="space-y-6">
              {/* Grid de Cards de Métricas */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-4">
                <CarteiraMetricCard
                  title="Saldo Bruto"
                  value={formatCurrency(resumo.saldoBruto)}
                  icon={<DollarLineIcon />}
                  change={formatPercentage(resumo.rentabilidade)}
                  changeDirection={resumo.rentabilidade >= 0 ? "up" : "down"}
                />
                <CarteiraMetricCard
                  title="Valor Aplicado"
                  value={formatCurrency(resumo.valorAplicado)}
                  icon={<BoxIconLine />}
                  change={formatPercentage(variacao)}
                  changeDirection={variacao >= 0 ? "up" : "down"}
                />
                <CarteiraMetricCard
                  title="Rentabilidade"
                  value={formatPercentage(resumo.rentabilidade)}
                  icon={<ShootingStarIcon />}
                  change={formatPercentage(Math.abs(variacao))}
                  changeDirection={variacao >= 0 ? "up" : "down"}
                />
                <CarteiraMetricCard
                  title="Meta de Patrimônio"
                  value={formatCurrency(resumo.metaPatrimonio)}
                  icon={<PieChartIcon />}
                  change={`${((resumo.saldoBruto / resumo.metaPatrimonio) * 100).toFixed(1)}%`}
                  changeDirection="up"
                />
              </div>

              {/* Grid de Gráficos */}
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
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

          {/* Outras tabs - páginas em branco */}
          {tabs.slice(1).map((tab) => (
            <TabContent key={tab.id} id={tab.id} isActive={activeTab === tab.id}>
              <BlankPage title={tab.label} />
            </TabContent>
          ))}
        </div>
      </div>

      {/* Modal para adicionar investimento */}
      <AddInvestmentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {
          refetch(); // Recarrega os dados da carteira
        }}
      />
    </div>
  );
} 