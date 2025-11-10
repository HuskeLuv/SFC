"use client";
import React, { useState } from "react";
import { useCarteiraStocks } from "@/hooks/useStocks";
import { CarteiraStockAtivo, CarteiraStockSecao } from "@/types/carteiraStocks";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ComponentCard from "@/components/common/ComponentCard";
import Badge from "@/components/ui/badge/Badge";
import PieChartStocksAtivo from "@/components/charts/pie/PieChartStocksAtivo";
import { ChevronDownIcon, ChevronUpIcon, DollarLineIcon } from "@/icons";
import { useCarteiraResumoContext } from "@/context/CarteiraResumoContext";

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
  onUpdateCotacao: (ativoId: string, novaCotacao: number) => void;
}

const StocksTableRow: React.FC<StocksTableRowProps> = ({
  ativo,
  formatCurrency,
  formatPercentage,
  formatNumber,
  onUpdateObjetivo,
  onUpdateCotacao,
}) => {
  const [isEditingObjetivo, setIsEditingObjetivo] = useState(false);
  const [isEditingCotacao, setIsEditingCotacao] = useState(false);
  const [objetivoValue, setObjetivoValue] = useState(ativo.objetivo.toString());
  const [cotacaoValue, setCotacaoValue] = useState(ativo.cotacaoAtual.toString());

  const handleObjetivoSubmit = () => {
    const novoObjetivo = parseFloat(objetivoValue);
    if (!isNaN(novoObjetivo) && novoObjetivo >= 0) {
      onUpdateObjetivo(ativo.id, novoObjetivo);
      setIsEditingObjetivo(false);
    }
  };

  const handleCotacaoSubmit = () => {
    const novaCotacao = parseFloat(cotacaoValue);
    if (!isNaN(novaCotacao) && novaCotacao > 0) {
      onUpdateCotacao(ativo.id, novaCotacao);
      setIsEditingCotacao(false);
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

  const handleCotacaoKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCotacaoSubmit();
    } else if (e.key === 'Escape') {
      setCotacaoValue(ativo.cotacaoAtual.toString());
      setIsEditingCotacao(false);
    }
  };

  const getSectorColor = (sector: string) => {
    const colors = {
      'technology': 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
      'financials': 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
      'healthcare': 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
      'consumer': 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300',
      'energy': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
      'industrials': 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300',
      'materials': 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300',
      'utilities': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300',
      'communication': 'bg-pink-100 text-pink-800 dark:bg-pink-900/20 dark:text-pink-300',
      'real_estate': 'bg-teal-100 text-teal-800 dark:bg-teal-900/20 dark:text-teal-300',
      'other': 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300',
    };
    return colors[sector as keyof typeof colors] || colors.other;
  };

  return (
    <tr className="border-b border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50">
      <td className="px-2 py-2 text-xs font-medium text-gray-900 dark:text-white">
        <div>
          <div className="font-semibold">{ativo.ticker}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{ativo.nome}</div>
          {ativo.observacoes && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {ativo.observacoes}
            </div>
          )}
        </div>
      </td>
      <td className="px-2 py-2 text-xs text-center">
        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getSectorColor(ativo.sector)}`}>
          {ativo.sector ? ativo.sector.charAt(0).toUpperCase() + ativo.sector.slice(1).replace('_', ' ') : 'Outros'}
        </span>
      </td>
      <td className="px-2 py-2 text-xs text-center text-gray-700 dark:text-gray-300">
        {ativo.industryCategory}
      </td>
      <td className="px-2 py-2 text-xs text-right font-medium text-gray-900 dark:text-white">
        {formatNumber(ativo.quantidade)}
      </td>
      <td className="px-2 py-2 text-xs text-right font-medium text-gray-900 dark:text-white">
        {formatCurrency(ativo.precoAquisicao)}
      </td>
      <td className="px-2 py-2 text-xs text-right font-medium text-gray-900 dark:text-white">
        {formatCurrency(ativo.valorTotal)}
      </td>
      <td className="px-2 py-2 text-xs text-right">
        {isEditingCotacao ? (
          <div className="flex items-center space-x-1">
            <input
              type="number"
              step="0.01"
              value={cotacaoValue}
              onChange={(e) => setCotacaoValue(e.target.value)}
              onKeyDown={handleCotacaoKeyPress}
              onBlur={handleCotacaoSubmit}
              className="w-20 px-1 py-0.5 text-xs border border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              autoFocus
            />
          </div>
        ) : (
          <div 
            className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 rounded"
            onClick={() => setIsEditingCotacao(true)}
          >
            <span className="font-medium text-gray-900 dark:text-white">
              {formatCurrency(ativo.cotacaoAtual)}
            </span>
          </div>
        )}
      </td>
      <td className="px-2 py-2 text-xs text-right font-semibold text-gray-900 dark:text-white">
        {formatCurrency(ativo.valorAtualizado)}
      </td>
      <td className="px-2 py-2 text-xs text-right">
        <Badge 
          color={ativo.riscoPorAtivo > 20 ? "error" : ativo.riscoPorAtivo > 10 ? "warning" : "primary"} 
          size="sm"
        >
          {formatPercentage(ativo.riscoPorAtivo)}
        </Badge>
      </td>
      <td className="px-2 py-2 text-xs text-right">
        <Badge 
          color={ativo.percentualCarteira > 25 ? "warning" : "primary"} 
          size="sm"
        >
          {formatPercentage(ativo.percentualCarteira)}
        </Badge>
      </td>
      <td className="px-2 py-2 text-xs text-right">
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
            <span className="text-xs text-gray-500">%</span>
          </div>
        ) : (
          <div 
            className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 rounded"
            onClick={() => setIsEditingObjetivo(true)}
          >
            <Badge color="primary" size="sm">
              {formatPercentage(ativo.objetivo)}
            </Badge>
          </div>
        )}
      </td>
      <td className="px-2 py-2 text-xs text-right">
        <Badge 
          color={ativo.quantoFalta > 0 ? "warning" : ativo.quantoFalta < 0 ? "success" : "primary"} 
          size="sm"
        >
          {formatPercentage(ativo.quantoFalta)}
        </Badge>
      </td>
      <td className="px-2 py-2 text-xs text-right font-medium">
        <span className={ativo.necessidadeAporte > 0 ? "text-orange-600 dark:text-orange-400" : "text-gray-600 dark:text-gray-400"}>
          {formatCurrency(ativo.necessidadeAporte)}
        </span>
      </td>
      <td className="px-2 py-2 text-xs text-right">
        <Badge 
          color={ativo.rentabilidade >= 0 ? "success" : "error"} 
          size="sm"
        >
          {formatPercentage(ativo.rentabilidade)}
        </Badge>
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
  onUpdateCotacao: (ativoId: string, novaCotacao: number) => void;
}

const StocksSection: React.FC<StocksSectionProps> = ({
  secao,
  formatCurrency,
  formatPercentage,
  formatNumber,
  isExpanded,
  onToggle,
  onUpdateObjetivo,
  onUpdateCotacao,
}) => {
  const getEstrategiaColor = (estrategia: string) => {
    const colors = {
      'value': 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
      'growth': 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
      'risk': 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
    };
    return colors[estrategia as keyof typeof colors] || colors.value;
  };

  return (
    <>
      {/* Cabeçalho da seção */}
      <tr 
        className="bg-gray-100 dark:bg-gray-800 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
        onClick={onToggle}
      >
        <td className="px-2 py-2 text-xs font-bold text-gray-900 dark:text-white">
          <div className="flex items-center space-x-2">
            {isExpanded ? (
              <ChevronUpIcon className="w-4 h-4" />
            ) : (
              <ChevronDownIcon className="w-4 h-4" />
            )}
            <span>{secao.nome}</span>
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getEstrategiaColor(secao.estrategia)}`}>
              {secao.estrategia.toUpperCase()}
            </span>
            <Badge color="primary" size="sm">
              {secao.ativos.length} {secao.ativos.length === 1 ? 'stock' : 'stocks'}
            </Badge>
          </div>
        </td>
        <td className="px-2 py-2 text-xs text-center">-</td>
        <td className="px-2 py-2 text-xs text-center">-</td>
        <td className="px-2 py-2 text-xs text-right font-bold text-gray-900 dark:text-white">
          {formatNumber(secao.totalQuantidade)}
        </td>
        <td className="px-2 py-2 text-xs text-center">-</td>
        <td className="px-2 py-2 text-xs text-right font-bold text-gray-900 dark:text-white">
          {formatCurrency(secao.totalValorAplicado)}
        </td>
        <td className="px-2 py-2 text-xs text-center">-</td>
        <td className="px-2 py-2 text-xs text-right font-bold text-gray-900 dark:text-white">
          {formatCurrency(secao.totalValorAtualizado)}
        </td>
        <td className="px-2 py-2 text-xs text-right">
          <Badge color="primary" size="sm">
            {formatPercentage(secao.totalRisco)}
          </Badge>
        </td>
        <td className="px-2 py-2 text-xs text-right">
          <Badge color="primary" size="sm">
            {formatPercentage(secao.totalPercentualCarteira)}
          </Badge>
        </td>
        <td className="px-2 py-2 text-xs text-right">
          <Badge color="primary" size="sm">
            {formatPercentage(secao.totalObjetivo)}
          </Badge>
        </td>
        <td className="px-2 py-2 text-xs text-right">
          <Badge 
            color={secao.totalQuantoFalta > 0 ? "warning" : secao.totalQuantoFalta < 0 ? "success" : "primary"} 
            size="sm"
          >
            {formatPercentage(secao.totalQuantoFalta)}
          </Badge>
        </td>
        <td className="px-2 py-2 text-xs text-right font-bold">
          <span className={secao.totalNecessidadeAporte > 0 ? "text-orange-600 dark:text-orange-400" : "text-gray-600 dark:text-gray-400"}>
            {formatCurrency(secao.totalNecessidadeAporte)}
          </span>
        </td>
        <td className="px-2 py-2 text-xs text-right">
          <Badge 
            color={secao.rentabilidadeMedia >= 0 ? "success" : "error"} 
            size="sm"
          >
            {formatPercentage(secao.rentabilidadeMedia)}
          </Badge>
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
          onUpdateCotacao={onUpdateCotacao}
        />
      ))}
    </>
  );
};

