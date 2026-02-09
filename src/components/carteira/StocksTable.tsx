"use client";
import React, { useState, useMemo } from "react";
import { useCarteiraStocks } from "@/hooks/useStocks";
import { CarteiraStockAtivo, CarteiraStockSecao, EstrategiaCarteiraStock } from "@/types/carteiraStocks";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ComponentCard from "@/components/common/ComponentCard";
import PieChartStocksAtivo from "@/components/charts/pie/PieChartStocksAtivo";
import { ChevronDownIcon, ChevronUpIcon } from "@/icons";
import { useCarteiraResumoContext } from "@/context/CarteiraResumoContext";
import { BasicTablePlaceholderRows } from "@/components/carteira/shared";
import CaixaParaInvestirCard from "@/components/carteira/shared/CaixaParaInvestirCard";

const MIN_PLACEHOLDER_ROWS = 4;
const STOCKS_COLUMN_COUNT = 14;
const STOCKS_AUX_COLUMN_COUNT = 5;
const STOCKS_SECTION_ORDER = ["value", "growth", "risk"] as const;
const STOCKS_SECTION_NAMES: Record<(typeof STOCKS_SECTION_ORDER)[number], string> = {
  value: "Value",
  growth: "Growth",
  risk: "Risk",
};

interface StocksMetricCardProps {
  title: string;
  value: string;
  color?: "primary" | "success" | "warning" | "error";
}

const StocksMetricCard: React.FC<StocksMetricCardProps> = ({
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

interface StocksTableRowProps {
  ativo: CarteiraStockAtivo;
  formatCurrency: (value: number) => string;
  formatPercentage: (value: number) => string;
  formatNumber: (value: number) => string;
  onUpdateObjetivo: (ativoId: string, novoObjetivo: number) => void;
}

const StocksTableRow: React.FC<StocksTableRowProps> = ({
  ativo,
  formatCurrency,
  formatPercentage,
  formatNumber,
  onUpdateObjetivo,
}) => {
  const [isEditingObjetivo, setIsEditingObjetivo] = useState(false);
  const [objetivoValue, setObjetivoValue] = useState(ativo.objetivo.toString());

  const handleObjetivoSubmit = () => {
    const novoObjetivo = parseFloat(objetivoValue);
    if (!isNaN(novoObjetivo) && novoObjetivo >= 0) {
      onUpdateObjetivo(ativo.id, novoObjetivo);
      setIsEditingObjetivo(false);
    }
  };

  const handleObjetivoKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleObjetivoSubmit();
    } else if (e.key === 'Escape') {
      setObjetivoValue(ativo.objetivo.toString());
      setIsEditingObjetivo(false);
    }
  };

  return (
    <tr className="border-b border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50">
      <td className="px-2 py-2 text-xs text-black">
        <div>
          <div>{ativo.ticker}</div>
          <div className="text-xs text-black">{ativo.nome}</div>
          {ativo.observacoes && (
            <div className="text-xs text-black mt-1">
              {ativo.observacoes}
            </div>
          )}
        </div>
      </td>
      <td className="px-2 py-2 text-xs text-center">
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs">
          {ativo.sector ? ativo.sector.charAt(0).toUpperCase() + ativo.sector.slice(1).replace('_', ' ') : 'Outros'}
        </span>
      </td>
      <td className="px-2 py-2 text-xs text-center text-black">
        {ativo.industryCategory}
      </td>
      <td className="px-2 py-2 text-xs text-right text-black">
        {formatNumber(ativo.quantidade)}
      </td>
      <td className="px-2 py-2 text-xs text-right text-black">
        {formatCurrency(ativo.precoAquisicao)}
      </td>
      <td className="px-2 py-2 text-xs text-right text-black">
        {formatCurrency(ativo.valorTotal)}
      </td>
      <td className="px-2 py-2 text-xs text-right">
        <span className="text-black">{formatCurrency(ativo.cotacaoAtual)}</span>
      </td>
      <td className="px-2 py-2 text-xs text-right text-black">
        {formatCurrency(ativo.valorAtualizado)}
      </td>
      <td className="px-2 py-2 text-xs text-right text-black">
        {formatPercentage(ativo.riscoPorAtivo)}
      </td>
      <td className="px-2 py-2 text-xs text-right text-black">
        {formatPercentage(ativo.percentualCarteira)}
      </td>
      <td className="px-2 py-2 text-xs text-right border border-black">
        {isEditingObjetivo ? (
          <div className="flex items-center space-x-1">
            <input
              type="number"
              step="0.01"
              value={objetivoValue}
              onChange={(e) => setObjetivoValue(e.target.value)}
              onKeyDown={handleObjetivoKeyPress}
              onBlur={handleObjetivoSubmit}
              className="w-16 px-1 py-0.5 text-xs border border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              autoFocus
            />
            <span className="text-xs text-black">%</span>
          </div>
        ) : (
          <div 
            className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 rounded"
            onClick={() => setIsEditingObjetivo(true)}
          >
            <span className="text-black">
              {formatPercentage(ativo.objetivo)}
            </span>
          </div>
        )}
      </td>
      <td className="px-2 py-2 text-xs text-right text-black">
        {formatPercentage(ativo.quantoFalta)}
      </td>
      <td className="px-2 py-2 text-xs text-right text-black">
        {formatCurrency(ativo.necessidadeAporte)}
      </td>
      <td className="px-2 py-2 text-xs text-right text-black">
        {formatPercentage(ativo.rentabilidade)}
      </td>
    </tr>
  );
};

