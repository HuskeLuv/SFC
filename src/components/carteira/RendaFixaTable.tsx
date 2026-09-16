'use client';
import React, { useState, useMemo } from 'react';
import { useRendaFixa } from '@/hooks/useRendaFixa';
import { RendaFixaSecao, RendaFixaAtivo, TipoRendaFixa } from '@/types/rendaFixa';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ComponentCard from '@/components/common/ComponentCard';
import { ChevronDownIcon, ChevronUpIcon } from '@/icons';
import {
  BasicTablePlaceholderRows,
  MetricCard,
  metricColorBySign,
} from '@/components/carteira/shared';
import CaixaParaInvestirCard from '@/components/carteira/shared/CaixaParaInvestirCard';
import { useCarteiraResumoContext } from '@/context/CarteiraResumoContext';
import AssetNameLink from '@/components/carteira/AssetNameLink';
import { formatAssetDisplayTitle } from '@/utils/assetDisplayName';
import {
  TABLE_STYLES,
  TABLE_HEADER_STYLE,
  TABLE_HIGHLIGHT_HEADER_STYLE,
  TABLE_SECTION_STYLE,
} from '@/components/ui/table/tableStyles';

const MIN_PLACEHOLDER_ROWS = 4;
const RENDA_FIXA_COLUMN_COUNT = 13;
const RENDA_FIXA_SECTION_ORDER = ['pos-fixada', 'prefixada', 'hibrida'] as const;
const RENDA_FIXA_SECTION_NAMES: Record<(typeof RENDA_FIXA_SECTION_ORDER)[number], string> = {
  'pos-fixada': 'Pos-fixada',
  prefixada: 'Pre-fixada',
  hibrida: 'Hibrida',
};

const formatPercentageSimple = (value: number | undefined | null): string => {
  if (value === undefined || value === null || isNaN(value)) {
    return '0,00%';
  }
  return `${value.toFixed(2)}%`;
};

// ---------------------------------------------------------------------------
// RendaFixaTableRow -- keeps its own editable state (too custom to generalize)
// ---------------------------------------------------------------------------

