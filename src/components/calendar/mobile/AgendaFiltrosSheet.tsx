'use client';

import React from 'react';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import type { TipoEvento } from '@/hooks/useAgenda';
import { TIPOS_DISPONIVEIS, TIPOS_META, corDoTipo } from '../agendaTipos';

interface AgendaFiltrosSheetProps {
  isOpen: boolean;
  onClose: () => void;
  tipos: Set<TipoEvento>;
  /** Eventos de cada tipo no período visível (mesma contagem do cartão "Mostrar" do desktop). */
  contagem: Map<TipoEvento, number>;
  theme: 'light' | 'dark';
  /** O MESMO alternarTipo do desktop (grava a preferência local). */
  onAlternar: (tipo: TipoEvento) => void;
  /** Eventos que ficam visíveis com os filtros atuais (rótulo do botão do rodapé). */
  totalVisiveis: number;
}

/**
 * Tipos de evento da Agenda em sheet (PWA fase 3, abaixo de 768px): o cartão "Mostrar" do desktop
 * vira uma lista de linhas role=checkbox de 52px com a cor do tipo. Tipos ainda não disponíveis
 * ("Mercado") aparecem desabilitados com "em breve".
 */
export default function AgendaFiltrosSheet({
  isOpen,
  onClose,
  tipos,
  contagem,
  theme,
  onAlternar,
  totalVisiveis,
}: AgendaFiltrosSheetProps) {
  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Mostrar na agenda"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="min-h-12 w-full rounded-xl bg-mf-seguranca px-4 text-sm font-semibold text-white dark:bg-mf-patrimonio"
        >
          Ver {totalVisiveis} evento{totalVisiveis !== 1 ? 's' : ''}
        </button>
      }
    >
      <div
        role="group"
        aria-label="Tipos de evento"
        className="divide-y divide-gray-100 pb-2 dark:divide-gray-800"
      >
        {TIPOS_META.map((m) => {
          const disponivel = TIPOS_DISPONIVEIS.includes(m.tipo);
          const marcado = tipos.has(m.tipo);
          const n = contagem.get(m.tipo) ?? 0;
          return (
            <button
              key={m.tipo}
              type="button"
              role="checkbox"
              aria-checked={marcado}
              aria-disabled={disponivel ? undefined : true}
              onClick={() => {
                if (disponivel) onAlternar(m.tipo);
              }}
              className={`flex min-h-[52px] w-full items-center gap-3 px-1 py-2 text-left ${
                disponivel ? '' : 'opacity-60'
              }`}
            >
              <span
                aria-hidden="true"
                className="h-3 w-3 shrink-0 rounded-sm"
                style={{ backgroundColor: corDoTipo(m.tipo, theme) }}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium text-gray-800 dark:text-white/90">
                  {m.label}
                  {disponivel && n > 0 ? (
                    <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">
                      ({n})
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {disponivel ? m.descricao : 'em breve'}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${
                  marcado && disponivel
                    ? 'border-mf-seguranca bg-mf-seguranca text-white dark:border-mf-tranquilidade dark:bg-mf-tranquilidade dark:text-gray-900'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              >
                {marcado && disponivel ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M5 12.5l4.5 4.5L19 7.5"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}
