// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EditableItemRow } from '@/components/cashflow/EditableItemRow';
import type { CashflowItem, CashflowGroup } from '@/types/cashflow';

const group: CashflowGroup = {
  id: 'grp-1',
  userId: 'u1',
  name: 'Planejamento Financeiro',
  type: 'investimento_plan',
  parentId: null,
  orderIndex: 0,
  items: [],
  children: [],
};

function buildItem(overrides: Partial<CashflowItem> = {}): CashflowItem {
  return {
    id: overrides.id ?? 'item-1',
    userId: 'u1',
    groupId: 'grp-1',
    name: overrides.name ?? 'Comprar Corolla',
    significado: overrides.significado ?? null,
    rank: overrides.rank ?? 'normal',
    values: overrides.values ?? [],
    objetivoId: overrides.objetivoId ?? null,
  };
}

function renderRow(props: Partial<React.ComponentProps<typeof EditableItemRow>> = {}) {
  const item = props.item ?? buildItem();
  return render(
    <table>
      <tbody>
        <EditableItemRow
          item={item}
          editedData={null}
          group={group}
          itemTotals={Array(12).fill(0)}
          itemAnnualTotal={0}
          itemPercentage={0}
          isEditing={true}
          onUpdateField={vi.fn()}
          onDeleteItem={vi.fn()}
          {...props}
        />
      </tbody>
    </table>,
  );
}

describe('EditableItemRow — objetivoLocked (linha 🎯 de sonho)', () => {
  it('linha de objetivo: valores editáveis (inputs) mas nome travado com 🎯', () => {
    renderRow({
      item: buildItem({ objetivoId: 'obj-1', name: 'Comprar Corolla' }),
      objetivoLocked: true,
    });

    // Nome aparece como texto travado, com 🎯 — NÃO como input.
    expect(screen.getByText('🎯')).toBeInTheDocument();
    expect(screen.getByText('Comprar Corolla')).toBeInTheDocument();

    // Mas há inputs de valor editáveis (células do mês).
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.length).toBeGreaterThan(0);
    // Nenhum input tem o nome do item como valor (nome não é editável).
    for (const el of inputs) {
      expect((el as HTMLInputElement).value).not.toBe('Comprar Corolla');
    }
  });

  it('linha de objetivo: sem botão de excluir', () => {
    renderRow({ item: buildItem({ objetivoId: 'obj-1' }), objetivoLocked: true });
    expect(screen.queryByLabelText(/remover|excluir|delete/i)).not.toBeInTheDocument();
  });

  it('linha NORMAL (sem objetivo): nome é editável via input', () => {
    renderRow({ item: buildItem({ name: 'Aluguel', objetivoId: null }), objetivoLocked: false });
    // O nome aparece como valor de um input (campo editável).
    const nameInput = screen
      .getAllByRole('textbox')
      .find((el) => (el as HTMLInputElement).value === 'Aluguel');
    expect(nameInput).toBeTruthy();
    // E não renderiza o marcador de sonho.
    expect(screen.queryByText('🎯')).not.toBeInTheDocument();
  });
});
