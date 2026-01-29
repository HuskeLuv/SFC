"use client";
import React, { useState, useMemo } from "react";
import { usePrevidenciaSeguros } from "@/hooks/usePrevidenciaSeguros";
import { PrevidenciaSegurosAtivo } from "@/types/previdencia-seguros";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ComponentCard from "@/components/common/ComponentCard";
import { useCarteiraResumoContext } from "@/context/CarteiraResumoContext";
import { BasicTablePlaceholderRows } from "@/components/carteira/shared";

const MIN_PLACEHOLDER_ROWS = 4;
const PREVIDENCIA_SEGUROS_COLUMN_COUNT = 17;

interface PrevidenciaSegurosMetricCardProps {
  title: string;
  value: string;
  color?: "primary" | "success" | "warning" | "error";
}

const PrevidenciaSegurosMetricCard: React.FC<PrevidenciaSegurosMetricCardProps> = ({
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

interface PrevidenciaSegurosTableRowProps {
  ativo: PrevidenciaSegurosAtivo;
  formatCurrency: (value: number, currency?: 'BRL' | 'USD') => string;
  formatPercentage: (value: number) => string;
  formatNumber: (value: number) => string;
  onUpdateObjetivo: (ativoId: string, novoObjetivo: number) => void;
  onUpdateCotacao: (ativoId: string, novaCotacao: number) => void;
}

const PrevidenciaSegurosTableRow: React.FC<PrevidenciaSegurosTableRowProps> = ({
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

  return (
    <tr className="border-b border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50">
      <td className="px-2 py-2 text-xs text-black">
        <div>
          <div>{ativo.nome}</div>
          {ativo.observacoes && (
            <div className="text-xs text-black mt-1">
              {ativo.observacoes}
            </div>
          )}
        </div>
      </td>
      <td className="px-2 py-2 text-xs text-center text-black">
        {ativo.carencia} meses
      </td>
      <td className="px-2 py-2 text-xs text-center text-black">
        {formatPercentage(ativo.cotacaoResgate * 100)}
      </td>
      <td className="px-2 py-2 text-xs text-center text-black">
        {ativo.liquidacaoResgate} dias
      </td>
      <td className="px-2 py-2 text-xs text-center">
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs">
          {ativo.modalidade.charAt(0).toUpperCase() + ativo.modalidade.slice(1)}
        </span>
      </td>
      <td className="px-2 py-2 text-xs text-center">
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs">
          {ativo.subclasse.charAt(0).toUpperCase() + ativo.subclasse.slice(1).replace('_', ' ')}
        </span>
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

interface PrevidenciaSegurosTableProps {
  totalCarteira?: number;
}

export default function PrevidenciaSegurosTable({ totalCarteira = 0 }: PrevidenciaSegurosTableProps) {
  const { data, loading, error, formatCurrency, formatPercentage, formatNumber, updateObjetivo, updateCotacao } = usePrevidenciaSeguros();
  const { necessidadeAporteMap } = useCarteiraResumoContext();
  const necessidadeAporteTotalCalculada = necessidadeAporteMap.previdenciaSeguros ?? data?.resumo?.necessidadeAporteTotal ?? 0;
  const ativosComRisco = useMemo(() => {
    if (!data) return [];

    const ativos = data.secoes.flatMap((secao) => secao.ativos);
    const totalTabValue = ativos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
    const shouldCalculateRisco = totalCarteira > 0;

    return ativos.map((ativo) => ({
      ...ativo,
      riscoPorAtivo: shouldCalculateRisco ? (ativo.valorAtualizado / totalCarteira) * 100 : 0,
      percentualCarteira: totalTabValue > 0 ? (ativo.valorAtualizado / totalTabValue) * 100 : 0,
    }));
  }, [data, totalCarteira]);

  const handleUpdateObjetivo = async (ativoId: string, novoObjetivo: number) => {
    await updateObjetivo(ativoId, novoObjetivo);
  };

  const handleUpdateCotacao = async (ativoId: string, novaCotacao: number) => {
    await updateCotacao(ativoId, novaCotacao);
  };


  if (loading) {
    return <LoadingSpinner text="Carregando dados de previdência e seguros..." />;
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
        <PrevidenciaSegurosMetricCard
          title="Necessidade de Aporte Total"
          value={formatCurrency(necessidadeAporteTotalCalculada)}
          color="warning"
        />
        <PrevidenciaSegurosMetricCard
          title="Caixa para Investir"
          value={formatCurrency(data?.resumo?.caixaParaInvestir ?? 0)}
          color="success"
        />
        <PrevidenciaSegurosMetricCard
          title="Saldo Início do Mês"
          value={formatCurrency(data?.resumo?.saldoInicioMes ?? 0)}
        />
        <PrevidenciaSegurosMetricCard
          title="Valor Atualizado"
          value={formatCurrency(data?.resumo?.valorAtualizado ?? 0)}
        />
        <PrevidenciaSegurosMetricCard
          title="Rendimento"
          value={formatCurrency(data?.resumo?.rendimento ?? 0)}
          color="success"
        />
        <PrevidenciaSegurosMetricCard
          title="Rentabilidade"
          value={formatPercentage(data?.resumo?.rentabilidade ?? 0)}
          color="success"
        />
      </div>

      {/* Tabela principal */}
      <ComponentCard title="Previdência & Seguros - Detalhamento">
        <div className="overflow-x-auto">
          <table className="w-full text-xs [&_td]:h-6 [&_td]:leading-6 [&_td]:py-0 [&_th]:h-6 [&_th]:leading-6 [&_th]:py-0">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700" style={{ backgroundColor: '#9E8A58' }}>
                <th className="px-2 py-2 font-bold text-black text-xs text-left cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Nome do Ativo
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Carência
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Cotação de Resgate
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Liquidação de Resgate
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Modalidade
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Subclasse
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
              {/* Linha de totalização */}
              <tr className="bg-[#404040] border-t-2 border-gray-300">
                <td className="px-2 py-2 text-xs text-white font-bold">
                  TOTAL GERAL
                </td>
                <td className="px-2 py-2 text-xs text-center text-white font-bold">-</td>
                <td className="px-2 py-2 text-xs text-center text-white font-bold">-</td>
                <td className="px-2 py-2 text-xs text-center text-white font-bold">-</td>
                <td className="px-2 py-2 text-xs text-center text-white font-bold">-</td>
                <td className="px-2 py-2 text-xs text-center text-white font-bold">-</td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatNumber(data?.totalGeral?.quantidade || 0)}
                </td>
                <td className="px-2 py-2 text-xs text-center text-white font-bold">-</td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatCurrency(data?.totalGeral?.valorAplicado || 0)}
                </td>
                <td className="px-2 py-2 text-xs text-center text-white font-bold">-</td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatCurrency(data?.totalGeral?.valorAtualizado || 0)}
                </td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatPercentage(data?.totalGeral?.risco || 0)}
                </td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  100.00%
                </td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatPercentage(data?.totalGeral?.objetivo || 0)}
                </td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatPercentage(data?.totalGeral?.quantoFalta || 0)}
                </td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatCurrency(data?.totalGeral?.necessidadeAporte || 0)}
                </td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatPercentage(data?.totalGeral?.rentabilidade || 0)}
                </td>
              </tr>

              {ativosComRisco.map((ativo) => (
                <PrevidenciaSegurosTableRow
                  key={ativo.id}
                  ativo={ativo}
                  formatCurrency={formatCurrency}
                  formatPercentage={formatPercentage}
                  formatNumber={formatNumber}
                  onUpdateObjetivo={handleUpdateObjetivo}
                  onUpdateCotacao={handleUpdateCotacao}
                />
              ))}
              <BasicTablePlaceholderRows
                count={Math.max(0, MIN_PLACEHOLDER_ROWS - ativosComRisco.length)}
                colSpan={PREVIDENCIA_SEGUROS_COLUMN_COUNT}
              />
            </tbody>
          </table>
        </div>
      </ComponentCard>

    </div>
  );
}
