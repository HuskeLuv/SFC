'use client';
import React from 'react';
import { useIRMensal, type IRRendaVariavelCategory } from '@/hooks/useIR';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import IRSummaryCard from './IRSummaryCard';
import IRStateMessage from './IRStateMessage';
import { CATEGORIA_LABEL, formatBRL, formatYearMonth } from './irFormatters';

const CATEGORIES: IRRendaVariavelCategory[] = ['acao_br', 'fii', 'etf_br'];

export default function IRMensalRendaVariavel() {
  const { data, isLoading, error } = useIRMensal();

  if (isLoading) return <LoadingSpinner text="Carregando apuração mensal..." />;
  if (error)
    return (
      <IRStateMessage
        variant="error"
        title="Erro ao carregar apuração mensal"
        description={(error as Error).message}
      />
    );
  if (!data || data.meses.length === 0)
    return (
      <IRStateMessage
        variant="empty"
        title="Sem operações para apurar"
        description="Cadastre operações de compra/venda de ações, FII ou ETF BR para ver a apuração mensal."
      />
    );

  const totalIR = data.meses.reduce((s, m) => s + m.irTotalDevido, 0);
  const mesesComIR = data.meses.filter((m) => m.irTotalDevido > 0).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <IRSummaryCard
          label="IR total acumulado"
          value={formatBRL(totalIR)}
          subtext={`${data.meses.length} meses apurados`}
          highlight
        />
        <IRSummaryCard
          label="Meses com IR a pagar"
          value={mesesComIR.toString()}
          subtext="DARF emitido por categoria"
        />
        <IRSummaryCard
          label="Prejuízo — RV Comum"
          value={formatBRL(data.saldosPrejuizoAtual.rvComum)}
          subtext="Pool compartilhado de ações + ETF"
          color={
            data.saldosPrejuizoAtual.rvComum > 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : undefined
          }
        />
        <IRSummaryCard
          label="Prejuízo — FII"
          value={formatBRL(data.saldosPrejuizoAtual.fii)}
          subtext="Pool separado (regra própria)"
          color={
            data.saldosPrejuizoAtual.fii > 0 ? 'text-emerald-600 dark:text-emerald-400' : undefined
          }
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-900/30">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Mês
              </th>
              {CATEGORIES.map((cat) => (
                <th
                  key={cat}
                  className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
                >
                  {CATEGORIA_LABEL[cat]}
                </th>
              ))}
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Total IR
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.meses.map((mes) => (
              <tr
                key={mes.yearMonth}
                className="transition-colors hover:bg-gray-50/50 dark:hover:bg-white/[0.02]"
              >
                <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900 dark:text-white">
                  {formatYearMonth(mes.yearMonth)}
                </td>
                {CATEGORIES.map((cat) => {
                  const r = mes.porCategoria[cat];
                  if (!r) {
                    return (
                      <td key={cat} className="px-4 py-3 text-right text-gray-400">
                        —
                      </td>
                    );
                  }
                  return (
                    <td key={cat} className="whitespace-nowrap px-4 py-3 text-right">
                      {r.isento ? (
                        <div>
                          <div className="text-emerald-600 dark:text-emerald-400">Isento</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Vendas {formatBRL(r.vendasTotal)}
                          </div>
                        </div>
                      ) : r.irDevido > 0 ? (
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {formatBRL(r.irDevido)}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Lucro {formatBRL(r.lucroTributavel)}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-gray-500">—</div>
                          {r.lucroBruto < 0 && (
                            <div className="text-xs text-red-500 dark:text-red-400">
                              Prej. {formatBRL(Math.abs(r.lucroBruto))}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">
                  {mes.irTotalDevido > 0 ? formatBRL(mes.irTotalDevido) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
