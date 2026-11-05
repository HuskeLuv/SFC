import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  bankTransaction: { findMany: vi.fn() },
  cashflowItem: { findMany: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import {
  BANCO_DETALHE_MAX,
  bancoTransacoesChanges,
  carregarTransacoesBanco,
  type TransacaoBancoDetalhe,
} from '../bancoTransacoesHelpers';

const tx = (over: Partial<TransacaoBancoDetalhe> = {}): TransacaoBancoDetalhe => ({
  id: 't1',
  date: new Date('2026-11-05T00:00:00.000Z'),
  description: 'UBER   *TRIP',
  amount: -23.9,
  type: 'DEBIT',
  contaNome: 'Conta corrente',
  bancoNome: 'Nubank',
  linha: 'Transporte',
  ano: 2026,
  mes: 10,
  ...over,
});

describe('bancoTransacoesChanges', () => {
  it('lançar: data · descrição · conta, valor com sinal e a linha/mês em que entrou', () => {
    expect(bancoTransacoesChanges('banco.aplicar', [tx()])).toEqual([
      {
        field: 'banco:t1',
        label: '05/11/2026 · UBER *TRIP · Nubank, Conta corrente',
        before: -23.9,
        after: 'entrou em Transporte (novembro de 2026)',
        format: 'currency',
      },
    ]);
  });

  it('entrada é positiva mesmo com sinal do provedor invertido; tirar diz de onde saiu', () => {
    const [c] = bancoTransacoesChanges('banco.desaplicar', [
      tx({ amount: -1500, type: 'CREDIT', linha: 'Salário', mes: 0, ano: 2027 }),
    ]);
    expect(c.before).toBe(1500);
    expect(c.after).toBe('saiu de Salário (janeiro de 2027)');
  });

  it('ignorar não tem destino; conta que já traz o banco no nome não repete', () => {
    const [c] = bancoTransacoesChanges('banco.ignorar', [
      tx({ contaNome: 'Nubank Ultravioleta', description: '' }),
    ]);
    expect(c.label).toBe('05/11/2026 · Sem descrição · Nubank Ultravioleta');
    expect(c.after).toBeNull();
  });

  it(`ordena por data, mostra até ${BANCO_DETALHE_MAX} e resume o resto`, () => {
    const lista = Array.from({ length: BANCO_DETALHE_MAX + 3 }, (_, i) =>
      tx({ id: `t${i}`, date: new Date(Date.UTC(2026, 10, 60 - i)) }),
    );
    const changes = bancoTransacoesChanges('banco.ignorar', lista);
    expect(changes).toHaveLength(BANCO_DETALHE_MAX + 1);
    expect(changes[0].field).toBe(`banco:t${BANCO_DETALHE_MAX + 2}`);
    expect(changes[BANCO_DETALHE_MAX]).toEqual({
      field: 'banco:resto',
      label: 'Mais 3 transações',
      before: null,
      after: null,
    });
  });
});

describe('carregarTransacoesBanco', () => {
  beforeEach(() => vi.clearAllMocks());

  const row = {
    id: 't1',
    date: new Date('2026-10-28T00:00:00.000Z'),
    description: 'Mercado',
    amount: { toString: () => '-80.5' },
    type: 'DEBIT',
    competenciaAno: 2026,
    competenciaMes: 10,
    cashflowItemId: 'it-1',
    account: { name: 'Cartão', connection: { connectorName: 'Itaú' } },
  };

  it('usa a linha atual da transação e a competência gravada', async () => {
    mockPrisma.bankTransaction.findMany.mockResolvedValue([row]);
    mockPrisma.cashflowItem.findMany.mockResolvedValue([{ id: 'it-1', name: 'Mercado' }]);
    const [t] = await carregarTransacoesBanco('u1', ['t1']);
    expect(mockPrisma.bankTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['t1'] }, userId: 'u1' } }),
    );
    expect(t).toMatchObject({
      amount: -80.5,
      contaNome: 'Cartão',
      bancoNome: 'Itaú',
      linha: 'Mercado',
      ano: 2026,
      mes: 10,
    });
  });

  it('tirar do fluxo: linha vem do mapa; sem competência usa o mês da data', async () => {
    mockPrisma.bankTransaction.findMany.mockResolvedValue([
      { ...row, cashflowItemId: null, competenciaAno: null, competenciaMes: null },
    ]);
    mockPrisma.cashflowItem.findMany.mockResolvedValue([{ id: 'it-9', name: 'Lazer' }]);
    const [t] = await carregarTransacoesBanco('u1', ['t1'], new Map([['t1', 'it-9']]));
    expect(t).toMatchObject({ linha: 'Lazer', ano: 2026, mes: 9 });
  });

  it('erro na leitura vira lista vazia (o histórico não quebra a ação)', async () => {
    mockPrisma.bankTransaction.findMany.mockRejectedValue(new Error('db'));
    await expect(carregarTransacoesBanco('u1', ['t1'])).resolves.toEqual([]);
    await expect(carregarTransacoesBanco('u1', [])).resolves.toEqual([]);
  });
});
