'use client';
import React from 'react';
import { useIRMensal, type IRRendaVariavelCategory } from '@/hooks/useIR';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import IRSummaryCard from './IRSummaryCard';
import IRStateMessage from './IRStateMessage';
import { CATEGORIA_LABEL, formatBRL, formatYearMonth } from './irFormatters';
import { TABLE_STYLES, TABLE_HEADER_STYLE } from '@/components/ui/table/tableStyles';

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
        {/* 2.18 (auditoria jul/2026): os cards ficam verdes quando o prejuízo
            acumulado é MAIOR — sem contexto, lia-se invertido. O subtext
            explicita que é crédito compensável (abate lucros futuros). */}
        <IRSummaryCard
          label="Prejuízo — RV Comum"
          value={formatBRL(data.saldosPrejuizoAtual.rvComum)}
          subtext="Crédito compensável em lucros futuros — pool ações + ETF"
          color={
            data.saldosPrejuizoAtual.rvComum > 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : undefined
          }
        />
        <IRSummaryCard
          label="Prejuízo — FII"
          value={formatBRL(data.saldosPrejuizoAtual.fii)}
          subtext="Crédito compensável em lucros futuros — pool separado de FII"
          color={
            data.saldosPrejuizoAtual.fii > 0 ? 'text-emerald-600 dark:text-emerald-400' : undefined
          }
        />
      </div>

      <div className={TABLE_STYLES.wrapper}>
        <table className={TABLE_STYLES.table}>
          <thead>
            <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
              <th className={`${TABLE_STYLES.th} text-left`}>Mês</th>
              {CATEGORIES.map((cat) => (
                <th key={cat} className={`${TABLE_STYLES.th} text-right`}>
                  {CATEGORIA_LABEL[cat]}
                </th>
              ))}
              <th className={`${TABLE_STYLES.th} text-right`}>Total IR</th>
            </tr>
          </thead>
          <tbody>
            {data.meses.map((mes) => (
              <tr key={mes.yearMonth} className={`${TABLE_STYLES.row} ${TABLE_STYLES.rowHover}`}>
                <td
                  className={`${TABLE_STYLES.td} whitespace-nowrap font-medium text-gray-900 dark:text-white`}
                >
                  {formatYearMonth(mes.yearMonth)}
                </td>
                {CATEGORIES.map((cat) => {
                  const r = mes.porCategoria[cat];
                  if (!r) {
                    return (
                      <td key={cat} className={`${TABLE_STYLES.td} text-right`}>
                        <span className="text-gray-400">—</span>
                      </td>
                    );
                  }
                  return (
                    <td key={cat} className={`${TABLE_STYLES.td} whitespace-nowrap text-right`}>
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
                <td
                  className={`${TABLE_STYLES.td} whitespace-nowrap text-right font-semibold text-gray-900 dark:text-white`}
                >
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
