'use client';

import { logger } from '@/lib/logger';
import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useImoveisBens } from '@/hooks/useImoveisBens';
import { ImovelBemAtivo } from '@/types/imoveis-bens';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ComponentCard from '@/components/common/ComponentCard';
import { BasicTablePlaceholderRows, metricColorBySign } from '@/components/carteira/shared';
import AssetNameLink from '@/components/carteira/AssetNameLink';
import {
  TABLE_STYLES,
  TABLE_HEADER_STYLE,
  TABLE_MOBILE_STYLES,
} from '@/components/ui/table/tableStyles';
import { ResponsiveCardList, type ResponsiveColumn } from '@/components/ui/table/ResponsiveTable';
import { MobileEditSheet } from '@/components/ui/sheet/MobileEditSheet';
import { useIsBelowLg } from '@/hooks/useMediaQuery';

const MIN_PLACEHOLDER_ROWS = 4;
const IMOVEIS_BENS_COLUMN_COUNT = 11;

interface ImoveisBensMetricCardProps {
  title: string;
  value: string;
  color?: 'primary' | 'success' | 'warning' | 'error';
}

const ImoveisBensMetricCard: React.FC<ImoveisBensMetricCardProps> = ({
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

interface ImoveisBensTableRowProps {
  ativo: ImovelBemAtivo;
  formatCurrency: (value: number, currency?: 'BRL' | 'USD') => string;
  formatPercentage: (value: number) => string;
  formatNumber: (value: number) => string;
  onUpdateValorAtualizado: (ativoId: string, novoValor: number) => void;
}

const ImoveisBensTableRow: React.FC<ImoveisBensTableRowProps> = ({
  ativo,
  formatCurrency,
  formatPercentage,
  formatNumber,
  onUpdateValorAtualizado,
}) => {
  const [isEditingValor, setIsEditingValor] = useState(false);
  const [valorValue, setValorValue] = useState(ativo.valorAtualizado.toString());

  // Atualizar valorValue quando ativo.valorAtualizado mudar
  React.useEffect(() => {
    if (!isEditingValor) {
      setValorValue(ativo.valorAtualizado.toString());
    }
  }, [ativo.valorAtualizado, isEditingValor]);

  const handleValorSubmit = async () => {
    const novoValor = parseFloat(valorValue);
    if (!isNaN(novoValor) && novoValor > 0) {
      try {
        await onUpdateValorAtualizado(ativo.id, novoValor);
        setIsEditingValor(false);
      } catch (error) {
        logger.error('Erro ao atualizar valor:', error);
        setValorValue(ativo.valorAtualizado.toString()); // Reverter se houver erro
        setIsEditingValor(false);
      }
    } else {
      setValorValue(ativo.valorAtualizado.toString()); // Reverter se inválido
      setIsEditingValor(false);
    }
  };

  const handleValorKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleValorSubmit();
    } else if (e.key === 'Escape') {
      setValorValue(ativo.valorAtualizado.toString());
      setIsEditingValor(false);
    }
  };

  return (
    <tr className={`${TABLE_STYLES.row} ${TABLE_STYLES.rowHover}`}>
      <td className={`${TABLE_STYLES.compact.td} font-medium`}>
        <div>
          <AssetNameLink portfolioId={ativo.id} ticker={ativo.nome} nomeComoPrincipal />
          {ativo.observacoes && (
            <div className="text-xs text-gray-900 dark:text-white mt-1">{ativo.observacoes}</div>
          )}
        </div>
      </td>
      <td className={`${TABLE_STYLES.compact.td} text-center`}>{ativo.cidade}</td>
      <td className={`${TABLE_STYLES.compact.td} text-center`}>{ativo.mandato}</td>
      <td className={`${TABLE_STYLES.compact.td} text-right`}>{formatNumber(ativo.quantidade)}</td>
      <td className={`${TABLE_STYLES.compact.td} text-right`}>
        {formatCurrency(ativo.precoAquisicao)}
      </td>
      <td className={`${TABLE_STYLES.compact.td} text-right`}>{formatCurrency(ativo.melhorias)}</td>
      <td className={`${TABLE_STYLES.compact.td} text-right`}>
        {formatCurrency(ativo.valorTotal)}
      </td>
      <td className={`${TABLE_STYLES.compact.td} text-right`}>
        {isEditingValor ? (
          <div className="flex items-center space-x-1">
            <input
              type="number"
              step="0.01"
              value={valorValue}
              onChange={(e) => setValorValue(e.target.value)}
              onKeyDown={handleValorKeyPress}
              onBlur={handleValorSubmit}
              className="w-24 px-1 py-0.5 text-xs border border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              autoFocus
            />
          </div>
        ) : (
          <div
            className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 rounded"
            onClick={() => setIsEditingValor(true)}
          >
            <span className="text-gray-900 dark:text-white">
              {formatCurrency(ativo.valorAtualizado)}
            </span>
          </div>
        )}
      </td>
      <td className={`${TABLE_STYLES.compact.td} text-right`}>
        {formatPercentage(ativo.riscoPorAtivo)}
      </td>
      <td className={`${TABLE_STYLES.compact.td} text-right`}>
        {formatPercentage(ativo.percentualCarteira)}
      </td>
      <td className={`${TABLE_STYLES.compact.td} text-right`}>
        {formatPercentage(ativo.rentabilidade)}
      </td>
    </tr>
  );
};

