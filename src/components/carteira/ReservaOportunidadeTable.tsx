'use client';
import React, { useMemo } from 'react';
import { useReservaOportunidade } from '@/hooks/useReservaOportunidade';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ComponentCard from '@/components/common/ComponentCard';
import {
  StandardTable,
  StandardTableHeader,
  StandardTableHeaderRow,
  StandardTableHeaderCell,
  StandardTableBodyCell,
  StandardTableRow,
} from '@/components/ui/table/StandardTable';
import { TableBody } from '@/components/ui/table';
import { TABLE_STYLES, TABLE_HIGHLIGHT_HEADER_STYLE } from '@/components/ui/table/tableStyles';
import { StandardTablePlaceholderRows, metricColorBySign } from '@/components/carteira/shared';
import AssetNameLink from '@/components/carteira/AssetNameLink';

const MIN_PLACEHOLDER_ROWS = 4;
const RESERVA_OPORTUNIDADE_COLUMN_COUNT = 13;

interface ReservaOportunidadeMetricCardProps {
  title: string;
  value: string;
  color?: 'primary' | 'success' | 'warning' | 'error';
}

const ReservaOportunidadeMetricCard: React.FC<ReservaOportunidadeMetricCardProps> = ({
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

interface ReservaOportunidadeTableRowProps {
  ativo: {
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
    observacoes?: string;
  };
  formatCurrency: (value: number) => string;
  formatPercentage: (value: number) => string;
}

const ReservaOportunidadeTableRow: React.FC<ReservaOportunidadeTableRowProps> = ({
  ativo,
  formatCurrency,
  formatPercentage,
}) => {
  return (
    <StandardTableRow>
      <StandardTableBodyCell align="left">
        <AssetNameLink portfolioId={ativo.id} ticker={ativo.nome} nomeComoPrincipal />
      </StandardTableBodyCell>
      <StandardTableBodyCell align="center">{ativo.cotizacaoResgate}</StandardTableBodyCell>
      <StandardTableBodyCell align="center">{ativo.liquidacaoResgate}</StandardTableBodyCell>
      <StandardTableBodyCell align="center">
        {ativo.vencimento.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="center">{ativo.benchmark}</StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        {formatCurrency(ativo.valorInicial)}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">{formatCurrency(ativo.aporte)}</StandardTableBodyCell>
      <StandardTableBodyCell align="right">{formatCurrency(ativo.resgate)}</StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        {formatCurrency(ativo.valorAtualizado)}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right" className={TABLE_STYLES.highlightTd}>
        {formatPercentage(ativo.percentualCarteira)}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        {formatPercentage(ativo.riscoAtivo)}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="right">
        {formatPercentage(ativo.rentabilidade)}
      </StandardTableBodyCell>
      <StandardTableBodyCell align="center">{ativo.observacoes || '-'}</StandardTableBodyCell>
    </StandardTableRow>
  );
};

interface ReservaOportunidadeTableProps {
  totalCarteira?: number;
}

export default function ReservaOportunidadeTable({
  totalCarteira = 0,
}: ReservaOportunidadeTableProps) {
  const { data, loading, error } = useReservaOportunidade();

  // Calcular risco (carteira total) e percentual da carteira da aba
  const ativosComRisco = useMemo(() => {
    const ativos = data?.ativos ?? [];
    const totalTabValue = ativos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
    const shouldCalculateRisco = totalCarteira > 0;

    return ativos.map((ativo) => ({
      ...ativo,
      riscoAtivo: shouldCalculateRisco
        ? Math.min(100, (ativo.valorAtualizado / totalCarteira) * 100)
        : 0,
      percentualCarteira: totalTabValue > 0 ? (ativo.valorAtualizado / totalTabValue) * 100 : 0,
    }));
  }, [data?.ativos, totalCarteira]);

  const formatCurrency = (value: number): string => {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  const formatPercentage = (value: number): string => {
    return `${value.toFixed(2)}%`;
  };

  if (loading) {
    return <LoadingSpinner text="Carregando dados de reserva de oportunidade..." />;
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

  const totais = ativosComRisco.reduce(
    (acc, ativo) => ({
      valorInicial: acc.valorInicial + ativo.valorInicial,
      aporte: acc.aporte + ativo.aporte,
      resgate: acc.resgate + ativo.resgate,
      valorAtualizado: acc.valorAtualizado + ativo.valorAtualizado,
    }),
    { valorInicial: 0, aporte: 0, resgate: 0, valorAtualizado: 0 },
  );

  // 2.16 (auditoria jul/2026): a linha TOTAL exibia (atual − inicial)/inicial,
  // ignorando os aportes/resgates que a própria tabela mostra (aporte contava
  // como lucro). Exibe a MESMA fonte do card "Rentabilidade" acima:
  // data.rentabilidade do backend, que desconta fluxos
  // (atual − (inicial + aportes − resgates)) / (inicial + aportes).
  const rentabilidadeTotal = data?.rentabilidade ?? 0;

  return (
    <div className="space-y-4">
      {/* Cards de resumo */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-3">
        <ReservaOportunidadeMetricCard
          title="Saldo Início do Mês"
          value={formatCurrency(data?.saldoInicioMes ?? 0)}
        />
        <ReservaOportunidadeMetricCard
          title="Rendimento"
          value={formatCurrency(data?.rendimento ?? 0)}
          color={metricColorBySign(data?.rendimento ?? 0)}
        />
        <ReservaOportunidadeMetricCard
          title="Rentabilidade"
          value={formatPercentage(data?.rentabilidade ?? 0)}
          color={metricColorBySign(data?.rentabilidade ?? 0)}
        />
      </div>

      {/* Tabela principal */}
      <ComponentCard title="Reserva de Oportunidade - Detalhamento">
        <StandardTable>
          <StandardTableHeader sticky>
            <StandardTableHeaderRow>
              <StandardTableHeaderCell align="left">Nome dos Ativos</StandardTableHeaderCell>
              <StandardTableHeaderCell align="center">Cot. Resgate</StandardTableHeaderCell>
              <StandardTableHeaderCell align="center">Liq. Resgate</StandardTableHeaderCell>
              <StandardTableHeaderCell align="center">Vencimento</StandardTableHeaderCell>
              <StandardTableHeaderCell align="center">Benchmark</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right">Valor Inicial</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right">Aporte</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right">Resgate</StandardTableHeaderCell>
              <StandardTableHeaderCell align="right">Valor Atual</StandardTableHeaderCell>
              <StandardTableHeaderCell
                align="right"
                headerBgColor={TABLE_HIGHLIGHT_HEADER_STYLE.backgroundColor}
              >
                % da Aba
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="right">
                <span className="block">Risco Por Ativo</span>
                <span className="block">(Carteira Total)</span>
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="right">Rentab.</StandardTableHeaderCell>
              <StandardTableHeaderCell align="center">Observações</StandardTableHeaderCell>
            </StandardTableHeaderRow>
          </StandardTableHeader>
          <TableBody>
            {/* Linha de totalização */}
            <StandardTableRow isTotal>
              <StandardTableBodyCell align="left" isTotal>
                TOTAL GERAL
              </StandardTableBodyCell>
              <StandardTableBodyCell align="center" isTotal>
                -
              </StandardTableBodyCell>
              <StandardTableBodyCell align="center" isTotal>
                -
              </StandardTableBodyCell>
              <StandardTableBodyCell align="center" isTotal>
                -
              </StandardTableBodyCell>
              <StandardTableBodyCell align="center" isTotal>
                -
              </StandardTableBodyCell>
              <StandardTableBodyCell align="right" isTotal>
                {formatCurrency(totais.valorInicial)}
              </StandardTableBodyCell>
              <StandardTableBodyCell align="right" isTotal>
                {formatCurrency(totais.aporte)}
              </StandardTableBodyCell>
              <StandardTableBodyCell align="right" isTotal>
                {formatCurrency(totais.resgate)}
              </StandardTableBodyCell>
              <StandardTableBodyCell align="right" isTotal>
                {formatCurrency(totais.valorAtualizado)}
              </StandardTableBodyCell>
              <StandardTableBodyCell align="right" isTotal>
                100.00%
              </StandardTableBodyCell>
              <StandardTableBodyCell align="center" isTotal>
                -
              </StandardTableBodyCell>
              <StandardTableBodyCell align="right" isTotal>
                {formatPercentage(rentabilidadeTotal)}
              </StandardTableBodyCell>
              <StandardTableBodyCell align="center" isTotal>
                -
              </StandardTableBodyCell>
            </StandardTableRow>

            {ativosComRisco.map((ativo) => (
              <ReservaOportunidadeTableRow
                key={ativo.id}
                ativo={ativo}
                formatCurrency={formatCurrency}
                formatPercentage={formatPercentage}
              />
            ))}
            <StandardTablePlaceholderRows
              count={Math.max(0, MIN_PLACEHOLDER_ROWS - ativosComRisco.length)}
              colSpan={RESERVA_OPORTUNIDADE_COLUMN_COUNT}
            />
          </TableBody>
        </StandardTable>
      </ComponentCard>
    </div>
  );
}
