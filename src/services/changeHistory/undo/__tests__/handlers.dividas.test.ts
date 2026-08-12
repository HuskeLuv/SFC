import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { UserChangeLog } from '@prisma/client';

const mockPrisma = vi.hoisted(() => ({
  divida: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  dividaPagamento: {
    findFirst: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { DIVIDAS_UNDO_HANDLERS } from '../handlers/dividas';
import { UndoError } from '../types';
import type { UndoContext } from '../types';

const auth = { payload: { id: 'user-1' }, targetUserId: 'user-1', actingClient: null };
const request = new NextRequest('http://localhost/api/historico-alteracoes/log-1/undo', {
  method: 'POST',
});

const makeEntry = (overrides: Partial<UserChangeLog>): UserChangeLog =>
  ({
    id: 'log-1',
    userId: 'user-1',
    actorId: 'user-1',
    viaConsultant: false,
    section: 'dividas',
    action: 'divida.editar',
    entity: 'divida',
    entityId: 'div-1',
    entityLabel: 'Apê',
    changes: null,
    snapshot: null,
    undoneAt: null,
    undoneById: null,
    revertsId: null,
    ipAddress: null,
    userAgent: null,
    createdAt: new Date('2026-08-12T12:00:00Z'),
    ...overrides,
  }) as UserChangeLog;

const ctx = (entry: UserChangeLog): UndoContext =>
  ({ auth, request, entry }) as unknown as UndoContext;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('divida.criar (delete-created)', () => {
  const def = DIVIDAS_UNDO_HANDLERS['divida.criar'];

  it('apaga a dívida criada quando não tem pagamentos', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue({ id: 'div-1', pagamentos: [] });
    await def.execute(ctx(makeEntry({ action: 'divida.criar', changes: [] })));
    expect(mockPrisma.divida.delete).toHaveBeenCalledWith({ where: { id: 'div-1' } });
  });

  it('409 quando já tem pagamentos registrados', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue({
      id: 'div-1',
      pagamentos: [{ id: 'pg-1' }],
    });
    await expect(
      def.execute(ctx(makeEntry({ action: 'divida.criar', changes: [] }))),
    ).rejects.toThrow(UndoError);
    expect(mockPrisma.divida.delete).not.toHaveBeenCalled();
  });

  it('409 quando a dívida não existe mais', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue(null);
    await expect(
      def.execute(ctx(makeEntry({ action: 'divida.criar', changes: [] }))),
    ).rejects.toThrow(UndoError);
  });
});

describe('divida.editar (restore-fields)', () => {
  const def = DIVIDAS_UNDO_HANDLERS['divida.editar'];

  it('restaura os campos anteriores quando o estado atual bate', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue({ id: 'div-1', nome: 'Apartamento' });
    const entry = makeEntry({
      changes: [{ field: 'nome', label: 'Nome', before: 'Apê', after: 'Apartamento' }],
    });
    await def.execute(ctx(entry));
    expect(mockPrisma.divida.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'div-1' }, data: { nome: 'Apê' } }),
    );
  });

  it('409 quando o estado atual diverge (edição posterior)', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue({ id: 'div-1', nome: 'Outro nome' });
    const entry = makeEntry({
      changes: [{ field: 'nome', label: 'Nome', before: 'Apê', after: 'Apartamento' }],
    });
    await expect(def.execute(ctx(entry))).rejects.toThrow();
    expect(mockPrisma.divida.update).not.toHaveBeenCalled();
  });
});

