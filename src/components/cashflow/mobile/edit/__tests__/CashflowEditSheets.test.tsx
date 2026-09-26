// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { CashflowGroup, CashflowItem, CashflowValue } from '@/types/cashflow';
import CashflowEditSheets, {
  type CashflowEditTarget,
} from '@/components/cashflow/mobile/CashflowEditSheets';
import { applyFormulaKey } from '../FormulaKeyBar';
import { buildCellValueChange } from '../CellValuePanel';

const mocks = vi.hoisted(() => ({
  saveItemChanges: vi.fn(),
  createItem: vi.fn(),
  reorderItem: vi.fn(),
  moveItem: vi.fn(),
  fetchCellComment: vi.fn(),
  saveCellComment: vi.fn(),
}));

vi.mock('@/hooks/useCashflowMutations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useCashflowMutations')>();
  return { ...actual, useCashflowMutations: () => mocks };
});

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const value = (
  itemId: string,
  month: number,
  over: Partial<CashflowValue> = {},
): CashflowValue => ({
  id: `${itemId}-${month}`,
  itemId,
  userId: 'u1',
  year: 2026,
  month,
  value: 0,
  ...over,
});

const item = (id: string, groupId: string, over: Partial<CashflowItem> = {}): CashflowItem => ({
  id,
  userId: 'u1',
  groupId,
  name: id[0].toUpperCase() + id.slice(1),
  significado: null,
  rank: null,
  values: [],
  ...over,
});

const group = (over: Partial<CashflowGroup> & { id: string }): CashflowGroup => ({
  userId: 'u1',
  name: over.id,
  type: 'despesa',
  parentId: 'despesas',
  orderIndex: 0,
  items: [],
  children: [],
  ...over,
});

const GROUPS: CashflowGroup[] = [
  group({
    id: 'entradas',
    name: 'Entradas',
    type: 'entrada',
    parentId: null,
    children: [
      group({
        id: 'salarios',
        name: 'Salários',
        type: 'entrada',
        parentId: 'entradas',
        items: [item('salario', 'salarios', { values: [value('salario', 6, { value: 10000 })] })],
      }),
    ],
  }),
  group({
    id: 'despesas',
    name: 'Despesas',
    parentId: null,
    children: [
      group({
        id: 'moradia',
        name: 'Moradia',
        items: [
          item('aluguel', 'moradia', {
            values: [value('aluguel', 6, { value: 1000, color: 'red' })],
          }),
          item('internet', 'moradia', {
            values: [value('internet', 6, { value: 100, comment: 'Plano novo' })],
          }),
          item('mercado', 'moradia', {
            values: [value('mercado', 6, { value: 30, formula: '=10+20' })],
          }),
        ],
      }),
      group({ id: 'lazer', name: 'Lazer', items: [item('cinema', 'lazer')] }),
      group({
        id: 'dividas',
        name: 'Dívidas',
        items: [item('financiamento', 'dividas', { dividaId: 'd1' })],
      }),
      group({
        id: 'planejamento',
        name: 'Planejamento Financeiro',
        items: [
          item('viagem', 'planejamento', {
            objetivoId: 'o1',
            values: [value('viagem', 6, { value: 500 })],
          }),
        ],
      }),
    ],
  }),
  group({
    id: 'inv',
    name: 'Investimentos',
    type: 'investimento',
    parentId: null,
    items: [
      item('investimento-aporte', 'inv', {
        name: 'Aportes',
        values: [value('investimento-aporte', 6, { value: 2000 })],
      }),
    ],
  }),
];

const onSaved = vi.fn();
const onStartReorder = vi.fn();
let lastTarget: CashflowEditTarget | null = null;

function Harness({
  initial,
  groups = GROUPS,
}: {
  initial: CashflowEditTarget | null;
  groups?: CashflowGroup[];
}) {
  const [target, setTarget] = useState<CashflowEditTarget | null>(initial);
  lastTarget = target;
  return (
    <CashflowEditSheets
      year={2026}
      groups={groups}
      itemTotals={{}}
      target={target}
      onTargetChange={setTarget}
      onSaved={onSaved}
      onStartReorder={onStartReorder}
    />
  );
}

