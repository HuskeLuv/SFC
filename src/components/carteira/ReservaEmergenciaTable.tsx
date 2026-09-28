'use client';
import React, { useMemo } from 'react';
import { formatPct } from '@/utils/format';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '../ui/table';
import ComponentCard from '../common/ComponentCard';
import { UiTablePlaceholderRows, metricColorBySign } from '@/components/carteira/shared';
import AssetNameLink from '@/components/carteira/AssetNameLink';
import Link from 'next/link';
import { ResponsiveCardList, type ResponsiveColumn } from '@/components/ui/table/ResponsiveTable';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import {
  TABLE_STYLES,
  TABLE_HEADER_STYLE,
  TABLE_MOBILE_STYLES,
} from '@/components/ui/table/tableStyles';

const MIN_PLACEHOLDER_ROWS = 4;
const RESERVA_EMERGENCIA_COLUMN_COUNT = 12;

interface ReservaEmergenciaAtivo {
  id: string;
  nome: string;
  cotizacaoResgate: string;
  liquidacaoResgate: string;
  vencimento: Date;
  benchmark: string;
  valorInicial: number;
  aporte: number;
  resgate: number;
  valorAtualizado: number;
  percentualCarteira: number;
  riscoAtivo: number;
  rentabilidade: number;
}

interface ReservaEmergenciaTableProps {
  ativos: ReservaEmergenciaAtivo[];
  saldoInicioMes: number;
  rendimento: number;
  rentabilidade: number;
  totalCarteira?: number;
}

interface ReservaEmergenciaMetricCardProps {
  title: string;
  value: string;
  color?: 'primary' | 'success' | 'warning' | 'error';
}

const ReservaEmergenciaMetricCard: React.FC<ReservaEmergenciaMetricCardProps> = ({
  title,
  value,
  color = 'primary',
}) => {
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

interface ReservaEmergenciaTableRowProps {
  ativo: ReservaEmergenciaAtivo;
  formatCurrency: (value: number) => string;
  formatPercentage: (value: number) => string;
  formatDate: (date: Date) => string;
}

const ReservaEmergenciaTableRow: React.FC<ReservaEmergenciaTableRowProps> = ({
  ativo,
  formatCurrency,
  formatPercentage,
  formatDate,
}) => {
  return (
    <TableRow className={`${TABLE_STYLES.row} ${TABLE_STYLES.rowHover}`}>
      <TableCell className={TABLE_STYLES.compact.td}>
        <AssetNameLink portfolioId={ativo.id} ticker={ativo.nome} nomeComoPrincipal />
      </TableCell>
      <TableCell className={`${TABLE_STYLES.compact.td} text-center`}>
        {ativo.cotizacaoResgate}
      </TableCell>
      <TableCell className={`${TABLE_STYLES.compact.td} text-center`}>
        {ativo.liquidacaoResgate}
      </TableCell>
      <TableCell className={`${TABLE_STYLES.compact.td} text-center`}>
        {formatDate(ativo.vencimento)}
      </TableCell>
      <TableCell className={`${TABLE_STYLES.compact.td} text-center`}>{ativo.benchmark}</TableCell>
      <TableCell className={`${TABLE_STYLES.compact.td} text-right font-mono`}>
        {formatCurrency(ativo.valorInicial)}
      </TableCell>
      <TableCell className={`${TABLE_STYLES.compact.td} text-right font-mono`}>
        {formatCurrency(ativo.aporte)}
      </TableCell>
      <TableCell className={`${TABLE_STYLES.compact.td} text-right font-mono`}>
        {formatCurrency(ativo.resgate)}
      </TableCell>
      <TableCell className={`${TABLE_STYLES.compact.td} text-right font-mono`}>
        {formatCurrency(ativo.valorAtualizado)}
      </TableCell>
      <TableCell className={`${TABLE_STYLES.compact.td} text-center`}>
        {formatPercentage(ativo.percentualCarteira)}
      </TableCell>
      <TableCell className={`${TABLE_STYLES.compact.td} text-center`}>
        {formatPercentage(ativo.riscoAtivo)}
      </TableCell>
      <TableCell className={`${TABLE_STYLES.compact.td} text-center font-medium`}>
        {formatPercentage(ativo.rentabilidade)}
      </TableCell>
    </TableRow>
  );
};

// ---------------------------------------------------------------------------
// Celular (PWA fase 1): cartões expansíveis, sem edição
// ---------------------------------------------------------------------------

type ReservaEmergenciaMobileAtivo = ReservaEmergenciaAtivo;

function ReservaEmergenciaDetail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className={TABLE_MOBILE_STYLES.cardDetailLabel}>{label}</dt>
      <dd className={`${TABLE_MOBILE_STYLES.cardDetailValue} break-words`}>{children}</dd>
    </div>
  );
}

