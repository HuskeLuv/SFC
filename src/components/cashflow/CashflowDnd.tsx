'use client';
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { VALUE_POSITIVE_CLASS } from './cashflowGridStyles';

/**
 * Drag-and-drop das linhas do fluxo de caixa: a linha é arrastada pela alça
 * (⠿). Solta numa irmã, reordena (16/09/2026); solta numa linha ou no
 * cabeçalho de OUTRO grupo, muda de seção (pedido do Pedro 24/09/2026) —
 * entra antes/depois da linha alvo, ou no fim do grupo pelo cabeçalho.
 * Linhas-espelho (sonho/dívida) e grupos calculados continuam presos.
 */

/** Dados que cada linha/cabeçalho arrastável ou alvo carrega. */
export interface SortableRowData {
  groupId: string;
  name: string;
  /** Nome do grupo, para a etiqueta "→ destino" enquanto arrasta. */
  groupName?: string;
  /** 'grupo' = cabeçalho (solta no fim); padrão = linha. */
  kind?: 'item' | 'grupo';
  /** A linha arrastada pode sair do grupo (não é espelho de sonho/dívida). */
  movable?: boolean;
  /** Alvo aceita linha vinda de outro grupo (grupo de lançamento manual). */
  acceptsDrop?: boolean;
  [key: string]: unknown;
}

/** Id do alvo "cabeçalho do grupo" (não colide com ids de linha). */
export const groupDropId = (groupId: string) => `grupo:${groupId}`;

const dataOf = (x: { data: { current?: unknown } }) =>
  x.data.current as SortableRowData | undefined;

/**
 * Alvos válidos: irmãs do mesmo grupo (reordenar) e, se a linha pode sair,
 * linhas/cabeçalhos de outros grupos que aceitam linha. Com mouse/toque vale
 * a linha sob o PONTEIRO (a etiqueta cobre duas linhas e errava o cabeçalho);
 * sem ponteiro (teclado) ou entre linhas, o que a etiqueta sobrepõe. Nada
 * sobreposto (arrastou pro vazio) → soltar cancela, e as linhas voltam.
 */
export const rowCollision: CollisionDetection = (args) => {
  const active = dataOf(args.active);
  const candidates = args.droppableContainers.filter((container) => {
    const d = dataOf(container);
    if (!d || !active) return false;
    if (d.groupId === active.groupId) return d.kind !== 'grupo';
    return !!active.movable && !!d.acceptsDrop;
  });
  if (args.pointerCoordinates) {
    const underPointer = pointerWithin({ ...args, droppableContainers: candidates });
    if (underPointer.length > 0) return underPointer.slice(0, 1);
  }
  const touching = new Set(
    rectIntersection({ ...args, droppableContainers: candidates }).map((c) => c.id),
  );
  if (touching.size === 0) return [];
  return closestCenter({
    ...args,
    droppableContainers: candidates.filter((container) => touching.has(container.id)),
  });
};

/** Onde a linha vai entrar quando cruza de grupo (para o traço azul). */
export interface DropHint {
  overId: string;
  /** true = depois da linha alvo; cabeçalho é sempre "no fim". */
  after: boolean;
}

const DropHintContext = createContext<DropHint | null>(null);

/** Alvo atual de uma linha vinda de OUTRO grupo (null fora do arrasto). */
export const useDropHint = () => useContext(DropHintContext);

interface CashflowDndProviderProps {
  /** Chamado ao soltar em outra linha do mesmo grupo. */
  onReorder: (groupId: string, activeId: string, overId: string) => void;
  /**
   * Chamado ao soltar em outro grupo: `overId` null = cabeçalho (fim do grupo);
   * `after` diz se entra depois da linha alvo.
   */
  onMove?: (activeId: string, toGroupId: string, overId: string | null, after: boolean) => void;
  /**
   * Sem arrastar (grade só de leitura do celular, PWA fase 2): nenhum sensor e sem fantasma. O
   * contexto continua montado porque as linhas usam `useSortable`/`useDroppable`.
   */
  disabled?: boolean;
  children: React.ReactNode;
}

const NO_SENSORS: ReturnType<typeof useSensors> = [];

type OverLike = DragOverEvent['over'];
type ActiveLike = DragOverEvent['active'];

/** Ponteiro (ou centro da linha arrastada) abaixo do meio do alvo → entra depois. */
function isAfter(
  active: ActiveLike,
  over: NonNullable<OverLike>,
  pointerY: number | null,
): boolean {
  const middle = over.rect.top + over.rect.height / 2;
  if (pointerY !== null) return pointerY > middle;
  const rect = active.rect.current.translated;
  return rect ? rect.top + rect.height / 2 > middle : false;
}

