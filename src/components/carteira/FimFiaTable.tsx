'use client';
import React, { useState, useMemo } from 'react';
import { useFimFia } from '@/hooks/useFimFia';
import { FimFiaAtivo, FimFiaSecao, TipoFimFia } from '@/types/fimFia';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ComponentCard from '@/components/common/ComponentCard';
import {
  StandardTable,
  StandardTableHeader,
  StandardTableHeaderRow,
  StandardTableHeaderCell,
  StandardTableBodyCell,
  StandardTableRow,
  TableBody,
} from '@/components/ui/table/StandardTable';
import { ChevronDownIcon, ChevronUpIcon } from '@/icons';
import { useCarteiraResumoContext } from '@/context/CarteiraResumoContext';
import { BasicTablePlaceholderRows } from '@/components/carteira/shared';
import CaixaParaInvestirCard from '@/components/carteira/shared/CaixaParaInvestirCard';
import AssetNameLink from '@/components/carteira/AssetNameLink';

const MIN_PLACEHOLDER_ROWS = 4;
const FIM_FIA_COLUMN_COUNT = 15;
const FIM_FIA_SECTION_ORDER = ['fim', 'fia'] as const;
const FIM_FIA_SECTION_NAMES: Record<(typeof FIM_FIA_SECTION_ORDER)[number], string> = {
  fim: 'FIM',
  fia: 'FIA',
};

interface FimFiaMetricCardProps {
  title: string;
  value: string;
  color?: 'primary' | 'success' | 'warning' | 'error';
}

