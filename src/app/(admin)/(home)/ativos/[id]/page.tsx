'use client';

import React, { useEffect, useState, useMemo, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ComponentCard from '@/components/common/ComponentCard';
import MetricCard from '@/components/carteira/shared/MetricCard';
import {
  StandardTable,
  StandardTableHeader,
  StandardTableHeaderRow,
  StandardTableHeaderCell,
  StandardTableBodyCell,
  StandardTableRow,
  TableBody,
} from '@/components/ui/table/StandardTable';
import Button from '@/components/ui/button/Button';
import LineChartCarteiraHistorico from '@/components/charts/line/LineChartCarteiraHistorico';
import RentabilidadeChart from '@/components/analises/RentabilidadeChart';
import { useIndices } from '@/hooks/useIndices';
import { ChevronDownIcon } from '@/icons';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const formatPercentage = (value: number) =>
  `${value >= 0 ? '' : '-'}${Math.abs(value).toFixed(2)}%`;

const formatNumber = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

const formatMonthYear = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString('pt-BR', {
    month: 'short',
    year: '2-digit',
  });

const formatDateProventos = (dateStr: string) => {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase().replace('.', '');
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
};

type RentabilidadeRange = '12M' | '2A' | '5A' | '10A' | 'MAX';

const RENTABILIDADE_OPTIONS: { value: RentabilidadeRange; label: string }[] = [
  { value: '12M', label: 'Últimos 12 meses' },
  { value: '2A', label: 'Últimos 2 anos' },
  { value: '5A', label: 'Últimos 5 anos' },
  { value: '10A', label: 'Últimos 10 anos' },
  { value: 'MAX', label: 'Máx.' },
];

interface AtivoData {
  ativo: { nome: string; ticker: string; instituicao: string | null };
  posicao: {
    quantidade: number;
    precoMedio: number;
    valorAplicado: number;
    saldoBruto: number;
    rentabilidade: number;
    resultado: number;
    cotacaoAtual: number;
  };
  transacoes: Array<{
    id: string;
    tipoOperacao: string;
    quantity: number;
    price: number;
    total: number;
    date: string;
    fees: number | null;
    notes: string | null;
  }>;
  historicoPatrimonio: Array<{
    data: number;
    valorAplicado: number;
    saldoBruto: number;
  }>;
  historicoTWR: Array<{ date: number; value: number }>;
  proventos: Array<{
    data: string;
    tipo: string;
    valorTotal: number;
    quantidade: number;
  }>;
  fundamentos: {
    pl: number | string;
    beta: number | string;
    dividendYield: string;
  };
  isFixedIncome?: boolean;
}

function AtivoDetalheContent() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [data, setData] = useState<AtivoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rentabilidadeRange, setRentabilidadeRange] = useState<RentabilidadeRange>('12M');

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/ativos/${id}`, { credentials: 'include' });
        if (!res.ok) {
          if (res.status === 404) throw new Error('Ativo não encontrado');
          throw new Error('Erro ao carregar dados');
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido');
      } finally {
        setLoading(false);
      }
    };
    void fetchData();
  }, [id]);

  const rentabilidadeStartDate = useMemo(() => {
    if (!data?.historicoTWR?.length) return undefined;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const firstDate = Math.min(...data.historicoTWR.map((h) => h.date));
    if (rentabilidadeRange === 'MAX') return firstDate;
    const start = new Date(now);
    if (rentabilidadeRange === '12M') start.setMonth(start.getMonth() - 12);
    else if (rentabilidadeRange === '2A') start.setFullYear(start.getFullYear() - 2);
    else if (rentabilidadeRange === '5A') start.setFullYear(start.getFullYear() - 5);
    else if (rentabilidadeRange === '10A') start.setFullYear(start.getFullYear() - 10);
    start.setHours(0, 0, 0, 0);
    return Math.max(firstDate, start.getTime());
  }, [data?.historicoTWR, rentabilidadeRange]);

  const filteredHistoricoTWR = useMemo(() => {
    if (!data?.historicoTWR?.length || !rentabilidadeStartDate) return data?.historicoTWR ?? [];
    return data.historicoTWR.filter((h) => h.date >= rentabilidadeStartDate);
  }, [data?.historicoTWR, rentabilidadeStartDate]);

  const indicesRange = rentabilidadeRange === '12M' ? '1y' : '2y';
  const { indices, loading: indicesLoading } = useIndices(
    indicesRange as '1y' | '2y',
    rentabilidadeStartDate,
  );

  const monthlyIndicesStartDate = useMemo(() => {
    if (!data?.historicoPatrimonio?.length) return undefined;
    return Math.min(...data.historicoPatrimonio.map((h) => h.data));
  }, [data?.historicoPatrimonio]);

  const { indices: indicesForMonthly } = useIndices('2y', monthlyIndicesStartDate);

  const historicoMensal = useMemo(() => {
    if (!data?.historicoPatrimonio?.length) return [];
    const hp = [...data.historicoPatrimonio].sort((a, b) => a.data - b.data);
    const twr = [...(data.historicoTWR ?? [])].sort((a, b) => a.date - b.date);
    const prov = data.proventos ?? [];
    const trans = data.transacoes ?? [];

    const getQuantityAtDate = (ts: number) => {
      let qty = 0;
      trans.forEach((tx) => {
        const txTs = new Date(tx.date).getTime();
        if (txTs <= ts) {
          const tipo = (tx.tipoOperacao || '').toLowerCase();
          qty += tipo.includes('aporte') || tipo.includes('compra') ? tx.quantity : -tx.quantity;
        }
      });
      return Math.max(0, qty);
    };

    const monthMap = new Map<
      string,
      {
        monthKey: string;
        date: number;
        saldoBruto: number;
        quantidade: number;
        rentInicio: number;
        rentFim: number;
        proventos: number;
      }
    >();

    hp.forEach((h) => {
      const d = new Date(h.data);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const existing = monthMap.get(monthKey);
      if (!existing || h.data >= existing.date) {
        monthMap.set(monthKey, {
          monthKey,
          date: h.data,
          saldoBruto: h.saldoBruto,
          quantidade: getQuantityAtDate(h.data),
          rentInicio: 0,
          rentFim: 0,
          proventos: 0,
        });
      }
    });

    twr.forEach((h) => {
      const d = new Date(h.date);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).getTime();
      const entry = monthMap.get(monthKey);
      if (entry && h.date <= lastDay + 86400000) {
        entry.rentFim = h.value;
      }
    });

    const sortedMonthKeys = Array.from(monthMap.keys()).sort();
    sortedMonthKeys.forEach((monthKey, idx) => {
      const entry = monthMap.get(monthKey)!;
      if (idx > 0) {
        entry.rentInicio = monthMap.get(sortedMonthKeys[idx - 1])!.rentFim;
      }
    });

    prov.forEach((p) => {
      const d = new Date(p.data);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const entry = monthMap.get(monthKey);
      if (entry) entry.proventos += p.valorTotal;
    });

    const ibovData =
      indicesForMonthly.find((i) => i.symbol === 'IBOV' || i.name?.toUpperCase().includes('IBOV'))
        ?.data ?? [];
    const ibovSorted = [...ibovData].sort((a, b) => a.date - b.date);
    const ibovByMonth = new Map<string, { start: number; end: number }>();
    ibovSorted.forEach((point) => {
      const d = new Date(point.date);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).getTime();
      if (point.date <= lastDay + 86400000) {
        const existing = ibovByMonth.get(monthKey);
        if (!existing) ibovByMonth.set(monthKey, { start: 0, end: point.value });
        else existing.end = point.value;
      }
    });
    const ibovMonthKeys = Array.from(ibovByMonth.keys()).sort();
    ibovMonthKeys.forEach((monthKey, idx) => {
      const entry = ibovByMonth.get(monthKey)!;
      if (idx > 0) entry.start = ibovByMonth.get(ibovMonthKeys[idx - 1])!.end;
    });

    return Array.from(monthMap.entries())
      .map(([, v]) => {
        const rentMensal =
          v.rentInicio !== undefined && v.rentFim !== undefined
            ? ((1 + v.rentFim / 100) / (1 + v.rentInicio / 100) - 1) * 100
            : 0;
        const ibov = ibovByMonth.get(v.monthKey);
        const ibovMensal =
          ibov && ibov.start !== undefined && ibov.end !== undefined
            ? ((1 + ibov.end / 100) / (1 + ibov.start / 100) - 1) * 100
            : null;
        return {
          monthKey: v.monthKey,
          date: v.date,
          saldoBruto: v.saldoBruto,
          quantidade: v.quantidade,
          rentabilidade: rentMensal,
          carteira: rentMensal,
          ibov: ibovMensal,
          proventos: v.proventos,
        };
      })
      .sort((a, b) => b.date - a.date);
  }, [
    data?.historicoPatrimonio,
    data?.historicoTWR,
    data?.proventos,
    data?.transacoes,
    indicesForMonthly,
  ]);

  const rentabilidadePeriod = rentabilidadeRange === '12M' ? '1mo' : '1y';

  const extratoUnificado = useMemo(() => {
    const items: Array<{
      id: string;
      tipo: string;
      data: string;
      quantity: number;
      total: number;
      detail?: string;
    }> = [];

    data?.transacoes?.forEach((tx) => {
      items.push({
        id: tx.id,
        tipo: tx.tipoOperacao,
        data: tx.date,
        quantity: tx.quantity,
        total: tx.total,
      });
    });

    data?.proventos?.forEach((p, i) => {
      const valorUnitario = p.quantidade > 0 ? p.valorTotal / p.quantidade : 0;
      items.push({
        id: `provento-${p.data}-${p.tipo}-${i}`,
        tipo: p.tipo,
        data: p.data,
        quantity: p.quantidade,
        total: p.valorTotal,
        detail:
          p.quantidade > 0
            ? `${formatCurrency(valorUnitario)} x ${formatNumber(p.quantidade)}`
            : undefined,
      });
    });

    return items.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  }, [data?.transacoes, data?.proventos]);

  if (loading) {
    return <LoadingSpinner text="Carregando detalhes do ativo..." />;
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <p className="text-red-600 dark:text-red-400">{error || 'Ativo não encontrado'}</p>
        <Button onClick={() => router.back()}>Voltar</Button>
      </div>
    );
  }

  const instituicaoLabel = data.ativo.instituicao ?? '—';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{data.ativo.nome}</h1>
          <p className="text-gray-600 dark:text-gray-400">
            {data.ativo.ticker}
            {instituicaoLabel !== '—' && ` • ${instituicaoLabel}`}
          </p>
        </div>
        <Link href={`/ativos/${id}/editar`}>
          <Button variant="outline">Editar produto</Button>
        </Link>
      </div>

      {/* Resumo - MetricCards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-7">
        <MetricCard title="Quantidade" value={formatNumber(data.posicao.quantidade)} />
        <MetricCard title="Preço médio" value={formatCurrency(data.posicao.precoMedio)} />
        <MetricCard
          title="Rentabilidade"
          value={formatPercentage(data.posicao.rentabilidade)}
          color={data.posicao.rentabilidade >= 0 ? 'success' : 'error'}
        />
        <MetricCard title="Última cotação" value={formatCurrency(data.posicao.cotacaoAtual)} />
        <MetricCard title="Valor aplicado" value={formatCurrency(data.posicao.valorAplicado)} />
        <MetricCard title="Saldo bruto" value={formatCurrency(data.posicao.saldoBruto)} />
        <MetricCard
          title="Resultado"
          value={formatCurrency(data.posicao.resultado)}
          color={data.posicao.resultado >= 0 ? 'success' : 'error'}
        />
      </div>

      {/* Conteúdo principal: coluna esquerda (~65%) | coluna direita Extrato (~35%) - como no exemplo */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)] xl:items-stretch">
        <div className="min-w-0 max-w-full overflow-hidden space-y-6">
          <Suspense
            fallback={
              <div className="flex h-80 items-center justify-center rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
                <div className="animate-spin h-8 w-8 border-2 border-brand-500 border-t-transparent rounded-full" />
              </div>
            }
          >
            <ComponentCard title="Valor aplicado vs Saldo" className="overflow-hidden">
              {data.historicoPatrimonio?.length > 0 ? (
                <div className="min-w-0 max-w-full overflow-hidden">
                  <LineChartCarteiraHistorico data={data.historicoPatrimonio} />
                </div>
              ) : (
                <div className="flex h-64 items-center justify-center text-gray-500 dark:text-gray-400">
                  Sem dados de histórico
                </div>
              )}
            </ComponentCard>
          </Suspense>

          <ComponentCard title="Histórico Mensal" className="overflow-hidden">
            {historicoMensal.length > 0 ? (
              <div className="max-h-80 overflow-y-auto">
                <StandardTable>
                  <StandardTableHeader>
                    <StandardTableHeaderRow>
                      <StandardTableHeaderCell align="left"> </StandardTableHeaderCell>
                      <StandardTableHeaderCell align="right">Saldo atual</StandardTableHeaderCell>
                      <StandardTableHeaderCell align="right">Qtde</StandardTableHeaderCell>
                      <StandardTableHeaderCell align="right">Rent. %</StandardTableHeaderCell>
                      <StandardTableHeaderCell align="right">Carteira. %</StandardTableHeaderCell>
                      <StandardTableHeaderCell align="right">IBOV</StandardTableHeaderCell>
                      <StandardTableHeaderCell align="right">Proventos</StandardTableHeaderCell>
                    </StandardTableHeaderRow>
                  </StandardTableHeader>
                  <TableBody>
                    {historicoMensal.map((row) => (
                      <StandardTableRow key={row.monthKey}>
                        <StandardTableBodyCell align="left">
                          {formatMonthYear(row.date)}
                        </StandardTableBodyCell>
                        <StandardTableBodyCell align="right">
                          {formatCurrency(row.saldoBruto)}
                        </StandardTableBodyCell>
                        <StandardTableBodyCell align="right">
                          {formatNumber(row.quantidade)}
                        </StandardTableBodyCell>
                        <StandardTableBodyCell align="right">
                          {formatPercentage(row.rentabilidade)}
                        </StandardTableBodyCell>
                        <StandardTableBodyCell align="right">
                          {formatPercentage(row.carteira)}
                        </StandardTableBodyCell>
                        <StandardTableBodyCell align="right">
                          {row.ibov !== null ? formatPercentage(row.ibov) : '—'}
                        </StandardTableBodyCell>
                        <StandardTableBodyCell align="right">
                          {formatCurrency(row.proventos)}
                        </StandardTableBodyCell>
                      </StandardTableRow>
                    ))}
                  </TableBody>
                </StandardTable>
              </div>
            ) : (
              <p className="py-8 text-center text-gray-500 dark:text-gray-400">
                Sem dados de histórico mensal
              </p>
            )}
          </ComponentCard>

          {/* Proventos e Fundamentos */}
          <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="grid grid-cols-1 gap-8 p-6 lg:grid-cols-2">
              {/* Proventos */}
              <div>
                <h3 className="mb-4 text-base font-semibold text-gray-900 dark:text-white">
                  Proventos
                </h3>
                {data.proventos?.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto space-y-0">
                    {data.proventos.map((p, i) => (
                      <div
                        key={`${p.data}-${p.tipo}-${i}`}
                        className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 py-3 last:border-0 dark:border-gray-700"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-800 dark:text-gray-200">
                            {formatDateProventos(p.data)}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
                            {p.tipo}
                          </p>
                        </div>
                        <div className="flex gap-6">
                          <div className="text-right">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                              Valor Total
                            </p>
                            <p className="text-xs font-normal text-gray-800 dark:text-gray-200">
                              {formatCurrency(p.valorTotal)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                              QTDE
                            </p>
                            <p className="text-xs font-normal text-gray-800 dark:text-gray-200">
                              {formatNumber(p.quantidade)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-8 text-center text-gray-500 dark:text-gray-400">
                    Nenhum provento encontrado
                  </p>
                )}
              </div>

              {/* Fundamentos */}
              <div>
                <h3 className="mb-4 text-base font-semibold text-gray-900 dark:text-white">
                  Fundamentos
                </h3>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">P/L</p>
                    <p className="mt-1 text-sm font-normal text-gray-800 dark:text-gray-200">
                      {typeof data.fundamentos.pl === 'number'
                        ? data.fundamentos.pl.toFixed(2)
                        : data.fundamentos.pl}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      Beta Ibov
                    </p>
                    <p className="mt-1 text-sm font-normal text-gray-800 dark:text-gray-200">
                      {typeof data.fundamentos.beta === 'number'
                        ? data.fundamentos.beta.toFixed(2)
                        : data.fundamentos.beta}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      Div Yield
                    </p>
                    <p className="mt-1 text-sm font-normal text-gray-800 dark:text-gray-200">
                      {data.fundamentos.dividendYield}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Rentabilidade Histórica */}
          <ComponentCard title="Rentabilidade Histórica" className="overflow-hidden">
            <div className="mb-4 flex items-center justify-between">
              <div />
              <div className="relative">
                <select
                  value={rentabilidadeRange}
                  onChange={(e) => setRentabilidadeRange(e.target.value as RentabilidadeRange)}
                  className="appearance-none rounded-lg border border-gray-300 bg-white px-4 py-2 pr-10 text-sm font-medium text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  aria-label="Selecionar período de rentabilidade"
                >
                  {RENTABILIDADE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              </div>
            </div>
            {filteredHistoricoTWR.length > 0 && indices.length > 0 ? (
              <RentabilidadeChart
                carteiraData={filteredHistoricoTWR.map((h) => ({ date: h.date, value: h.value }))}
                indicesData={indices}
                period={rentabilidadePeriod as '1mo' | '1y'}
                chartType="line"
                customColors={['#06B6D4', '#8B5CF6', '#F59E0B']}
                allowedIndices={data.isFixedIncome ? ['CDI', 'IPCA'] : ['CDI', 'IBOV']}
                carteiraLabel="Ativo"
                legendPosition="bottom"
              />
            ) : indicesLoading ? (
              <div className="flex h-80 items-center justify-center">
                <div className="animate-spin h-8 w-8 border-2 border-brand-500 border-t-transparent rounded-full" />
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center text-gray-500 dark:text-gray-400">
                Sem dados de rentabilidade para o período
              </div>
            )}
          </ComponentCard>
        </div>

        {/* Extrato: coluna direita com espaço reservado - ocupa altura total da coluna */}
        <div className="flex min-w-0 flex-col">
          <ComponentCard title="Extrato" className="flex flex-1 flex-col min-h-0">
            {extratoUnificado.length > 0 ? (
              <div className="min-h-[320px] flex-1">
                <StandardTable>
                  <StandardTableHeader>
                    <StandardTableHeaderRow>
                      <StandardTableHeaderCell align="left">Tipo</StandardTableHeaderCell>
                      <StandardTableHeaderCell align="center">Data</StandardTableHeaderCell>
                      <StandardTableHeaderCell align="right">Qtd</StandardTableHeaderCell>
                      <StandardTableHeaderCell align="right">Valor</StandardTableHeaderCell>
                    </StandardTableHeaderRow>
                  </StandardTableHeader>
                  <TableBody>
                    {extratoUnificado.map((item) => (
                      <StandardTableRow key={item.id}>
                        <StandardTableBodyCell align="left">{item.tipo}</StandardTableBodyCell>
                        <StandardTableBodyCell align="center">
                          {formatDate(item.data)}
                        </StandardTableBodyCell>
                        <StandardTableBodyCell align="right">
                          {item.detail ?? formatNumber(item.quantity)}
                        </StandardTableBodyCell>
                        <StandardTableBodyCell align="right">
                          {formatCurrency(item.total)}
                        </StandardTableBodyCell>
                      </StandardTableRow>
                    ))}
                  </TableBody>
                </StandardTable>
              </div>
            ) : (
              <p className="py-8 text-center text-gray-500 dark:text-gray-400">
                Nenhum lançamento no extrato
              </p>
            )}
          </ComponentCard>
        </div>
      </div>
    </div>
  );
}

export default function AtivoDetalhePage() {
  return (
    <ProtectedRoute>
      <AtivoDetalheContent />
    </ProtectedRoute>
  );
}
