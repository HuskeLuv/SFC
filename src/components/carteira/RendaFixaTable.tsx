"use client";
import React, { useState } from "react";
import { useRendaFixa } from "@/hooks/useRendaFixa";
import { RendaFixaSecao, RendaFixaAtivo } from "@/types/rendaFixa";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ComponentCard from "@/components/common/ComponentCard";
import Badge from "@/components/ui/badge/Badge";
import { ChevronDownIcon, ChevronUpIcon } from "@/icons";
import { useCarteiraResumoContext } from "@/context/CarteiraResumoContext";

interface RendaFixaMetricCardProps {
  title: string;
  value: string;
  color?: "primary" | "success" | "warning" | "error";
}

const RendaFixaMetricCard: React.FC<RendaFixaMetricCardProps> = ({
  title,
  value,
  color = "primary",
}) => {
  const colorClasses = {
    primary: "bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:text-blue-100",
    default: "bg-gray-50 text-gray-900 dark:bg-gray-800 dark:text-gray-100",
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

interface RendaFixaTableRowProps {
  ativo: RendaFixaAtivo;
  formatCurrency: (value: number) => string;
  formatPercentage: (value: number) => string;
}

const RendaFixaTableRow: React.FC<RendaFixaTableRowProps> = ({
  ativo,
  formatCurrency,
  formatPercentage,
}) => {
  return (
    <tr className="border-b border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50">
      <td className="px-2 py-2 text-xs font-medium text-gray-900 dark:text-white">
        <div>
          <div className="font-semibold">{ativo.nome}</div>
          {ativo.observacoes && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {ativo.observacoes}
            </div>
          )}
        </div>
      </td>
      <td className="px-2 py-2 text-xs text-center">
        <Badge color="primary" size="sm">
          {ativo.percentualRentabilidade}%
        </Badge>
      </td>
      <td className="px-2 py-2 text-xs text-center text-gray-700 dark:text-gray-300">
        {ativo.cotizacaoResgate}
      </td>
      <td className="px-2 py-2 text-xs text-center text-gray-700 dark:text-gray-300">
        {ativo.liquidacaoResgate}
      </td>
      <td className="px-2 py-2 text-xs text-center text-gray-700 dark:text-gray-300">
        {ativo.vencimento.toLocaleDateString("pt-BR")}
      </td>
      <td className="px-2 py-2 text-xs text-center text-gray-700 dark:text-gray-300">
        {ativo.benchmark}
      </td>
      <td className="px-2 py-2 text-xs text-right font-medium text-gray-900 dark:text-white">
        {formatCurrency(ativo.valorInicialAplicado)}
      </td>
      <td className="px-2 py-2 text-xs text-right font-medium text-green-600 dark:text-green-400">
        {formatCurrency(ativo.aporte)}
      </td>
      <td className="px-2 py-2 text-xs text-right font-medium text-red-600 dark:text-red-400">
        {formatCurrency(ativo.resgate)}
      </td>
      <td className="px-2 py-2 text-xs text-right font-semibold text-gray-900 dark:text-white">
        {formatCurrency(ativo.valorAtualizado)}
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
        <Badge 
          color={ativo.riscoPorAtivo > 20 ? "error" : "primary"} 
          size="sm"
        >
          {formatPercentage(ativo.riscoPorAtivo)}
        </Badge>
      </td>
      <td className="px-2 py-2 text-xs text-right">
        <Badge 
          color={ativo.rentabilidade >= 3 ? "success" : "primary"} 
          size="sm"
        >
          {formatPercentage(ativo.rentabilidade)}
        </Badge>
      </td>
    </tr>
  );
};

interface RendaFixaSectionProps {
  secao: RendaFixaSecao;
  formatCurrency: (value: number) => string;
  formatPercentage: (value: number) => string;
  isExpanded: boolean;
  onToggle: () => void;
}

const RendaFixaSection: React.FC<RendaFixaSectionProps> = ({
  secao,
  formatCurrency,
  formatPercentage,
  isExpanded,
  onToggle,
}) => {
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
            <Badge color="primary" size="sm">
              {secao.ativos.length} {secao.ativos.length === 1 ? 'ativo' : 'ativos'}
            </Badge>
          </div>
        </td>
        <td className="px-2 py-2 text-xs text-center">-</td>
        <td className="px-2 py-2 text-xs text-center">-</td>
        <td className="px-2 py-2 text-xs text-center">-</td>
        <td className="px-2 py-2 text-xs text-center">-</td>
        <td className="px-2 py-2 text-xs text-center">-</td>
        <td className="px-2 py-2 text-xs text-right font-bold text-gray-900 dark:text-white">
          {formatCurrency(secao.totalValorAplicado)}
        </td>
        <td className="px-2 py-2 text-xs text-right font-bold text-green-600 dark:text-green-400">
          {formatCurrency(secao.totalAporte)}
        </td>
        <td className="px-2 py-2 text-xs text-right font-bold text-red-600 dark:text-red-400">
          {formatCurrency(secao.totalResgate)}
        </td>
        <td className="px-2 py-2 text-xs text-right font-bold text-gray-900 dark:text-white">
          {formatCurrency(secao.totalValorAtualizado)}
        </td>
        <td className="px-2 py-2 text-xs text-right">
          <Badge color="primary" size="sm">
            {formatPercentage(secao.percentualTotal)}
          </Badge>
        </td>
        <td className="px-2 py-2 text-xs text-center">-</td>
        <td className="px-2 py-2 text-xs text-right">
          <Badge 
            color={secao.rentabilidadeMedia >= 3 ? "success" : "primary"} 
            size="sm"
          >
            {formatPercentage(secao.rentabilidadeMedia)}
          </Badge>
        </td>
      </tr>

      {/* Ativos da seção */}
      {isExpanded && secao.ativos.map((ativo) => (
        <RendaFixaTableRow
          key={ativo.id}
          ativo={ativo}
          formatCurrency={formatCurrency}
          formatPercentage={formatPercentage}
        />
      ))}
    </>
  );
};

