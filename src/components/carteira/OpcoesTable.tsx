"use client";
import React, { useState, useMemo } from "react";
import { useOpcoes } from "@/hooks/useOpcoes";
import { OpcaoAtivo, OpcaoSecao } from "@/types/opcoes";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ComponentCard from "@/components/common/ComponentCard";
import { ChevronDownIcon, ChevronUpIcon, DollarLineIcon } from "@/icons";
import { useCarteiraResumoContext } from "@/context/CarteiraResumoContext";

interface OpcoesMetricCardProps {
  title: string;
  value: string;
  color?: "primary" | "success" | "warning" | "error";
}

const OpcoesMetricCard: React.FC<OpcoesMetricCardProps> = ({
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

interface OpcoesTableRowProps {
  ativo: OpcaoAtivo;
  formatCurrency: (value: number, currency?: 'BRL' | 'USD') => string;
  formatPercentage: (value: number) => string;
  formatNumber: (value: number) => string;
  onUpdateObjetivo: (ativoId: string, novoObjetivo: number) => void;
  onUpdateCotacao: (ativoId: string, novaCotacao: number) => void;
}

const OpcoesTableRow: React.FC<OpcoesTableRowProps> = ({
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

  const formatVencimento = (vencimento: string) => {
    const date = new Date(vencimento);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });
  };

  return (
    <tr className="border-b border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50">
      <td className="px-2 py-2 text-xs font-medium text-black">
        <div>
          <div className="font-semibold">{ativo.nome}</div>
          {ativo.observacoes && (
            <div className="text-xs text-black mt-1">
              {ativo.observacoes}
            </div>
          )}
        </div>
      </td>
      <td className="px-2 py-2 text-xs text-center">
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs">
          {ativo.compraVenda.charAt(0).toUpperCase() + ativo.compraVenda.slice(1)}
        </span>
      </td>
      <td className="px-2 py-2 text-xs text-center font-medium text-black">
        {formatVencimento(ativo.vencimento)}
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
            <span className="text-black">{formatCurrency(ativo.cotacaoAtual)}</span>
          </div>
        )}
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

interface OpcoesSectionProps {
  secao: OpcaoSecao;
  formatCurrency: (value: number, currency?: 'BRL' | 'USD') => string;
  formatPercentage: (value: number) => string;
  formatNumber: (value: number) => string;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdateObjetivo: (ativoId: string, novoObjetivo: number) => void;
  onUpdateCotacao: (ativoId: string, novaCotacao: number) => void;
}

const OpcoesSection: React.FC<OpcoesSectionProps> = ({
  secao,
  formatCurrency,
  formatPercentage,
  formatNumber,
  isExpanded,
  onToggle,
  onUpdateObjetivo,
  onUpdateCotacao,
}) => {
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
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs">
              {secao.tipo === 'put' ? 'PUT' : 'CALL'}
            </span>
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
        <OpcoesTableRow
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

interface OpcoesTableProps {
  totalCarteira?: number;
}

export default function OpcoesTable({ totalCarteira = 0 }: OpcoesTableProps) {
  const { data, loading, error, formatCurrency, formatPercentage, formatNumber, updateObjetivo, updateCotacao } = useOpcoes();
  const { necessidadeAporteMap } = useCarteiraResumoContext();
  const necessidadeAporteTotalCalculada = necessidadeAporteMap.opcoes ?? data?.resumo?.necessidadeAporteTotal ?? 0;
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['put', 'call'])
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
        ativos: secao.ativos.map(ativo => ({
          ...ativo,
          riscoPorAtivo: shouldCalculateRisco ? (ativo.valorAtualizado / totalCarteira) * 100 : 0,
          percentualCarteira: totalTabValue > 0 ? (ativo.valorAtualizado / totalTabValue) * 100 : 0,
        })),
        totalPercentualCarteira,
        totalRisco: secao.ativos.reduce(
          (sum, ativo) => sum + (shouldCalculateRisco ? (ativo.valorAtualizado / totalCarteira) * 100 : 0),
          0
        ),
      };
    });

    const totalGeralRisco = secoesComRisco.reduce(
      (sum, secao) => sum + secao.ativos.reduce((s, ativo) => s + ativo.riscoPorAtivo, 0),
      0
    );

    return {
      ...data,
      secoes: secoesComRisco,
      totalGeral: {
        ...data.totalGeral,
        risco: totalGeralRisco,
        percentualCarteira: totalTabValue > 0 ? 100 : 0,
      },
    };
  }, [data, totalCarteira]);

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
    return <LoadingSpinner text="Carregando dados de opções..." />;
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
          <OpcoesMetricCard
            title="Necessidade de Aporte Total"
            value={formatCurrency(necessidadeAporteTotalCalculada)}
            color="warning"
          />
          <OpcoesMetricCard
            title="Caixa para Investir"
            value={formatCurrency(0)}
            color="success"
          />
          <OpcoesMetricCard
            title="Saldo Início do Mês"
            value={formatCurrency(0)}
          />
          <OpcoesMetricCard
            title="Valor Atualizado"
            value={formatCurrency(0)}
          />
          <OpcoesMetricCard
            title="Rendimento"
            value={formatCurrency(0)}
            color="success"
          />
          <OpcoesMetricCard
            title="Rentabilidade"
            value={formatPercentage(0)}
            color="success"
          />
        </div>

        <ComponentCard title="Opções - Detalhamento">
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
              <DollarLineIcon className="w-8 h-8 text-gray-400" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-black mb-2">
                Nenhum ativo encontrado
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
                Adicione opções de compra e venda para começar a acompanhar sua carteira de derivativos.
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
        <OpcoesMetricCard
          title="Necessidade de Aporte Total"
          value={formatCurrency(necessidadeAporteTotalCalculada)}
          color="warning"
        />
        <OpcoesMetricCard
          title="Caixa para Investir"
          value={formatCurrency(data.resumo.caixaParaInvestir)}
          color="success"
        />
        <OpcoesMetricCard
          title="Saldo Início do Mês"
          value={formatCurrency(data.resumo.saldoInicioMes)}
        />
        <OpcoesMetricCard
          title="Valor Atualizado"
          value={formatCurrency(data.resumo.valorAtualizado)}
        />
        <OpcoesMetricCard
          title="Rendimento"
          value={formatCurrency(data.resumo.rendimento)}
          color="success"
        />
        <OpcoesMetricCard
          title="Rentabilidade"
          value={formatPercentage(data.resumo.rentabilidade)}
          color="success"
        />
      </div>

      {/* Tabela principal */}
      <ComponentCard title="Opções - Detalhamento">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700" style={{ backgroundColor: '#9E8A58' }}>
                <th className="px-2 py-2 font-bold text-black text-xs text-left cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Nome do Ativo
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Compra/Venda
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Vencimento
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Quantidade
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Preço Aquisição
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Valor Total
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Cotação em Tempo Real
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
              {dataComRisco?.secoes.map((secao) => (
                <OpcoesSection
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
              <tr className="bg-[#808080] border-t-2 border-gray-300">
                <td className="px-2 py-2 text-xs text-white font-bold">
                  TOTAL GERAL
                </td>
                <td className="px-2 py-2 text-xs text-center text-white font-bold">-</td>
                <td className="px-2 py-2 text-xs text-center text-white font-bold">-</td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatNumber(dataComRisco?.totalGeral?.quantidade || 0)}
                </td>
                <td className="px-2 py-2 text-xs text-center text-white font-bold">-</td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatCurrency(dataComRisco?.totalGeral?.valorAplicado || 0)}
                </td>
                <td className="px-2 py-2 text-xs text-center text-white font-bold">-</td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatCurrency(dataComRisco?.totalGeral?.valorAtualizado || 0)}
                </td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatPercentage(dataComRisco?.totalGeral?.risco || 0)}
                </td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  100.00%
                </td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatPercentage(dataComRisco?.totalGeral?.objetivo || 0)}
                </td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatPercentage(dataComRisco?.totalGeral?.quantoFalta || 0)}
                </td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatCurrency(dataComRisco?.totalGeral?.necessidadeAporte || 0)}
                </td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatPercentage(dataComRisco?.totalGeral?.rentabilidade || 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </ComponentCard>
    </div>
  );
}

