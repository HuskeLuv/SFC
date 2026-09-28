'use client';

import React, { useState } from 'react';
import CardSectionBand from '@/components/ui/table/CardSectionBand';
import { TABLE_MOBILE_STYLES } from '@/components/ui/table/tableStyles';
import type { QuadranteBalanco, QuadrantesBalanco } from '../BalancoPatrimonial';
import { formatBRL } from '../utils';

/**
 * Balanço patrimonial no celular (PWA fase 3): Ativo (curto e longo) → Passivo (curto e longo) →
 * Patrimônio Líquido, com os MESMOS rótulos e totais da tabela da planilha (`montarQuadrantes`).
 * Quem usa monta só no ramo `useIsBelowLg`, dentro de `hidden mscreen:block` (nunca imprime).
 */

interface BalancoMobileProps {
  quadrantes: QuadrantesBalanco;
}

function Quadrante({ id, quadrante }: { id: string; quadrante: QuadranteBalanco }) {
  const [aberto, setAberto] = useState(true);
  return (
    <div className="space-y-2">
      <CardSectionBand
        id={id}
        label={quadrante.titulo}
        subtotal={formatBRL(quadrante.total)}
        expanded={aberto}
        onToggle={() => setAberto((v) => !v)}
      />
      {aberto ? (
        <ul id={id} className="divide-y divide-gray-100 px-1 dark:divide-gray-800">
          {quadrante.itens.map((item) => (
            <li key={item.key} className="flex items-start justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 text-gray-700 dark:text-gray-200">{item.label}</span>
              <span
                className={`shrink-0 font-medium tabular-nums ${
                  item.valor === 0
                    ? 'text-gray-400 dark:text-gray-500'
                    : 'text-gray-900 dark:text-white/90'
                }`}
              >
                {formatBRL(item.valor)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <div
        className={`${TABLE_MOBILE_STYLES.totalCard} flex items-center justify-between gap-3 text-sm`}
      >
        <span className="font-semibold">{quadrante.totalLabel}</span>
        <span className="shrink-0 font-semibold tabular-nums">{formatBRL(quadrante.total)}</span>
      </div>
    </div>
  );
}

export default function BalancoMobile({ quadrantes }: BalancoMobileProps) {
  const pl = quadrantes.patrimonioLiquido;
  return (
    <div data-mf-mobile="" className="mt-2 space-y-5">
      <section aria-label="Ativo" className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Ativo
        </p>
        <Quadrante id="balanco-ativo-curto" quadrante={quadrantes.ativo.curto} />
        <Quadrante id="balanco-ativo-longo" quadrante={quadrantes.ativo.longo} />
      </section>
      <section aria-label="Passivo" className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Passivo
        </p>
        <Quadrante id="balanco-passivo-curto" quadrante={quadrantes.passivo.curto} />
        <Quadrante id="balanco-passivo-longo" quadrante={quadrantes.passivo.longo} />
      </section>
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 px-4 py-3.5 dark:border-gray-800">
        <span className="text-sm font-semibold text-gray-900 dark:text-white/90">
          Total do Patrimônio Líquido
        </span>
        <span
          className={`shrink-0 text-base font-semibold tabular-nums ${
            pl < 0 ? 'text-[#D92D20] dark:text-[#F97066]' : 'text-gray-900 dark:text-white/90'
          }`}
        >
          {formatBRL(pl)}
        </span>
      </div>
    </div>
  );
}
