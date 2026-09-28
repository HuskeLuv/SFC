'use client';

import React from 'react';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import type { DerivedKey, MonthDerived } from '@/lib/cashflow/monthViewModel';
import { MONTH_NAMES } from './MonthStepper';
import { CalcIcon, formatDerived } from './MonthDerivedRow';
import { signClass } from './MonthSummaryCard';

/**
 * Sheet SÓ LEITURA de uma linha calculada da visão do mês: valor do mês, a explicação da conta
 * (os mesmos textos dos tooltips da planilha de desktop, quando existem) e um mini-gráfico do ano.
 */

export const DERIVED_HELP: Record<DerivedKey, string> = {
  // SaldoContaCorrenteAnteriorRow (tooltip do desktop)
  saldoCcAnterior:
    'Janeiro puxa a Conta Corrente de dezembro do ano anterior; os demais meses puxam o bloco Conta Corrente do mês anterior. Não soma nas entradas — só compõe o Fluxo de Caixa livre.',
  inflacao:
    '(Despesas do mês ÷ despesas do mês anterior − 1) × 100. Janeiro é sempre 0%; se o mês anterior não tem despesas, não há cálculo.',
  saldoMes:
    'Total de Entradas − Despesas Fixas e Variáveis. Aporte/Resgate e Conta Corrente ficam de fora.',
  poupanca: 'Saldo do mês ÷ Total de Entradas × 100.',
  // SummaryRow "Fluxo de Caixa livre" (tooltip do desktop)
  fluxoLivre:
    'Saldo do mês + Saldo Conta Corrente do mês anterior − aportes/resgates do mês. Mês com aporte grande fica negativo: o dinheiro saiu do caixa livre e virou patrimônio investido.',
  evolucao:
    'Patrimônio do mês anterior + aportes do mês + Fluxo de Caixa livre do mês (sem o saldo da conta corrente do mês anterior, para não contar duas vezes). Considera o valor aplicado, sem a valorização de mercado; meses fechados usam o valor travado no último dia útil.',
  rendimentos: 'Proventos da Carteira pagos no mês. Não somam nas entradas nem no saldo do mês.',
  paz: 'Rendimentos Recebidos ÷ Despesas Fixas × 100. Mostra quanto das contas fixas a carteira já paga sozinha.',
};

export interface DerivedInfoSheetProps {
  row: MonthDerived | null;
  year: number;
  /** 0 = Jan … 11 = Dez. */
  month: number;
  onClose: () => void;
}

export default function DerivedInfoSheet({ row, year, month, onClose }: DerivedInfoSheetProps) {
  const series = row?.series ?? [];
  const max = Math.max(1, ...series.map((v) => Math.abs(v ?? 0)));
  const monthName = MONTH_NAMES[month] ?? '';
  return (
    <BottomSheet isOpen={!!row} onClose={onClose} title={row?.label}>
      {row ? (
        <div className="flex flex-col gap-4 pb-2">
          <p className="-mt-1 text-sm text-gray-500 dark:text-gray-400">
            {monthName} de {year} · calculado
          </p>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3.5 py-3 dark:bg-white/[0.04]">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Em {monthName.toLowerCase()}
              </p>
              <p
                className={`text-2xl font-semibold tabular-nums ${
                  (row.format === 'currency' && signClass(row.value)) ||
                  'text-gray-800 dark:text-white/90'
                }`}
              >
                {formatDerived(row.value, row.format)}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
              <CalcIcon size={16} />
              Calculado
            </span>
          </div>
          <div>
            <p className="text-[13px] font-medium text-gray-600 dark:text-gray-300">
              Como é calculado
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-800 dark:text-white/90">
              {DERIVED_HELP[row.helpKey]}
            </p>
          </div>
          <div aria-hidden="true">
            <div className="flex h-16 items-end gap-1">
              {series.map((v, i) => (
                <i
                  key={i}
                  className={`block flex-1 rounded-t-sm ${
                    (v ?? 0) < 0
                      ? 'bg-[#D92D20] dark:bg-[#F97066]'
                      : i === month
                        ? 'bg-mf-patrimonio dark:bg-mf-tranquilidade'
                        : 'bg-mf-tranquilidade/50 dark:bg-mf-tranquilidade/40'
                  } ${i === month ? '' : 'opacity-70'}`}
                  style={{ height: `${Math.max(4, (Math.abs(v ?? 0) / max) * 100)}%` }}
                />
              ))}
            </div>
            <div className="mt-1 flex gap-1 text-center text-[10px] text-gray-500 dark:text-gray-400">
              {MONTH_NAMES.map((n, i) => (
                <span key={n} className={`flex-1 ${i === month ? 'font-semibold' : ''}`}>
                  {n[0]}
                </span>
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Linha calculada: não dá para editar. Ela muda quando você altera as linhas que entram na
            conta.
          </p>
        </div>
      ) : null}
    </BottomSheet>
  );
}

export { DerivedInfoSheet };
