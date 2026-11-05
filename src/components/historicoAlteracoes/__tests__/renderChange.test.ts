import { describe, it, expect } from 'vitest';
import type { HistoricoAlteracaoEntry } from '@/hooks/useHistoricoAlteracoes';
import {
  formatChangeValue,
  isListaBanco,
  partesItemBanco,
  renderDescription,
  renderRichDescription,
} from '../renderChange';

const makeEntry = (overrides: Partial<HistoricoAlteracaoEntry>): HistoricoAlteracaoEntry => ({
  id: 'log-1',
  userId: 'user-1',
  actorId: 'user-1',
  viaConsultant: false,
  section: 'carteira',
  action: 'transacao.editar',
  entity: 'transacao',
  entityId: 'tx-1',
  entityLabel: 'PETR4',
  changes: null,
  createdAt: '2026-07-10T12:00:00.000Z',
  ...overrides,
});

describe('formatChangeValue', () => {
  it('formata currency em BRL', () => {
    expect(formatChangeValue(3210.5, 'currency')).toBe(
      (3210.5).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    );
  });

  it('formata percent com sufixo %', () => {
    expect(formatChangeValue(12.5, 'percent')).toBe('12,5%');
  });

  it('mantém heurística sem format (número pt-BR, data ISO, boolean)', () => {
    expect(formatChangeValue(1234.56)).toBe((1234.56).toLocaleString('pt-BR'));
    expect(formatChangeValue('2026-01-15T00:00:00.000Z')).toBe('15/01/2026');
    expect(formatChangeValue(true)).toBe('Sim');
    expect(formatChangeValue(null)).toBe('—');
  });
});

describe('renderDescription — undo', () => {
  it('prefixa "Desfez:" usando o renderer da action base', () => {
    const entry = makeEntry({ action: 'transacao.editar.desfazer' });
    expect(renderDescription(entry)).toBe('Desfez: Editou transação de PETR4');
  });
});

describe('renderRichDescription', () => {
  it('sem changes retorna só o título', () => {
    expect(renderRichDescription(makeEntry({}))).toEqual({
      title: 'Editou transação de PETR4',
    });
  });

  it('edição: até 2 pares antes → depois', () => {
    const entry = makeEntry({
      changes: [
        { field: 'quantity', label: 'Quantidade', before: 100, after: 150, format: 'number' },
        { field: 'price', label: 'Preço', before: 32.1, after: 30, format: 'currency' },
      ],
    });
    const { summary } = renderRichDescription(entry);
    expect(summary).toContain('Quantidade: 100 → 150');
    expect(summary).toContain('Preço:');
    expect(summary).toContain('→');
  });

  it('mais de 2 campos vira "+N outros campos"', () => {
    const entry = makeEntry({
      changes: [
        { field: 'a', label: 'A', before: 1, after: 2 },
        { field: 'b', label: 'B', before: 1, after: 2 },
        { field: 'c', label: 'C', before: 1, after: 2 },
        { field: 'd', label: 'D', before: 1, after: 2 },
      ],
    });
    expect(renderRichDescription(entry).summary).toContain('+2 outros campos');
  });

  it('exatamente 3 campos vira "+1 outro campo" (singular)', () => {
    const entry = makeEntry({
      changes: [
        { field: 'a', label: 'A', before: 1, after: 2 },
        { field: 'b', label: 'B', before: 1, after: 2 },
        { field: 'c', label: 'C', before: 1, after: 2 },
      ],
    });
    expect(renderRichDescription(entry).summary).toContain('+1 outro campo');
  });

  it('criação: mostra só os valores iniciais, sem seta', () => {
    const entry = makeEntry({
      action: 'sonho.criar',
      section: 'planejamento',
      entityLabel: 'Viagem Europa',
      changes: [
        { field: 'target', label: 'Valor meta', before: null, after: 50000, format: 'currency' },
      ],
    });
    const { summary } = renderRichDescription(entry);
    expect(summary).not.toContain('→');
    expect(summary).toContain('Valor meta:');
  });

  it('exclusão: prefixa "Valores no momento da exclusão"', () => {
    const entry = makeEntry({
      action: 'transacao.excluir',
      changes: [
        { field: 'quantity', label: 'Quantidade', before: 100, after: null, format: 'number' },
        { field: 'total', label: 'Total', before: 3210, after: null, format: 'currency' },
      ],
    });
    const { summary } = renderRichDescription(entry);
    expect(summary).toMatch(/^Valores no momento da exclusão/);
    expect(summary).not.toContain('→');
    expect(summary).toContain('Quantidade: 100');
  });

  it('entrada de undo usa o estilo da action base (edição)', () => {
    const entry = makeEntry({
      action: 'transacao.editar.desfazer',
      changes: [{ field: 'quantity', label: 'Quantidade', before: 150, after: 100 }],
    });
    const { title, summary } = renderRichDescription(entry);
    expect(title).toBe('Desfez: Editou transação de PETR4');
    expect(summary).toContain('Quantidade: 150 → 100');
  });
});

describe('renderRichDescription — transações do banco (lista)', () => {
  const BRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const item = (id: string, before: number, after: string | null) => ({
    field: `banco:${id}`,
    label: `05/11/2026 · UBER ${id} · Nubank, Conta corrente`,
    before,
    after,
    format: 'currency' as const,
  });

  it('lançar: resumo com as 2 primeiras e quantas faltam, sem "→"', () => {
    const entry = makeEntry({
      section: 'fluxo-caixa',
      action: 'banco.aplicar',
      entityLabel: '15 transações',
      changes: [
        item('a', -23.9, 'entrou em Transporte (novembro de 2026)'),
        item('b', 300, 'entrou em Salário (novembro de 2026)'),
        item('c', -10, 'entrou em Transporte (novembro de 2026)'),
        { field: 'banco:resto', label: 'Mais 12 transações', before: null, after: null },
      ],
    });
    const { title, summary } = renderRichDescription(entry);
    expect(title).toBe('Lançou 15 transações do banco no fluxo de caixa');
    expect(summary).toBe(
      `05/11/2026 · UBER a · Nubank, Conta corrente: ${BRL(-23.9)} · entrou em Transporte (novembro de 2026)` +
        ` · 05/11/2026 · UBER b · Nubank, Conta corrente: ${BRL(300)} · entrou em Salário (novembro de 2026)` +
        ' · +13 outras transações em Detalhes',
    );
  });

  it('ignorar (sem destino) e o desfazer usam o mesmo formato', () => {
    const entry = makeEntry({
      section: 'fluxo-caixa',
      action: 'banco.ignorar.desfazer',
      entityLabel: '1 transação',
      changes: [item('a', -5, null)],
    });
    const { title, summary } = renderRichDescription(entry);
    expect(title).toBe('Desfez: Ignorou 1 transação do banco na Caixa de entrada');
    expect(summary).toBe(`05/11/2026 · UBER a · Nubank, Conta corrente: ${BRL(-5)}`);
  });

  it('isListaBanco só para as ações do banco', () => {
    expect(isListaBanco({ action: 'banco.desaplicar' })).toBe(true);
    expect(isListaBanco({ action: 'banco.aplicar.desfazer' })).toBe(true);
    expect(isListaBanco({ action: 'valor.editar' })).toBe(false);
  });

  it('partesItemBanco: o "Mais N" é só o rótulo', () => {
    expect(
      partesItemBanco({
        field: 'banco:resto',
        label: 'Mais 3 transações',
        before: null,
        after: null,
      }),
    ).toEqual(['Mais 3 transações']);
  });
});
