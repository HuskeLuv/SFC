import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { mockAuthAsUser, mockAuthAsConsultant } from '@/test/mocks/auth';
import { recordChange } from '../recordChange';

const mockPrisma = vi.hoisted(() => ({
  userChangeLog: {
    create: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({
  default: mockPrisma,
}));

const makeRequest = () =>
  new NextRequest('http://localhost/api/test', {
    headers: {
      'x-forwarded-for': '203.0.113.7, 10.0.0.1',
      'user-agent': 'vitest-agent',
    },
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('recordChange', () => {
  it('grava linha com userId/actorId corretos para usuário editando a própria conta', async () => {
    const auth = mockAuthAsUser('user-1');

    await recordChange({
      request: makeRequest(),
      auth,
      section: 'carteira',
      action: 'transacao.editar',
      entity: 'transacao',
      entityId: 'tx-1',
      entityLabel: 'PETR4',
      changes: [{ field: 'quantity', label: 'Quantidade', before: 100, after: 150 }],
    });

    expect(mockPrisma.userChangeLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        actorId: 'user-1',
        viaConsultant: false,
        section: 'carteira',
        action: 'transacao.editar',
        entity: 'transacao',
        entityId: 'tx-1',
        entityLabel: 'PETR4',
        changes: [{ field: 'quantity', label: 'Quantidade', before: 100, after: 150 }],
        ipAddress: '203.0.113.7',
        userAgent: 'vitest-agent',
      }),
    });
  });

  it('marca viaConsultant e separa actor/target quando consultor impersona', async () => {
    const auth = mockAuthAsConsultant('consultant-1', 'client-1');

    await recordChange({
      request: makeRequest(),
      auth,
      section: 'fluxo-caixa',
      action: 'valor.editar',
    });

    expect(mockPrisma.userChangeLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'client-1',
        actorId: 'consultant-1',
        viaConsultant: true,
      }),
    });
  });

  it('não grava quando changes é um array vazio (edição no-op)', async () => {
    await recordChange({
      request: makeRequest(),
      auth: mockAuthAsUser(),
      section: 'perfil',
      action: 'perfil.editar',
      changes: [],
    });

    expect(mockPrisma.userChangeLog.create).not.toHaveBeenCalled();
  });

  it('grava quando changes é undefined (ações sem diff, ex. exclusão)', async () => {
    await recordChange({
      request: makeRequest(),
      auth: mockAuthAsUser(),
      section: 'planejamento',
      action: 'sonho.excluir',
      entityLabel: 'Viagem Europa',
    });

    expect(mockPrisma.userChangeLog.create).toHaveBeenCalledOnce();
  });

  it('nunca propaga erro do Prisma (best-effort)', async () => {
    mockPrisma.userChangeLog.create.mockRejectedValueOnce(new Error('db down'));

    await expect(
      recordChange({
        request: makeRequest(),
        auth: mockAuthAsUser(),
        section: 'carteira',
        action: 'aporte.registrar',
      }),
    ).resolves.toBeUndefined();
  });
});