export default function StocksTable() {
  const { data, loading, error, formatCurrency, formatPercentage, formatNumber, updateObjetivo, updateCotacao } = useCarteiraStocks();
  const { necessidadeAporteMap } = useCarteiraResumoContext();
  const necessidadeAporteTotalCalculada = necessidadeAporteMap.stocks ?? data?.resumo?.necessidadeAporteTotal ?? 0;
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['value', 'growth', 'risk'])
  );

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

  const handleUpdateCotacao = async (ativoId: string, novaCotacao: number) => {
    await updateCotacao(ativoId, novaCotacao);
  };

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

  if (!data) {
    return (
      <div className="space-y-4">
        {/* Cards de resumo */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <StocksMetricCard
            title="Necessidade de Aporte Total"
            value={formatCurrency(necessidadeAporteTotalCalculada)}
            color="warning"
          />
          <StocksMetricCard
            title="Caixa para Investir"
            value={formatCurrency(0)}
            color="success"
          />
          <StocksMetricCard
            title="Saldo Início do Mês"
            value={formatCurrency(0)}
          />
          <StocksMetricCard
            title="Valor Atualizado"
            value={formatCurrency(0)}
          />
          <StocksMetricCard
            title="Rendimento"
            value={formatCurrency(0)}
            color="success"
          />
          <StocksMetricCard
            title="Rentabilidade"
            value={formatPercentage(0)}
            color="success"
          />
        </div>

        <ComponentCard title="Stocks - Detalhamento">
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
              <DollarLineIcon className="w-8 h-8 text-gray-400" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Nenhum stock encontrado
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
                Adicione stocks para começar a acompanhar sua carteira internacional.
              </p>
            </div>
          </div>
        </ComponentCard>
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
        <StocksMetricCard
          title="Caixa para Investir"
          value={formatCurrency(data?.resumo?.caixaParaInvestir)}
          color="success"
        />
        <StocksMetricCard
          title="Saldo Início do Mês"
          value={formatCurrency(data?.resumo?.saldoInicioMes)}
        />
        <StocksMetricCard
          title="Valor Atualizado"
          value={formatCurrency(data?.resumo?.valorAtualizado)}
        />
        <StocksMetricCard
          title="Rendimento"
          value={formatCurrency(data?.resumo?.rendimento)}
          color="success"
        />
        <StocksMetricCard
          title="Rentabilidade"
          value={formatPercentage(data?.resumo?.rentabilidade)}
          color="success"
        />
      </div>

      {/* Tabela principal */}
      <ComponentCard title="Stocks - Detalhamento">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Nome do Ativo
                </th>
                <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Sector
                </th>
                <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Industry Category
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Quantidade
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Preço Médio
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Valor Total
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Cotação Atual
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Valor Atualizado
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Risco por Ativo
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  % da Carteira
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Objetivo
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Quanto Falta
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Nec. Aporte $
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Rentabilidade
                </th>
              </tr>
            </thead>
            <tbody>
              {data?.secoes?.map((secao) => (
                <StocksSection
                  key={secao.estrategia}
                  secao={secao}
                  formatCurrency={formatCurrency}
                  formatPercentage={formatPercentage}
                  formatNumber={formatNumber}
                  isExpanded={expandedSections.has(secao.estrategia)}
                  onToggle={() => toggleSection(secao.estrategia)}
                  onUpdateObjetivo={handleUpdateObjetivo}
                  onUpdateCotacao={handleUpdateCotacao}
                />
              )) || []}

              {/* Linha de totalização */}
              <tr className="bg-gray-50 dark:bg-gray-800 border-t-2 border-gray-300 dark:border-gray-600">
                <td className="px-2 py-2 text-xs font-bold text-gray-900 dark:text-white">
                  TOTAL GERAL
                </td>
                <td className="px-2 py-2 text-xs text-center">-</td>
                <td className="px-2 py-2 text-xs text-center">-</td>
                <td className="px-2 py-2 text-xs text-right font-bold text-gray-900 dark:text-white">
                  {formatNumber(data?.totalGeral?.quantidade)}
                </td>
                <td className="px-2 py-2 text-xs text-center">-</td>
                <td className="px-2 py-2 text-xs text-right font-bold text-gray-900 dark:text-white">
                  {formatCurrency(data?.totalGeral?.valorAplicado)}
                </td>
                <td className="px-2 py-2 text-xs text-center">-</td>
                <td className="px-2 py-2 text-xs text-right font-bold text-gray-900 dark:text-white">
                  {formatCurrency(data?.totalGeral?.valorAtualizado)}
                </td>
                <td className="px-2 py-2 text-xs text-right">
                  <Badge color="primary" size="sm">
                    {formatPercentage(data?.totalGeral?.risco)}
                  </Badge>
                </td>
                <td className="px-2 py-2 text-xs text-right">
                  <Badge color="primary" size="sm">100.00%</Badge>
                </td>
                <td className="px-2 py-2 text-xs text-right">
                  <Badge color="primary" size="sm">
                    {formatPercentage(data?.totalGeral?.objetivo)}
                  </Badge>
                </td>
                <td className="px-2 py-2 text-xs text-right">
                  <Badge 
                    color={data?.totalGeral?.quantoFalta > 0 ? "warning" : data?.totalGeral?.quantoFalta < 0 ? "success" : "primary"} 
                    size="sm"
                  >
                    {formatPercentage(data?.totalGeral?.quantoFalta)}
                  </Badge>
                </td>
                <td className="px-2 py-2 text-xs text-right font-bold">
                  <span className={data?.totalGeral?.necessidadeAporte > 0 ? "text-orange-600 dark:text-orange-400" : "text-gray-600 dark:text-gray-400"}>
                    {formatCurrency(data?.totalGeral?.necessidadeAporte)}
                  </span>
                </td>
                <td className="px-2 py-2 text-xs text-right">
                  <Badge 
                    color={data?.totalGeral?.rentabilidade >= 0 ? "success" : "error"} 
                    size="sm"
                  >
                    {formatPercentage(data?.totalGeral?.rentabilidade)}
                  </Badge>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </ComponentCard>

      {/* Gráfico e tabela auxiliar */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-6">
          <ComponentCard title="Distribuição por Ativo">
            <PieChartStocksAtivo data={data?.alocacaoAtivo} />
          </ComponentCard>
        </div>
        <div className="xl:col-span-6">
          <ComponentCard title="Resumo de Aportes">
            <div className="overflow-x-auto">
              <table className="w-full">
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
                  {data?.tabelaAuxiliar?.map((item, index) => (
                    <tr key={index} className="border-b border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50">
                      <td className="px-2 py-2 text-xs font-medium text-gray-900 dark:text-white">
                        {item.ticker}
                      </td>
                      <td className="px-2 py-2 text-xs text-gray-700 dark:text-gray-300">
                        {item.nome}
                      </td>
                      <td className="px-2 py-2 text-xs text-right font-medium text-gray-900 dark:text-white">
                        {formatCurrency(item.cotacaoAtual)}
                      </td>
                      <td className="px-2 py-2 text-xs text-right font-medium">
                        <span className={item.necessidadeAporte > 0 ? "text-orange-600 dark:text-orange-400" : "text-gray-600 dark:text-gray-400"}>
                          {formatCurrency(item.necessidadeAporte)}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-xs text-right font-medium text-gray-900 dark:text-white">
                        {formatNumber(item.loteAproximado)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ComponentCard>
        </div>
      </div>
    </div>
  );
}
