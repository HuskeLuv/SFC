'use client';
import React, { useState, useMemo } from 'react';
import Link from 'next/link';
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
import { formatAssetDisplayTitle, simplifyAssetName } from '@/utils/assetDisplayName';
import {
  TABLE_STYLES,
  TABLE_HEADER_STYLE,
  TABLE_SECTION_STYLE,
  TABLE_MOBILE_STYLES,
} from '@/components/ui/table/tableStyles';
import { ResponsiveCardList, type ResponsiveColumn } from '@/components/ui/table/ResponsiveTable';
import { CardSectionBand } from '@/components/ui/table/CardSectionBand';
import {
  MobileEditSheet,
  type MobileEditKind,
  type MobileEditValue,
} from '@/components/ui/sheet/MobileEditSheet';
import { useIsBelowLg } from '@/hooks/useMediaQuery';

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
      <td className={`${TABLE_STYLES.compact.td} text-right`}>
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
// Celular (PWA fase 1): cartões expansíveis por seção + edição por sheet
// ---------------------------------------------------------------------------

type RendaFixaCampo =
  | 'cotizacaoResgate'
  | 'liquidacaoResgate'
  | 'benchmark'
  | 'valorAtualizado'
  | 'observacoes';

const DIA_MS = 24 * 60 * 60 * 1000;
/** Vencimento a até N dias vira selo âmbar + aviso no topo da aba. */
export const RF_VENCE_EM_BREVE_DIAS = 30;

/** Dias corridos (dia UTC do vencimento × dia local de hoje) — negativo se já venceu. */
export function diasAteVencimento(vencimento: Date, hoje: Date = new Date()): number {
  const v = Date.UTC(
    vencimento.getUTCFullYear(),
    vencimento.getUTCMonth(),
    vencimento.getUTCDate(),
  );
  const h = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((v - h) / DIA_MS);
}

/** Prazo até o vencimento por extenso ("em 12 dias", "em 1 ano e 3 meses", "já venceu"). */
export function formatPrazoVencimento(dias: number): string {
  if (!Number.isFinite(dias)) return '';
  if (dias < 0) return 'já venceu';
  if (dias === 0) return 'vence hoje';
  if (dias === 1) return 'vence amanhã';
  if (dias <= 45) return `em ${dias} dias`;
  const meses = Math.round(dias / 30.4375);
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  const txtMeses = `${resto} ${resto === 1 ? 'mês' : 'meses'}`;
  if (anos === 0) return `em ${txtMeses}`;
  const txtAnos = `${anos} ${anos === 1 ? 'ano' : 'anos'}`;
  return resto === 0 ? `em ${txtAnos}` : `em ${txtAnos} e ${txtMeses}`;
}

const formatDateUtc = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });

const rfDisplayName = (ativo: RendaFixaAtivo) => {
  const full = formatAssetDisplayTitle({ ticker: ativo.nome, nome: null }, 'Renda Fixa').full;
  return simplifyAssetName(full) || full;
};

const PILL_BASE =
  'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap';
const PILL_SOFT = `${PILL_BASE} bg-gray-100 text-gray-700 dark:bg-white/[0.06] dark:text-gray-300`;
const PILL_WARN = `${PILL_BASE} bg-[#D97706]/[0.12] text-[#B45309] dark:bg-[#FBBF24]/[0.14] dark:text-amber-300`;

const EDIT_META: Record<
  RendaFixaCampo,
  { label: string; title: string; kind: MobileEditKind; hint?: string }
> = {
  cotizacaoResgate: {
    label: 'Cotização de resgate',
    title: 'Editar cotização',
    kind: 'text',
    hint: 'Ex.: D+0, D+30',
  },
  liquidacaoResgate: {
    label: 'Liquidação de resgate',
    title: 'Editar liquidação',
    kind: 'text',
    hint: 'Ex.: D+0, D+1',
  },
  benchmark: {
    label: 'Benchmark',
    title: 'Editar benchmark',
    kind: 'text',
    hint: 'Ex.: CDI, IPCA + 6%',
  },
  valorAtualizado: {
    label: 'Valor atualizado',
    title: 'Editar valor atualizado',
    kind: 'currency',
  },
  observacoes: { label: 'Observações', title: 'Editar observações', kind: 'textarea' },
};

