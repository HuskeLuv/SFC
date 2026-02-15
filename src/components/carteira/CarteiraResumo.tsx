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
import MarketIndicatorsCards from "./MarketIndicatorsCards";
import AddAssetWizard from "./AddAssetWizard";
import RedeemAssetWizard from "./RedeemAssetWizard";
import CaixaParaInvestirCard from "@/components/carteira/shared/CaixaParaInvestirCard";
import { DownloadIcon, PlusIcon } from "@/icons";
import { useReservaEmergencia } from "@/hooks/useReservaEmergencia";
import { useCarteiraResumoContext } from "@/context/CarteiraResumoContext";
import { useAlocacaoConfig } from "@/hooks/useAlocacaoConfig";

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
  { id: "renda-fixa", label: "Renda Fixa" },
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

export default function CarteiraResumo() {
  const [activeTab, setActiveTab] = useState("consolidada");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isRedeemSidebarOpen, setIsRedeemSidebarOpen] = useState(false);
  const { resumo, formatCurrency, refetch, updateMeta, updateCaixaParaInvestir, incrementRefreshTrigger } = useCarteiraResumoContext();
  const alocacaoConfig = useAlocacaoConfig();
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [metaInputValue, setMetaInputValue] = useState("");
  const [isSavingMeta, setIsSavingMeta] = useState(false);
  const [metaErrorMessage, setMetaErrorMessage] = useState<string | null>(null);
  const { data: reservaEmergenciaData, refetch: refetchReservaEmergencia, updateValorAtualizado: updateReservaEmergenciaValor } = useReservaEmergencia();

  return (
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="flex items-center space-x-2 rounded-lg bg-brand-500 px-4 py-2 text-white transition-colors hover:bg-brand-600"
            >
              <PlusIcon className="h-4 w-4" />
              <span>Adicionar Investimento</span>
            </button>
            <button
              onClick={() => setIsRedeemSidebarOpen(true)}
              className="flex items-center space-x-2 rounded-lg bg-gray-700 px-4 py-2 text-white transition-colors hover:bg-gray-800"
            >
              <DownloadIcon className="h-4 w-4" />
              <span>Resgatar Investimento</span>
            </button>
          </div>
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
                <MarketIndicatorsCards
                  extraCards={
                    <CaixaParaInvestirCard
                      key="caixa-para-investir-resumo"
                      value={resumo.caixaParaInvestir ?? 0}
                      formatCurrency={formatCurrency}
                      onSave={updateCaixaParaInvestir}
                      color="success"
                    />
                  }
                />
                <AlocacaoAtivosTable
                  distribuicao={resumo.distribuicao}
                  alocacaoConfig={alocacaoConfig}
                  caixaParaInvestir={resumo.caixaParaInvestir ?? 0}
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
                onUpdateValorAtualizado={async (portfolioId, novoValor) => {
                  await updateReservaEmergenciaValor(portfolioId, novoValor);
                  refetch();
                }}
                totalCarteira={resumo?.saldoBruto || 0}
              />
            </TabContent>

            {/* Reserva de Oportunidade */}
            <TabContent id="reserva-oportunidade" isActive={activeTab === "reserva-oportunidade"}>
              <ReservaOportunidadeTable
                totalCarteira={resumo?.saldoBruto || 0}
                onUpdateSuccess={refetch}
              />
            </TabContent>

            {/* Renda Fixa */}
            <TabContent id="renda-fixa" isActive={activeTab === "renda-fixa"}>
              <RendaFixaTable totalCarteira={resumo?.saldoBruto || 0} />
            </TabContent>

            {/* FIM/FIA */}
            <TabContent id="fim-fia" isActive={activeTab === "fim-fia"}>
              <FimFiaTable totalCarteira={resumo?.saldoBruto || 0} />
            </TabContent>

            {/* FIIs */}
            <TabContent id="fiis" isActive={activeTab === "fiis"}>
              <FiiTable totalCarteira={resumo?.saldoBruto || 0} />
            </TabContent>

            {/* Ações */}
            <TabContent id="acoes" isActive={activeTab === "acoes"}>
              <AcoesTable totalCarteira={resumo?.saldoBruto || 0} />
            </TabContent>

            {/* Stocks */}
            <TabContent id="stocks" isActive={activeTab === "stocks"}>
              <StocksTable totalCarteira={resumo?.saldoBruto || 0} />
            </TabContent>

            {/* REIT */}
            <TabContent id="reit" isActive={activeTab === "reit"}>
              <ReitTable totalCarteira={resumo?.saldoBruto || 0} />
            </TabContent>

            {/* ETF's */}
            <TabContent id="etf" isActive={activeTab === "etf"}>
              <EtfTable totalCarteira={resumo?.saldoBruto || 0} />
            </TabContent>

            {/* Moedas, Criptomoedas & Outros */}
            <TabContent id="moedas-criptos" isActive={activeTab === "moedas-criptos"}>
              <MoedasCriptosTable totalCarteira={resumo?.saldoBruto || 0} />
            </TabContent>

            {/* Previdência & Seguros */}
            <TabContent id="previdencia" isActive={activeTab === "previdencia"}>
              <PrevidenciaSegurosTable totalCarteira={resumo?.saldoBruto || 0} />
            </TabContent>

            {/* Opções */}
            <TabContent id="opcoes" isActive={activeTab === "opcoes"}>
              <OpcoesTable totalCarteira={resumo?.saldoBruto || 0} />
            </TabContent>

            {/* Imóveis & Bens */}
            <TabContent id="imoveis" isActive={activeTab === "imoveis"}>
              <ImoveisBensTable totalCarteira={resumo?.saldoBruto || 0} />
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
            refetchReservaEmergencia();
            incrementRefreshTrigger();
          }}
        />
        <RedeemAssetWizard
          isOpen={isRedeemSidebarOpen}
          onClose={() => setIsRedeemSidebarOpen(false)}
          onSuccess={() => {
            refetch();
            refetchReservaEmergencia();
            incrementRefreshTrigger();
          }}
        />
      </div>
  );
}

