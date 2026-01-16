"use client";
import React, { useState, useMemo } from "react";
import { useFimFia } from "@/hooks/useFimFia";
import { FimFiaAtivo, FimFiaSecao } from "@/types/fimFia";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ComponentCard from "@/components/common/ComponentCard";
import { StandardTable, StandardTableHeader, StandardTableHeaderRow, StandardTableHeaderCell, StandardTableBodyCell, StandardTableRow } from "@/components/ui/table/StandardTable";
import { TableBody } from "@/components/ui/table";
import { ChevronDownIcon, ChevronUpIcon, DollarLineIcon } from "@/icons";
import { useCarteiraResumoContext } from "@/context/CarteiraResumoContext";

interface FimFiaMetricCardProps {
  title: string;
  value: string;
  color?: "primary" | "success" | "warning" | "error";
}

const FimFiaMetricCard: React.FC<FimFiaMetricCardProps> = ({
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

interface FimFiaTableRowProps {
  ativo: FimFiaAtivo;
  formatCurrency: (value: number) => string;
  formatPercentage: (value: number) => string;
  onUpdateObjetivo: (ativoId: string, novoObjetivo: number) => void;
}

const FimFiaTableRow: React.FC<FimFiaTableRowProps> = ({
  ativo,
  formatCurrency,
  formatPercentage,
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
    <tr className="border-b border-gray-200">
      <td className="px-2 py-2 text-xs font-medium text-black">
        <div>
          <div>{ativo.nome}</div>
          <div className="text-xs text-black mt-1">
            {ativo.categoriaNivel1} • {ativo.subcategoriaNivel2}
          </div>
          {ativo.observacoes && (
            <div className="text-xs text-black mt-1">
              {ativo.observacoes}
            </div>
          )}
        </div>
      </td>
      <td className="px-2 py-2 text-xs text-center text-black">
        {ativo.cotizacaoResgate}
      </td>
      <td className="px-2 py-2 text-xs text-center text-black">
        {ativo.liquidacaoResgate}
      </td>
      <td className="px-2 py-2 text-xs text-center text-black">
        {ativo.categoriaNivel1}
      </td>
      <td className="px-2 py-2 text-xs text-center text-black">
        {ativo.subcategoriaNivel2}
      </td>
      <td className="px-2 py-2 text-xs text-right text-black">
        {formatCurrency(ativo.valorInicialAplicado)}
      </td>
      <td className="px-2 py-2 text-xs text-right text-black">
        {formatCurrency(ativo.aporte)}
      </td>
      <td className="px-2 py-2 text-xs text-right text-black">
        {formatCurrency(ativo.resgate)}
      </td>
      <td className="px-2 py-2 text-xs text-right text-black">
        {formatCurrency(ativo.valorAtualizado)}
      </td>
      <td className="px-2 py-2 text-xs text-right text-black">
        {formatPercentage(ativo.percentualCarteira)}
      </td>
      <td className="px-2 py-2 text-xs text-right text-black">
        {formatPercentage(ativo.riscoPorAtivo)}
      </td>
      <td className="px-2 py-2 text-xs text-right">
        {isEditingObjetivo ? (
          <div className="flex items-center space-x-1">
            <input
              type="number"
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
            className="cursor-pointer px-1 py-0.5 rounded"
            onClick={() => setIsEditingObjetivo(true)}
          >
            {formatPercentage(ativo.objetivo)}
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

interface FimFiaSectionProps {
  secao: FimFiaSecao;
  formatCurrency: (value: number) => string;
  formatPercentage: (value: number) => string;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdateObjetivo: (ativoId: string, novoObjetivo: number) => void;
}

const FimFiaSection: React.FC<FimFiaSectionProps> = ({
  secao,
  formatCurrency,
  formatPercentage,
  isExpanded,
  onToggle,
  onUpdateObjetivo,
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
          </div>
        </td>
        <td className="px-2 py-2 text-xs text-center bg-[#808080] text-white font-bold">-</td>
        <td className="px-2 py-2 text-xs text-center bg-[#808080] text-white font-bold">-</td>
        <td className="px-2 py-2 text-xs text-center bg-[#808080] text-white font-bold">-</td>
        <td className="px-2 py-2 text-xs text-center bg-[#808080] text-white font-bold">-</td>
        <td className="px-2 py-2 text-xs text-right bg-[#808080] text-white font-bold">
          {formatCurrency(secao.totalValorAplicado)}
        </td>
        <td className="px-2 py-2 text-xs text-right bg-[#808080] text-white font-bold">
          {formatCurrency(secao.totalAporte)}
        </td>
        <td className="px-2 py-2 text-xs text-right bg-[#808080] text-white font-bold">
          {formatCurrency(secao.totalResgate)}
        </td>
        <td className="px-2 py-2 text-xs text-right bg-[#808080] text-white font-bold">
          {formatCurrency(secao.totalValorAtualizado)}
        </td>
        <td className="px-2 py-2 text-xs text-right bg-[#808080] text-white font-bold">
          {formatPercentage(secao.totalPercentualCarteira)}
        </td>
        <td className="px-2 py-2 text-xs text-right bg-[#808080] text-white font-bold">
          {formatPercentage(secao.totalRisco)}
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
        <FimFiaTableRow
          key={ativo.id}
          ativo={ativo}
          formatCurrency={formatCurrency}
          formatPercentage={formatPercentage}
          onUpdateObjetivo={onUpdateObjetivo}
        />
      ))}
    </>
  );
};

interface FimFiaTableProps {
  totalCarteira?: number;
}

export default function FimFiaTable({ totalCarteira = 0 }: FimFiaTableProps) {
  const { data, loading, error, formatCurrency, formatPercentage, updateObjetivo } = useFimFia();
  const { necessidadeAporteMap } = useCarteiraResumoContext();
  const necessidadeAporteTotalCalculada = necessidadeAporteMap.fimFia ?? data?.resumo?.necessidadeAporteTotal ?? 0;
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['fim', 'fia'])
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

  if (loading) {
    return <LoadingSpinner text="Carregando dados FIM/FIA..." />;
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
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <FimFiaMetricCard
            title="Necessidade de Aporte Total"
            value={formatCurrency(necessidadeAporteTotalCalculada)}
            color="warning"
          />
          <FimFiaMetricCard
            title="Caixa para Investir"
            value={formatCurrency(0)}
            color="success"
          />
          <FimFiaMetricCard
            title="Saldo Início do Mês"
            value={formatCurrency(0)}
          />
          <FimFiaMetricCard
            title="Valor Atualizado"
            value={formatCurrency(0)}
          />
          <FimFiaMetricCard
            title="Rendimento"
            value={formatCurrency(0)}
            color="success"
          />
          <FimFiaMetricCard
            title="Rentabilidade"
            value={formatPercentage(0)}
            color="success"
          />
        </div>

        <ComponentCard title="FIM/FIA - Detalhamento">
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
              <DollarLineIcon className="w-8 h-8 text-gray-400" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-black mb-2">
                Nenhum investimento encontrado
              </h3>
              <p className="text-sm text-black max-w-md">
                Adicione investimentos FIM/FIA para começar a acompanhar seus fundos multimercado e de ações.
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
        <FimFiaMetricCard
          title="Necessidade de Aporte Total"
          value={formatCurrency(necessidadeAporteTotalCalculada)}
          color="warning"
        />
        <FimFiaMetricCard
          title="Caixa para Investir"
          value={formatCurrency(data.resumo.caixaParaInvestir)}
          color="success"
        />
        <FimFiaMetricCard
          title="Saldo Início do Mês"
          value={formatCurrency(data.resumo.saldoInicioMes)}
        />
        <FimFiaMetricCard
          title="Valor Atualizado"
          value={formatCurrency(data.resumo.valorAtualizado)}
        />
        <FimFiaMetricCard
          title="Rendimento"
          value={formatCurrency(data.resumo.rendimento)}
          color="success"
        />
        <FimFiaMetricCard
          title="Rentabilidade"
          value={formatPercentage(data.resumo.rentabilidade)}
          color="success"
        />
      </div>

      {/* Tabela principal */}
      <ComponentCard title="FIM/FIA - Detalhamento">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700" style={{ backgroundColor: '#9E8A58' }}>
                <th className="px-2 py-2 font-bold text-black text-xs text-left cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Nome dos Ativos
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Cot. Resgate
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Liq. Resgate
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Cat. Nível 1
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Subcat. Nível 2
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Valor Inicial
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Aporte
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Resgate
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Valor Atualizado
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  % da Carteira
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  <span className="block">Risco Por Ativo</span>
                  <span className="block">(Carteira Total)</span>
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Objetivo
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Quanto Falta
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Nec. Aporte R$
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Rentabilidade
                </th>
              </tr>
            </thead>
            <tbody>
              {dataComRisco?.secoes.map((secao) => (
                <FimFiaSection
                  key={secao.tipo}
                  secao={secao}
                  formatCurrency={formatCurrency}
                  formatPercentage={formatPercentage}
                  isExpanded={expandedSections.has(secao.tipo)}
                  onToggle={() => toggleSection(secao.tipo)}
                  onUpdateObjetivo={handleUpdateObjetivo}
                />
              ))}

              {/* Linha de totalização */}
              <tr className="bg-[#808080] border-t-2 border-gray-300">
                <td className="px-2 py-2 text-xs text-white font-bold">
                  TOTAL GERAL
                </td>
                <td className="px-2 py-2 text-xs text-center text-white font-bold">-</td>
                <td className="px-2 py-2 text-xs text-center text-white font-bold">-</td>
                <td className="px-2 py-2 text-xs text-center text-white font-bold">-</td>
                <td className="px-2 py-2 text-xs text-center text-white font-bold">-</td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatCurrency(dataComRisco?.totalGeral?.valorAplicado || 0)}
                </td>
      <td className="px-2 py-2 text-xs text-right text-white font-bold">
        {formatCurrency(dataComRisco?.totalGeral?.aporte || 0)}
      </td>
      <td className="px-2 py-2 text-xs text-right text-white font-bold">
        {formatCurrency(dataComRisco?.totalGeral?.resgate || 0)}
      </td>
      <td className="px-2 py-2 text-xs text-right text-white font-bold">
        {formatCurrency(dataComRisco?.totalGeral?.valorAtualizado || 0)}
      </td>
      <td className="px-2 py-2 text-xs text-right text-white font-bold">100.00%</td>
      <td className="px-2 py-2 text-xs text-right text-white font-bold">
        {formatPercentage(dataComRisco?.totalGeral?.risco || 0)}
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
