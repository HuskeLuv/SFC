"use client";
import React, { useState, useMemo } from "react";
import { useRendaFixa } from "@/hooks/useRendaFixa";
import { RendaFixaSecao, RendaFixaAtivo, TipoRendaFixa } from "@/types/rendaFixa";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ComponentCard from "@/components/common/ComponentCard";
import { ChevronDownIcon, ChevronUpIcon } from "@/icons";
import { BasicTablePlaceholderRows } from "@/components/carteira/shared";
import CaixaParaInvestirCard from "@/components/carteira/shared/CaixaParaInvestirCard";

const MIN_PLACEHOLDER_ROWS = 4;
const RENDA_FIXA_COLUMN_COUNT = 13;
const RENDA_FIXA_SECTION_ORDER = ["pos-fixada", "prefixada", "hibrida"] as const;
const RENDA_FIXA_SECTION_NAMES: Record<(typeof RENDA_FIXA_SECTION_ORDER)[number], string> = {
  "pos-fixada": "Pós-fixada",
  prefixada: "Pré-Fixada",
  hibrida: "Híbrida",
};
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
  onUpdateCampo: (ativoId: string, campo: 'cotizacaoResgate' | 'liquidacaoResgate' | 'benchmark' | 'valorAtualizado' | 'observacoes', valor: string | number) => void;
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
  onUpdateCampo,
}) => {
  const [isEditingCotizacao, setIsEditingCotizacao] = useState(false);
  const [isEditingLiquidacao, setIsEditingLiquidacao] = useState(false);
  const [isEditingBenchmark, setIsEditingBenchmark] = useState(false);
  const [isEditingValor, setIsEditingValor] = useState(false);
  const [isEditingObservacoes, setIsEditingObservacoes] = useState(false);
  
  const [cotizacaoValue, setCotizacaoValue] = useState(ativo.cotizacaoResgate);
  const [liquidacaoValue, setLiquidacaoValue] = useState(ativo.liquidacaoResgate);
  const [benchmarkValue, setBenchmarkValue] = useState(ativo.benchmark);
  const [valorValue, setValorValue] = useState(ativo.valorAtualizado.toString());
  const [observacoesValue, setObservacoesValue] = useState(ativo.observacoes || '');

  const handleSubmit = (campo: 'cotizacaoResgate' | 'liquidacaoResgate' | 'benchmark' | 'valorAtualizado' | 'observacoes', valor: string | number) => {
    onUpdateCampo(ativo.id, campo, valor);
    if (campo === 'cotizacaoResgate') setIsEditingCotizacao(false);
    if (campo === 'liquidacaoResgate') setIsEditingLiquidacao(false);
    if (campo === 'benchmark') setIsEditingBenchmark(false);
    if (campo === 'valorAtualizado') setIsEditingValor(false);
    if (campo === 'observacoes') setIsEditingObservacoes(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent, campo: 'cotizacaoResgate' | 'liquidacaoResgate' | 'benchmark' | 'valorAtualizado' | 'observacoes', valor: string | number) => {
    if (e.key === 'Enter') {
      handleSubmit(campo, valor);
    } else if (e.key === 'Escape') {
      if (campo === 'cotizacaoResgate') {
        setCotizacaoValue(ativo.cotizacaoResgate);
        setIsEditingCotizacao(false);
      } else if (campo === 'liquidacaoResgate') {
        setLiquidacaoValue(ativo.liquidacaoResgate);
        setIsEditingLiquidacao(false);
      } else if (campo === 'benchmark') {
        setBenchmarkValue(ativo.benchmark);
        setIsEditingBenchmark(false);
      } else if (campo === 'valorAtualizado') {
        setValorValue(ativo.valorAtualizado.toString());
        setIsEditingValor(false);
      } else if (campo === 'observacoes') {
        setObservacoesValue(ativo.observacoes || '');
        setIsEditingObservacoes(false);
      }
    }
  };

  return (
    <tr className="border-b border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50">
      <td className="px-2 py-2 text-xs text-black">
        <div>{ativo.nome}</div>
      </td>
      <td className="px-2 py-2 text-xs text-center text-black">
        {isEditingCotizacao ? (
          <input
            type="text"
            value={cotizacaoValue}
            onChange={(e) => setCotizacaoValue(e.target.value)}
            onKeyDown={(e) => handleKeyPress(e, 'cotizacaoResgate', cotizacaoValue)}
            onBlur={() => handleSubmit('cotizacaoResgate', cotizacaoValue)}
            className="w-20 px-1 py-0.5 text-xs border border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700 dark:text-white text-center"
            autoFocus
          />
        ) : (
          <div 
            className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 rounded"
            onClick={() => setIsEditingCotizacao(true)}
          >
            {ativo.cotizacaoResgate}
          </div>
        )}
      </td>
      <td className="px-2 py-2 text-xs text-center text-black">
        {isEditingLiquidacao ? (
          <input
            type="text"
            value={liquidacaoValue}
            onChange={(e) => setLiquidacaoValue(e.target.value)}
            onKeyDown={(e) => handleKeyPress(e, 'liquidacaoResgate', liquidacaoValue)}
            onBlur={() => handleSubmit('liquidacaoResgate', liquidacaoValue)}
            className="w-24 px-1 py-0.5 text-xs border border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700 dark:text-white text-center"
            autoFocus
          />
        ) : (
          <div 
            className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 rounded"
            onClick={() => setIsEditingLiquidacao(true)}
          >
            {ativo.liquidacaoResgate}
          </div>
        )}
      </td>
      <td className="px-2 py-2 text-xs text-center text-black">
        {ativo.vencimento.toLocaleDateString("pt-BR")}
      </td>
      <td className="px-2 py-2 text-xs text-center text-black">
        {isEditingBenchmark ? (
          <input
            type="text"
            value={benchmarkValue}
            onChange={(e) => setBenchmarkValue(e.target.value)}
            onKeyDown={(e) => handleKeyPress(e, 'benchmark', benchmarkValue)}
            onBlur={() => handleSubmit('benchmark', benchmarkValue)}
            className="w-24 px-1 py-0.5 text-xs border border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700 dark:text-white text-center"
            autoFocus
          />
        ) : (
          <div 
            className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 rounded"
            onClick={() => setIsEditingBenchmark(true)}
          >
            {ativo.benchmark}
          </div>
        )}
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
        {isEditingValor ? (
          <input
            type="number"
            step="0.01"
            value={valorValue}
            onChange={(e) => setValorValue(e.target.value)}
            onKeyDown={(e) => {
              const numValue = parseFloat(valorValue);
              if (!isNaN(numValue) && numValue > 0) {
                handleKeyPress(e, 'valorAtualizado', numValue);
              }
            }}
            onBlur={() => {
              const numValue = parseFloat(valorValue);
              if (!isNaN(numValue) && numValue > 0) {
                handleSubmit('valorAtualizado', numValue);
              } else {
                setValorValue(ativo.valorAtualizado.toString());
                setIsEditingValor(false);
              }
            }}
            className="w-24 px-1 py-0.5 text-xs border border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700 dark:text-white text-right"
            autoFocus
          />
        ) : (
          <div 
            className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 rounded"
            onClick={() => setIsEditingValor(true)}
          >
            {formatCurrency(ativo.valorAtualizado)}
          </div>
        )}
      </td>
      <td className="px-2 py-2 text-xs text-right text-black">
        {formatPercentageSimple(ativo.percentualCarteira)}
      </td>
      <td className="px-2 py-2 text-xs text-right text-black">
        {formatPercentage(ativo.riscoPorAtivo)}
      </td>
      <td className="px-2 py-2 text-xs text-right text-black">
        {formatPercentage(ativo.rentabilidade)}
      </td>
      <td className="px-2 py-2 text-xs text-black">
        {isEditingObservacoes ? (
          <input
            type="text"
            value={observacoesValue}
            onChange={(e) => setObservacoesValue(e.target.value)}
            onKeyDown={(e) => handleKeyPress(e, 'observacoes', observacoesValue)}
            onBlur={() => handleSubmit('observacoes', observacoesValue)}
            className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            autoFocus
          />
        ) : (
          <div 
            className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 rounded"
            onClick={() => setIsEditingObservacoes(true)}
          >
            {ativo.observacoes || '-'}
          </div>
        )}
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
  onUpdateCampo: (ativoId: string, campo: 'cotizacaoResgate' | 'liquidacaoResgate' | 'benchmark' | 'valorAtualizado' | 'observacoes', valor: string | number) => void;
}

const RendaFixaSection: React.FC<RendaFixaSectionProps> = ({
  secao,
  formatCurrency,
  formatPercentage,
  isExpanded,
  onToggle,
  onUpdateCampo,
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
          {formatPercentageSimple(secao.percentualTotal)}
        </td>
        <td className="px-2 py-2 text-xs text-center bg-[#808080] text-white font-bold">-</td>
        <td className="px-2 py-2 text-xs text-right bg-[#808080] text-white font-bold">
          {formatPercentage(secao.rentabilidadeMedia)}
        </td>
        <td className="px-2 py-2 text-xs text-center bg-[#808080] text-white font-bold">-</td>
      </tr>

      {/* Ativos da seção */}
      {isExpanded && secao.ativos.map((ativo) => (
        <RendaFixaTableRow
          key={ativo.id}
          ativo={ativo}
          formatCurrency={formatCurrency}
          formatPercentage={formatPercentage}
          onUpdateCampo={onUpdateCampo}
        />
      ))}
      {isExpanded && (
        <BasicTablePlaceholderRows
          count={placeholderCount}
          colSpan={RENDA_FIXA_COLUMN_COUNT}
        />
      )}
    </>
  );
};

interface RendaFixaTableProps {
  totalCarteira?: number;
}

export default function RendaFixaTable({ totalCarteira = 0 }: RendaFixaTableProps) {
  const { data, loading, error, formatCurrency, formatPercentage, updateCaixaParaInvestir, updateRendaFixaCampo } = useRendaFixa();
  const { necessidadeAporteMap, resumo } = useCarteiraResumoContext();
  const necessidadeAporteCalculada = necessidadeAporteMap.rendaFixaFundos ?? data?.resumo?.necessidadeAporte ?? 0;
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(RENDA_FIXA_SECTION_ORDER)
  );

  // Calcular risco (carteira total) e percentual da carteira da aba
  const dataComRisco = useMemo(() => {
    if (!data) return data;

    const totalTabValue = data.totalGeral?.valorAtualizado || 0;
    const shouldCalculateRisco = totalCarteira > 0;

    const secoesComRisco = data.secoes.map(secao => ({
      ...secao,
      percentualTotal: totalTabValue > 0 ? (secao.totalValorAtualizado / totalTabValue) * 100 : 0,
      ativos: secao.ativos.map(ativo => ({
        ...ativo,
        riscoPorAtivo: shouldCalculateRisco ? (ativo.valorAtualizado / totalCarteira) * 100 : 0,
        percentualCarteira: totalTabValue > 0 ? (ativo.valorAtualizado / totalTabValue) * 100 : 0,
      })),
      totalRisco: secao.ativos.reduce(
        (sum, ativo) => sum + (shouldCalculateRisco ? (ativo.valorAtualizado / totalCarteira) * 100 : 0),
        0
      ),
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

  const normalizedSections = useMemo(() => {
    const createEmptySection = (
      tipo: (typeof RENDA_FIXA_SECTION_ORDER)[number],
      nome: string
    ): RendaFixaSecao => ({
      tipo: tipo as TipoRendaFixa,
      nome,
      ativos: [],
      totalValorAplicado: 0,
      totalAporte: 0,
      totalResgate: 0,
      totalValorAtualizado: 0,
      percentualTotal: 0,
      rentabilidadeMedia: 0,
    });

    const sectionMap = new Map<string, RendaFixaSecao>();
    (dataComRisco?.secoes || []).forEach((secao) => {
      const nome = secao.nome || RENDA_FIXA_SECTION_NAMES[secao.tipo];
      sectionMap.set(secao.tipo, { ...secao, nome });
    });

    return RENDA_FIXA_SECTION_ORDER.map((tipo) => {
      const nome = RENDA_FIXA_SECTION_NAMES[tipo];
      return sectionMap.get(tipo) ?? createEmptySection(tipo, nome);
    });
  }, [dataComRisco?.secoes]);

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

  return (
    <div className="space-y-4">
      {/* Cards de resumo */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <RendaFixaMetricCard
          title="Necessidade de Aporte"
          value={formatCurrency(necessidadeAporteCalculada)}
          color="warning"
        />
        <CaixaParaInvestirCard
          value={data?.resumo?.caixaParaInvestir ?? 0}
          formatCurrency={formatCurrency}
          onSave={updateCaixaParaInvestir}
          color="success"
        />
        <RendaFixaMetricCard
          title="Saldo Início do Mês"
          value={formatCurrency(data?.resumo?.saldoInicioMes ?? 0)}
        />
        <RendaFixaMetricCard
          title="Saldo Atual"
          value={formatCurrency(data?.resumo?.saldoAtual ?? 0)}
        />
        <RendaFixaMetricCard
          title="Rendimento"
          value={formatCurrency(data?.resumo?.rendimento ?? 0)}
          color="success"
        />
        <RendaFixaMetricCard
          title="Rentabilidade"
          value={formatPercentage(data?.resumo?.rentabilidade ?? 0)}
          color="success"
        />
      </div>

      {/* Tabela principal */}
      <ComponentCard title="Renda Fixa">
        <div className="overflow-x-auto">
          <table className="w-full text-xs [&_td]:h-6 [&_td]:leading-6 [&_td]:py-0 [&_th]:h-6 [&_th]:leading-6 [&_th]:py-0">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700" style={{ backgroundColor: '#9E8A58' }}>
                <th className="px-2 py-2 font-bold text-black text-xs text-left cursor-pointer whitespace-nowrap" style={{ backgroundColor: '#9E8A58' }}>
                  Nome dos Ativos
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer whitespace-nowrap" style={{ backgroundColor: '#9E8A58' }}>
                  Cotização de resgate
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer whitespace-nowrap" style={{ backgroundColor: '#9E8A58' }}>
                  Liquidação de resgate
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer whitespace-nowrap" style={{ backgroundColor: '#9E8A58' }}>
                  Vencimento
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer whitespace-nowrap" style={{ backgroundColor: '#9E8A58' }}>
                  Benchmark
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer whitespace-nowrap" style={{ backgroundColor: '#9E8A58' }}>
                  Valor inicial aplicado
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
                  <span className="block">Risco por ativo</span>
                  <span className="block">(Carteira Total)</span>
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer whitespace-nowrap" style={{ backgroundColor: '#9E8A58' }}>
                  Rentabilidade
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-left cursor-pointer whitespace-nowrap" style={{ backgroundColor: '#9E8A58' }}>
                  Observações
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
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  100.00%
                </td>
                <td className="px-2 py-2 text-xs text-center text-white font-bold">-</td>
                <td className="px-2 py-2 text-xs text-right text-white font-bold">
                  {formatPercentage(dataComRisco?.totalGeral?.rentabilidade || 0)}
                </td>
                <td className="px-2 py-2 text-xs text-center text-white font-bold">-</td>
              </tr>

              {normalizedSections.map((secao) => (
                <RendaFixaSection
                  key={secao.tipo}
                  secao={secao}
                  formatCurrency={formatCurrency}
                  formatPercentage={formatPercentage}
                  isExpanded={expandedSections.has(secao.tipo)}
                  onToggle={() => toggleSection(secao.tipo)}
                  onUpdateCampo={updateRendaFixaCampo}
                />
              ))}
            </tbody>
          </table>
        </div>
      </ComponentCard>
    </div>
  );
}