interface RendaFixaTableRowProps {
  ativo: RendaFixaAtivo;
  formatCurrency: (value: number) => string;
  formatPercentage: (value: number) => string;
  onUpdateCampo: (
    ativoId: string,
    campo:
      | 'cotizacaoResgate'
      | 'liquidacaoResgate'
      | 'benchmark'
      | 'valorAtualizado'
      | 'observacoes',
    valor: string | number,
  ) => void;
}

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

  const handleSubmit = (
    campo:
      | 'cotizacaoResgate'
      | 'liquidacaoResgate'
      | 'benchmark'
      | 'valorAtualizado'
      | 'observacoes',
    valor: string | number,
  ) => {
    onUpdateCampo(ativo.id, campo, valor);
    if (campo === 'cotizacaoResgate') setIsEditingCotizacao(false);
    if (campo === 'liquidacaoResgate') setIsEditingLiquidacao(false);
    if (campo === 'benchmark') setIsEditingBenchmark(false);
    if (campo === 'valorAtualizado') setIsEditingValor(false);
    if (campo === 'observacoes') setIsEditingObservacoes(false);
  };

  const handleKeyPress = (
    e: React.KeyboardEvent,
    campo:
      | 'cotizacaoResgate'
      | 'liquidacaoResgate'
      | 'benchmark'
      | 'valorAtualizado'
      | 'observacoes',
    valor: string | number,
  ) => {
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
    <tr className={`${TABLE_STYLES.row} ${TABLE_STYLES.rowHover}`}>
      <td className={TABLE_STYLES.compact.td}>
        <AssetNameLink
          portfolioId={ativo.id}
          ticker={formatAssetDisplayTitle({ ticker: ativo.nome, nome: null }, 'Renda Fixa').full}
          nomeComoPrincipal
        />
      </td>
      <td className={`${TABLE_STYLES.compact.td} text-center`}>
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
      <td className={`${TABLE_STYLES.compact.td} text-center`}>
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
      <td className={`${TABLE_STYLES.compact.td} text-center`}>
        {ativo.vencimento.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
      </td>
      <td className={`${TABLE_STYLES.compact.td} text-center`}>
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
      <td className={`${TABLE_STYLES.compact.td} text-right`}>
        {formatCurrency(ativo.valorInicialAplicado)}
      </td>
      <td className={`${TABLE_STYLES.compact.td} text-right`}>{formatCurrency(ativo.aporte)}</td>
      <td className={`${TABLE_STYLES.compact.td} text-right`}>{formatCurrency(ativo.resgate)}</td>
      <td className={`${TABLE_STYLES.compact.td} text-right`}>
        {ativo.isAutoUpdated ? (
          <div title="Sincronizado automaticamente (PU Tesouro Direto)" className="px-1 py-0.5">
            {formatCurrency(ativo.valorAtualizado)}
          </div>
        ) : isEditingValor ? (
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
      <td className={`${TABLE_STYLES.compact.td} ${TABLE_STYLES.highlightTd} text-right`}>
        {formatPercentageSimple(ativo.percentualCarteira)}
      </td>
      <td className={`${TABLE_STYLES.compact.td} text-right`}>
        {/* razão (participação), não variação — sem sinal "+" */}
        {formatPercentageSimple(ativo.riscoPorAtivo)}
      </td>
      <td className={`${TABLE_STYLES.compact.td} text-right`}>
        {formatPercentage(ativo.rentabilidade)}
      </td>
      <td className={TABLE_STYLES.compact.td}>
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

// ---------------------------------------------------------------------------
// RendaFixaSection
// ---------------------------------------------------------------------------

interface RendaFixaSectionProps {
  secao: RendaFixaSecao;
  formatCurrency: (value: number) => string;
  formatPercentage: (value: number) => string;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdateCampo: (
    ativoId: string,
    campo:
      | 'cotizacaoResgate'
      | 'liquidacaoResgate'
      | 'benchmark'
      | 'valorAtualizado'
      | 'observacoes',
    valor: string | number,
  ) => void;
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
      <tr
        className={`${TABLE_STYLES.sectionRow} cursor-pointer`}
        style={TABLE_SECTION_STYLE}
        onClick={onToggle}
      >
        <td className={`${TABLE_STYLES.compact.td} text-white`}>
          <div className="flex items-center space-x-2">
            {isExpanded ? (
              <ChevronUpIcon className="w-4 h-4" />
            ) : (
              <ChevronDownIcon className="w-4 h-4" />
            )}
            <span>{secao.nome}</span>
          </div>
        </td>
        <td className={`${TABLE_STYLES.compact.td} text-center text-white`}>-</td>
        <td className={`${TABLE_STYLES.compact.td} text-center text-white`}>-</td>
        <td className={`${TABLE_STYLES.compact.td} text-center text-white`}>-</td>
        <td className={`${TABLE_STYLES.compact.td} text-center text-white`}>-</td>
        <td className={`${TABLE_STYLES.compact.td} text-right text-white`}>
          {formatCurrency(secao.totalValorAplicado)}
        </td>
        <td className={`${TABLE_STYLES.compact.td} text-right text-white`}>
          {formatCurrency(secao.totalAporte)}
        </td>
        <td className={`${TABLE_STYLES.compact.td} text-right text-white`}>
          {formatCurrency(secao.totalResgate)}
        </td>
        <td className={`${TABLE_STYLES.compact.td} text-right text-white`}>
          {formatCurrency(secao.totalValorAtualizado)}
        </td>
        <td className={`${TABLE_STYLES.compact.td} text-right text-white`}>
          {formatPercentageSimple(secao.percentualTotal)}
        </td>
        <td className={`${TABLE_STYLES.compact.td} text-center text-white`}>-</td>
        <td className={`${TABLE_STYLES.compact.td} text-right text-white`}>
          {formatPercentage(secao.rentabilidadeMedia)}
        </td>
        <td className={`${TABLE_STYLES.compact.td} text-center text-white`}>-</td>
      </tr>

      {isExpanded &&
        secao.ativos.map((ativo) => (
          <RendaFixaTableRow
            key={ativo.id}
            ativo={ativo}
            formatCurrency={formatCurrency}
            formatPercentage={formatPercentage}
            onUpdateCampo={onUpdateCampo}
          />
        ))}
      {isExpanded && (
        <BasicTablePlaceholderRows count={placeholderCount} colSpan={RENDA_FIXA_COLUMN_COUNT} />
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// Main RendaFixaTable component
// ---------------------------------------------------------------------------

interface RendaFixaTableProps {
  totalCarteira?: number;
}

export default function RendaFixaTable({ totalCarteira = 0 }: RendaFixaTableProps) {
  const {
    data,
    loading,
    error,
    formatCurrency,
    formatPercentage,
    updateCaixaParaInvestir,
    updateRendaFixaCampo,
  } = useRendaFixa();
  const { necessidadeAporteMap } = useCarteiraResumoContext();
  const necessidadeAporteCalculada =
    necessidadeAporteMap.rendaFixaFundos ?? data?.resumo?.necessidadeAporte ?? 0;
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(RENDA_FIXA_SECTION_ORDER),
  );

  const dataComRisco = useMemo(() => {
    if (!data) return data;

    const totalTabValue = data.totalGeral?.valorAtualizado || 0;
    const shouldCalculateRisco = totalCarteira > 0;

    const secoesComRisco = data.secoes.map((secao) => ({
      ...secao,
      percentualTotal: totalTabValue > 0 ? (secao.totalValorAtualizado / totalTabValue) * 100 : 0,
      ativos: secao.ativos.map((ativo) => ({
        ...ativo,
        riscoPorAtivo: shouldCalculateRisco
          ? Math.min(100, (ativo.valorAtualizado / totalCarteira) * 100)
          : 0,
        percentualCarteira: totalTabValue > 0 ? (ativo.valorAtualizado / totalTabValue) * 100 : 0,
      })),
      totalRisco: secao.ativos.reduce(
        (sum, ativo) =>
          sum +
          (shouldCalculateRisco ? Math.min(100, (ativo.valorAtualizado / totalCarteira) * 100) : 0),
        0,
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
      nome: string,
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
      const nome = RENDA_FIXA_SECTION_NAMES[secao.tipo] ?? secao.nome;
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
          <p className="text-xs text-gray-900 dark:text-white">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <MetricCard
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
        <MetricCard
          title="Saldo Inicio do Mes"
          value={formatCurrency(data?.resumo?.saldoInicioMes ?? 0)}
        />
        <MetricCard title="Saldo Atual" value={formatCurrency(data?.resumo?.saldoAtual ?? 0)} />
        <MetricCard
          title="Rendimento"
          value={formatCurrency(data?.resumo?.rendimento ?? 0)}
          color={metricColorBySign(data?.resumo?.rendimento ?? 0)}
        />
        <MetricCard
          title="Rentabilidade"
          value={formatPercentage(data?.resumo?.rentabilidade ?? 0)}
          color={metricColorBySign(data?.resumo?.rentabilidade ?? 0)}
        />
      </div>

      {/* Main table */}
      <ComponentCard title="Renda Fixa">
        <div className={TABLE_STYLES.wrapper}>
          <table className={TABLE_STYLES.table}>
            <thead>
              <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
                <th className={`${TABLE_STYLES.compact.th} text-left`}>Nome dos Ativos</th>
                <th className={`${TABLE_STYLES.compact.th} text-center`}>Cotizacao de resgate</th>
                <th className={`${TABLE_STYLES.compact.th} text-center`}>Liquidacao de resgate</th>
                <th className={`${TABLE_STYLES.compact.th} text-center`}>Vencimento</th>
                <th className={`${TABLE_STYLES.compact.th} text-center`}>Benchmark</th>
                <th className={`${TABLE_STYLES.compact.th} text-right`}>Valor inicial aplicado</th>
                <th className={`${TABLE_STYLES.compact.th} text-right`}>Aporte</th>
                <th className={`${TABLE_STYLES.compact.th} text-right`}>Resgate</th>
                <th className={`${TABLE_STYLES.compact.th} text-right`}>Valor Atualizado</th>
                <th
                  className={`${TABLE_STYLES.compact.th} text-right`}
                  style={TABLE_HIGHLIGHT_HEADER_STYLE}
                >
                  % da Aba
                </th>
                <th className={`${TABLE_STYLES.compact.th} text-right`}>
                  <span className="block">Risco por ativo</span>
                  <span className="block">(Carteira Total)</span>
                </th>
                <th className={`${TABLE_STYLES.compact.th} text-right`}>Rentabilidade</th>
                <th className={`${TABLE_STYLES.compact.th} text-left`}>Observações</th>
              </tr>
            </thead>
            <tbody>
              {/* Grand total row */}
              <tr className={TABLE_STYLES.totalRow}>
                <td className={TABLE_STYLES.compact.td}>TOTAL GERAL</td>
                <td className={`${TABLE_STYLES.compact.td} text-center`}>-</td>
                <td className={`${TABLE_STYLES.compact.td} text-center`}>-</td>
                <td className={`${TABLE_STYLES.compact.td} text-center`}>-</td>
                <td className={`${TABLE_STYLES.compact.td} text-center`}>-</td>
                <td className={`${TABLE_STYLES.compact.td} text-right`}>
                  {formatCurrency(dataComRisco?.totalGeral?.valorAplicado || 0)}
                </td>
                <td className={`${TABLE_STYLES.compact.td} text-right`}>
                  {formatCurrency(dataComRisco?.totalGeral?.aporte || 0)}
                </td>
                <td className={`${TABLE_STYLES.compact.td} text-right`}>
                  {formatCurrency(dataComRisco?.totalGeral?.resgate || 0)}
                </td>
                <td className={`${TABLE_STYLES.compact.td} text-right`}>
                  {formatCurrency(dataComRisco?.totalGeral?.valorAtualizado || 0)}
                </td>
                <td className={`${TABLE_STYLES.compact.td} text-right`}>100.00%</td>
                <td className={`${TABLE_STYLES.compact.td} text-center`}>-</td>
                <td className={`${TABLE_STYLES.compact.td} text-right`}>
                  {formatPercentage(dataComRisco?.totalGeral?.rentabilidade || 0)}
                </td>
                <td className={`${TABLE_STYLES.compact.td} text-center`}>-</td>
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