export default function RendaFixaTable() {
  const { data, loading, error, formatCurrency, formatPercentage } = useRendaFixa();
  const { necessidadeAporteMap } = useCarteiraResumoContext();
  const necessidadeAporteCalculada = necessidadeAporteMap.rendaFixaFundos ?? data?.resumo?.necessidadeAporte ?? 0;
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['pos-fixada', 'prefixada', 'hibrida'])
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

  if (loading) {
    return <LoadingSpinner text="Carregando dados de renda fixa..." />;
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
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Nenhum dado encontrado
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Adicione seus primeiros investimentos em renda fixa para começar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cards de resumo */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <RendaFixaMetricCard
          title="Necessidade de Aporte"
          value={formatCurrency(necessidadeAporteCalculada)}
          color="warning"
        />
        <RendaFixaMetricCard
          title="Caixa para Investir"
          value={formatCurrency(data.resumo.caixaParaInvestir)}
          color="success"
        />
        <RendaFixaMetricCard
          title="Saldo Início do Mês"
          value={formatCurrency(data.resumo.saldoInicioMes)}
        />
        <RendaFixaMetricCard
          title="Saldo Atual"
          value={formatCurrency(data.resumo.saldoAtual)}
        />
        <RendaFixaMetricCard
          title="Rendimento"
          value={formatCurrency(data.resumo.rendimento)}
          color="success"
        />
        <RendaFixaMetricCard
          title="Rentabilidade"
          value={formatPercentage(data.resumo.rentabilidade)}
          color="success"
        />
      </div>

      {/* Tabela principal */}
      <ComponentCard title="Renda Fixa & Fundos">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Nome dos Ativos
                </th>
                <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  % Rentabilidade
                </th>
                <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Cotização Resgate
                </th>
                <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Liquidação Resgate
                </th>
                <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Vencimento
                </th>
                <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Benchmark
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Valor Inicial
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Aporte
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Resgate
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Valor Atualizado
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  % da Carteira
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Risco por Ativo
                </th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Rentabilidade
                </th>
              </tr>
            </thead>
            <tbody>
              {data.secoes.map((secao) => (
                <RendaFixaSection
                  key={secao.tipo}
                  secao={secao}
                  formatCurrency={formatCurrency}
                  formatPercentage={formatPercentage}
                  isExpanded={expandedSections.has(secao.tipo)}
                  onToggle={() => toggleSection(secao.tipo)}
                />
              ))}

              {/* Linha de totalização */}
              <tr className="bg-gray-50 dark:bg-gray-800 border-t-2 border-gray-300 dark:border-gray-600">
                <td className="px-2 py-2 text-xs font-bold text-gray-900 dark:text-white">
                  TOTAL GERAL
                </td>
                <td className="px-2 py-2 text-xs text-center">-</td>
                <td className="px-2 py-2 text-xs text-center">-</td>
                <td className="px-2 py-2 text-xs text-center">-</td>
                <td className="px-2 py-2 text-xs text-center">-</td>
                <td className="px-2 py-2 text-xs text-center">-</td>
                <td className="px-2 py-2 text-xs text-right font-bold text-gray-900 dark:text-white">
                  {formatCurrency(data.totalGeral.valorAplicado)}
                </td>
                <td className="px-2 py-2 text-xs text-right font-bold text-green-600 dark:text-green-400">
                  {formatCurrency(data.totalGeral.aporte)}
                </td>
                <td className="px-2 py-2 text-xs text-right font-bold text-red-600 dark:text-red-400">
                  {formatCurrency(data.totalGeral.resgate)}
                </td>
                <td className="px-2 py-2 text-xs text-right font-bold text-gray-900 dark:text-white">
                  {formatCurrency(data.totalGeral.valorAtualizado)}
                </td>
                <td className="px-2 py-2 text-xs text-right">
                  <Badge color="primary" size="sm">100.00%</Badge>
                </td>
                <td className="px-2 py-2 text-xs text-center">-</td>
                <td className="px-2 py-2 text-xs text-right">
                  <Badge 
                    color={data.totalGeral.rentabilidade >= 3 ? "success" : "primary"} 
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