describe('divida.excluir (recreate-from-snapshot)', () => {
  const def = DIVIDAS_UNDO_HANDLERS['divida.excluir'];

  const snapshot = {
    v: 1,
    kind: 'divida',
    data: {
      id: 'div-1',
      nome: 'Apê',
      instituicao: null,
      tipo: 'financiamento_imobiliario',
      modalidade: 'financiamento',
      principal: 100000,
      taxaAm: 0.01,
      taxaUnidadeEntrada: 'am',
      prazoMeses: 120,
      sistema: 'PRICE',
      indexador: 'PREFIXADO',
      primeiroVencimento: '2026-01',
      saldoInicial: null,
      dataSaldoInicial: null,
      status: 'ativa',
      notes: null,
    },
    meta: {
      pagamentos: [
        { month: '2026-01', valor: 1434.71, parcelaNumero: 1, tipo: 'pagamento', notes: null },
      ],
    },
  };

  it('recria dívida com o id original e os pagamentos', async () => {
    mockPrisma.divida.create.mockResolvedValue({ id: 'div-1' });
    const entry = makeEntry({ action: 'divida.excluir', changes: [], snapshot });
    await def.execute(ctx(entry));
    expect(mockPrisma.divida.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ id: 'div-1', userId: 'user-1', principal: 100000 }),
      }),
    );
    expect(mockPrisma.dividaPagamento.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ dividaId: 'div-1', parcelaNumero: 1 })],
      }),
    );
  });

  it('409 quando já foi restaurada (unique violation)', async () => {
    mockPrisma.divida.create.mockRejectedValue({ code: 'P2002' });
    const entry = makeEntry({ action: 'divida.excluir', changes: [], snapshot });
    await expect(def.execute(ctx(entry))).rejects.toThrow(UndoError);
  });
});

describe('divida-pagamento.registrar (delete-created)', () => {
  const def = DIVIDAS_UNDO_HANDLERS['divida-pagamento.registrar'];

  it('apaga o pagamento registrado', async () => {
    mockPrisma.dividaPagamento.findFirst.mockResolvedValue({ id: 'pg-1' });
    const entry = makeEntry({
      action: 'divida-pagamento.registrar',
      entity: 'divida-pagamento',
      entityId: 'pg-1',
      changes: [],
    });
    await def.execute(ctx(entry));
    expect(mockPrisma.dividaPagamento.delete).toHaveBeenCalledWith({ where: { id: 'pg-1' } });
  });

  it('409 quando o pagamento não existe mais', async () => {
    mockPrisma.dividaPagamento.findFirst.mockResolvedValue(null);
    const entry = makeEntry({
      action: 'divida-pagamento.registrar',
      entity: 'divida-pagamento',
      entityId: 'pg-1',
      changes: [],
    });
    await expect(def.execute(ctx(entry))).rejects.toThrow(UndoError);
  });
});

describe('divida-pagamento.excluir (recreate-from-snapshot)', () => {
  const def = DIVIDAS_UNDO_HANDLERS['divida-pagamento.excluir'];

  const snapshot = {
    v: 1,
    kind: 'divida-pagamento',
    data: {
      id: 'pg-1',
      month: '2026-01',
      valor: 1434.71,
      parcelaNumero: 1,
      tipo: 'pagamento',
      notes: null,
    },
    meta: { dividaId: 'div-1' },
  };

  it('recria o pagamento quando a parcela segue livre', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue({ id: 'div-1', pagamentos: [] });
    const entry = makeEntry({
      action: 'divida-pagamento.excluir',
      entity: 'divida-pagamento',
      entityId: 'pg-1',
      changes: [],
      snapshot,
    });
    await def.execute(ctx(entry));
    expect(mockPrisma.dividaPagamento.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ id: 'pg-1', dividaId: 'div-1', parcelaNumero: 1 }),
      }),
    );
  });

  it('409 quando a parcela já foi registrada de novo', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue({
      id: 'div-1',
      pagamentos: [{ parcelaNumero: 1, tipo: 'pagamento' }],
    });
    const entry = makeEntry({
      action: 'divida-pagamento.excluir',
      entity: 'divida-pagamento',
      entityId: 'pg-1',
      changes: [],
      snapshot,
    });
    await expect(def.execute(ctx(entry))).rejects.toThrow(UndoError);
    expect(mockPrisma.dividaPagamento.create).not.toHaveBeenCalled();
  });

  it('409 quando a dívida-pai não existe mais', async () => {
    mockPrisma.divida.findFirst.mockResolvedValue(null);
    const entry = makeEntry({
      action: 'divida-pagamento.excluir',
      entity: 'divida-pagamento',
      entityId: 'pg-1',
      changes: [],
      snapshot,
    });
    await expect(def.execute(ctx(entry))).rejects.toThrow(UndoError);
  });
});
