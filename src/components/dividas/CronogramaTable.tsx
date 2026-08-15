'use client';

import { useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import type { ParcelaCronograma } from '@/hooks/useDividas';
import { formatBRL, formatYearMonth } from './utils';

interface CronogramaTableProps {
  cronograma: ParcelaCronograma[];
  parcelasPagas: number;
  proximaParcela: number | null;
}

const HEAD =
  'px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400';

/**
 * Tabela do cronograma de amortização (SAC/Price). Parcelas pagas ganham
 * check; a próxima fica destacada. Cronogramas longos começam colapsados em
 * torno da próxima parcela (expande sob demanda).
 */
export default function CronogramaTable({
  cronograma,
  parcelasPagas,
  proximaParcela,
}: CronogramaTableProps) {
  const [expanded, setExpanded] = useState(false);

  const visible = useMemo(() => {
    if (expanded || cronograma.length <= 24) return cronograma;
    // Janela de 24 linhas centrada na próxima parcela.
    const centro = (proximaParcela ?? 1) - 1;
    const start = Math.max(0, Math.min(centro - 6, cronograma.length - 24));
    return cronograma.slice(start, start + 24);
  }, [cronograma, expanded, proximaParcela]);

  const totais = useMemo(
    () => ({
      juros: cronograma.reduce((s, r) => s + r.juros, 0),
      amortizacao: cronograma.reduce((s, r) => s + r.amortizacao, 0),
    }),
    [cronograma],
  );

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between px-4 pt-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white/90">
          Cronograma de amortização
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Total de juros: {formatBRL(totais.juros)} · Amortização: {formatBRL(totais.amortizacao)}
        </span>
      </div>
      <div className="overflow-x-auto">
        <Table className="text-sm">
          <TableHeader>
            <TableRow className="border-b border-gray-200 dark:border-gray-800">
              <TableCell isHeader className={`${HEAD} text-left`}>
                Nº
              </TableCell>
              <TableCell isHeader className={`${HEAD} text-left`}>
                Mês
              </TableCell>
              <TableCell isHeader className={`${HEAD} text-right`}>
                Parcela
              </TableCell>
              <TableCell isHeader className={`${HEAD} text-right`}>
                Juros
              </TableCell>
              <TableCell isHeader className={`${HEAD} text-right`}>
                Amortização
              </TableCell>
              <TableCell isHeader className={`${HEAD} text-right`}>
                Saldo devedor
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((r) => {
              const paga = r.numero <= parcelasPagas;
              const isProxima = r.numero === proximaParcela;
              const amortizada = Boolean(r.amortizada);
              return (
                <TableRow
                  key={r.numero}
                  className={`border-b border-gray-100 dark:border-gray-800/60 ${
                    isProxima
                      ? 'bg-brand-50 dark:bg-brand-500/10'
                      : amortizada
                        ? 'opacity-50 line-through'
                        : paga
                          ? 'opacity-60'
                          : ''
                  }`}
                >
                  <TableCell className="px-3 py-2 text-gray-600 dark:text-gray-300">
                    {amortizada ? (
                      <span className="mr-1 inline-block rounded-full bg-emerald-50 px-1.5 text-[10px] font-medium text-emerald-700 no-underline dark:bg-emerald-900/20 dark:text-emerald-300">
                        amortizada
                      </span>
                    ) : paga ? (
                      '✓ '
                    ) : (
                      ''
                    )}
                    {r.numero}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-gray-600 dark:text-gray-300">
                    {formatYearMonth(r.mes)}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-right font-medium text-gray-900 dark:text-white/90">
                    {formatBRL(r.parcela)}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">
                    {formatBRL(r.juros)}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">
                    {formatBRL(r.amortizacao)}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">
                    {formatBRL(r.saldoDevedor)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {cronograma.length > 24 ? (
        <div className="border-t border-gray-100 p-2 text-center dark:border-gray-800/60">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs font-medium text-brand-600 transition hover:text-brand-700 dark:text-brand-400"
          >
            {expanded ? 'Mostrar menos' : `Mostrar todas as ${cronograma.length} parcelas`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