// ---------------------------------------------------------------------------
// Celular (PWA fase 1): cartões expansíveis + valor atualizado por sheet
// ---------------------------------------------------------------------------

interface ImoveisBensMobileListProps {
  ativos: ImovelBemAtivo[];
  totalGeral: { valorAplicado: number; valorAtualizado: number; rentabilidade: number };
  formatCurrency: (value: number, currency?: 'BRL' | 'USD') => string;
  formatPercentage: (value: number) => string;
  formatNumber: (value: number) => string;
  /** O MESMO handler do desktop (lança em falha). */
  onUpdateValorAtualizado: (ativoId: string, novoValor: number) => Promise<void>;
}

function ImovelDetail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className={TABLE_MOBILE_STYLES.cardDetailLabel}>{label}</dt>
      <dd className={`${TABLE_MOBILE_STYLES.cardDetailValue} break-words`}>{children}</dd>
    </div>
  );
}

export function ImoveisBensMobileList({
  ativos,
  totalGeral,
  formatCurrency,
  formatPercentage,
  formatNumber,
  onUpdateValorAtualizado,
}: ImoveisBensMobileListProps) {
  const [editing, setEditing] = useState<ImovelBemAtivo | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const columns: ResponsiveColumn<ImovelBemAtivo>[] = [
    {
      id: 'nome',
      header: 'Nome do Ativo',
      mobile: 'primary',
      cell: (a) => a.nome,
      mobileCell: (a) => <span className="block truncate">{a.nome}</span>,
    },
    {
      id: 'cidade',
      header: 'Cidade',
      mobile: 'subtitle',
      cell: (a) => a.cidade || '—',
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

  const renderBody = (a: ImovelBemAtivo) => (
    <div className="space-y-3">
      <dl className={TABLE_MOBILE_STYLES.cardDetailGrid}>
        <ImovelDetail label="Mandato">{a.mandato || '—'}</ImovelDetail>
        <ImovelDetail label="Quantidade">{formatNumber(a.quantidade)}</ImovelDetail>
        <ImovelDetail label="Aquisição">{formatCurrency(a.precoAquisicao)}</ImovelDetail>
        <ImovelDetail label="Melhorias">{formatCurrency(a.melhorias)}</ImovelDetail>
        <ImovelDetail label="Valor total">{formatCurrency(a.valorTotal)}</ImovelDetail>
        <ImovelDetail label="% da aba">{formatPercentage(a.percentualCarteira)}</ImovelDetail>
        <ImovelDetail label="Risco cart.">{formatPercentage(a.riscoPorAtivo)}</ImovelDetail>
      </dl>
      {a.observacoes && (
        <p className="text-sm text-gray-700 dark:text-gray-300 break-words">{a.observacoes}</p>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-gray-100 py-1.5 dark:border-gray-800">
        <div className="min-w-0">
          <div className={TABLE_MOBILE_STYLES.cardDetailLabel}>Valor atualizado</div>
          <div className="text-sm font-medium tabular-nums text-gray-800 dark:text-gray-100">
            {formatCurrency(a.valorAtualizado)}
          </div>
        </div>
        <button
          type="button"
          data-mf-edit="valorAtualizado"
          className={TABLE_MOBILE_STYLES.editButton}
          aria-label={`Editar valor atualizado de ${a.nome}`}
          onClick={() => {
            setEditing(a);
            setEditOpen(true);
          }}
        >
          Editar
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3" data-mf-imoveis-mobile="">
      <ResponsiveCardList<ImovelBemAtivo>
        columns={columns}
        rows={ativos}
        getRowKey={(a) => a.id}
        ariaLabel="Imóveis & Bens"
        expandable
        emptyState="Nenhum imóvel ou bem cadastrado."
        renderCardBody={renderBody}
        renderCardFooter={(a) => (
          <Link href={`/ativos/${a.id}`} className={TABLE_MOBILE_STYLES.editButton}>
            Ver detalhes do ativo
          </Link>
        )}
      />

      <section aria-label="Total geral de Imóveis & Bens" className={TABLE_MOBILE_STYLES.totalCard}>
        <div className={TABLE_MOBILE_STYLES.cardHeader}>
          <span className="font-semibold">Total geral</span>
          <span className="font-semibold tabular-nums">
            {formatCurrency(totalGeral.valorAtualizado)}
          </span>
        </div>
        <dl className={`${TABLE_MOBILE_STYLES.cardDetailGrid} mt-2`}>
          <ImovelDetail label="Valor total">
            {formatCurrency(totalGeral.valorAplicado)}
          </ImovelDetail>
          <ImovelDetail label="Rentabilidade">
            {formatPercentage(totalGeral.rentabilidade)}
          </ImovelDetail>
        </dl>
      </section>

      <MobileEditSheet
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        title="Editar valor atualizado"
        subject={editing?.nome}
        label="Valor atualizado"
        kind="currency"
        initialValue={editing?.valorAtualizado ?? null}
        min={0}
        minExclusive
        savedMessage={() => 'Valor atualizado salvo'}
        onSubmit={async (v) => {
          if (!editing || typeof v !== 'number') return false;
          await onUpdateValorAtualizado(editing.id, v);
        }}
      />
    </div>
  );
}

interface ImoveisBensTableProps {
  totalCarteira?: number;
}

export default function ImoveisBensTable({ totalCarteira = 0 }: ImoveisBensTableProps) {
  const {
    data,
    loading,
    error,
    formatCurrency,
    formatPercentage,
    formatNumber,
    updateValorAtualizado,
  } = useImoveisBens();
  const isBelowLg = useIsBelowLg();

  // Calcular risco e percentual da aba. `totalCarteira` aqui é o
  // dinheiroMaisBens (carteira líquida + imóveis/bens) passado por
  // CarteiraResumo — incluir os próprios imóveis no denominador evita a
  // saturação em 100% quando um imóvel vale mais que a carteira líquida.
  const dataComRisco = useMemo(() => {
    if (!data) return data;

    const totalTabValue = data.totalGeral?.valorAtualizado || 0;
    const shouldCalculateRisco = totalCarteira > 0;

    const ativosComRisco = data.ativos.map((ativo) => ({
      ...ativo,
      riscoPorAtivo: shouldCalculateRisco
        ? Math.min(100, (ativo.valorAtualizado / totalCarteira) * 100)
        : 0,
      percentualCarteira: totalTabValue > 0 ? (ativo.valorAtualizado / totalTabValue) * 100 : 0,
    }));

    const totalGeralRisco = ativosComRisco.reduce((sum, ativo) => sum + ativo.riscoPorAtivo, 0);

    return {
      ...data,
      ativos: ativosComRisco,
      totalGeral: {
        ...data.totalGeral,
        risco: totalGeralRisco,
        percentualCarteira: totalTabValue > 0 ? 100 : 0,
      },
    };
  }, [data, totalCarteira]);

  const handleUpdateValorAtualizado = async (ativoId: string, novoValor: number) => {
    await updateValorAtualizado(ativoId, novoValor);
  };

  if (loading) {
    return <LoadingSpinner text="Carregando dados de imóveis e bens..." />;
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
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <ImoveisBensMetricCard
          title="Valor Total Aquisições"
          value={formatCurrency(data?.resumo?.valorTotalAquisicoes ?? 0)}
        />
        <ImoveisBensMetricCard
          title="Valor Total Melhorias"
          value={formatCurrency(data?.resumo?.valorTotalMelhorias ?? 0)}
          color="warning"
        />
        <ImoveisBensMetricCard
          title="Valor Atualizado"
          value={formatCurrency(data?.resumo?.valorAtualizado ?? 0)}
        />
        <ImoveisBensMetricCard
          title="Rendimento"
          value={formatCurrency(data?.resumo?.rendimento ?? 0)}
          color={metricColorBySign(data?.resumo?.rendimento ?? 0)}
        />
        <ImoveisBensMetricCard
          title="Rentabilidade"
          value={formatPercentage(data?.resumo?.rentabilidade ?? 0)}
          color={metricColorBySign(data?.resumo?.rentabilidade ?? 0)}
        />
      </div>

      {isBelowLg ? (
        <ImoveisBensMobileList
          ativos={dataComRisco?.ativos ?? []}
          totalGeral={{
            valorAplicado: dataComRisco?.totalGeral?.valorAplicado || 0,
            valorAtualizado: dataComRisco?.totalGeral?.valorAtualizado || 0,
            rentabilidade: dataComRisco?.totalGeral?.rentabilidade || 0,
          }}
          formatCurrency={formatCurrency}
          formatPercentage={formatPercentage}
          formatNumber={formatNumber}
          onUpdateValorAtualizado={handleUpdateValorAtualizado}
        />
      ) : (
        /* Tabela principal */
        <ComponentCard title="Imóveis & Bens - Detalhamento">
          <div className={TABLE_STYLES.wrapper}>
            <table className={TABLE_STYLES.table}>
              <thead>
                <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
                  <th className={`${TABLE_STYLES.compact.th} text-left`}>Nome do Ativo</th>
                  <th className={`${TABLE_STYLES.compact.th} text-center`}>Cidade</th>
                  <th className={`${TABLE_STYLES.compact.th} text-center`}>Mandato</th>
                  <th className={`${TABLE_STYLES.compact.th} text-right`}>Quantidade</th>
                  <th className={`${TABLE_STYLES.compact.th} text-right`}>Preço Aquisição</th>
                  <th className={`${TABLE_STYLES.compact.th} text-right`}>Melhorias</th>
                  <th className={`${TABLE_STYLES.compact.th} text-right`}>Valor Total</th>
                  <th className={`${TABLE_STYLES.compact.th} text-right`}>Valor Atualizado</th>
                  <th className={`${TABLE_STYLES.compact.th} text-right`}>
                    <span className="block">Risco Por Ativo</span>
                    <span className="block">(Carteira Total)</span>
                  </th>
                  <th className={`${TABLE_STYLES.compact.th} text-right`}>% da Aba</th>
                  <th className={`${TABLE_STYLES.compact.th} text-right`}>Rentabilidade</th>
                </tr>
              </thead>
              <tbody>
                {/* Linha de totalização */}
                <tr className={TABLE_STYLES.totalRow}>
                  <td className={TABLE_STYLES.compact.td}>TOTAL GERAL</td>
                  <td className={`${TABLE_STYLES.compact.td} text-center`}>-</td>
                  <td className={`${TABLE_STYLES.compact.td} text-center`}>-</td>
                  <td className={`${TABLE_STYLES.compact.td} text-right`}>
                    {formatNumber(dataComRisco?.totalGeral?.quantidade || 0)}
                  </td>
                  <td className={`${TABLE_STYLES.compact.td} text-center`}>-</td>
                  <td className={`${TABLE_STYLES.compact.td} text-center`}>-</td>
                  <td className={`${TABLE_STYLES.compact.td} text-right`}>
                    {formatCurrency(dataComRisco?.totalGeral?.valorAplicado || 0)}
                  </td>
                  <td className={`${TABLE_STYLES.compact.td} text-right`}>
                    {formatCurrency(dataComRisco?.totalGeral?.valorAtualizado || 0)}
                  </td>
                  <td className={`${TABLE_STYLES.compact.td} text-right`}>
                    {formatPercentage(dataComRisco?.totalGeral?.risco || 0)}
                  </td>
                  <td className={`${TABLE_STYLES.compact.td} text-right`}>
                    {formatPercentage(dataComRisco?.totalGeral?.percentualCarteira || 0)}
                  </td>
                  <td className={`${TABLE_STYLES.compact.td} text-right`}>
                    {formatPercentage(dataComRisco?.totalGeral?.rentabilidade || 0)}
                  </td>
                </tr>

                {dataComRisco?.ativos?.map((ativo) => (
                  <ImoveisBensTableRow
                    key={ativo.id}
                    ativo={ativo}
                    formatCurrency={formatCurrency}
                    formatPercentage={formatPercentage}
                    formatNumber={formatNumber}
                    onUpdateValorAtualizado={handleUpdateValorAtualizado}
                  />
                )) || []}
                <BasicTablePlaceholderRows
                  count={Math.max(0, MIN_PLACEHOLDER_ROWS - (dataComRisco?.ativos?.length || 0))}
                  colSpan={IMOVEIS_BENS_COLUMN_COUNT}
                />
              </tbody>
            </table>
          </div>
        </ComponentCard>
      )}
    </div>
  );
}
