import { describe, it, expect } from 'vitest';
import { diffFields } from '../diffFields';

const LABELS = { quantity: 'Quantidade', price: 'Preço', date: 'Data' };

describe('diffFields', () => {
  it('retorna os campos alterados com before/after', () => {
    const changes = diffFields({ quantity: 100, price: 10 }, { quantity: 150, price: 10 }, LABELS);
    expect(changes).toEqual([{ field: 'quantity', label: 'Quantidade', before: 100, after: 150 }]);
  });

  it('retorna [] quando nada mudou (edição no-op)', () => {
    expect(diffFields({ quantity: 100 }, { quantity: 100 }, LABELS)).toEqual([]);
  });

  it('ignora campos fora da allowlist (ex.: senha)', () => {
    const changes = diffFields(
      { quantity: 100, password: 'old-hash' },
      { quantity: 100, password: 'new-hash' },
      LABELS,
    );
    expect(changes).toEqual([]);
  });

  it('trata undefined em after como campo não alterado', () => {
    expect(diffFields({ quantity: 100, price: 10 }, { price: 12 }, LABELS)).toEqual([
      { field: 'price', label: 'Preço', before: 10, after: 12 },
    ]);
  });

  it('normaliza Date para ISO string e compara por valor', () => {
    const before = { date: new Date('2026-01-01T00:00:00Z') };
    const sameDate = { date: new Date('2026-01-01T00:00:00Z') };
    expect(diffFields(before, sameDate, LABELS)).toEqual([]);

    const changed = diffFields(before, { date: new Date('2026-02-01T00:00:00Z') }, LABELS);
    expect(changed).toEqual([
      {
        field: 'date',
        label: 'Data',
        before: '2026-01-01T00:00:00.000Z',
        after: '2026-02-01T00:00:00.000Z',
      },
    ]);
  });

  it('normaliza objetos Decimal-like (toNumber) para number', () => {
    const decimal = (n: number) => ({ toNumber: () => n });
    expect(diffFields({ price: decimal(10) }, { price: 10 }, LABELS)).toEqual([]);
    expect(diffFields({ price: decimal(10) }, { price: 12.5 }, LABELS)).toEqual([
      { field: 'price', label: 'Preço', before: 10, after: 12.5 },
    ]);
  });

  it('normaliza null e undefined em before para null', () => {
    expect(diffFields({}, { quantity: 5 }, LABELS)).toEqual([
      { field: 'quantity', label: 'Quantidade', before: null, after: 5 },
    ]);
  });
});