const FimFiaMetricCard: React.FC<FimFiaMetricCardProps> = ({ title, value, color = 'primary' }) => {
  const colorClasses = {
    primary: 'bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:text-blue-100',
    success: 'bg-green-50 text-green-900 dark:bg-green-900/20 dark:text-green-100',
    warning: 'bg-yellow-50 text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-100',
    error: 'bg-red-50 text-red-900 dark:bg-red-900/20 dark:text-red-100',
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
  onUpdateValorAtualizado: (ativoId: string, novoValor: number) => void;
}

const FimFiaTableRow: React.FC<FimFiaTableRowProps> = ({
  ativo,
  formatCurrency,
  formatPercentage,
  onUpdateObjetivo,
  onUpdateValorAtualizado,
}) => {
  const [isEditingObjetivo, setIsEditingObjetivo] = useState(false);
  const [objetivoValue, setObjetivoValue] = useState(ativo.objetivo.toString());
  const [isEditingValor, setIsEditingValor] = useState(false);
  const [valorValue, setValorValue] = useState(
    ativo.valorAtualizado.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  );

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

  const parseValorMonetario = (str: string): number | null => {
    const cleaned = str.replace(/[^\d,.]/g, '').trim();
    if (!cleaned) return null;
    const hasComma = cleaned.includes(',');
    const normalized = hasComma ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned;
    const num = Number.parseFloat(normalized);
    return Number.isFinite(num) && num >= 0 ? num : null;
  };

  const formatValorMonetario = (num: number): string => {
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleValorSubmit = (rawValue?: string) => {
    const str = rawValue !== undefined ? rawValue : valorValue;
    const numValor = parseValorMonetario(str);
    if (numValor !== null) {
      onUpdateValorAtualizado(ativo.id, numValor);
      setIsEditingValor(false);
    } else {
      setValorValue(
        ativo.valorAtualizado.toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      );
      setIsEditingValor(false);
    }
  };

  const handleValorKeyPress = (e: React.KeyboardEvent, rawValue: string) => {
    if (e.key === 'Enter') {
      handleValorSubmit(rawValue);
    } else if (e.key === 'Escape') {
      setValorValue(formatValorMonetario(ativo.valorAtualizado));
      setIsEditingValor(false);
    }
  };

  return (
    <StandardTableRow>
      <StandardTableBodyCell align="left" className="min-w-[220px] w-3/12">
        <div>
          <AssetNameLink
            portfolioId={ativo.id}
            ticker={`${ativo.categoriaNivel1} • ${ativo.subcategoriaNivel2}`}
            nome={ativo.nome}
            nomeComoPrincipal
          />
          {ativo.observacoes && <div className="text-xs mt-1">{ativo.observacoes}</div>}
        </div>
      </StandardTableBodyCell>
      <StandardTableBodyCell align="center">{ativo.cotizacaoResgate}</StandardTableBodyCell>
      <StandardTableBodyCell align="center">{ativo.liquidacaoResgate}</StandardTableBodyCell>
      <StandardTableBodyCell align="center">{ativo.categoriaNivel1}</StandardTableBodyCell>
      <StandardTableBodyCell align="center">{ativo.subcategoriaNivel2}</StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        {formatCurrency(ativo.valorInicialAplicado)}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">{formatCurrency(ativo.aporte)}</StandardTableBodyCell>
      <StandardTableBodyCell align="right">{formatCurrency(ativo.resgate)}</StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        {isEditingValor ? (
          <input
            type="text"
            inputMode="decimal"
            value={valorValue}
            onChange={(e) => setValorValue(e.target.value)}
            onKeyDown={(e) => handleValorKeyPress(e, valorValue)}
            onBlur={() => handleValorSubmit()}
            onFocus={(e) => e.target.select()}
            placeholder="0,00"
            className="w-28 px-1 py-0.5 text-xs border border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700 dark:text-white text-right"
            autoFocus
          />
        ) : (
          <div
            className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 rounded"
            onClick={() => {
              setValorValue(
                ativo.valorAtualizado.toLocaleString('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }),
              );
              setIsEditingValor(true);
            }}
          >
            {formatCurrency(ativo.valorAtualizado)}
          </div>
        )}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        {formatPercentage(ativo.percentualCarteira)}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        {formatPercentage(ativo.riscoPorAtivo)}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right" className="border border-black">
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
            <span className="text-xs">%</span>
          </div>
        ) : (
          <div
            className="cursor-pointer px-1 py-0.5 rounded"
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
        {formatCurrency(ativo.necessidadeAporte)}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        {formatPercentage(ativo.rentabilidade)}
      </StandardTableBodyCell>
    </StandardTableRow>
  );
};

interface FimFiaSectionProps {
  secao: FimFiaSecao;
  formatCurrency: (value: number) => string;
  formatPercentage: (value: number) => string;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdateObjetivo: (ativoId: string, novoObjetivo: number) => void;
  onUpdateValorAtualizado: (ativoId: string, novoValor: number) => void;
}

const FimFiaSection: React.FC<FimFiaSectionProps> = ({
  secao,
  formatCurrency,
  formatPercentage,
  isExpanded,
  onToggle,
  onUpdateObjetivo,
  onUpdateValorAtualizado,
}) => {
  const placeholderCount = Math.max(0, MIN_PLACEHOLDER_ROWS - secao.ativos.length);

  return (
    <>
      {/* Cabeçalho da seção */}
      <StandardTableRow className="bg-[#808080] cursor-pointer" onClick={onToggle}>
        <StandardTableBodyCell
          align="left"
          className="min-w-[220px] w-3/12 bg-[#808080] text-white font-bold"
        >
          <div className="flex items-center space-x-2">
            {isExpanded ? (
              <ChevronUpIcon className="w-4 h-4" />
            ) : (
              <ChevronDownIcon className="w-4 h-4" />
            )}
            <span>{secao.nome}</span>
          </div>
        </StandardTableBodyCell>
        <StandardTableBodyCell align="center" className="bg-[#808080] text-white font-bold">
          -
        </StandardTableBodyCell>
        <StandardTableBodyCell align="center" className="bg-[#808080] text-white font-bold">
          -
        </StandardTableBodyCell>
        <StandardTableBodyCell align="center" className="bg-[#808080] text-white font-bold">
          -
        </StandardTableBodyCell>
        <StandardTableBodyCell align="center" className="bg-[#808080] text-white font-bold">
          -
        </StandardTableBodyCell>
        <StandardTableBodyCell align="right" className="bg-[#808080] text-white font-bold">
          {formatCurrency(secao.totalValorAplicado)}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="right" className="bg-[#808080] text-white font-bold">
          {formatCurrency(secao.totalAporte)}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="right" className="bg-[#808080] text-white font-bold">
          {formatCurrency(secao.totalResgate)}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="right" className="bg-[#808080] text-white font-bold">
          {formatCurrency(secao.totalValorAtualizado)}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="right" className="bg-[#808080] text-white font-bold">
          {formatPercentage(secao.totalPercentualCarteira)}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="right" className="bg-[#808080] text-white font-bold">
          {formatPercentage(secao.totalRisco)}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="right" className="bg-[#808080] text-white font-bold">
          {formatPercentage(secao.totalObjetivo)}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="right" className="bg-[#808080] text-white font-bold">
          {formatPercentage(secao.totalQuantoFalta)}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="right" className="bg-[#808080] text-white font-bold">
          {formatCurrency(secao.totalNecessidadeAporte)}
        </StandardTableBodyCell>
        <StandardTableBodyCell align="right" className="bg-[#808080] text-white font-bold">
          {formatPercentage(secao.rentabilidadeMedia)}
        </StandardTableBodyCell>
      </StandardTableRow>

      {/* Ativos da seção */}
      {isExpanded &&
        secao.ativos.map((ativo) => (
          <FimFiaTableRow
            key={ativo.id}
            ativo={ativo}
            formatCurrency={formatCurrency}
            formatPercentage={formatPercentage}
            onUpdateObjetivo={onUpdateObjetivo}
            onUpdateValorAtualizado={onUpdateValorAtualizado}
          />
        ))}
      {isExpanded && (
        <BasicTablePlaceholderRows count={placeholderCount} colSpan={FIM_FIA_COLUMN_COUNT} />
      )}
    </>
  );
};

interface FimFiaTableProps {
  totalCarteira?: number;
}

export default function FimFiaTable({ totalCarteira = 0 }: FimFiaTableProps) {
  const {
    data,
    loading,
    error,
    formatCurrency,
    formatPercentage,
    updateObjetivo,
    updateValorAtualizado,
    updateCaixaParaInvestir,
  } = useFimFia();
  const { necessidadeAporteMap } = useCarteiraResumoContext();
  const necessidadeAporteTotalCalculada =
    necessidadeAporteMap.fimFia ?? data?.resumo?.necessidadeAporteTotal ?? 0;
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(FIM_FIA_SECTION_ORDER),
  );

  // Calcular risco (carteira total) e percentual da carteira da aba
  const dataComRisco = useMemo(() => {
    if (!data) return data;

    const totalTabValue = data.totalGeral?.valorAtualizado || 0;
    const shouldCalculateRisco = totalCarteira > 0;

    const secoesComRisco = data.secoes.map((secao) => {
      const totalPercentualCarteira =
        totalTabValue > 0 ? (secao.totalValorAtualizado / totalTabValue) * 100 : 0;

      return {
        ...secao,
        ativos: secao.ativos.map((ativo) => {
          // Percentual daquele tipo de ativo (não da carteira total)
          const percentualCarteira =
            totalTabValue > 0 ? (ativo.valorAtualizado / totalTabValue) * 100 : 0;
          const objetivo = ativo.objetivo || 0;
          // Quanto falta = diferença entre % atual e objetivo (em %)
          const quantoFalta = objetivo - percentualCarteira;
          // Necessidade de aporte = valor em R$ referente à porcentagem de "quanto falta" (calculado sobre o total daquele tipo de ativo)
          const necessidadeAporte =
            totalTabValue > 0 && quantoFalta > 0 ? (quantoFalta / 100) * totalTabValue : 0;

          return {
            ...ativo,
            riscoPorAtivo: shouldCalculateRisco
              ? Math.min(100, (ativo.valorAtualizado / totalCarteira) * 100)
              : 0,
            percentualCarteira,
            quantoFalta,
            necessidadeAporte,
          };
        }),
        totalPercentualCarteira,
        totalRisco: secao.ativos.reduce(
          (sum, ativo) =>
            sum +
            (shouldCalculateRisco
              ? Math.min(100, (ativo.valorAtualizado / totalCarteira) * 100)
              : 0),
          0,
        ),
        totalQuantoFalta: secao.ativos.reduce((sum, ativo) => {
          const percentualCarteira =
            totalTabValue > 0 ? (ativo.valorAtualizado / totalTabValue) * 100 : 0;
          const objetivo = ativo.objetivo || 0;
          return sum + (objetivo - percentualCarteira);
        }, 0),
        totalNecessidadeAporte: secao.ativos.reduce((sum, ativo) => {
          const percentualCarteira =
            totalTabValue > 0 ? (ativo.valorAtualizado / totalTabValue) * 100 : 0;
          const objetivo = ativo.objetivo || 0;
          const quantoFalta = objetivo - percentualCarteira;
          return (
            sum + (totalTabValue > 0 && quantoFalta > 0 ? (quantoFalta / 100) * totalTabValue : 0)
          );
        }, 0),
      };
    });

    const totalGeralRisco = secoesComRisco.reduce(
      (sum, secao) => sum + secao.ativos.reduce((s, ativo) => s + ativo.riscoPorAtivo, 0),
      0,
    );

    // Recalcular totais gerais
    const totalQuantoFalta = secoesComRisco.reduce((sum, secao) => sum + secao.totalQuantoFalta, 0);
    const totalNecessidadeAporte = secoesComRisco.reduce(
      (sum, secao) => sum + secao.totalNecessidadeAporte,
      0,
    );

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

  const handleUpdateValorAtualizado = async (ativoId: string, novoValor: number) => {
    await updateValorAtualizado(ativoId, novoValor);
  };

  const normalizedSections = useMemo(() => {
    const createEmptySection = (
      tipo: (typeof FIM_FIA_SECTION_ORDER)[number],
      nome: string,
    ): FimFiaSecao => ({
      tipo: tipo as TipoFimFia,
      nome,
      ativos: [],
      totalValorAplicado: 0,
      totalAporte: 0,
      totalResgate: 0,
      totalValorAtualizado: 0,
      totalPercentualCarteira: 0,
      totalRisco: 0,
      totalObjetivo: 0,
      totalQuantoFalta: 0,
      totalNecessidadeAporte: 0,
      rentabilidadeMedia: 0,
    });

    const sectionMap = new Map<string, FimFiaSecao>();
    (dataComRisco?.secoes || []).forEach((secao) => {
      const nome = FIM_FIA_SECTION_NAMES[secao.tipo];
      sectionMap.set(secao.tipo, { ...secao, nome });
    });

    return FIM_FIA_SECTION_ORDER.map((tipo) => {
      const nome = FIM_FIA_SECTION_NAMES[tipo];
      return sectionMap.get(tipo) ?? createEmptySection(tipo, nome);
    });
  }, [dataComRisco?.secoes]);

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

  return (
    <div className="space-y-4">
      {/* Cards de resumo */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <FimFiaMetricCard
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
        <FimFiaMetricCard
          title="Saldo Início do Mês"
          value={formatCurrency(data?.resumo?.saldoInicioMes ?? 0)}
        />
        <FimFiaMetricCard
          title="Valor Atualizado"
          value={formatCurrency(data?.resumo?.valorAtualizado ?? 0)}
        />
        <FimFiaMetricCard
          title="Rendimento"
          value={formatCurrency(data?.resumo?.rendimento ?? 0)}
          color="success"
        />
        <FimFiaMetricCard
          title="Rentabilidade"
          value={formatPercentage(data?.resumo?.rentabilidade ?? 0)}
          color="success"
        />
      </div>

      {/* Tabela principal */}
      <ComponentCard title="FIM/FIA - Detalhamento">
        <StandardTable>
          <StandardTableHeader sticky headerBgColor="#9E8A58">
            <StandardTableHeaderRow headerBgColor="#9E8A58">
              <StandardTableHeaderCell
                align="left"
                className="min-w-[220px] w-3/12"
                headerBgColor="#9E8A58"
              >
                Nome dos Ativos
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="center" headerBgColor="#9E8A58">
                Cot. Resgate
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="center" headerBgColor="#9E8A58">
                Liq. Resgate
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="center" headerBgColor="#9E8A58">
                Cat. Nível 1
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="center" headerBgColor="#9E8A58">
                Subcat. Nível 2
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">
                Valor Inicial
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">
                Aporte
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">
                Resgate
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">
                Valor Atualizado
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">
                % da Carteira
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">
                <span className="block">Risco Por Ativo</span>
                <span className="block">(Carteira Total)</span>
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">
                Objetivo
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">
                Quanto Falta
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">
                Nec. Aporte R$
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">
                Rentabilidade
              </StandardTableHeaderCell>
            </StandardTableHeaderRow>
          </StandardTableHeader>
          <TableBody>
            {/* Linha de totalização */}
            <StandardTableRow isTotal className="bg-[#404040]">
              <StandardTableBodyCell
                align="left"
                isTotal
                className="min-w-[220px] w-3/12 bg-[#404040] text-white font-bold"
              >
                TOTAL GERAL
              </StandardTableBodyCell>
              <StandardTableBodyCell
                align="center"
                isTotal
                className="bg-[#404040] text-white font-bold"
              >
                -
              </StandardTableBodyCell>
              <StandardTableBodyCell
                align="center"
                isTotal
                className="bg-[#404040] text-white font-bold"
              >
                -
              </StandardTableBodyCell>
              <StandardTableBodyCell
                align="center"
                isTotal
                className="bg-[#404040] text-white font-bold"
              >
                -
              </StandardTableBodyCell>
              <StandardTableBodyCell
                align="center"
                isTotal
                className="bg-[#404040] text-white font-bold"
              >
                -
              </StandardTableBodyCell>
              <StandardTableBodyCell
                align="right"
                isTotal
                className="bg-[#404040] text-white font-bold"
              >
                {formatCurrency(dataComRisco?.totalGeral?.valorAplicado || 0)}
              </StandardTableBodyCell>
              <StandardTableBodyCell
                align="right"
                isTotal
                className="bg-[#404040] text-white font-bold"
              >
                {formatCurrency(dataComRisco?.totalGeral?.aporte || 0)}
              </StandardTableBodyCell>
              <StandardTableBodyCell
                align="right"
                isTotal
                className="bg-[#404040] text-white font-bold"
              >
                {formatCurrency(dataComRisco?.totalGeral?.resgate || 0)}
              </StandardTableBodyCell>
              <StandardTableBodyCell
                align="right"
                isTotal
                className="bg-[#404040] text-white font-bold"
              >
                {formatCurrency(dataComRisco?.totalGeral?.valorAtualizado || 0)}
              </StandardTableBodyCell>
              <StandardTableBodyCell
                align="right"
                isTotal
                className="bg-[#404040] text-white font-bold"
              >
                100.00%
              </StandardTableBodyCell>
              <StandardTableBodyCell
                align="right"
                isTotal
                className="bg-[#404040] text-white font-bold"
              >
                {formatPercentage(dataComRisco?.totalGeral?.risco || 0)}
              </StandardTableBodyCell>
              <StandardTableBodyCell
                align="right"
                isTotal
                className="bg-[#404040] text-white font-bold"
              >
                {formatPercentage(dataComRisco?.totalGeral?.objetivo || 0)}
              </StandardTableBodyCell>
              <StandardTableBodyCell
                align="right"
                isTotal
                className="bg-[#404040] text-white font-bold"
              >
                {formatPercentage(dataComRisco?.totalGeral?.quantoFalta || 0)}
              </StandardTableBodyCell>
              <StandardTableBodyCell
                align="right"
                isTotal
                className="bg-[#404040] text-white font-bold"
              >
                {formatCurrency(dataComRisco?.totalGeral?.necessidadeAporte || 0)}
              </StandardTableBodyCell>
              <StandardTableBodyCell
                align="right"
                isTotal
                className="bg-[#404040] text-white font-bold"
              >
                {formatPercentage(dataComRisco?.totalGeral?.rentabilidade || 0)}
              </StandardTableBodyCell>
            </StandardTableRow>

            {normalizedSections.map((secao) => (
              <FimFiaSection
                key={secao.tipo}
                secao={secao}
                formatCurrency={formatCurrency}
                formatPercentage={formatPercentage}
                isExpanded={expandedSections.has(secao.tipo)}
                onToggle={() => toggleSection(secao.tipo)}
                onUpdateObjetivo={handleUpdateObjetivo}
                onUpdateValorAtualizado={handleUpdateValorAtualizado}
              />
            ))}
          </TableBody>
        </StandardTable>
      </ComponentCard>
    </div>
  );
}
