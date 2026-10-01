'use client';
import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { MoverAlvo } from '@/types/carteiraMover';
import { linhaDragId, type LinhaDragData } from './CarteiraDnd';

/**
 * Alça ⠿ de uma linha movível (mesmo visual do `ItemRow` do Fluxo): botão de 24×28px, 45% de
 * opacidade em repouso e 100% no hover da linha (`group/linha`) ou no foco. `touch-none`: no
 * toque, segurar pega a linha sem rolar. Teclado: espaço pega, setas, espaço solta, Esc cancela
 * (instruções no `aria-describedby` do dnd-kit).
 */
interface DragHandleCellProps {
  alvo: MoverAlvo;
  secaoDropId: string;
  secaoLabel: string;
  disabled?: boolean;
}

export function DragHandleCell({ alvo, secaoDropId, secaoLabel, disabled }: DragHandleCellProps) {
  const data: LinhaDragData = { kind: 'linha', alvo, secaoDropId, secaoLabel };
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: linhaDragId(alvo),
    data,
    disabled,
  });
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      disabled={disabled}
      data-mover-alca={alvo.id}
      aria-label={`Arrastar ${alvo.label}`}
      title="Arraste para outra seção ou aba"
      className="inline-grid h-7 w-6 shrink-0 cursor-grab touch-none place-items-center rounded-md text-sm leading-none text-gray-500 opacity-45 transition-opacity select-none group-hover/linha:opacity-100 hover:bg-gray-100 hover:text-gray-800 focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-[#0079F2] focus-visible:outline-none active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-30 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-100 dark:focus-visible:ring-mf-tranquilidade"
    >
      <span aria-hidden>⠿</span>
    </button>
  );
}
