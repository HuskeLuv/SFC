// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ItemRow } from '../ItemRow';
import { CashflowDndProvider, SortableGroupItems, sameGroupCollision } from '../CashflowDnd';
import type { CashflowGroup, CashflowItem } from '@/types/cashflow';

const item = (id: string, groupId: string): CashflowItem => ({
  id,
  userId: 'u1',
  groupId,
  name: `Linha ${id}`,
  significado: null,
  rank: null,
  values: [],
});

const group = (id: string, type = 'despesa'): CashflowGroup => ({
  id,
  userId: 'u1',
  name: id,
  type,
  parentId: null,
  orderIndex: 1,
  items: [],
  children: [],
});

const renderRows = (rows: React.ReactNode, groupId = 'g1') =>
  render(
    <CashflowDndProvider onReorder={vi.fn()}>
      <table>
        <tbody>
          <SortableGroupItems groupId={groupId} itemIds={['a', 'b']}>
            {rows}
          </SortableGroupItems>
        </tbody>
      </table>
    </CashflowDndProvider>,
  );

describe('ItemRow — alça de arrastar (drag-and-drop 16/09/2026)', () => {
  it('linha reordenável mostra a alça acessível e não mostra mais as setinhas', () => {
    renderRows(
      <ItemRow
        item={item('a', 'g1')}
        itemTotals={Array(12).fill(0)}
        itemAnnualTotal={0}
        itemPercentage={0}
        group={group('g1')}
        reorderable
      />,
    );
    const handle = screen.getByRole('button', { name: 'Arrastar Linha a para reordenar' });
    expect(handle).toHaveAttribute('aria-roledescription', 'sortable');
    expect(handle.className).toContain('cursor-grab');
    expect(screen.queryByLabelText(/Mover .* para cima/)).toBeNull();
  });

  it('sem reorderable (grupos calculados) não há alça', () => {
    renderRows(
      <ItemRow
        item={item('a', 'g1')}
        itemTotals={Array(12).fill(0)}
        itemAnnualTotal={0}
        itemPercentage={0}
        group={group('g1', 'investimento')}
      />,
    );
    expect(screen.queryByRole('button', { name: /Arrastar/ })).toBeNull();
    expect(screen.getByText('Linha a')).toBeInTheDocument();
  });
});

describe('sameGroupCollision — só enxerga irmãos do mesmo grupo', () => {
  const container = (id: string, groupId: string, top: number) => ({
    id,
    data: { current: { groupId, name: id } },
    rect: { current: { top, left: 0, width: 100, height: 10, bottom: top + 10, right: 100 } },
    disabled: false,
    node: { current: null },
    key: id,
  });

  const containers = [
    container('a', 'g1', 0),
    container('outro', 'g2', 100), // mesma posição do cursor, grupo diferente
    container('b', 'g1', 105), // encosta na linha arrastada e é irmã
  ];
  // closestCenter lê os retângulos em droppableRects (não em container.rect).
  const droppableRects = new Map(containers.map((c) => [c.id, c.rect.current]));

  const collide = (activeId: string, activeGroup: string, top = 100) =>
    sameGroupCollision({
      active: { id: activeId, data: { current: { groupId: activeGroup, name: activeId } } },
      collisionRect: { top, left: 0, width: 100, height: 10, bottom: top + 10, right: 100 },
      droppableRects,
      droppableContainers: containers,
      pointerCoordinates: null,
    } as unknown as Parameters<typeof sameGroupCollision>[0]);

  it('ignora a linha de outro grupo mesmo sendo a mais próxima', () => {
    const [closest] = collide('a', 'g1');
    expect(closest.id).toBe('b');
  });

  it('linha de grupo sem irmãos não colide com nada', () => {
    expect(collide('x', 'g3')).toEqual([]);
  });

  it('longe de qualquer irmã (fora do grupo) não há alvo → soltar cancela', () => {
    expect(collide('a', 'g1', 400)).toEqual([]);
  });
});