/** Y do ponteiro no fim do movimento (mouse ou toque); null no teclado. */
function pointerY(event: DragOverEvent): number | null {
  const start = event.activatorEvent;
  let y: number | null = null;
  if (start instanceof MouseEvent) y = start.clientY;
  else if (typeof TouchEvent !== 'undefined' && start instanceof TouchEvent)
    y = start.touches[0]?.clientY ?? null;
  return y === null ? null : y + event.delta.y;
}

export const CashflowDndProvider: React.FC<CashflowDndProviderProps> = ({
  onReorder,
  onMove,
  disabled = false,
  children,
}) => {
  const [activeName, setActiveName] = useState<string | null>(null);
  const [destino, setDestino] = useState<string | null>(null);
  const [hint, setHint] = useState<DropHint | null>(null);

  // Mouse: começa a arrastar depois de 4px (clique simples continua clique).
  // Toque: só depois de segurar 250ms — senão briga com a rolagem horizontal
  // da planilha. Teclado: espaço pega, setas movem, espaço solta.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const reset = useCallback(() => {
    setActiveName(null);
    setDestino(null);
    setHint(null);
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveName(dataOf(event.active)?.name ?? null);
  }, []);

  // Atualiza destino/traço só quando mudam (onDragMove dispara a cada pixel).
  const track = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    const a = dataOf(active);
    const o = over ? dataOf(over) : undefined;
    if (!over || !a || !o || o.groupId === a.groupId) {
      setDestino(null);
      setHint((prev) => (prev ? null : prev));
      return;
    }
    const after = o.kind === 'grupo' ? true : isAfter(active, over, pointerY(event));
    const overId = String(over.id);
    setDestino(o.groupName ?? null);
    setHint((prev) =>
      prev && prev.overId === overId && prev.after === after ? prev : { overId, after },
    );
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      reset();
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const activeData = dataOf(active);
      const overData = dataOf(over);
      if (!activeData || !overData) return;
      if (activeData.groupId === overData.groupId) {
        if (overData.kind === 'grupo') return;
        onReorder(activeData.groupId, String(active.id), String(over.id));
        return;
      }
      if (!onMove || !activeData.movable || !overData.acceptsDrop) return;
      if (overData.kind === 'grupo') {
        onMove(String(active.id), overData.groupId, null, true);
      } else {
        onMove(
          String(active.id),
          overData.groupId,
          String(over.id),
          isAfter(active, over, pointerY(event)),
        );
      }
    },
    [onReorder, onMove, reset],
  );

  const accessibility = useMemo(
    () => ({
      screenReaderInstructions: {
        draggable:
          'Para mover, pressione espaço na alça da linha, use as setas para cima e para baixo — inclusive para outra seção — e pressione espaço de novo para soltar. Pressione Esc para cancelar.',
      },
      announcements: {
        onDragStart: ({ active }: { active: { data: { current?: unknown } } }) =>
          `Linha ${dataOf(active)?.name ?? ''} selecionada.`,
        onDragOver: () => undefined,
        onDragEnd: ({ over }: { over: unknown }) =>
          over ? 'Linha solta na nova posição.' : 'Linha voltou para a posição original.',
        onDragCancel: () => 'Movimento cancelado.',
      },
    }),
    [],
  );

  return (
    <DndContext
      sensors={disabled ? NO_SENSORS : sensors}
      collisionDetection={rowCollision}
      modifiers={[restrictToVerticalAxis]}
      onDragStart={handleDragStart}
      onDragOver={track}
      onDragMove={track}
      onDragEnd={handleDragEnd}
      onDragCancel={reset}
      accessibility={accessibility}
    >
      <DropHintContext.Provider value={hint}>{children}</DropHintContext.Provider>
      {/* Fantasma: uma etiqueta com o nome da linha (uma <tr> inteira fora
          da tabela não renderiza; as linhas reais abrem espaço no destino).
          Cruzando de grupo, mostra para onde vai. */}
      {disabled ? null : (
        <DragOverlay dropAnimation={null}>
          {activeName ? (
            <div className="pointer-events-none inline-flex max-w-[360px] items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 shadow-lg dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
              <span aria-hidden className="text-gray-400">
                ⠿
              </span>
              <span className="truncate">{activeName}</span>
              {destino ? (
                <span className={`shrink-0 truncate ${VALUE_POSITIVE_CLASS}`}>→ {destino}</span>
              ) : null}
            </div>
          ) : null}
        </DragOverlay>
      )}
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
