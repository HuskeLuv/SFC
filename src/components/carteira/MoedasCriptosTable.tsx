"use client";
import React, { useState } from "react";
import { useMoedasCriptos } from "@/hooks/useMoedasCriptos";
import { MoedaCriptoAtivo, MoedaCriptoSecao } from "@/types/moedas-criptos";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ComponentCard from "@/components/common/ComponentCard";
import Badge from "@/components/ui/badge/Badge";
import { ChevronDownIcon, ChevronUpIcon, DollarLineIcon } from "@/icons";

interface MoedasCriptosMetricCardProps {
  title: string;
  value: string;
  color?: "primary" | "success" | "warning" | "error";
}

const MoedasCriptosMetricCard: React.FC<MoedasCriptosMetricCardProps> = ({
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

interface MoedasCriptosTableRowProps {
  ativo: MoedaCriptoAtivo;
  formatCurrency: (value: number, currency?: 'BRL' | 'USD') => string;
  formatPercentage: (value: number) => string;
  formatNumber: (value: number) => string;
  onUpdateObjetivo: (ativoId: string, novoObjetivo: number) => void;
  onUpdateCotacao: (ativoId: string, novaCotacao: number) => void;
}

const MoedasCriptosTableRow: React.FC<MoedasCriptosTableRowProps> = ({
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

  const getTipoColor = (tipo: string) => {
    const colors = {
      'moeda': 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
      'criptomoeda': 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300',
      'metal': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
      'outro': 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300',
    };
    return colors[tipo as keyof typeof colors] || colors.outros;
  };

  const getIndiceColor = (indice: string) => {
    const colors = {
      'dolar': 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
      'ouro': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
      'bitcoin': 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300',
      'ethereum': 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300',
      'sp500': 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
      'outros': 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300',
    };
    return colors[indice as keyof typeof colors] || colors.outros;
  };

  const currency = ativo.regiao === 'estados_unidos' ? 'USD' : 'BRL';

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
      <td className="px-2 py-2 text-center">
        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getIndiceColor(ativo.indiceRastreado)}`}>
          {ativo.indiceRastreado.charAt(0).toUpperCase() + ativo.indiceRastreado.slice(1).replace('_', ' ')}
        </span>
      </td>
      <td className="px-2 py-2 text-xs text-right font-medium text-gray-900 dark:text-white">
        {formatNumber(ativo.quantidade)}
      </td>
      <td className="px-2 py-2 text-xs text-right font-medium text-gray-900 dark:text-white">
        {formatCurrency(ativo.precoAquisicao, currency)}
      </td>
      <td className="px-2 py-2 text-xs text-right font-medium text-gray-900 dark:text-white">
        {formatCurrency(ativo.valorTotal, currency)}
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
              {formatCurrency(ativo.cotacaoAtual, currency)}
            </span>
          </div>
        )}
      </td>
      <td className="px-2 py-2 text-xs text-right font-semibold text-gray-900 dark:text-white">
        {formatCurrency(ativo.valorAtualizado, currency)}
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
          {formatCurrency(ativo.necessidadeAporte, currency)}
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

interface MoedasCriptosSectionProps {
  secao: MoedaCriptoSecao;
  formatCurrency: (value: number, currency?: 'BRL' | 'USD') => string;
  formatPercentage: (value: number) => string;
  formatNumber: (value: number) => string;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdateObjetivo: (ativoId: string, novoObjetivo: number) => void;
  onUpdateCotacao: (ativoId: string, novaCotacao: number) => void;
}

const MoedasCriptosSection: React.FC<MoedasCriptosSectionProps> = ({
  secao,
  formatCurrency,
  formatPercentage,
  formatNumber,
  isExpanded,
  onToggle,
  onUpdateObjetivo,
  onUpdateCotacao,
}) => {
  const getTipoColor = (tipo: string) => {
    const colors = {
      'moedas_metais': 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
      'etf_estados_unidos': 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
    };
    return colors[tipo as keyof typeof colors] || colors.moedas_metais;
  };

  const currency = secao.regiao === 'estados_unidos' ? 'USD' : 'BRL';

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
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getTipoColor(secao.tipo)}`}>
              {secao.tipo === 'moedas_metais' ? 'MOEDAS & METAIS' : 'ETF\'s EUA'}
            </span>
            <Badge color="primary" size="sm">
              {secao.ativos.length} {secao.ativos.length === 1 ? 'Ativo' : 'Ativos'}
            </Badge>
          </div>
        </td>
        <td className="px-2 py-2 text-xs text-center">-</td>
        <td className="px-2 py-2 text-xs text-right font-bold text-gray-900 dark:text-white">
          {formatNumber(secao.totalQuantidade)}
        </td>
        <td className="px-2 py-2 text-xs text-center">-</td>
        <td className="px-2 py-2 text-xs text-right font-bold text-gray-900 dark:text-white">
          {formatCurrency(secao.totalValorAplicado, currency)}
        </td>
        <td className="px-2 py-2 text-xs text-center">-</td>
        <td className="px-2 py-2 text-xs text-right font-bold text-gray-900 dark:text-white">
          {formatCurrency(secao.totalValorAtualizado, currency)}
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
            {formatCurrency(secao.totalNecessidadeAporte, currency)}
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
        <MoedasCriptosTableRow
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

export default function MoedasCriptosTable() {
  const { data, loading, error, formatCurrency, formatPercentage, formatNumber, updateObjetivo, updateCotacao } = useMoedasCriptos();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['moedas_metais', 'etf_estados_unidos'])
  );

  const toggleSection = (tipo: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(tipo)) {
      newExpanded.delete(tipo);
    } else {
      newExpanded.add(tipo);
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
    return <LoadingSpinner text="Carregando dados de moedas e criptomoedas..." />;
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
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <MoedasCriptosMetricCard
            title="Necessidade de Aporte Total"
            value={formatCurrency(0)}
            color="warning"
          />
          <MoedasCriptosMetricCard
            title="Caixa para Investir"
            value={formatCurrency(0)}
            color="success"
          />
          <MoedasCriptosMetricCard
            title="Saldo Início do Mês"
            value={formatCurrency(0)}
          />
          <MoedasCriptosMetricCard
            title="Valor Atualizado"
            value={formatCurrency(0)}
          />
          <MoedasCriptosMetricCard
            title="Rendimento"
            value={formatCurrency(0)}
            color="success"
          />
          <MoedasCriptosMetricCard
            title="Rentabilidade"
            value={formatPercentage(0)}
            color="success"
          />
        </div>

        <ComponentCard title="Moedas, Criptomoedas & Outros - Detalhamento">
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
              <DollarLineIcon className="w-8 h-8 text-gray-400" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Nenhum ativo encontrado
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
                Adicione moedas, criptomoedas e outros ativos para começar a acompanhar sua carteira diversificada.
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
        <MoedasCriptosMetricCard
          title="Necessidade de Aporte Total"
          value={formatCurrency(data.resumo.necessidadeAporteTotal)}
          color="warning"
        />
        <MoedasCriptosMetricCard
          title="Caixa para Investir"
          value={formatCurrency(data.resumo.caixaParaInvestir)}
          color="success"
        />
        <MoedasCriptosMetricCard
          title="Saldo Início do Mês"
          value={formatCurrency(data.resumo.saldoInicioMes)}
        />
        <MoedasCriptosMetricCard
          title="Valor Atualizado"
          value={formatCurrency(data.resumo.valorAtualizado)}
        />
        <MoedasCriptosMetricCard
          title="Rendimento"
          value={formatCurrency(data.resumo.rendimento)}
          color="success"
        />
        <MoedasCriptosMetricCard
          title="Rentabilidade"
          value={formatPercentage(data.resumo.rentabilidade)}
          color="success"
        />
      </div>

      {/* Tabela principal */}
      <ComponentCard title="Moedas, Criptomoedas & Outros - Detalhamento">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Nome do Ativo
                </th>
                <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Índice Rastreado
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Quantidade
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Preço Aquisição
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Valor Total
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Cotação em Tempo Real
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
              {data.secoes.map((secao) => (
                <MoedasCriptosSection
                  key={secao.tipo}
                  secao={secao}
                  formatCurrency={formatCurrency}
                  formatPercentage={formatPercentage}
                  formatNumber={formatNumber}
                  isExpanded={expandedSections.has(secao.tipo)}
                  onToggle={() => toggleSection(secao.tipo)}
                  onUpdateObjetivo={handleUpdateObjetivo}
                  onUpdateCotacao={handleUpdateCotacao}
                />
              ))}

              {/* Linha de totalização */}
              <tr className="bg-gray-50 dark:bg-gray-800 border-t-2 border-gray-300 dark:border-gray-600">
                <td className="px-2 py-2 text-xs font-bold text-gray-900 dark:text-white">
                  TOTAL GERAL
                </td>
                <td className="px-2 py-2 text-xs text-center">-</td>
                <td className="px-2 py-2 text-xs text-right font-bold text-gray-900 dark:text-white">
                  {formatNumber(data.totalGeral.quantidade)}
                </td>
                <td className="px-2 py-2 text-xs text-center">-</td>
                <td className="px-2 py-2 text-xs text-right font-bold text-gray-900 dark:text-white">
                  {formatCurrency(data.totalGeral.valorAplicado)}
                </td>
                <td className="px-2 py-2 text-xs text-center">-</td>
                <td className="px-2 py-2 text-xs text-right font-bold text-gray-900 dark:text-white">
                  {formatCurrency(data.totalGeral.valorAtualizado)}
                </td>
                <td className="px-2 py-2 text-xs text-right">
                  <Badge color="primary" size="sm">
                    {formatPercentage(data.totalGeral.risco)}
                  </Badge>
                </td>
                <td className="px-2 py-2 text-xs text-right">
                  <Badge color="primary" size="sm">100.00%</Badge>
                </td>
                <td className="px-2 py-2 text-xs text-right">
                  <Badge color="primary" size="sm">
                    {formatPercentage(data.totalGeral.objetivo)}
                  </Badge>
                </td>
                <td className="px-2 py-2 text-xs text-right">
                  <Badge 
                    color={data.totalGeral.quantoFalta > 0 ? "warning" : data.totalGeral.quantoFalta < 0 ? "success" : "primary"} 
                    size="sm"
                  >
                    {formatPercentage(data.totalGeral.quantoFalta)}
                  </Badge>
                </td>
                <td className="px-2 py-2 text-xs text-right font-bold">
                  <span className={data.totalGeral.necessidadeAporte > 0 ? "text-orange-600 dark:text-orange-400" : "text-gray-600 dark:text-gray-400"}>
                    {formatCurrency(data.totalGeral.necessidadeAporte)}
                  </span>
                </td>
                <td className="px-2 py-2 text-xs text-right">
                  <Badge 
                    color={data.totalGeral.rentabilidade >= 0 ? "success" : "error"} 
                    size="sm"
                  >
                    {formatPercentage(data.totalGeral.rentabilidade)}
                  </Badge>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </ComponentCard>

    </div>
  );
}
