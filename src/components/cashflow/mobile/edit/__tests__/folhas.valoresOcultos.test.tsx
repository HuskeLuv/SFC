// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CashflowGroup, CashflowItem, CashflowValue } from '@/types/cashflow';
import CashflowEditSheets, {
  type CashflowEditTarget,
} from '@/components/cashflow/mobile/CashflowEditSheets';
import {
  SENTINELAS,
  expectPilulas,
  expectSemValoresExpostos,
  renderComValoresOcultos,
} from '@/test/valoresOcultos';
import { formatBRL } from '@/utils/format';

/**
 * Esconder valores (Fase 2, fatia 2): folhas de edição do fluxo no celular com o olho fechado.
 * Decisão 3: o CAMPO continua com o número; o que é só leitura (valor automático, "Antes",
 * parte do banco, totais do grupo, aviso de exclusão, mini gráfico do ano) vira pílula.
 */

const mocks = vi.hoisted(() => ({
  saveItemChanges: vi.fn(),
  createItem: vi.fn(),
  reorderItem: vi.fn(),
  moveItem: vi.fn(),
  fetchCellComment: vi.fn(),
  saveCellComment: vi.fn(),
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/fluxodecaixa' }));
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

const S = SENTINELAS;

const value = (itemId: string, month: number, v: number, over: Partial<CashflowValue> = {}) =>
  ({
    id: `${itemId}-${month}`,
    itemId,
    userId: 'u1',
    year: 2026,
    month,
    value: v,
    ...over,
  }) as CashflowValue;

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
    items: [item('salario', 'entradas', { values: [value('salario', 6, S.aplicado * 2)] })],
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
            values: [
              value('aluguel', 6, S.saldo, { valorBanco: S.aplicado }),
              value('aluguel', 2, S.aplicado),
            ],
          }),
          item('internet', 'moradia', { values: [value('internet', 6, 100)] }),
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
        values: [value('investimento-aporte', 6, S.saldo)],
      }),
    ],
  }),
];

function abrir(target: CashflowEditTarget, ocultos = true) {
  return renderComValoresOcultos(
    <CashflowEditSheets
      year={2026}
      groups={GROUPS}
      itemTotals={{}}
      target={target}
      onTargetChange={() => {}}
      onSaved={() => {}}
      onStartReorder={() => {}}
    />,
    { ocultos },
  );
}

const cell = (itemId: string, groupId: string, view?: 'excluir') =>
  ({ kind: 'cell', itemId, groupId, month: 6, ...(view ? { view } : {}) }) as CashflowEditTarget;

describe('folhas de edição do fluxo com o olho fechado', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.fetchCellComment.mockResolvedValue({ comment: null, updatedAt: null });
  });
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('Aporte (só leitura): valor e mini gráfico viram pílula', () => {
    abrir(cell('investimento-aporte', 'inv'));
    const dialog = screen.getByRole('dialog', { name: 'Aportes' });
    expectSemValoresExpostos(dialog);
    // valor automático + "No ano" + "média"
    expectPilulas(dialog, 3);
    expect(dialog.querySelector('[role="img"][aria-label*="Aportes em 2026"]')).toHaveAttribute(
      'aria-label',
      'Aportes em 2026: Julho R$ •••••; no ano R$ •••••, 1 mês preenchido.',
    );
    expect(screen.getByText('Somente leitura')).toBeInTheDocument();
  });

  it('célula editável: o campo mostra o número; apoio fora do campo vira pílula', () => {
    abrir(cell('aluguel', 'moradia'));
    const dialog = screen.getByRole('dialog', { name: 'Aluguel' });
    const campo = screen.getByLabelText('Valor de Julho') as HTMLInputElement;
    expect(campo.value).toBe('9.876.543,21');
    // Muda o valor: aparece o "Antes" (valor guardado) como pílula.
    fireEvent.change(campo, { target: { value: '10' } });
    expect(screen.getByText('Antes')).toBeInTheDocument();
    expectSemValoresExpostos(dialog);
    // "Antes" + parte do banco + "No ano" + "média"
    expectPilulas(dialog, 4);
    expect(dialog).toHaveTextContent('lançados pelo banco');
  });

  it('fórmula: o resultado de apoio vira pílula, o campo continua com o texto', () => {
    abrir(cell('internet', 'moradia'));
    const campo = screen.getByLabelText('Valor de Julho') as HTMLInputElement;
    fireEvent.change(campo, { target: { value: `=${S.saldo}*1` } });
    expect(campo.value).toBe(`=${S.saldo}*1`);
    const dialog = screen.getByRole('dialog', { name: 'Internet' });
    expect(screen.getByText('Resultado')).toBeInTheDocument();
    expect(dialog.querySelectorAll('b .mf-sensivel').length).toBe(1);
    expectSemValoresExpostos(dialog.querySelector('form') as HTMLElement, { sentinelas: [] });
  });

  it('⋯ do grupo: total do mês e do ano viram pílula; % da receita fica', () => {
    abrir({ kind: 'group', groupId: 'despesas', month: 6 });
    const dialog = screen.getByRole('dialog', { name: 'Despesas Fixas e Variáveis' });
    expectSemValoresExpostos(dialog);
    expectPilulas(dialog, 2);
    expect(dialog).toHaveTextContent(/\d+(,\d)?%da receita no ano/);
  });

  it('excluir: o total do ano no aviso vira pílula; a contagem de meses fica', () => {
    abrir(cell('aluguel', 'moradia', 'excluir'));
    const dialog = screen.getByRole('dialog', { name: 'Excluir linha' });
    expectSemValoresExpostos(dialog);
    expectPilulas(dialog, 1);
    expect(dialog).toHaveTextContent('(2 meses de 2026,');
  });

  it('olho aberto: os textos de hoje, sem pílula', () => {
    abrir(cell('investimento-aporte', 'inv'), false);
    const dialog = screen.getByRole('dialog', { name: 'Aportes' });
    expectPilulas(dialog, 0);
    expect(dialog.textContent).toContain(formatBRL(S.saldo));
    expect(dialog.textContent).toContain(`No ano ${formatBRL(S.saldo)} · média`);
  });
});
