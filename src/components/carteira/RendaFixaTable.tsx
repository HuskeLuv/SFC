"use client";
import React, { useState, useMemo } from "react";
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

const formatPercentageSimple = (value: number | undefined | null): string => {
  if (value === undefined || value === null || isNaN(value)) {
    return '0,00%';
  }
  return `${value.toFixed(2)}%`;
};

const RendaFixaTableRow: React.FC<RendaFixaTableRowProps> = ({
  ativo,
  formatCurrency,
  formatPercentage,
}) => {
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
        <Badge color="primary" size="sm">
          {ativo.percentualRentabilidade}%
        </Badge>
      </td>
      <td className="px-2 py-2 text-xs text-center text-black">
        {ativo.cotizacaoResgate}
      </td>
      <td className="px-2 py-2 text-xs text-center text-black">
        {ativo.liquidacaoResgate}
      </td>
      <td className="px-2 py-2 text-xs text-center text-black">
        {ativo.vencimento.toLocaleDateString("pt-BR")}
      </td>
      <td className="px-2 py-2 text-xs text-center text-black">
        {ativo.benchmark}
      </td>
      <td className="px-2 py-2 text-xs text-right font-medium text-black">
        {formatCurrency(ativo.valorInicialAplicado)}
      </td>
      <td className="px-2 py-2 text-xs text-right font-medium text-black">
        {formatCurrency(ativo.aporte)}
      </td>
      <td className="px-2 py-2 text-xs text-right font-medium text-black">
        {formatCurrency(ativo.resgate)}
      </td>
      <td className="px-2 py-2 text-xs text-right font-semibold text-black">
        {formatCurrency(ativo.valorAtualizado)}
      </td>
      <td className="px-2 py-2 text-xs text-right font-medium text-black">
        {formatPercentageSimple(ativo.percentualCarteira)}
      </td>
      <td className="px-2 py-2 text-xs text-right">
        <Badge 
          color={ativo.riscoPorAtivo > 20 ? "error" : "primary"} 
          size="sm"
        >
          {formatPercentage(ativo.riscoPorAtivo)}
        </Badge>
      </td>
      <td className="px-2 py-2 text-xs text-right font-medium text-black">
        {formatPercentage(ativo.rentabilidade)}
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
        <td className="px-2 py-2 text-xs font-bold text-black">
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
        <td className="px-2 py-2 text-xs text-right font-bold text-black">
          {formatCurrency(secao.totalValorAplicado)}
        </td>
        <td className="px-2 py-2 text-xs text-right font-bold text-black">
          {formatCurrency(secao.totalAporte)}
        </td>
        <td className="px-2 py-2 text-xs text-right font-bold text-black">
          {formatCurrency(secao.totalResgate)}
        </td>
        <td className="px-2 py-2 text-xs text-right font-bold text-black">
          {formatCurrency(secao.totalValorAtualizado)}
        </td>
        <td className="px-2 py-2 text-xs text-right font-bold text-black">
          {formatPercentageSimple(secao.percentualTotal)}
        </td>
        <td className="px-2 py-2 text-xs text-center">-</td>
        <td className="px-2 py-2 text-xs text-right font-bold text-black">
          {formatPercentage(secao.rentabilidadeMedia)}
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

interface RendaFixaTableProps {
  totalCarteira?: number;
}

export default function RendaFixaTable({ totalCarteira = 0 }: RendaFixaTableProps) {
  const { data, loading, error, formatCurrency, formatPercentage } = useRendaFixa();
  const { necessidadeAporteMap } = useCarteiraResumoContext();
  const necessidadeAporteCalculada = necessidadeAporteMap.rendaFixaFundos ?? data?.resumo?.necessidadeAporte ?? 0;
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['pos-fixada', 'prefixada', 'hibrida'])
  );

  // Calcular risco para cada ativo: (valorAtualizado / totalCarteira) * 100
  const dataComRisco = useMemo(() => {
    if (!data || totalCarteira <= 0) return data;
    
    const secoesComRisco = data.secoes.map(secao => ({
      ...secao,
      ativos: secao.ativos.map(ativo => ({
        ...ativo,
        riscoPorAtivo: (ativo.valorAtualizado / totalCarteira) * 100,
      })),
      totalRisco: secao.ativos.reduce((sum, ativo) => sum + ((ativo.valorAtualizado / totalCarteira) * 100), 0),
    }));
    
    return {
      ...data,
      secoes: secoesComRisco,
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
          <p className="text-xs text-black">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-black mb-2">
            Nenhum dado encontrado
          </h3>
          <p className="text-xs text-black">
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
              <tr className="border-b border-gray-200 dark:border-gray-700" style={{ backgroundColor: '#9E8A58' }}>
                <th className="px-2 py-2 font-bold text-black text-xs text-left cursor-pointer whitespace-nowrap" style={{ backgroundColor: '#9E8A58' }}>
                  Nome dos Ativos
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer whitespace-nowrap" style={{ backgroundColor: '#9E8A58' }}>
                  % Rentabilidade
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer whitespace-nowrap" style={{ backgroundColor: '#9E8A58' }}>
                  Cotização Resgate
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer whitespace-nowrap" style={{ backgroundColor: '#9E8A58' }}>
                  Liquidação Resgate
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer whitespace-nowrap" style={{ backgroundColor: '#9E8A58' }}>
                  Vencimento
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer whitespace-nowrap" style={{ backgroundColor: '#9E8A58' }}>
                  Benchmark
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer whitespace-nowrap" style={{ backgroundColor: '#9E8A58' }}>
                  Valor Inicial
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer whitespace-nowrap" style={{ backgroundColor: '#9E8A58' }}>
                  Aporte
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer whitespace-nowrap" style={{ backgroundColor: '#9E8A58' }}>
                  Resgate
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer whitespace-nowrap" style={{ backgroundColor: '#9E8A58' }}>
                  Valor Atualizado
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer whitespace-nowrap" style={{ backgroundColor: '#9E8A58' }}>
                  % Carteira
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer whitespace-nowrap" style={{ backgroundColor: '#9E8A58' }}>
                  Risco Por Ativo (Carteira Total)
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer whitespace-nowrap" style={{ backgroundColor: '#9E8A58' }}>
                  Rentabilidade
                </th>
              </tr>
            </thead>
            <tbody>
              {dataComRisco?.secoes.map((secao) => (
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
                <td className="px-2 py-2 text-xs font-bold text-black">
                  TOTAL GERAL
                </td>
                <td className="px-2 py-2 text-xs text-center">-</td>
                <td className="px-2 py-2 text-xs text-center">-</td>
                <td className="px-2 py-2 text-xs text-center">-</td>
                <td className="px-2 py-2 text-xs text-center">-</td>
                <td className="px-2 py-2 text-xs text-center">-</td>
                <td className="px-2 py-2 text-xs text-right font-bold text-black">
                  {formatCurrency(dataComRisco?.totalGeral?.valorAplicado || 0)}
                </td>
                <td className="px-2 py-2 text-xs text-right font-bold text-black">
                  {formatCurrency(dataComRisco?.totalGeral?.aporte || 0)}
                </td>
                <td className="px-2 py-2 text-xs text-right font-bold text-black">
                  {formatCurrency(dataComRisco?.totalGeral?.resgate || 0)}
                </td>
                <td className="px-2 py-2 text-xs text-right font-bold text-black">
                  {formatCurrency(dataComRisco?.totalGeral?.valorAtualizado || 0)}
                </td>
                <td className="px-2 py-2 text-xs text-right font-bold text-black">
                  100.00%
                </td>
                <td className="px-2 py-2 text-xs text-center">-</td>
                <td className="px-2 py-2 text-xs text-right font-bold text-black">
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
