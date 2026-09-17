'use client';
import React, { useCallback, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

/**
 * Drag-and-drop das linhas do fluxo de caixa (pedido 16/09/2026): a linha é
 * arrastada pela alça (⠿) e solta em outra posição DO MESMO grupo/subgrupo.
 * Soltar fora do grupo não faz nada. O backend já rejeita item de outro
 * grupo; aqui a restrição é visual — a colisão só enxerga irmãos.
 */

/** Dados que cada linha arrastável carrega (lidos na colisão e no drop). */
export interface SortableRowData {
  groupId: string;
  name: string;
  [key: string]: unknown;
}

/**
 * Só considera alvos do MESMO grupo da linha arrastada, e só os que a linha
 * está de fato sobrepondo: arrastar para longe do grupo (outra seção, cabeçalho,
 * fora da tabela) não encontra alvo → soltar ali cancela, e as linhas voltam.
 */
export const sameGroupCollision: CollisionDetection = (args) => {
  const groupId = (args.active.data.current as SortableRowData | undefined)?.groupId;
  const siblings = args.droppableContainers.filter(
    (container) => (container.data.current as SortableRowData | undefined)?.groupId === groupId,
  );
  const touching = new Set(
    rectIntersection({ ...args, droppableContainers: siblings }).map((c) => c.id),
  );
  if (touching.size === 0) return [];
  return closestCenter({
    ...args,
    droppableContainers: siblings.filter((container) => touching.has(container.id)),
  });
};

interface CashflowDndProviderProps {
  /** Chamado ao soltar em outra linha do mesmo grupo. */
  onReorder: (groupId: string, activeId: string, overId: string) => void;
  children: React.ReactNode;
}

export const CashflowDndProvider: React.FC<CashflowDndProviderProps> = ({
  onReorder,
  children,
}) => {
  const [activeName, setActiveName] = useState<string | null>(null);

  // Mouse: começa a arrastar depois de 4px (clique simples continua clique).
  // Toque: só depois de segurar 250ms — senão briga com a rolagem horizontal
  // da planilha. Teclado: espaço pega, setas movem, espaço solta.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveName((event.active.data.current as SortableRowData | undefined)?.name ?? null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveName(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const activeData = active.data.current as SortableRowData | undefined;
      const overData = over.data.current as SortableRowData | undefined;
      if (!activeData || !overData || activeData.groupId !== overData.groupId) return;
      onReorder(activeData.groupId, String(active.id), String(over.id));
    },
    [onReorder],
  );

  const accessibility = useMemo(
    () => ({
      screenReaderInstructions: {
        draggable:
          'Para reordenar, pressione espaço na alça da linha, use as setas para cima e para baixo e pressione espaço de novo para soltar. Pressione Esc para cancelar.',
      },
      announcements: {
        onDragStart: ({ active }: { active: { data: { current?: unknown } } }) =>
          `Linha ${(active.data.current as SortableRowData | undefined)?.name ?? ''} selecionada.`,
        onDragOver: () => undefined,
        onDragEnd: ({ over }: { over: unknown }) =>
          over ? 'Linha solta na nova posição.' : 'Linha voltou para a posição original.',
        onDragCancel: () => 'Reordenação cancelada.',
      },
    }),
    [],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={sameGroupCollision}
      modifiers={[restrictToVerticalAxis]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveName(null)}
      accessibility={accessibility}
    >
      {children}
      {/* Fantasma: uma etiqueta com o nome da linha (uma <tr> inteira fora
          da tabela não renderiza; as linhas reais abrem espaço no destino). */}
      <DragOverlay dropAnimation={null}>
        {activeName ? (
          <div className="pointer-events-none inline-flex max-w-[260px] items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 shadow-lg dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
            <span aria-hidden className="text-gray-400">
              ⠿
            </span>
            <span className="truncate">{activeName}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

interface SortableGroupItemsProps {
  groupId: string;
  itemIds: string[];
  children: React.ReactNode;
}

/** Lista ordenável de um grupo (não gera DOM — cabe dentro do <tbody>). */
export const SortableGroupItems: React.FC<SortableGroupItemsProps> = ({
  groupId,
  itemIds,
  children,
}) => (
  <SortableContext id={groupId} items={itemIds} strategy={verticalListSortingStrategy}>
    {children}
  </SortableContext>
);
