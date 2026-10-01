'use client';
import React, { type ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { secaoDropId, useCarteiraMover, type SecaoDropData } from './CarteiraDnd';

/**
 * Uma seção da tabela da aba como ALVO de soltar (mover investimentos, out/2026): o `<tbody>`
 * inteiro — faixa, linhas e as linhas vazias que o GenericAssetTable já desenha nas seções sem
 * ativo. Não existe "entre a linha X e Y": a seção é o destino.
 *
 * Realce só durante o arrasto de uma linha de OUTRA seção: tinta `outside` 9% (16% no escuro)
 * no grupo; a faixa ganha o traço inferior e o "Soltar aqui" (via `realce` do render prop).
 */
export const SECAO_REALCE_CLASS = 'bg-[#0079F2]/[0.09] dark:bg-[#0079F2]/[0.16]';
/** Traço inferior de 3px `outside` nas células da faixa da seção sob o arrasto. */
export const SECAO_FAIXA_REALCE_CLASS = 'shadow-[inset_0_-3px_0_#0079F2]';

interface SecaoDropRowProps {
  data: SecaoDropData;
  children: (realce: boolean) => ReactNode;
}

export function SecaoDropRow({ data, children }: SecaoDropRowProps) {
  const id = secaoDropId(data.categoria, data.sectionKey);
  const { setNodeRef, isOver } = useDroppable({ id, data });
  const mover = useCarteiraMover();
  const realce = !!mover?.ativo && isOver && mover.ativo.secaoDropId !== id;
  return (
    <tbody
      ref={setNodeRef}
      data-mover-secao={data.subgrupo}
      data-drop-on={realce ? 'true' : undefined}
      className={realce ? SECAO_REALCE_CLASS : undefined}
    >
      {children(realce)}
    </tbody>
  );
}
