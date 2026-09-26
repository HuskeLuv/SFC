'use client';

import { useState } from 'react';
import Button from '@/components/ui/button/Button';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { TABLE_HEADER_STYLE, TABLE_STYLES } from '@/components/ui/table/tableStyles';
import { ResponsiveCardList, type ResponsiveColumn } from '@/components/ui/table/ResponsiveTable';
import { formatBRL } from '@/utils/format';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import {
  useDesaplicarTransacoes,
  useExtrato,
  type BankAccountDTO,
  type BankTransactionDTO,
} from '@/hooks/useConexoesBancarias';

interface ExtratoContaProps {
  conta: BankAccountDTO;
  onFechar: () => void;
  /**
   * PWA fase 3: 'sheet' = dentro do BottomSheet do celular (o título e o fechar são do sheet; sem
   * moldura). Padrão 'card' = o cartão de hoje.
   */
  variant?: 'card' | 'sheet';
}

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

/**
 * Extrato importado de uma conta (só leitura, paginado). Exibição: valor
 * negativo = saída, positivo = entrada/estorno (o `type` do provedor não é
 * confiável no cartão: o sandbox marca compra como CREDIT).
 */
export default function ExtratoConta({ conta, onFechar, variant = 'card' }: ExtratoContaProps) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, isFetching } = useExtrato(conta.id, page);
  const desaplicar = useDesaplicarTransacoes();
  const isBelowLg = useIsBelowLg();
  const noSheet = variant === 'sheet';

  // Mesmas marcas da coluna Descrição do desktop (parcela, pendente, no fluxo · tirar…).
  const marcas = (t: BankTransactionDTO) => (
    <>
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
          className="ml-2 text-xs text-blue-600 hover:underline dark:text-blue-400 max-lg:ml-0 max-lg:inline-flex max-lg:min-h-11 max-lg:items-center max-lg:px-2 max-lg:text-mf-patrimonio dark:max-lg:text-mf-tranquilidade"
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
    </>
  );

  const colunasMobile: ResponsiveColumn<BankTransactionDTO>[] = [
    {
      id: 'descricao',
      header: 'Descrição',
      mobile: 'primary',
      cell: (t) => (
        <span className="[overflow-wrap:anywhere]">{t.merchantName ?? t.description}</span>
      ),
    },
    {
      id: 'data',
      header: 'Data',
      mobile: 'subtitle',
      cell: (t) => (
        <>
          {dataCurta(t.date)}
          {t.providerCategory ? ` · ${t.providerCategory}` : ''}
        </>
      ),
    },
    {
      id: 'marcas',
      header: '',
      mobile: 'subtitle',
      cell: (t) => <span className="-ml-2 flex flex-wrap items-center">{marcas(t)}</span>,
    },
    {
      id: 'valor',
      header: 'Valor',
      mobile: 'value',
      cell: (t) => {
        const saida = t.amount < 0;
        return (
          <span
            className={
              saida
                ? 'text-[#D92D20] dark:text-[#F97066]'
                : 'text-mf-patrimonio dark:text-mf-tranquilidade'
            }
          >
            {saida ? '−' : '+'}
            {formatBRL(Math.abs(t.amount))}
          </span>
        );
      },
    },
  ];

  return (
    <div
      className={
        noSheet
          ? undefined
          : 'rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]'
      }
    >
      {noSheet ? (
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          Importado do banco. Para lançar no Fluxo de Caixa, use a Caixa de entrada.
        </p>
      ) : (
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
      )}

      {isLoading ? <LoadingSpinner size="md" text="Carregando extrato..." /> : null}
      {isError ? <p className="text-sm text-red-600 dark:text-red-400">{error?.message}</p> : null}

      {data ? (
        <>
          {isBelowLg ? (
            <ResponsiveCardList
              columns={colunasMobile}
              rows={data.transactions}
              getRowKey={(t) => t.id}
              ariaLabel={`Extrato de ${conta.name}`}
              emptyState="Nenhuma transação no período importado."
            />
          ) : (
            <div className={TABLE_STYLES.wrapper}>
              <Table className={TABLE_STYLES.table} aria-label={`Extrato de ${conta.name}`}>
                <TableHeader>
                  <TableRow className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
                    {['Data', 'Descrição', 'Categoria', 'Valor'].map((h) => (
                      <TableCell
                        key={h}
                        isHeader
                        className={`${TABLE_STYLES.th} ${h === 'Valor' ? 'text-right' : 'text-left'}`}
                      >
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.transactions.length === 0 ? (
                    <TableRow className={TABLE_STYLES.placeholderRow}>
                      <TableCell
                        className={`${TABLE_STYLES.td} text-gray-500 dark:text-gray-400`}
                        colSpan={4}
                      >
                        Nenhuma transação no período importado.
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {data.transactions.map((t) => {
                    // Sinal do valor: negativo = saída (vale para conta e para cartão,
                    // onde alguns conectores marcam compra como CREDIT).
                    const saida = t.amount < 0;
                    return (
                      <TableRow key={t.id} className={TABLE_STYLES.row}>
                        <TableCell className={`${TABLE_STYLES.td} whitespace-nowrap`}>
                          {new Date(t.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                        </TableCell>
                        <TableCell
                          className={`${TABLE_STYLES.td} text-gray-800 dark:text-white/90`}
                        >
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
                        <TableCell
                          className={`${TABLE_STYLES.td} text-gray-500 dark:text-gray-400`}
                        >
                          {t.providerCategory ?? '—'}
                        </TableCell>
                        <TableCell
                          className={`${TABLE_STYLES.td} whitespace-nowrap text-right font-medium tabular-nums ${
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
          )}
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