interface RendaFixaMobileListProps {
  secoes: RendaFixaSecao[];
  expandedSections: Set<string>;
  onToggleSection: (tipo: string) => void;
  totalGeral: {
    valorAplicado: number;
    aporte: number;
    resgate: number;
    valorAtualizado: number;
    rentabilidade: number;
  };
  formatCurrency: (value: number) => string;
  formatPercentage: (value: number) => string;
  /** O MESMO `updateRendaFixaCampo` do desktop (devolve false em falha). */
  onUpdateCampo: (
    ativoId: string,
    campo: RendaFixaCampo,
    valor: string | number,
  ) => void | boolean | Promise<void | boolean>;
}

function DetailItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className={TABLE_MOBILE_STYLES.cardDetailLabel}>{label}</dt>
      <dd className={`${TABLE_MOBILE_STYLES.cardDetailValue} break-words`}>{children}</dd>
    </div>
  );
}

export function RendaFixaMobileList({
  secoes,
  expandedSections,
  onToggleSection,
  totalGeral,
  formatCurrency,
  formatPercentage,
  onUpdateCampo,
}: RendaFixaMobileListProps) {
  const [editing, setEditing] = useState<{ ativo: RendaFixaAtivo; campo: RendaFixaCampo } | null>(
    null,
  );
  const [editOpen, setEditOpen] = useState(false);

  const hoje = useMemo(() => new Date(), []);
  // Seções vazias somem no celular (decisão 7).
  const visiveis = secoes.filter((s) => s.ativos.length > 0);
  const vencendo = visiveis
    .flatMap((s) => s.ativos)
    .filter((a) => {
      if (a.semVencimento) return false;
      const d = diasAteVencimento(a.vencimento, hoje);
      return d >= 0 && d <= RF_VENCE_EM_BREVE_DIAS;
    });

  const openEdit = (ativo: RendaFixaAtivo, campo: RendaFixaCampo) => {
    setEditing({ ativo, campo });
    setEditOpen(true);
  };

  const vencimentoPill = (ativo: RendaFixaAtivo) => {
    if (ativo.semVencimento) return null;
    const dias = diasAteVencimento(ativo.vencimento, hoje);
    const emBreve = dias >= 0 && dias <= RF_VENCE_EM_BREVE_DIAS;
    let texto: string;
    if (emBreve)
      texto = dias === 0 ? 'Vence hoje' : `Vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
    else if (dias < 0) texto = `Venceu ${formatDateUtc(ativo.vencimento)}`;
    else texto = `Vence ${formatDateUtc(ativo.vencimento)}`;
    return <span className={emBreve ? PILL_WARN : PILL_SOFT}>{texto}</span>;
  };

  const columns: ResponsiveColumn<RendaFixaAtivo>[] = [
    {
      id: 'nome',
      header: 'Nome',
      mobile: 'primary',
      cell: (a) => rfDisplayName(a),
      mobileCell: (a) => <span className="block truncate">{rfDisplayName(a)}</span>,
    },
    {
      id: 'meta',
      header: 'Benchmark',
      mobile: 'subtitle',
      cell: (a) => a.benchmark,
      mobileCell: (a) => (
        <span className="mt-1 flex flex-wrap items-center gap-1">
          <span className="mr-0.5">{a.benchmark}</span>
          {vencimentoPill(a)}
          {a.isAutoUpdated && <span className={PILL_SOFT}>PU oficial</span>}
          {a.ir?.isento && <span className={PILL_SOFT}>Isento</span>}
        </span>
      ),
    },
    {
      id: 'valor',
      header: 'Valor Atualizado',
      mobile: 'value',
      cell: (a) => formatCurrency(a.valorAtualizado),
      mobileCell: (a) => (
        <>
          <span className="block">{formatCurrency(a.valorAtualizado)}</span>
          <span
            className={`block text-xs font-medium ${
              a.rentabilidade < 0 ? TABLE_MOBILE_STYLES.negative : TABLE_MOBILE_STYLES.positive
            }`}
          >
            {formatPercentage(a.rentabilidade)}
          </span>
        </>
      ),
    },
  ];

  const editRow = (
    ativo: RendaFixaAtivo,
    campo: RendaFixaCampo,
    valor: React.ReactNode,
    vazio = false,
  ) => (
    <div className="flex items-center justify-between gap-3 border-t border-gray-100 py-1.5 dark:border-gray-800">
      <div className="min-w-0">
        <div className={TABLE_MOBILE_STYLES.cardDetailLabel}>{EDIT_META[campo].label}</div>
        <div
          className={`text-sm break-words ${
            vazio
              ? 'text-gray-500 dark:text-gray-400'
              : 'font-medium text-gray-800 dark:text-gray-100'
          }`}
        >
          {valor}
        </div>
      </div>
      <button
        type="button"
        data-mf-edit={campo}
        className={TABLE_MOBILE_STYLES.editButton}
        aria-label={`Editar ${EDIT_META[campo].label.toLowerCase()} de ${rfDisplayName(ativo)}`}
        onClick={() => openEdit(ativo, campo)}
      >
        Editar
      </button>
    </div>
  );

  const renderBody = (a: RendaFixaAtivo) => {
    const dias = diasAteVencimento(a.vencimento, hoje);
    return (
      <div className="space-y-3">
        <dl className={TABLE_MOBILE_STYLES.cardDetailGrid}>
          <DetailItem label="Aplicado">{formatCurrency(a.valorInicialAplicado)}</DetailItem>
          <DetailItem label="Aportes">{formatCurrency(a.aporte)}</DetailItem>
          <DetailItem label="Resgates">{formatCurrency(a.resgate)}</DetailItem>
          <DetailItem label="Vencimento">
            {a.semVencimento ? (
              '—'
            ) : (
              <>
                {formatDateUtc(a.vencimento)}
                <span className="block text-xs font-normal text-gray-500 dark:text-gray-400">
                  {formatPrazoVencimento(dias)}
                </span>
              </>
            )}
          </DetailItem>
          <DetailItem label="% da aba">{formatPercentageSimple(a.percentualCarteira)}</DetailItem>
          <DetailItem label="Risco cart.">{formatPercentageSimple(a.riscoPorAtivo)}</DetailItem>
        </dl>
        {a.ir && (
          <p
            className="rounded-xl bg-gray-50 px-3 py-2 text-[13px] text-gray-700 dark:bg-white/[0.04] dark:text-gray-300"
            data-mf-rf-ir=""
          >
            {a.ir.isento ? (
              <>
                IR se resgatar hoje: <b className="font-semibold">isento</b>
                {a.ir.motivoIsencao ? ` (${a.ir.motivoIsencao})` : ''}
              </>
            ) : (
              <>
                IR se resgatar hoje:{' '}
                <b className="font-semibold tabular-nums">{formatCurrency(a.ir.ir + a.ir.iof)}</b> ·
                líquido{' '}
                <b className="font-semibold tabular-nums">{formatCurrency(a.ir.valorLiquido)}</b>
              </>
            )}
          </p>
        )}
        <div>
          {editRow(a, 'cotizacaoResgate', a.cotizacaoResgate)}
          {editRow(a, 'liquidacaoResgate', a.liquidacaoResgate)}
          {editRow(a, 'benchmark', a.benchmark)}
          {a.isAutoUpdated ? (
            <div
              className="flex items-center justify-between gap-3 border-t border-gray-100 py-1.5 dark:border-gray-800"
              data-mf-locked="valorAtualizado"
            >
              <div className="min-w-0">
                <div className={TABLE_MOBILE_STYLES.cardDetailLabel}>Valor atualizado</div>
                <div className="text-sm font-medium tabular-nums text-gray-800 dark:text-gray-100">
                  {formatCurrency(a.valorAtualizado)}
                </div>
              </div>
              <span className="inline-flex min-h-11 items-center gap-1 text-right text-xs text-gray-500 dark:text-gray-400">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                  className="shrink-0"
                >
                  <rect x="4" y="11" width="16" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
                Pelo PU oficial do Tesouro
              </span>
            </div>
          ) : (
            editRow(
              a,
              'valorAtualizado',
              <span className="tabular-nums">{formatCurrency(a.valorAtualizado)}</span>,
            )
          )}
          {editRow(a, 'observacoes', a.observacoes || 'Nenhuma', !a.observacoes)}
        </div>
      </div>
    );
  };

  const renderFooter = (a: RendaFixaAtivo) => (
    <Link href={`/ativos/${a.id}`} className={TABLE_MOBILE_STYLES.editButton}>
      Ver detalhes do ativo
    </Link>
  );

  const meta = editing ? EDIT_META[editing.campo] : null;
  let initialValue: MobileEditValue = null;
  if (editing) {
    if (editing.campo === 'valorAtualizado') initialValue = editing.ativo.valorAtualizado;
    else if (editing.campo === 'observacoes') initialValue = editing.ativo.observacoes ?? '';
    else initialValue = editing.ativo[editing.campo];
  }

  return (
    <div className="space-y-3" data-mf-rf-mobile="">
      {vencendo.length > 0 && (
        <div
          role="note"
          className="flex items-start gap-2 rounded-2xl bg-[#D97706]/[0.10] px-4 py-3 text-sm text-[#B45309] dark:bg-[#FBBF24]/[0.12] dark:text-amber-300"
        >
          <span aria-hidden="true">⚠</span>
          <span>
            <b className="font-semibold">
              {vencendo.length === 1
                ? `1 título vence em até ${RF_VENCE_EM_BREVE_DIAS} dias`
                : `${vencendo.length} títulos vencem em até ${RF_VENCE_EM_BREVE_DIAS} dias`}
            </b>
            {vencendo.length === 1 ? ` (${rfDisplayName(vencendo[0])}).` : '.'}
          </span>
        </div>
      )}

      {visiveis.length === 0 && (
        <p className={`${TABLE_MOBILE_STYLES.card} text-sm text-gray-500 dark:text-gray-400`}>
          Nenhum título de renda fixa na carteira.
        </p>
      )}

      {visiveis.map((secao) => {
        const bodyId = `rf-secao-${secao.tipo}`;
        const expanded = expandedSections.has(secao.tipo);
        return (
          <section key={secao.tipo} className="space-y-2" aria-label={secao.nome}>
            <CardSectionBand
              id={bodyId}
              label={secao.nome}
              count={secao.ativos.length}
              subtotal={formatCurrency(secao.totalValorAtualizado)}
              expanded={expanded}
              onToggle={() => onToggleSection(secao.tipo)}
            />
            {expanded && (
              <div id={bodyId}>
                <ResponsiveCardList<RendaFixaAtivo>
                  columns={columns}
                  rows={secao.ativos}
                  getRowKey={(a) => a.id}
                  ariaLabel={`Títulos ${secao.nome}`}
                  expandable
                  renderCardBody={renderBody}
                  renderCardFooter={renderFooter}
                />
              </div>
            )}
          </section>
        );
      })}

      <section aria-label="Total geral de Renda Fixa" className={TABLE_MOBILE_STYLES.totalCard}>
        <div className={TABLE_MOBILE_STYLES.cardHeader}>
          <span className="font-semibold">Total geral</span>
          <span className="font-semibold tabular-nums">
            {formatCurrency(totalGeral.valorAtualizado)}
          </span>
        </div>
        <dl className={`${TABLE_MOBILE_STYLES.cardDetailGrid} mt-2`}>
          <DetailItem label="Aplicado">{formatCurrency(totalGeral.valorAplicado)}</DetailItem>
          <DetailItem label="Aportes">{formatCurrency(totalGeral.aporte)}</DetailItem>
          <DetailItem label="Resgates">{formatCurrency(totalGeral.resgate)}</DetailItem>
          <DetailItem label="Rentabilidade">
            {formatPercentage(totalGeral.rentabilidade)}
          </DetailItem>
        </dl>
      </section>

      <MobileEditSheet
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        title={meta?.title ?? 'Editar'}
        subject={editing ? rfDisplayName(editing.ativo) : undefined}
        label={meta?.label ?? ''}
        kind={meta?.kind ?? 'text'}
        initialValue={initialValue}
        min={editing?.campo === 'valorAtualizado' ? 0 : undefined}
        minExclusive={editing?.campo === 'valorAtualizado'}
        allowEmpty={editing?.campo === 'observacoes'}
        hint={meta?.hint}
        savedMessage={() => (meta ? `${meta.label}: salvo` : 'Salvo')}
        onSubmit={async (v) => {
          if (!editing) return false;
          const valor = typeof v === 'number' ? v : String(v ?? '');
          return onUpdateCampo(editing.ativo.id, editing.campo, valor);
        }}
      />
    </div>
  );
}

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
  const isBelowLg = useIsBelowLg();
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
        {/* Celular (< md): Necessidade e Caixa em largura inteira, como nas outras abas (a 320px
            o valor e o título não cabem em meia coluna). A partir de md o wrapper some. */}
        <div className="min-w-0 max-md:col-span-2 md:contents">
          <MetricCard
            title="Necessidade de Aporte"
            value={formatCurrency(necessidadeAporteCalculada)}
            color="warning"
          />
        </div>
        <div className="min-w-0 max-md:col-span-2 md:contents">
          <CaixaParaInvestirCard
            value={data?.resumo?.caixaParaInvestir ?? 0}
            formatCurrency={formatCurrency}
            onSave={updateCaixaParaInvestir}
            color="success"
          />
        </div>
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

      {isBelowLg ? (
        <RendaFixaMobileList
          secoes={normalizedSections}
          expandedSections={expandedSections}
          onToggleSection={toggleSection}
          totalGeral={{
            valorAplicado: dataComRisco?.totalGeral?.valorAplicado || 0,
            aporte: dataComRisco?.totalGeral?.aporte || 0,
            resgate: dataComRisco?.totalGeral?.resgate || 0,
            valorAtualizado: dataComRisco?.totalGeral?.valorAtualizado || 0,
            rentabilidade: dataComRisco?.totalGeral?.rentabilidade || 0,
          }}
          formatCurrency={formatCurrency}
          formatPercentage={formatPercentage}
          onUpdateCampo={updateRendaFixaCampo}
        />
      ) : (
        /* Main table */
        <ComponentCard title="Renda Fixa">
          <div className={TABLE_STYLES.wrapper}>
            <table className={TABLE_STYLES.table}>
              <thead>
                <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
                  <th className={`${TABLE_STYLES.compact.th} text-left`}>Nome dos Ativos</th>
                  <th className={`${TABLE_STYLES.compact.th} text-center`}>Cotizacao de resgate</th>
                  <th className={`${TABLE_STYLES.compact.th} text-center`}>
                    Liquidacao de resgate
                  </th>
                  <th className={`${TABLE_STYLES.compact.th} text-center`}>Vencimento</th>
                  <th className={`${TABLE_STYLES.compact.th} text-center`}>Benchmark</th>
                  <th className={`${TABLE_STYLES.compact.th} text-right`}>
                    Valor inicial aplicado
                  </th>
                  <th className={`${TABLE_STYLES.compact.th} text-right`}>Aporte</th>
                  <th className={`${TABLE_STYLES.compact.th} text-right`}>Resgate</th>
                  <th className={`${TABLE_STYLES.compact.th} text-right`}>Valor Atualizado</th>
                  <th className={`${TABLE_STYLES.compact.th} text-right`}>% da Aba</th>
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
      )}
    </div>
  );
}
