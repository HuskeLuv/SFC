'use client';

import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import type { DividaDTO } from '@/hooks/useDividas';
import { CATEGORIA_LABELS, INDEXADOR_LABELS, STATUS_LABELS, TIPO_LABELS, formatBRL } from './utils';

interface DividasTableProps {
  dividas: DividaDTO[];
  onSelectDivida: (id: string) => void;
}

const HEAD =
  'px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400';

/**
 * Tabela consolidada de dívidas: nome, tipo, sistema/indexador, saldo
 * devedor, parcela, progresso (pagas/total) e status. Rodapé soma o saldo
 * devedor das ativas.
 */
export default function DividasTable({ dividas, onSelectDivida }: DividasTableProps) {
  const totalDevido = useMemo(
    () =>
      dividas
        .filter((d) => d.status === 'ativa')
        .reduce((s, d) => s + (d.resumo?.saldoDevedor ?? 0), 0),
    [dividas],
  );

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
      <Table className="text-sm">
        <TableHeader>
          <TableRow className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03]">
            <TableCell isHeader className={`${HEAD} text-left`}>
              Dívida
            </TableCell>
            <TableCell isHeader className={`${HEAD} text-left`}>
              Tipo
            </TableCell>
            <TableCell isHeader className={`${HEAD} text-left`}>
              Sistema
            </TableCell>
            <TableCell isHeader className={`${HEAD} text-right`}>
              Saldo devedor
            </TableCell>
            <TableCell isHeader className={`${HEAD} text-right`}>
              Parcela
            </TableCell>
            <TableCell isHeader className={`${HEAD} text-center`}>
              Progresso
            </TableCell>
            <TableCell isHeader className={`${HEAD} text-center`}>
              Prazo
            </TableCell>
            <TableCell isHeader className={`${HEAD} text-center`}>
              Status
            </TableCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dividas.map((d) => {
            const r = d.resumo;
            const isFinanciamento = d.modalidade === 'financiamento';
            const progresso =
              isFinanciamento && r?.parcelasPagas != null && r?.totalParcelas
                ? `${r.parcelasPagas}/${r.totalParcelas}`
                : '—';
            return (
              <TableRow
                key={d.id}
                className="cursor-pointer border-b border-gray-100 transition hover:bg-gray-50 dark:border-gray-800/60 dark:hover:bg-white/[0.03]"
                onClick={() => onSelectDivida(d.id)}
              >
                <TableCell className="px-3 py-2.5">
                  <span className="font-medium text-gray-900 dark:text-white/90">{d.nome}</span>
                  {d.instituicao ? (
                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                      {d.instituicao}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="px-3 py-2.5 text-gray-600 dark:text-gray-300">
                  {TIPO_LABELS[d.tipo]}
                </TableCell>
                <TableCell className="px-3 py-2.5 text-gray-600 dark:text-gray-300">
                  {isFinanciamento && d.sistema
                    ? `${d.sistema}${d.indexador !== 'PREFIXADO' ? ` + ${INDEXADOR_LABELS[d.indexador]}` : ''}`
                    : 'Rotativa'}
                </TableCell>
                <TableCell className="px-3 py-2.5 text-right font-medium text-gray-900 dark:text-white/90">
                  {formatBRL(r?.saldoDevedor)}
                </TableCell>
                <TableCell className="px-3 py-2.5 text-right text-gray-600 dark:text-gray-300">
                  {r?.proximaParcela ? formatBRL(r.proximaParcela.parcela) : '—'}
                </TableCell>
                <TableCell className="px-3 py-2.5 text-center text-gray-600 dark:text-gray-300">
                  {progresso}
                </TableCell>
                <TableCell className="px-3 py-2.5 text-center text-xs text-gray-500 dark:text-gray-400">
                  {r ? CATEGORIA_LABELS[r.categoria] : '—'}
                </TableCell>
                <TableCell className="px-3 py-2.5 text-center">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      d.status === 'quitada'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                        : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
                    }`}
                  >
                    {STATUS_LABELS[d.status]}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
          {/* Rodapé de totais */}
          <TableRow className="bg-gray-50 font-medium dark:bg-white/[0.03]">
            <TableCell className="px-3 py-2.5 text-gray-700 dark:text-gray-200">
              Total (ativas)
            </TableCell>
            <TableCell className="px-3 py-2.5">{''}</TableCell>
            <TableCell className="px-3 py-2.5">{''}</TableCell>
            <TableCell className="px-3 py-2.5 text-right text-gray-900 dark:text-white/90">
              {formatBRL(totalDevido)}
            </TableCell>
            <TableCell className="px-3 py-2.5">{''}</TableCell>
            <TableCell className="px-3 py-2.5">{''}</TableCell>
            <TableCell className="px-3 py-2.5">{''}</TableCell>
            <TableCell className="px-3 py-2.5">{''}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