interface StocksSectionProps {
  secao: CarteiraStockSecao;
  formatCurrency: (value: number) => string;
  formatPercentage: (value: number) => string;
  formatNumber: (value: number) => string;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdateObjetivo: (ativoId: string, novoObjetivo: number) => void;
}

const StocksSection: React.FC<StocksSectionProps> = ({
  secao,
  formatCurrency,
  formatPercentage,
  formatNumber,
  isExpanded,
  onToggle,
  onUpdateObjetivo,
}) => {
  const placeholderCount = Math.max(0, MIN_PLACEHOLDER_ROWS - secao.ativos.length);

  return (
    <>
      {/* Cabeçalho da seção */}
      <tr 
        className="bg-[#808080] cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-2 py-2 text-xs bg-[#808080] text-white font-bold">
          <div className="flex items-center space-x-2">
            {isExpanded ? (
              <ChevronUpIcon className="w-4 h-4" />
            ) : (
              <ChevronDownIcon className="w-4 h-4" />
            )}
            <span>{secao.nome}</span>
          </div>
        </td>
        <td className="px-2 py-2 text-xs text-center bg-[#808080] text-white font-bold">-</td>
        <td className="px-2 py-2 text-xs text-center bg-[#808080] text-white font-bold">-</td>
        <td className="px-2 py-2 text-xs text-right bg-[#808080] text-white font-bold">
          {formatNumber(secao.totalQuantidade)}
        </td>
        <td className="px-2 py-2 text-xs text-center bg-[#808080] text-white font-bold">-</td>
        <td className="px-2 py-2 text-xs text-right bg-[#808080] text-white font-bold">
          {formatCurrency(secao.totalValorAplicado)}
        </td>
        <td className="px-2 py-2 text-xs text-center bg-[#808080] text-white font-bold">-</td>
        <td className="px-2 py-2 text-xs text-right bg-[#808080] text-white font-bold">
          {formatCurrency(secao.totalValorAtualizado)}
        </td>
        <td className="px-2 py-2 text-xs text-right bg-[#808080] text-white font-bold">
          {formatPercentage(secao.totalRisco)}
        </td>
        <td className="px-2 py-2 text-xs text-right bg-[#808080] text-white font-bold">
          {formatPercentage(secao.totalPercentualCarteira)}
        </td>
        <td className="px-2 py-2 text-xs text-right bg-[#808080] text-white font-bold">
          {formatPercentage(secao.totalObjetivo)}
        </td>
        <td className="px-2 py-2 text-xs text-right bg-[#808080] text-white font-bold">
          {formatPercentage(secao.totalQuantoFalta)}
        </td>
        <td className="px-2 py-2 text-xs text-right bg-[#808080] text-white font-bold">
          {formatCurrency(secao.totalNecessidadeAporte)}
        </td>
        <td className="px-2 py-2 text-xs text-right bg-[#808080] text-white font-bold">
          {formatPercentage(secao.rentabilidadeMedia)}
        </td>
      </tr>

      {/* Ativos da seção */}
      {isExpanded && secao.ativos.map((ativo) => (
        <StocksTableRow
          key={ativo.id}
          ativo={ativo}
          formatCurrency={formatCurrency}
          formatPercentage={formatPercentage}
          formatNumber={formatNumber}
          onUpdateObjetivo={onUpdateObjetivo}
        />
      ))}
      {isExpanded && (
        <BasicTablePlaceholderRows
          count={placeholderCount}
          colSpan={STOCKS_COLUMN_COUNT}
        />
      )}
    </>
  );
};