function ReservaEmergenciaMobileList({
  ativos,
  total,
  formatCurrency,
  formatPercentage,
}: {
  ativos: ReservaEmergenciaMobileAtivo[];
  total: {
    valorInicial: number;
    aporte: number;
    resgate: number;
    valorAtualizado: number;
    rentabilidade: number;
  };
  formatCurrency: (value: number) => string;
  formatPercentage: (value: number) => string;
}) {
  const formatDate = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  const columns: ResponsiveColumn<ReservaEmergenciaMobileAtivo>[] = [
    {
      id: 'nome',
      header: 'Nome dos Ativos',
      mobile: 'primary',
      cell: (a) => a.nome,
      mobileCell: (a) => <span className="block truncate">{a.nome}</span>,
    },
    { id: 'benchmark', header: 'Benchmark', mobile: 'subtitle', cell: (a) => a.benchmark },
    {
      id: 'valor',
      header: 'Valor Atual',
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

  return (
    <div className="space-y-3" data-mf-reserva-mobile="">
      <ResponsiveCardList<ReservaEmergenciaMobileAtivo>
        columns={columns}
        rows={ativos}
        getRowKey={(a) => a.id}
        ariaLabel="Reserva de Emergência"
        expandable
        emptyState="Nenhum ativo nesta reserva."
        renderCardBody={(a) => (
          <div className="space-y-3">
            <dl className={TABLE_MOBILE_STYLES.cardDetailGrid}>
              <ReservaEmergenciaDetail label="Cot. resgate">
                {a.cotizacaoResgate}
              </ReservaEmergenciaDetail>
              <ReservaEmergenciaDetail label="Liq. resgate">
                {a.liquidacaoResgate}
              </ReservaEmergenciaDetail>
              <ReservaEmergenciaDetail label="Vencimento">
                {formatDate(a.vencimento)}
              </ReservaEmergenciaDetail>
              <ReservaEmergenciaDetail label="Valor inicial">
                {formatCurrency(a.valorInicial)}
              </ReservaEmergenciaDetail>
              <ReservaEmergenciaDetail label="Aportes">
                {formatCurrency(a.aporte)}
              </ReservaEmergenciaDetail>
              <ReservaEmergenciaDetail label="Resgates">
                {formatCurrency(a.resgate)}
              </ReservaEmergenciaDetail>
              <ReservaEmergenciaDetail label="% da aba">
                {formatPercentage(a.percentualCarteira)}
              </ReservaEmergenciaDetail>
              <ReservaEmergenciaDetail label="Risco cart.">
                {formatPercentage(a.riscoAtivo)}
              </ReservaEmergenciaDetail>
            </dl>
          </div>
        )}
        renderCardFooter={(a) => (
          <Link href={`/ativos/${a.id}`} className={TABLE_MOBILE_STYLES.editButton}>
            Ver detalhes do ativo
          </Link>
        )}
      />
      <section
        aria-label="Total geral de Reserva de Emergência"
        className={TABLE_MOBILE_STYLES.totalCard}
      >
        <div className={TABLE_MOBILE_STYLES.cardHeader}>
          <span className="font-semibold">Total geral</span>
          <span className="font-semibold tabular-nums">
            {formatCurrency(total.valorAtualizado)}
          </span>
        </div>
        <dl className={`${TABLE_MOBILE_STYLES.cardDetailGrid} mt-2`}>
          <ReservaEmergenciaDetail label="Valor inicial">
            {formatCurrency(total.valorInicial)}
          </ReservaEmergenciaDetail>
          <ReservaEmergenciaDetail label="Aportes">
            {formatCurrency(total.aporte)}
          </ReservaEmergenciaDetail>
          <ReservaEmergenciaDetail label="Resgates">
            {formatCurrency(total.resgate)}
          </ReservaEmergenciaDetail>
          <ReservaEmergenciaDetail label="Rentabilidade">
            {formatPercentage(total.rentabilidade)}
          </ReservaEmergenciaDetail>
        </dl>
      </section>
    </div>
  );
}

export default function ReservaEmergenciaTable({
  ativos,
  saldoInicioMes,
  rendimento,
  rentabilidade,
  totalCarteira = 0,
}: ReservaEmergenciaTableProps) {
  const isBelowLg = useIsBelowLg();
  // Calcular risco (carteira total) e percentual da carteira da aba
  const ativosComRisco = useMemo(() => {
    const totalTabValue = ativos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
    const shouldCalculateRisco = totalCarteira > 0;

    return ativos.map((ativo) => ({
      ...ativo,
      riscoAtivo: shouldCalculateRisco
        ? Math.min(100, (ativo.valorAtualizado / totalCarteira) * 100)
        : 0,
      percentualCarteira: totalTabValue > 0 ? (ativo.valorAtualizado / totalTabValue) * 100 : 0,
    }));
  }, [ativos, totalCarteira]);

  const totais = useMemo(() => {
    const totalValorInicial = ativosComRisco.reduce((sum, ativo) => sum + ativo.valorInicial, 0);
    const totalAporte = ativosComRisco.reduce((sum, ativo) => sum + ativo.aporte, 0);
    const totalResgate = ativosComRisco.reduce((sum, ativo) => sum + ativo.resgate, 0);
    const totalValorAtualizado = ativosComRisco.reduce(
      (sum, ativo) => sum + ativo.valorAtualizado,
      0,
    );
    const totalRisco = ativosComRisco.reduce((sum, ativo) => sum + ativo.riscoAtivo, 0);

    return {
      valorInicial: totalValorInicial,
      aporte: totalAporte,
      resgate: totalResgate,
      valorAtualizado: totalValorAtualizado,
      risco: totalRisco,
    };
  }, [ativosComRisco]);

  const formatCurrency = (value: number): string => {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  const formatPercentage = (value: number): string => {
    return `${value.toFixed(2)}%`;
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  };

  const sortedAtivos = ativosComRisco;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <ReservaEmergenciaMetricCard
          title="Saldo Início do Mês"
          value={formatCurrency(saldoInicioMes)}
        />
        <ReservaEmergenciaMetricCard
          title="Rendimento"
          value={formatCurrency(rendimento)}
          color={metricColorBySign(rendimento)}
        />
        <ReservaEmergenciaMetricCard
          title="Rentabilidade"
          value={formatPercentage(rentabilidade)}
          color={metricColorBySign(rentabilidade)}
        />
      </div>

      {isBelowLg ? (
        <ReservaEmergenciaMobileList
          ativos={sortedAtivos}
          total={{ ...totais, rentabilidade }}
          formatCurrency={formatCurrency}
          formatPercentage={formatPercentage}
        />
      ) : (
        <ComponentCard title="Reserva de Emergência - Detalhamento">
          <div className={TABLE_STYLES.wrapper}>
            <Table className={TABLE_STYLES.table}>
              <TableHeader>
                <TableRow className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
                  <TableCell isHeader className={`${TABLE_STYLES.compact.th} text-left`}>
                    Nome dos Ativos
                  </TableCell>
                  <TableCell isHeader className={`${TABLE_STYLES.compact.th} text-center`}>
                    Cot. Resgate
                  </TableCell>
                  <TableCell isHeader className={`${TABLE_STYLES.compact.th} text-center`}>
                    Liq. Resgate
                  </TableCell>
                  <TableCell isHeader className={`${TABLE_STYLES.compact.th} text-center`}>
                    Vencimento
                  </TableCell>
                  <TableCell isHeader className={`${TABLE_STYLES.compact.th} text-center`}>
                    Benchmark
                  </TableCell>
                  <TableCell isHeader className={`${TABLE_STYLES.compact.th} text-right`}>
                    Valor Inicial
                  </TableCell>
                  <TableCell isHeader className={`${TABLE_STYLES.compact.th} text-right`}>
                    Aporte
                  </TableCell>
                  <TableCell isHeader className={`${TABLE_STYLES.compact.th} text-right`}>
                    Resgate
                  </TableCell>
                  <TableCell isHeader className={`${TABLE_STYLES.compact.th} text-right`}>
                    Valor Atual
                  </TableCell>
                  <TableCell isHeader className={`${TABLE_STYLES.compact.th} text-center`}>
                    % da Aba
                  </TableCell>
                  <TableCell isHeader className={`${TABLE_STYLES.compact.th} text-center`}>
                    <span className="block">Risco Por Ativo</span>
                    <span className="block">(Carteira Total)</span>
                  </TableCell>
                  <TableCell isHeader className={`${TABLE_STYLES.compact.th} text-center`}>
                    Rentab.
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className={TABLE_STYLES.totalRow}>
                  <TableCell className={TABLE_STYLES.compact.td}>TOTAL GERAL</TableCell>
                  <TableCell className={TABLE_STYLES.compact.td}></TableCell>
                  <TableCell className={TABLE_STYLES.compact.td}></TableCell>
                  <TableCell className={TABLE_STYLES.compact.td}></TableCell>
                  <TableCell className={TABLE_STYLES.compact.td}></TableCell>
                  <TableCell className={`${TABLE_STYLES.compact.td} text-right font-mono`}>
                    {formatCurrency(totais.valorInicial)}
                  </TableCell>
                  <TableCell className={`${TABLE_STYLES.compact.td} text-right font-mono`}>
                    {formatCurrency(totais.aporte)}
                  </TableCell>
                  <TableCell className={`${TABLE_STYLES.compact.td} text-right font-mono`}>
                    {formatCurrency(totais.resgate)}
                  </TableCell>
                  <TableCell className={`${TABLE_STYLES.compact.td} text-right font-mono`}>
                    {formatCurrency(totais.valorAtualizado)}
                  </TableCell>
                  <TableCell className={`${TABLE_STYLES.compact.td} text-center`}>
                    {sortedAtivos.length > 0 ? formatPct(100) : '—'}
                  </TableCell>
                  <TableCell className={`${TABLE_STYLES.compact.td} text-center`}>
                    {formatPercentage(totais.risco)}
                  </TableCell>
                  <TableCell className={`${TABLE_STYLES.compact.td} text-center`}>
                    {formatPercentage(rentabilidade)}
                  </TableCell>
                </TableRow>

                {sortedAtivos.map((ativo) => (
                  <ReservaEmergenciaTableRow
                    key={ativo.id}
                    ativo={ativo}
                    formatCurrency={formatCurrency}
                    formatPercentage={formatPercentage}
                    formatDate={formatDate}
                  />
                ))}
                <UiTablePlaceholderRows
                  count={Math.max(0, MIN_PLACEHOLDER_ROWS - sortedAtivos.length)}
                  colSpan={RESERVA_EMERGENCIA_COLUMN_COUNT}
                />
              </TableBody>
            </Table>
          </div>
        </ComponentCard>
      )}
    </div>
  );
}
