'use client';

import React from 'react';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import { formatBRL } from '@/utils/format';
import { CARTEIRA_CLASS_TABS, type CarteiraCategoria } from './carteiraTabsConfig';

type Distribuicao = Partial<Record<CarteiraCategoria, { valor: number; percentual: number }>>;

export interface ClassePickerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  activeId: string;
  onSelect: (id: string) => void;
  distribuicao: Distribuicao;
  /** Denominador do % (patrimônio investível, sem imóveis: `resumo.totais.dinheiro`). */
  totalDinheiro: number;
}

const formatPct = (v: number) =>
  `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/**
 * "Todas" as classes da carteira num painel (PWA fase 1, só celular): nome completo, valor e % da
 * carteira de cada aba. Só lê o resumo; tocar troca a aba e fecha. Rádios de 48px.
 */
export default function ClassePickerSheet({
  isOpen,
  onClose,
  activeId,
  onSelect,
  distribuicao,
  totalDinheiro,
}: ClassePickerSheetProps) {
  const detalhe = (categoria: CarteiraCategoria | null): string => {
    if (!categoria) return 'Resumo, mercado e alocação';
    const valor = distribuicao[categoria]?.valor ?? 0;
    if (valor <= 0) return 'Vazia';
    if (categoria === 'imoveisBens') return `${formatBRL(valor)} · fora da rentabilidade`;
    const pct = totalDinheiro > 0 ? (valor / totalDinheiro) * 100 : 0;
    return `${formatBRL(valor)} · ${formatPct(pct)} da carteira`;
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Classes da carteira">
      <div
        role="radiogroup"
        aria-label="Classes da carteira"
        className="flex flex-col gap-1 pb-[calc(env(safe-area-inset-bottom)+8px)]"
      >
        {CARTEIRA_CLASS_TABS.map((tab) => {
          const checked = tab.id === activeId;
          const vazia = tab.categoria !== null && (distribuicao[tab.categoria]?.valor ?? 0) <= 0;
          return (
            <button
              key={tab.id}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => {
                onSelect(tab.id);
                onClose();
              }}
              className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left active:bg-gray-100 dark:active:bg-white/5 ${
                checked ? 'bg-mf-tranquilidade/[0.18] dark:bg-mf-tranquilidade/[0.14]' : ''
              }`}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  className={`text-[15px] font-semibold ${
                    vazia ? 'text-gray-500 dark:text-gray-400' : 'text-gray-800 dark:text-white/90'
                  }`}
                >
                  {tab.label}
                </span>
                <span className="text-[12.5px] tabular-nums text-gray-600 dark:text-gray-400">
                  {detalhe(tab.categoria)}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                  checked
                    ? 'border-mf-seguranca dark:border-mf-tranquilidade'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              >
                {checked && (
                  <span className="h-2.5 w-2.5 rounded-full bg-mf-seguranca dark:bg-mf-tranquilidade" />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}