const cell = (itemId: string, groupId: string, view?: 'valor' | 'mover' | 'excluir') =>
  ({ kind: 'cell', itemId, groupId, month: 6, ...(view ? { view } : {}) }) as CashflowEditTarget;

const field = () => screen.getByLabelText('Valor de Julho') as HTMLInputElement;
const saveButton = () => screen.getByRole('button', { name: 'Salvar' });

describe('CashflowEditSheets', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    onSaved.mockReset();
    onStartReorder.mockReset();
    mocks.saveItemChanges.mockResolvedValue({
      ok: true,
      httpOk: true,
      treeUpdated: true,
      results: [],
    });
    mocks.fetchCellComment.mockResolvedValue({ comment: null, updatedAt: null });
    lastTarget = null;
  });
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('valor simples → um update com { month, value } e o aviso "Valor salvo"', async () => {
    render(<Harness initial={cell('internet', 'moradia')} />);
    expect(screen.getByRole('dialog', { name: 'Internet' })).toBeInTheDocument();
    expect(field().value).toBe('100,00');
    expect(field()).toHaveFocus();
    fireEvent.change(field(), { target: { value: '150,50' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Valor salvo', expect.anything()));
    expect(mocks.saveItemChanges).toHaveBeenCalledWith({
      groupId: 'moradia',
      updates: [{ itemId: 'internet', values: [{ month: 6, value: 150.5 }] }],
    });
    expect(onSaved).toHaveBeenCalledWith('Valor salvo', { itemId: 'internet', month: 6 });
    expect(lastTarget).toBeNull();
  });

  it("'=100+50' → 150 com a fórmula e a prévia", async () => {
    render(<Harness initial={cell('internet', 'moradia')} />);
    fireEvent.change(field(), { target: { value: '=100+50' } });
    expect(screen.getByText('= R$ 150,00')).toBeInTheDocument();
    fireEvent.click(saveButton());
    await waitFor(() => expect(mocks.saveItemChanges).toHaveBeenCalled());
    expect(mocks.saveItemChanges.mock.calls[0][0].updates[0].values).toEqual([
      { month: 6, value: 150, formula: '=100+50' },
    ]);
  });

  it("a tecla '−' insere o hífen ASCII e gera '=100-50' válido", async () => {
    render(<Harness initial={cell('internet', 'moradia')} />);
    fireEvent.change(field(), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Começar fórmula' }));
    expect(field().value).toBe('=100');
    fireEvent.click(screen.getByRole('button', { name: 'Menos' }));
    expect(field().value).toBe('=100-');
    expect(saveButton()).toBeDisabled();
    fireEvent.change(field(), { target: { value: `${field().value}50` } });
    expect(screen.getByText('= R$ 50,00')).toBeInTheDocument();
    fireEvent.click(saveButton());
    await waitFor(() => expect(mocks.saveItemChanges).toHaveBeenCalled());
    expect(mocks.saveItemChanges.mock.calls[0][0].updates[0].values).toEqual([
      { month: 6, value: 50, formula: '=100-50' },
    ]);
  });

  it('fórmula inválida trava o Salvar (nada vai ao servidor)', () => {
    render(<Harness initial={cell('internet', 'moradia')} />);
    fireEvent.change(field(), { target: { value: '=100+' } });
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(saveButton()).toBeDisabled();
  });

  it('número sobre fórmula → formula null', async () => {
    render(<Harness initial={cell('mercado', 'moradia')} />);
    expect(field().value).toBe('=10+20');
    fireEvent.change(field(), { target: { value: '40' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(mocks.saveItemChanges).toHaveBeenCalled());
    expect(mocks.saveItemChanges.mock.calls[0][0].updates[0].values).toEqual([
      { month: 6, value: 40, formula: null },
    ]);
  });

  it('só a situação → grava o hex da legenda', async () => {
    render(<Harness initial={cell('internet', 'moradia')} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Recebido' }));
    fireEvent.click(saveButton());
    await waitFor(() => expect(mocks.saveItemChanges).toHaveBeenCalled());
    expect(mocks.saveItemChanges.mock.calls[0][0].updates[0].values).toEqual([
      { month: 6, value: 100, color: '#76933C' },
    ]);
  });

  it("situação antiga 'red' vem marcada como 'Pago' (e sem mexer não regrava)", async () => {
    render(<Harness initial={cell('aluguel', 'moradia')} />);
    expect(screen.getByRole('radio', { name: 'Pago' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(saveButton());
    await waitFor(() => expect(lastTarget).toBeNull());
    expect(mocks.saveItemChanges).not.toHaveBeenCalled();
  });

  it('ok:false (linha recusada no results) → o sheet fica aberto com a mensagem', async () => {
    mocks.saveItemChanges.mockResolvedValue({
      ok: false,
      httpOk: true,
      treeUpdated: true,
      error: 'Sonho com ativos vinculados: o realizado vem da carteira',
      results: [{ itemId: 'internet', success: false }],
    });
    render(<Harness initial={cell('internet', 'moradia')} />);
    fireEvent.change(field(), { target: { value: '340,00' } });
    fireEvent.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Sonho com ativos vinculados');
    expect(screen.getByRole('dialog', { name: 'Internet' })).toBeInTheDocument();
    expect(field().value).toBe('340,00');
    expect(saveButton()).not.toBeDisabled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('exceção de rede → o sheet fica aberto', async () => {
    mocks.saveItemChanges.mockRejectedValue(new Error('offline'));
    render(<Harness initial={cell('internet', 'moradia')} />);
    fireEvent.change(field(), { target: { value: '1' } });
    fireEvent.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar');
    expect(lastTarget).not.toBeNull();
  });

  it('nada mudou → fecha sem request', async () => {
    render(<Harness initial={cell('internet', 'moradia')} />);
    fireEvent.click(saveButton());
    await waitFor(() => expect(lastTarget).toBeNull());
    expect(mocks.saveItemChanges).not.toHaveBeenCalled();
  });

  it('Aporte/Resgate em modo leitura: sem Salvar, com o motivo', () => {
    render(<Harness initial={cell('investimento-aporte', 'inv')} />);
    expect(screen.getByRole('dialog', { name: 'Aportes' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull();
    expect(screen.queryByLabelText('Valor de Julho')).toBeNull();
    expect(screen.getByText(/Calculado automaticamente da carteira/)).toBeInTheDocument();
    expect(screen.getByText('R$ 2.000,00')).toBeInTheDocument();
  });

  it('dívida: sem Renomear nem Excluir, com "Gerida em Dívidas"', () => {
    render(<Harness initial={cell('financiamento', 'dividas')} />);
    expect(screen.queryByRole('button', { name: /Renomear e porquê/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Excluir linha/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Mover/ })).toBeNull();
    expect(screen.getByText('Gerida em Dívidas')).toBeInTheDocument();
    expect(saveButton()).toBeInTheDocument();
  });

  it('pedido de painel proibido cai no valor (dívida com view excluir)', () => {
    render(<Harness initial={cell('financiamento', 'dividas', 'excluir')} />);
    expect(screen.getByRole('dialog', { name: 'Financiamento' })).toBeInTheDocument();
  });

  it('sonho: excluir avisa que o objetivo sai do Planejamento e manda deletes', async () => {
    render(<Harness initial={cell('viagem', 'planejamento')} />);
    fireEvent.click(screen.getByRole('button', { name: /Excluir linha/ }));
    const dialog = screen.getByRole('dialog', { name: 'Excluir linha' });
    expect(dialog).toHaveTextContent('Esta linha é um sonho do Planejamento');
    expect(dialog).toHaveTextContent('O sonho também será apagado do Planejamento');
    expect(dialog).toHaveTextContent('Não dá para desfazer');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir linha' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Linha excluída'));
    expect(mocks.saveItemChanges).toHaveBeenCalledWith({
      groupId: 'planejamento',
      deletes: ['viagem'],
    });
    expect(lastTarget).toBeNull();
  });

  it('mover para cima → reorderItem com o vizinho (painel continua aberto)', async () => {
    mocks.reorderItem.mockResolvedValue(true);
    render(<Harness initial={cell('internet', 'moradia', 'mover')} />);
    expect(screen.getByRole('button', { name: /Mover para cima/ })).toHaveTextContent(
      'Troca com Aluguel',
    );
    fireEvent.click(screen.getByRole('button', { name: /Mover para cima/ }));
    await waitFor(() =>
      expect(mocks.reorderItem).toHaveBeenCalledWith('moradia', 'internet', 'aluguel'),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(screen.getByRole('dialog', { name: 'Mover linha' })).toBeInTheDocument();
  });

  it('mover para outra seção → moveItem(id, destino, null, true)', async () => {
    mocks.moveItem.mockResolvedValue({ ok: true });
    render(<Harness initial={cell('internet', 'moradia', 'mover')} />);
    fireEvent.click(screen.getByRole('button', { name: /Mover para outra seção/ }));
    const destinos = screen.getAllByRole('radio').map((r) => r.textContent);
    expect(destinos.join('|')).toContain('Lazer');
    expect(destinos.join('|')).not.toContain('Moradia');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar seção' }), {
      target: { value: 'laz' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /Lazer/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Mover para Lazer' }));
    await waitFor(() =>
      expect(mocks.moveItem).toHaveBeenCalledWith('internet', 'lazer', null, true),
    );
    expect(onSaved).toHaveBeenCalledWith('Linha movida para Lazer', {
      itemId: 'internet',
      month: 6,
    });
  });

  it('falha ao mover fica no sheet com a mensagem do servidor', async () => {
    mocks.moveItem.mockResolvedValue({ ok: false, error: 'Destino inválido' });
    render(<Harness initial={cell('internet', 'moradia', 'mover')} />);
    fireEvent.click(screen.getByRole('button', { name: /Mover para outra seção/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Lazer/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Mover para Lazer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Destino inválido');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('renomear/porquê/nível → um update só com o que mudou', async () => {
    render(<Harness initial={cell('internet', 'moradia')} />);
    fireEvent.click(screen.getByRole('button', { name: /Renomear e porquê/ }));
    fireEvent.change(screen.getByLabelText('Nome da linha'), {
      target: { value: 'Internet fibra' },
    });
    fireEvent.change(screen.getByLabelText('Nível de prioridade'), { target: { value: '1' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(mocks.saveItemChanges).toHaveBeenCalled());
    expect(mocks.saveItemChanges).toHaveBeenCalledWith({
      groupId: 'moradia',
      updates: [{ itemId: 'internet', name: 'Internet fibra', rank: '1' }],
    });
  });

  it('comentário: grava pelo PATCH do desktop e avisa', async () => {
    mocks.fetchCellComment.mockResolvedValue({ comment: 'Plano novo', updatedAt: null });
    mocks.saveCellComment.mockResolvedValue(undefined);
    render(<Harness initial={cell('internet', 'moradia')} />);
    fireEvent.click(screen.getByRole('button', { name: /Comentário/ }));
    const textarea = screen.getByLabelText('Comentário de Julho') as HTMLTextAreaElement;
    await waitFor(() => expect(mocks.fetchCellComment).toHaveBeenCalledWith('internet', 6));
    expect(textarea.value).toBe('Plano novo');
    fireEvent.change(textarea, { target: { value: '  Plano de 500 mega ' } });
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(mocks.saveCellComment).toHaveBeenCalledWith('internet', 6, 'Plano de 500 mega'),
    );
    expect(onSaved).toHaveBeenCalledWith('Comentário salvo', { itemId: 'internet', month: 6 });
  });

  it('Voltar do painel mantém o valor digitado', () => {
    render(<Harness initial={cell('internet', 'moradia')} />);
    fireEvent.change(field(), { target: { value: '777' } });
    fireEvent.click(screen.getByRole('button', { name: /^Mover/ }));
    expect(screen.getByRole('dialog', { name: 'Mover linha' })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Voltar' })[0]);
    expect(field().value).toBe('777');
  });

  it('Esc no painel de ação volta ao valor; Esc no valor fecha o sheet', () => {
    render(<Harness initial={cell('internet', 'moradia', 'mover')} />);
    const dialog = screen.getByRole('dialog', { name: 'Mover linha' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Internet' })).toBeInTheDocument();
    expect(lastTarget).toMatchObject({ kind: 'cell', view: 'valor' });
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Internet' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(lastTarget).toBeNull();
  });

  it('o id sumiu da árvore → fecha', () => {
    const { rerender } = render(<Harness initial={cell('internet', 'moradia')} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    rerender(<Harness initial={cell('internet', 'moradia')} groups={[]} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(lastTarget).toBeNull();
  });

  it('⋯ do grupo: Adicionar linha abre a nova linha; Reordenar chama onStartReorder', () => {
    render(<Harness initial={{ kind: 'group', groupId: 'moradia', month: 6 }} />);
    expect(screen.getByRole('dialog', { name: 'Moradia' })).toHaveTextContent('R$ 1.130,00');
    fireEvent.click(screen.getByRole('button', { name: /Reordenar linhas/ }));
    expect(onStartReorder).toHaveBeenCalledWith('moradia');
    expect(lastTarget).toBeNull();
  });

  it('nova linha → createItem com refetch e abre a célula da linha criada', async () => {
    const criada = item('academia', 'lazer', { name: 'Academia' });
    mocks.createItem.mockResolvedValue(criada);
    const groups = GROUPS.map((g) =>
      g.id === 'despesas'
        ? {
            ...g,
            children: g.children.map((c) =>
              c.id === 'lazer' ? { ...c, items: [...c.items, criada] } : c,
            ),
          }
        : g,
    );
    render(<Harness initial={{ kind: 'group', groupId: 'lazer', month: 6 }} groups={groups} />);
    fireEvent.click(screen.getByRole('button', { name: /Adicionar linha/ }));
    expect(screen.getByRole('dialog', { name: 'Nova linha' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Dê um nome para a linha.');
    fireEvent.change(screen.getByLabelText('Nome da linha'), { target: { value: ' Academia ' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    });
    expect(mocks.createItem).toHaveBeenCalledWith('lazer', 'Academia', undefined, {
      refetch: true,
    });
    expect(onSaved).toHaveBeenCalledWith('Linha adicionada', { itemId: 'academia', month: 6 });
    expect(await screen.findByRole('dialog', { name: 'Academia' })).toBeInTheDocument();
  });
});

describe('regras puras do sheet da célula', () => {
  it('applyFormulaKey: "=" só na posição 0 e operador vira fórmula', () => {
    expect(applyFormulaKey('100', '=', null, null)).toEqual({ text: '=100', caret: 4 });
    expect(applyFormulaKey('=100', '=', 4, 4)).toEqual({ text: '=100', caret: 4 });
    expect(applyFormulaKey('100', '+', 3, 3)).toEqual({ text: '=100+', caret: 5 });
    expect(applyFormulaKey('=10+20', '×', 3, 3)).toEqual({ text: '=10×+20', caret: 4 });
    expect(applyFormulaKey('=1', '-', null, null)).toEqual({ text: '=1-', caret: 3 });
  });

  it('buildCellValueChange segue o getChangesForGroup', () => {
    const orig = value('x', 2, { value: 10, color: '#FF0000', formula: null });
    expect(
      buildCellValueChange(orig, 2, { value: 10.005, formula: null, color: '#FF0000' }),
    ).toBeNull();
    expect(buildCellValueChange(orig, 2, { value: 12, formula: null, color: '#FF0000' })).toEqual({
      month: 2,
      value: 12,
    });
    expect(buildCellValueChange(orig, 2, { value: 10, formula: null, color: null })).toEqual({
      month: 2,
      value: 10,
      color: null,
    });
    // Cor numa célula sem registro entra mesmo com valor 0.
    expect(
      buildCellValueChange(undefined, 2, { value: 0, formula: null, color: '#0000FF' }),
    ).toEqual({ month: 2, value: 0, color: '#0000FF' });
    expect(buildCellValueChange(undefined, 2, { value: 0, formula: null, color: null })).toBeNull();
  });
});
