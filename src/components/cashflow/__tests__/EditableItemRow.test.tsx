// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
    dividaId: overrides.dividaId ?? null,
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

describe('EditableItemRow — linha de dívida (💳)', () => {
  it('nome, porquê e nível travados, sem excluir, com "Gerida em Dívidas"', () => {
    renderRow({ item: buildItem({ dividaId: 'div-1', name: 'Financiamento' }) });
    expect(screen.queryByLabelText('Nome do item')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('O seu porquê')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nível de prioridade')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/remover|excluir|delete/i)).not.toBeInTheDocument();
    expect(screen.getByTitle('Gerida em Dívidas')).toBeInTheDocument();
    expect(screen.getByText('Financiamento')).toBeInTheDocument();
  });
});

describe('EditableItemRow — excluir em categoria com Geral (86e3vxd5r)', () => {
  const comValores = () =>
    buildItem({
      id: 'cond',
      name: 'Condomínio antigo',
      values: [
        { id: 'v1', itemId: 'cond', userId: 'u1', year: 2026, month: 0, value: 2900 },
        {
          id: 'v2',
          itemId: 'cond',
          userId: 'u1',
          year: 2026,
          month: 1,
          value: 300,
          valorBanco: 120,
        },
      ] as CashflowItem['values'],
    });

  it('pergunta e manda o destino escolhido', () => {
    const onDeleteItem = vi.fn();
    renderRow({ item: comValores(), temGeralNaCategoria: true, onDeleteItem, currentYear: 2026 });
    fireEvent.click(screen.getByRole('button', { name: 'Deletar item' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Excluir “Condomínio antigo”?');
    expect(dialog).toHaveTextContent('2 meses');
    expect(dialog).toHaveTextContent('vieram do banco (Open Finance)');
    expect(onDeleteItem).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Apagar os valores' }));
    expect(onDeleteItem).toHaveBeenCalledWith('cond', 'apagar');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Cancelar não exclui; Mover para Geral manda geral', () => {
    const onDeleteItem = vi.fn();
    renderRow({ item: comValores(), temGeralNaCategoria: true, onDeleteItem, currentYear: 2026 });
    fireEvent.click(screen.getByRole('button', { name: 'Deletar item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onDeleteItem).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Deletar item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mover para Geral' }));
    expect(onDeleteItem).toHaveBeenCalledWith('cond', 'geral');
  });

  it('sem Geral na categoria ou sem valores: exclui direto, como antes', () => {
    const onDeleteItem = vi.fn();
    renderRow({ item: comValores(), onDeleteItem });
    fireEvent.click(screen.getByRole('button', { name: 'Deletar item' }));
    expect(onDeleteItem).toHaveBeenCalledWith('cond');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