interface StocksTableProps {
  totalCarteira?: number;
}

export default function StocksTable({ totalCarteira = 0 }: StocksTableProps) {
  const { data, loading, error, formatCurrency, formatPercentage, formatNumber, updateObjetivo, updateCaixaParaInvestir } = useCarteiraStocks();
  const { necessidadeAporteMap, resumo } = useCarteiraResumoContext();
  const necessidadeAporteTotalCalculada = necessidadeAporteMap.stocks ?? data?.resumo?.necessidadeAporteTotal ?? 0;
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(STOCKS_SECTION_ORDER)
  );

  // Calcular risco (carteira total) e percentual da carteira da aba
  const dataComRisco = useMemo(() => {
    if (!data) return data;

    const totalTabValue = data.totalGeral?.valorAtualizado || 0;
    const shouldCalculateRisco = totalCarteira > 0;

    const secoesComRisco = data.secoes.map(secao => {
      const totalPercentualCarteira = totalTabValue > 0
        ? (secao.totalValorAtualizado / totalTabValue) * 100
        : 0;

      return {
        ...secao,
        ativos: secao.ativos.map(ativo => {
          // Percentual daquele tipo de ativo (não da carteira total)
          const percentualCarteira = totalTabValue > 0 ? (ativo.valorAtualizado / totalTabValue) * 100 : 0;
          const objetivo = ativo.objetivo || 0;
          // Quanto falta = diferença entre % atual e objetivo (em %)
          const quantoFalta = objetivo - percentualCarteira;
          // Necessidade de aporte = valor em R$ referente à porcentagem de "quanto falta" (calculado sobre o total daquele tipo de ativo)
          const necessidadeAporte = totalTabValue > 0 && quantoFalta > 0 
            ? (quantoFalta / 100) * totalTabValue 
            : 0;
          
          return {
            ...ativo,
            riscoPorAtivo: shouldCalculateRisco ? (ativo.valorAtualizado / totalCarteira) * 100 : 0,
            percentualCarteira,
            quantoFalta,
            necessidadeAporte,
          };
        }),
        totalPercentualCarteira,
        totalRisco: secao.ativos.reduce(
          (sum, ativo) => sum + (shouldCalculateRisco ? (ativo.valorAtualizado / totalCarteira) * 100 : 0),
          0
        ),
        totalQuantoFalta: secao.ativos.reduce((sum, ativo) => {
          const percentualCarteira = totalTabValue > 0 ? (ativo.valorAtualizado / totalTabValue) * 100 : 0;
          const objetivo = ativo.objetivo || 0;
          return sum + (objetivo - percentualCarteira);
        }, 0),
        totalNecessidadeAporte: secao.ativos.reduce((sum, ativo) => {
          const percentualCarteira = totalTabValue > 0 ? (ativo.valorAtualizado / totalTabValue) * 100 : 0;
          const objetivo = ativo.objetivo || 0;
          const quantoFalta = objetivo - percentualCarteira;
          return sum + (totalTabValue > 0 && quantoFalta > 0 ? (quantoFalta / 100) * totalTabValue : 0);
        }, 0),
      };
    });

    const totalGeralRisco = secoesComRisco.reduce(
      (sum, secao) => sum + secao.ativos.reduce((s, ativo) => s + ativo.riscoPorAtivo, 0),
      0
    );

    // Recalcular totais gerais
    const totalQuantoFalta = secoesComRisco.reduce((sum, secao) => sum + secao.totalQuantoFalta, 0);
    const totalNecessidadeAporte = secoesComRisco.reduce((sum, secao) => sum + secao.totalNecessidadeAporte, 0);

    return {
      ...data,
      secoes: secoesComRisco,
      totalGeral: {
        ...data.totalGeral,
        risco: totalGeralRisco,
        percentualCarteira: totalTabValue > 0 ? 100 : 0,
        quantoFalta: totalQuantoFalta,
        necessidadeAporte: totalNecessidadeAporte,
      },
    };
  }, [data, totalCarteira]);

  const toggleSection = (estrategia: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(estrategia)) {
      newExpanded.delete(estrategia);
    } else {
      newExpanded.add(estrategia);
    }
    setExpandedSections(newExpanded);
  };

  const handleUpdateObjetivo = async (ativoId: string, novoObjetivo: number) => {
    await updateObjetivo(ativoId, novoObjetivo);
  };

  const normalizedSections = useMemo(() => {
    const createEmptySection = (
      estrategia: (typeof STOCKS_SECTION_ORDER)[number],
      nome: string
    ): CarteiraStockSecao => ({
      estrategia: estrategia as EstrategiaCarteiraStock,
      nome,
      ativos: [],
      totalQuantidade: 0,
      totalValorAplicado: 0,
      totalValorAtualizado: 0,
      totalPercentualCarteira: 0,
      totalRisco: 0,
      totalObjetivo: 0,
      totalQuantoFalta: 0,
      totalNecessidadeAporte: 0,
      rentabilidadeMedia: 0,
    });

    const sectionMap = new Map<string, CarteiraStockSecao>();
    (dataComRisco?.secoes || []).forEach((secao) => {
      const nome = STOCKS_SECTION_NAMES[secao.estrategia];
      sectionMap.set(secao.estrategia, { ...secao, nome });
    });

    return STOCKS_SECTION_ORDER.map((estrategia) => {
      const nome = STOCKS_SECTION_NAMES[estrategia];
      return sectionMap.get(estrategia) ?? createEmptySection(estrategia, nome);
    });
  }, [dataComRisco?.secoes]);

  if (loading) {
    return <LoadingSpinner text="Carregando dados Stocks..." />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
            Erro ao carregar dados
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cards de resumo */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StocksMetricCard
          title="Necessidade de Aporte Total"
          value={formatCurrency(necessidadeAporteTotalCalculada)}
          color="warning"
        />
        <CaixaParaInvestirCard
          value={data?.resumo?.caixaParaInvestir ?? 0}
          formatCurrency={(value) => formatCurrency(value ?? 0)}
          onSave={updateCaixaParaInvestir}
          color="success"
        />
        <StocksMetricCard
          title="Saldo Início do Mês"
          value={formatCurrency(data?.resumo?.saldoInicioMes ?? 0)}
        />
        <StocksMetricCard
          title="Valor Atualizado"
          value={formatCurrency(data?.resumo?.valorAtualizado ?? 0)}
        />
        <StocksMetricCard
          title="Rendimento"
          value={formatCurrency(data?.resumo?.rendimento ?? 0)}
          color="success"
        />
        <StocksMetricCard
          title="Rentabilidade"
          value={formatPercentage(data?.resumo?.rentabilidade ?? 0)}
          color="success"
        />
      </div>

      {/* Tabela principal */}
      <ComponentCard title="Stocks - Detalhamento">
        <div className="overflow-x-auto">
          <table className="w-full text-xs [&_td]:h-6 [&_td]:leading-6 [&_td]:py-0 [&_th]:h-6 [&_th]:leading-6 [&_th]:py-0">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700" style={{ backgroundColor: '#9E8A58' }}>
                <th className="px-2 py-2 font-bold text-black text-xs text-left cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Nome do Ativo
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Sector
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Industry Category
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Quantidade
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Preço Médio
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Valor Total
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Cotação Atual
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Valor Atualizado
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  <span className="block">Risco Por Ativo</span>
                  <span className="block">(Carteira Total)</span>
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  % da Carteira
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Objetivo
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Quanto Falta
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Nec. Aporte $
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Rentabilidade
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Linha de totalização */}
              <tr className="bg-[#404040] border-t-2 border-gray-300">
                <td className="px-2 py-2 text-xs text-white font-bold">
                  TOTAL GERAL
                </td>
                <td className="px-2 py-2 text-xs text-center text-white font-bold">-</td>
                <td className="px-2 py-2 text-xs text-center text-white font-bold">-</td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatNumber(data?.totalGeral?.quantidade)}
                </td>
                <td className="px-2 py-2 text-xs text-center text-white font-bold">-</td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatCurrency(data?.totalGeral?.valorAplicado)}
                </td>
                <td className="px-2 py-2 text-xs text-center text-white font-bold">-</td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatCurrency(data?.totalGeral?.valorAtualizado)}
                </td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatPercentage(dataComRisco?.totalGeral?.risco || 0)}
                </td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  100.00%
                </td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatPercentage(data?.totalGeral?.objetivo)}
                </td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatPercentage(data?.totalGeral?.quantoFalta)}
                </td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatCurrency(data?.totalGeral?.necessidadeAporte)}
                </td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatPercentage(data?.totalGeral?.rentabilidade)}
                </td>
              </tr>

              {normalizedSections.map((secao) => (
                <StocksSection
                  key={secao.estrategia}
                  secao={secao}
                  formatCurrency={formatCurrency}
                  formatPercentage={formatPercentage}
                  formatNumber={formatNumber}
                  isExpanded={expandedSections.has(secao.estrategia)}
                  onToggle={() => toggleSection(secao.estrategia)}
                  onUpdateObjetivo={handleUpdateObjetivo}
                />
              ))}
            </tbody>
          </table>
        </div>
      </ComponentCard>

      {/* Gráfico e tabela auxiliar */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-6">
          <ComponentCard title="Distribuição por Ativo">
            <PieChartStocksAtivo data={data?.alocacaoAtivo ?? []} />
          </ComponentCard>
        </div>
        <div className="xl:col-span-6">
          <ComponentCard title="Resumo de Aportes">
            <div className="overflow-x-auto">
              <table className="w-full text-xs [&_td]:h-6 [&_td]:leading-6 [&_td]:py-0 [&_th]:h-6 [&_th]:leading-6 [&_th]:py-0">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Ticker
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Nome
                    </th>
                    <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Cotação Atual
                    </th>
                    <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Necessidade Aporte
                    </th>
                    <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Lote Aproximado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.tabelaAuxiliar || []).map((item, index) => (
                    <tr key={index} className="border-b border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50">
                      <td className="px-2 py-2 text-xs text-black">
                        {item.ticker}
                      </td>
                      <td className="px-2 py-2 text-xs text-black">
                        {item.nome}
                      </td>
                      <td className="px-2 py-2 text-xs text-right text-black">
                        {formatCurrency(item.cotacaoAtual)}
                      </td>
                      <td className="px-2 py-2 text-xs text-right text-black">
                        {formatCurrency(item.necessidadeAporte)}
                      </td>
                      <td className="px-2 py-2 text-xs text-right text-black">
                        {formatNumber(item.loteAproximado)}
                      </td>
                    </tr>
                  ))}
                  <BasicTablePlaceholderRows
                    count={Math.max(0, MIN_PLACEHOLDER_ROWS - (data?.tabelaAuxiliar?.length || 0))}
                    colSpan={STOCKS_AUX_COLUMN_COUNT}
                  />
                </tbody>
              </table>
            </div>
          </ComponentCard>
        </div>
      </div>
    </div>
  );
}
