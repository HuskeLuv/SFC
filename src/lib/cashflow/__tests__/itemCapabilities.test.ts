import { describe, expect, it } from 'vitest';
import type { CashflowGroup, CashflowItem } from '@/types/cashflow';
import {
  DESPESAS_PERCENT_STYLE,
  getGroupCapabilities,
  getItemCapabilities,
  groupDisplayName,
  isInvestment,
  READONLY_REASON_TEXT,
} from '../itemCapabilities';

const item = (over: Partial<CashflowItem> = {}): CashflowItem => ({
  id: 'i1',
  userId: 'u1',
  groupId: 'g1',
  name: 'Linha',
  significado: null,
  rank: null,
  values: [],
  ...over,
});

const group = (over: Partial<CashflowGroup> = {}): CashflowGroup => ({
  id: 'g1',
  userId: 'u1',
  name: 'Moradia',
  type: 'despesa',
  parentId: 'p1',
  orderIndex: 1,
  items: [],
  children: [],
  ...over,
});

describe('getItemCapabilities', () => {
  it.each([
    [
      'linha comum',
      item(),
      group(),
      {
        editValues: true,
        editStructure: true,
        canDelete: true,
        deleteNeedsObjetivoConfirm: false,
        canMove: true,
        canComment: true,
        canColor: true,
      },
    ],
    [
      'sonho',
      item({ objetivoId: 'o1' }),
      group(),
      {
        editValues: true,
        editStructure: false,
        canDelete: true,
        deleteNeedsObjetivoConfirm: true,
        canMove: false,
        canComment: true,
        canColor: true,
        readOnlyReason: 'sonho',
      },
    ],
    [
      'sonho com ativos vinculados (auto-realizado)',
      item({ objetivoId: 'o1', objetivoAutoRealizado: true }),
      group(),
      {
        editValues: false,
        editStructure: false,
        canDelete: true,
        deleteNeedsObjetivoConfirm: true,
        canMove: false,
        canComment: true,
        canColor: false,
        readOnlyReason: 'auto-realizado',
      },
    ],
    [
      'dívida',
      item({ dividaId: 'd1' }),
      group(),
      {
        editValues: true,
        editStructure: false,
        canDelete: false,
        deleteNeedsObjetivoConfirm: false,
        canMove: false,
        canComment: true,
        canColor: true,
        readOnlyReason: 'divida',
      },
    ],
    [
      'investimento (grupo)',
      item(),
      group({ type: 'investimento' }),
      {
        editValues: false,
        editStructure: false,
        canDelete: false,
        deleteNeedsObjetivoConfirm: false,
        canMove: false,
        canComment: false,
        canColor: false,
        readOnlyReason: 'investimento',
      },
    ],
    [
      'investimento (id sintético)',
      item({ id: 'investimento-acoes' }),
      group(),
      {
        editValues: false,
        editStructure: false,
        canDelete: false,
        deleteNeedsObjetivoConfirm: false,
        canMove: true,
        canComment: false,
        canColor: false,
        readOnlyReason: 'investimento',
      },
    ],
    [
      'conta corrente (saldo)',
      item(),
      group({ type: 'saldo' }),
      {
        editValues: true,
        editStructure: true,
        canDelete: true,
        deleteNeedsObjetivoConfirm: false,
        canMove: false,
        canComment: true,
        canColor: true,
      },
    ],
  ])('%s', (_label, i, g, expected) => {
    expect(getItemCapabilities(i, g)).toEqual(expected);
  });

  it('todo motivo tem texto', () => {
    expect(READONLY_REASON_TEXT).toEqual({
      investimento: 'Calculado automaticamente da carteira',
      'auto-realizado': 'O realizado deste sonho vem dos ativos vinculados',
      divida: 'Gerida em Dívidas',
      sonho: 'Editável no Planejamento de Sonhos',
    });
  });
});

describe('getGroupCapabilities', () => {
  it('grupo-folha de despesa/entrada aceita linha e recebe linha movida', () => {
    expect(getGroupCapabilities(group())).toEqual({ addRow: true, acceptsMovedRow: true });
    expect(getGroupCapabilities(group({ type: 'entrada' }))).toEqual({
      addRow: true,
      acceptsMovedRow: true,
    });
  });
  it('grupo com filhos não aceita nenhum dos dois', () => {
    expect(getGroupCapabilities(group({ children: [group({ id: 'c' })] }))).toEqual({
      addRow: false,
      acceptsMovedRow: false,
    });
  });
  it('Aporte/Resgate e Conta Corrente', () => {
    expect(getGroupCapabilities(group({ type: 'investimento' }))).toEqual({
      addRow: false,
      acceptsMovedRow: false,
    });
    expect(getGroupCapabilities(group({ type: 'saldo' }))).toEqual({
      addRow: true,
      acceptsMovedRow: false,
    });
  });
});

describe('helpers visuais', () => {
  it('isInvestment pelo grupo ou pelo id', () => {
    expect(isInvestment({ type: 'investimento' })).toBe(true);
    expect(isInvestment({ type: 'despesa' }, { id: 'investimento-x' })).toBe(true);
    expect(isInvestment({ type: 'despesa' }, { id: 'abc' })).toBe(false);
  });

  it('groupDisplayName', () => {
    expect(groupDisplayName(group({ type: 'investimento', name: 'Investimentos' }))).toBe(
      'Aporte/Resgate',
    );
    expect(groupDisplayName(group({ name: 'Entradas', type: 'entrada', parentId: null }))).toBe(
      'Total de Entradas',
    );
    expect(
      groupDisplayName(group({ name: 'Custos', templateName: 'Despesas', parentId: null })),
    ).toBe('Despesas Fixas e Variáveis');
    expect(groupDisplayName(group({ name: 'Entradas', parentId: 'x' }))).toBe('Entradas');
    expect(groupDisplayName(group({ name: 'Moradia' }))).toBe('Moradia');
  });

  it('DESPESAS_PERCENT_STYLE nas quatro faixas', () => {
    expect(DESPESAS_PERCENT_STYLE(80).backgroundColor).toBe('#2E7DFF');
    expect(DESPESAS_PERCENT_STYLE(85).backgroundColor).toBe('#FFD54D');
    expect(DESPESAS_PERCENT_STYLE(100).backgroundColor).toBe('#FF9B9B');
    expect(DESPESAS_PERCENT_STYLE(101).backgroundColor).toBe('#FF0000');
  });
});
