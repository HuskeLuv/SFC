"use client";
import React, { useState, useMemo } from "react";
import { useAcoes } from "@/hooks/useAcoes";
import { AcaoAtivo, AcaoSecao, EstrategiaAcao } from "@/types/acoes";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ComponentCard from "@/components/common/ComponentCard";
import { ChevronDownIcon, ChevronUpIcon } from "@/icons";
import { useCarteiraResumoContext } from "@/context/CarteiraResumoContext";
import { StandardTable, StandardTableHeader, StandardTableHeaderRow, StandardTableHeaderCell, StandardTableRow, StandardTableBodyCell, TableBody } from "@/components/ui/table/StandardTable";
import { StandardTablePlaceholderRows } from "@/components/carteira/shared";
import CaixaParaInvestirCard from "@/components/carteira/shared/CaixaParaInvestirCard";

const MIN_PLACEHOLDER_ROWS = 4;
const ACOES_COLUMN_COUNT = 14;
const ACOES_SECTION_ORDER = ["value", "growth", "risk"] as const;
const ACOES_SECTION_NAMES: Record<(typeof ACOES_SECTION_ORDER)[number], string> = {
  value: "Value",
  growth: "Growth",
  risk: "Risk",
};

interface AcoesMetricCardProps {
  title: string;
  value: string;
  color?: "primary" | "success" | "warning" | "error";
}

