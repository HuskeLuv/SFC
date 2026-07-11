import { describe, it, expect } from 'vitest';
import type { HistoricoAlteracaoEntry } from '@/hooks/useHistoricoAlteracoes';
import { formatChangeValue, renderDescription, renderRichDescription } from '../renderChange';

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
