'use client';

import { useState } from 'react';
import Button from '@/components/ui/button/Button';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { TABLE_HEADER_BG } from '@/constants/brandColors';
import { formatBRL } from '@/utils/format';
import {
  useDesaplicarTransacoes,
  useExtrato,
  type BankAccountDTO,
} from '@/hooks/useConexoesBancarias';

interface ExtratoContaProps {
  conta: BankAccountDTO;
  onFechar: () => void;
}

/**
 * Extrato importado de uma conta (só leitura, paginado). Exibição: valor
 * negativo = saída, positivo = entrada/estorno (o `type` do provedor não é
 * confiável no cartão: o sandbox marca compra como CREDIT).
 */
export default function ExtratoConta({ conta, onFechar }: ExtratoContaProps) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, isFetching } = useExtrato(conta.id, page);
  const desaplicar = useDesaplicarTransacoes();

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Extrato · {conta.name}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Importado do banco. Para lançar no Fluxo de Caixa, use a Caixa de entrada acima.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onFechar}>
          Fechar
        </Button>
      </div>

      {isLoading ? <LoadingSpinner size="md" text="Carregando extrato..." /> : null}
      {isError ? <p className="text-sm text-red-600 dark:text-red-400">{error?.message}</p> : null}

      {data ? (
        <>
          <div className="overflow-x-auto">
            <Table aria-label={`Extrato de ${conta.name}`}>
              <TableHeader>
                <TableRow>
                  {['Data', 'Descrição', 'Categoria', 'Valor'].map((h) => (
                    <TableCell
                      key={h}
                      isHeader
                      className={`px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-white ${
                        h === 'Valor' ? 'text-right' : ''
                      }`}
                      style={{ backgroundColor: TABLE_HEADER_BG }}
                    >
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.transactions.length === 0 ? (
                  <TableRow>
                    <TableCell className="px-3 py-4 text-sm text-gray-500" colSpan={4}>
                      Nenhuma transação no período importado.
                    </TableCell>
                  </TableRow>
                ) : null}
                {data.transactions.map((t) => {
                  // Sinal do valor: negativo = saída (vale para conta e para cartão,
                  // onde alguns conectores marcam compra como CREDIT).
                  const saida = t.amount < 0;
                  return (
                    <TableRow key={t.id} className="border-b border-gray-100 dark:border-gray-800">
                      <TableCell className="whitespace-nowrap px-3 py-2 text-sm text-gray-600 dark:text-gray-300">
                        {new Date(t.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-sm text-gray-800 dark:text-white/90">
                        <span>{t.merchantName ?? t.description}</span>
                        {t.installmentTotal ? (
                          <span className="ml-2 text-xs text-gray-500">
                            {t.installmentNumber}/{t.installmentTotal}
                          </span>
                        ) : null}
                        {t.status === 'PENDING' ? (
                          <span className="ml-2 text-xs text-amber-600">pendente</span>
                        ) : null}
                        {t.cashflowItemId ? (
                          <button
                            type="button"
                            className="ml-2 text-xs text-blue-600 hover:underline dark:text-blue-400"
                            disabled={desaplicar.isPending}
                            onClick={() => desaplicar.mutate({ ids: [t.id] })}
                            title="Tirar do fluxo de caixa (volta para a Caixa de entrada)"
                          >
                            no fluxo · tirar
                          </button>
                        ) : t.duplicadaDe ? (
                          <span
                            className="ml-2 text-xs text-gray-400"
                            title="Já importada por outra conexão; não conta no fluxo"
                          >
                            duplicada
                          </span>
                        ) : t.ignorada ? (
                          <span className="ml-2 text-xs text-gray-400">ignorada</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                        {t.providerCategory ?? '—'}
                      </TableCell>
                      <TableCell
                        className={`whitespace-nowrap px-3 py-2 text-right text-sm font-medium tabular-nums ${
                          saida
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {saida ? '−' : '+'}
                        {formatBRL(Math.abs(t.amount))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>
              {data.pagination.total} transações · página {data.pagination.page} de{' '}
              {Math.max(1, data.pagination.totalPages)}
              {isFetching ? ' · atualizando…' : ''}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= data.pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