const AcoesMetricCard: React.FC<AcoesMetricCardProps> = ({
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

interface AcoesTableRowProps {
  ativo: AcaoAtivo;
  formatCurrency: (value: number) => string;
  formatPercentage: (value: number) => string;
  formatNumber: (value: number) => string;
  onUpdateObjetivo: (ativoId: string, novoObjetivo: number) => void;
}

const AcoesTableRow: React.FC<AcoesTableRowProps> = ({
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

  const getSetorColor = (setor: string) => {
    const colors = {
      'financeiro': 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
      'energia': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
      'consumo': 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
      'saude': 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
      'tecnologia': 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300',
      'industria': 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300',
      'materiais': 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300',
      'utilidades': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300',
      'outros': 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300',
    };
    return colors[setor as keyof typeof colors] || colors.outros;
  };

  return (
    <StandardTableRow>
      <StandardTableBodyCell align="left">
        <div>
          <div>{ativo.ticker}</div>
          <div className="text-xs">{ativo.nome}</div>
          {ativo.observacoes && (
            <div className="text-xs mt-1">
              {ativo.observacoes}
            </div>
          )}
        </div>
      </StandardTableBodyCell>
      <StandardTableBodyCell align="center">
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs">
          {ativo.setor.charAt(0).toUpperCase() + ativo.setor.slice(1)}
        </span>
      </StandardTableBodyCell>
      <StandardTableBodyCell align="center">
        {ativo.subsetor}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        {formatNumber(ativo.quantidade)}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        {formatCurrency(ativo.precoAquisicao)}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        {formatCurrency(ativo.valorTotal)}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        <span>{formatCurrency(ativo.cotacaoAtual)}</span>
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        {formatCurrency(ativo.valorAtualizado)}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        {formatPercentage(ativo.riscoPorAtivo)}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        {formatPercentage(ativo.percentualCarteira)}
      </StandardTableBodyCell>
      <StandardTableBodyCell
        align="right"
        className="border border-black"
      >
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
            <span className="text-xs">%</span>
          </div>
        ) : (
          <div 
            className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 rounded"
            onClick={() => setIsEditingObjetivo(true)}
          >
            {formatPercentage(ativo.objetivo)}
          </div>
        )}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        {formatPercentage(ativo.quantoFalta)}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        <span>
          {formatCurrency(ativo.necessidadeAporte)}
        </span>
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        {formatPercentage(ativo.rentabilidade)}
      </StandardTableBodyCell>
    </StandardTableRow>
  );
};

interface AcoesSectionProps {
  secao: AcaoSecao;
  formatCurrency: (value: number) => string;
  formatPercentage: (value: number) => string;
  formatNumber: (value: number) => string;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdateObjetivo: (ativoId: string, novoObjetivo: number) => void;
}

const AcoesSection: React.FC<AcoesSectionProps> = ({
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
      <StandardTableRow 
        className="bg-[#808080] cursor-pointer"
        onClick={onToggle}
      >
        <StandardTableBodyCell align="left" isTotal className="bg-[#808080] text-white font-bold">
          <div className="flex items-center space-x-2">
            {isExpanded ? (
              <ChevronUpIcon className="w-4 h-4" />
            ) : (
              <ChevronDownIcon className="w-4 h-4" />
            )}
            <span>{secao.nome || secao.estrategia}</span>
          </div>
        </StandardTableBodyCell>
        <StandardTableBodyCell align="center" isTotal className="bg-[#808080] text-white font-bold">-</StandardTableBodyCell>
        <StandardTableBodyCell align="center" isTotal className="bg-[#808080] text-white font-bold">-</StandardTableBodyCell>
        <StandardTableBodyCell align="right" isTotal className="bg-[#808080] text-white font-bold">
          {formatNumber(secao.totalQuantidade)}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="center" isTotal className="bg-[#808080] text-white font-bold">-</StandardTableBodyCell>
        <StandardTableBodyCell align="right" isTotal className="bg-[#808080] text-white font-bold">
          {formatCurrency(secao.totalValorAplicado)}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="center" isTotal className="bg-[#808080] text-white font-bold">-</StandardTableBodyCell>
        <StandardTableBodyCell align="right" isTotal className="bg-[#808080] text-white font-bold">
          {formatCurrency(secao.totalValorAtualizado)}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="right" isTotal className="bg-[#808080] text-white font-bold">
          {formatPercentage(secao.totalRisco)}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="right" isTotal className="bg-[#808080] text-white font-bold">
          {formatPercentage(secao.totalPercentualCarteira)}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="right" isTotal className="bg-[#808080] text-white font-bold">
          {formatPercentage(secao.totalObjetivo)}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="right" isTotal className="bg-[#808080] text-white font-bold">
          {formatPercentage(secao.totalQuantoFalta)}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="right" isTotal className="bg-[#808080] text-white font-bold">
          <span>
            {formatCurrency(secao.totalNecessidadeAporte)}
          </span>
        </StandardTableBodyCell>
        <StandardTableBodyCell align="right" isTotal className="bg-[#808080] text-white font-bold">
          {formatPercentage(secao.rentabilidadeMedia)}
        </StandardTableBodyCell>
      </StandardTableRow>

      {/* Ativos da seção */}
      {isExpanded && secao.ativos.map((ativo) => (
        <AcoesTableRow
          key={ativo.id}
          ativo={ativo}
          formatCurrency={formatCurrency}
          formatPercentage={formatPercentage}
          formatNumber={formatNumber}
          onUpdateObjetivo={onUpdateObjetivo}
        />
      ))}
      {isExpanded && (
        <StandardTablePlaceholderRows
          count={placeholderCount}
          colSpan={ACOES_COLUMN_COUNT}
        />
      )}
    </>
  );
};

interface AcoesTableProps {
  totalCarteira?: number;
}

export default function AcoesTable({ totalCarteira = 0 }: AcoesTableProps) {
  const { data, loading, error, formatCurrency, formatPercentage, formatNumber, updateObjetivo, updateCaixaParaInvestir } = useAcoes();
  const { necessidadeAporteMap, resumo } = useCarteiraResumoContext();
  const necessidadeAporteTotalCalculada = necessidadeAporteMap.acoes ?? data?.resumo?.necessidadeAporteTotal ?? 0;
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(ACOES_SECTION_ORDER)
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
    const createEmptySection = (estrategia: (typeof ACOES_SECTION_ORDER)[number], nome: string): AcaoSecao => ({
      estrategia: estrategia as EstrategiaAcao,
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

    const sectionMap = new Map<string, AcaoSecao>();
    (dataComRisco?.secoes || []).forEach((secao) => {
      const nome = secao.nome || ACOES_SECTION_NAMES[secao.estrategia];
      sectionMap.set(secao.estrategia, { ...secao, nome });
    });

    return ACOES_SECTION_ORDER.map((estrategia) => {
      const nome = ACOES_SECTION_NAMES[estrategia];
      return sectionMap.get(estrategia) ?? createEmptySection(estrategia, nome);
    });
  }, [dataComRisco?.secoes]);

  if (loading) {
    return <LoadingSpinner text="Carregando dados Ações..." />;
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
        <AcoesMetricCard
          title="Necessidade de Aporte Total"
          value={formatCurrency(necessidadeAporteTotalCalculada)}
          color="warning"
        />
        <CaixaParaInvestirCard
          value={data?.resumo?.caixaParaInvestir ?? 0}
          formatCurrency={formatCurrency}
          onSave={updateCaixaParaInvestir}
          color="success"
        />
        <AcoesMetricCard
          title="Saldo Início do Mês"
          value={formatCurrency(data?.resumo?.saldoInicioMes ?? 0)}
        />
        <AcoesMetricCard
          title="Valor Atualizado"
          value={formatCurrency(data?.resumo?.valorAtualizado ?? 0)}
        />
        <AcoesMetricCard
          title="Rendimento"
          value={formatCurrency(data?.resumo?.rendimento ?? 0)}
          color="success"
        />
        <AcoesMetricCard
          title="Rentabilidade"
          value={formatPercentage(data?.resumo?.rentabilidade ?? 0)}
          color="success"
        />
      </div>

      {/* Tabela principal */}
      <ComponentCard title="Ações - Detalhamento">
        <StandardTable>
          <StandardTableHeader sticky headerBgColor="#9E8A58">
            <StandardTableHeaderRow headerBgColor="#9E8A58">
              <StandardTableHeaderCell align="left" headerBgColor="#9E8A58">Nome do Ativo</StandardTableHeaderCell>
              <StandardTableHeaderCell align="center" headerBgColor="#9E8A58">Setor</StandardTableHeaderCell>
              <StandardTableHeaderCell align="center" headerBgColor="#9E8A58">Subsetor</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">Quantidade</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">Preço Médio</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">Valor Total</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">Cotação Atual</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">Valor Atualizado</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">
                <span className="block">Risco Por Ativo</span>
                <span className="block">(Carteira Total)</span>
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">% da Carteira</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">Objetivo</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">Quanto Falta</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">Nec. Aporte R$</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">Rentabilidade</StandardTableHeaderCell>
            </StandardTableHeaderRow>
          </StandardTableHeader>
          <TableBody>
              {/* Linha de totalização */}
              <StandardTableRow isTotal className="bg-[#404040]">
              <StandardTableBodyCell align="left" isTotal className="bg-[#404040] text-white font-bold">
                  TOTAL GERAL
                </StandardTableBodyCell>
              <StandardTableBodyCell align="center" isTotal className="bg-[#404040] text-white font-bold">-</StandardTableBodyCell>
              <StandardTableBodyCell align="center" isTotal className="bg-[#404040] text-white font-bold">-</StandardTableBodyCell>
              <StandardTableBodyCell align="right" isTotal className="bg-[#404040] text-white font-bold">
                  {formatNumber(dataComRisco?.totalGeral.quantidade || 0)}
                </StandardTableBodyCell>
              <StandardTableBodyCell align="center" isTotal className="bg-[#404040] text-white font-bold">-</StandardTableBodyCell>
              <StandardTableBodyCell align="right" isTotal className="bg-[#404040] text-white font-bold">
                  {formatCurrency(dataComRisco?.totalGeral.valorAplicado || 0)}
                </StandardTableBodyCell>
              <StandardTableBodyCell align="center" isTotal className="bg-[#404040] text-white font-bold">-</StandardTableBodyCell>
              <StandardTableBodyCell align="right" isTotal className="bg-[#404040] text-white font-bold">
                  {formatCurrency(dataComRisco?.totalGeral.valorAtualizado || 0)}
                </StandardTableBodyCell>
              <StandardTableBodyCell align="right" isTotal className="bg-[#404040] text-white font-bold">
                  {formatPercentage(dataComRisco?.totalGeral.risco || 0)}
                </StandardTableBodyCell>
              <StandardTableBodyCell align="right" isTotal className="bg-[#404040] text-white font-bold">
                  100.00%
                </StandardTableBodyCell>
              <StandardTableBodyCell align="right" isTotal className="bg-[#404040] text-white font-bold">
                  {formatPercentage(dataComRisco?.totalGeral?.objetivo || 0)}
                </StandardTableBodyCell>
              <StandardTableBodyCell align="right" isTotal className="bg-[#404040] text-white font-bold">
                  {formatPercentage(dataComRisco?.totalGeral?.quantoFalta || 0)}
                </StandardTableBodyCell>
              <StandardTableBodyCell align="right" isTotal className="bg-[#404040] text-white font-bold">
                  <span>
                    {formatCurrency(dataComRisco?.totalGeral?.necessidadeAporte || 0)}
                  </span>
                </StandardTableBodyCell>
              <StandardTableBodyCell align="right" isTotal className="bg-[#404040] text-white font-bold">
                  {formatPercentage(dataComRisco?.totalGeral?.rentabilidade || 0)}
                </StandardTableBodyCell>
              </StandardTableRow>

              {normalizedSections.map((secao) => (
                <AcoesSection
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
            </TableBody>
        </StandardTable>
      </ComponentCard>
    </div>
  );
}
