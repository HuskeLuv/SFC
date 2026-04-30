import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  cashflowGroup: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  cashflowItem: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  cashflowValue: { deleteMany: vi.fn() },
  $transaction: vi.fn().mockResolvedValue([]),
}));

const mockPersonalizeGroup = vi.hoisted(() => vi.fn());
const mockPersonalizeItem = vi.hoisted(() => vi.fn());
const mockGetItemForUser = vi.hoisted(() => vi.fn());
const mockGetGroupForUser = vi.hoisted(() => vi.fn());
const mockHideTemplateGroup = vi.hoisted(() => vi.fn());
const mockHideTemplateItem = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@prisma/client', () => ({ Prisma: {} }));
vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: vi.fn().mockResolvedValue({
    payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-123',
    actingClient: null,
  }),
}));
vi.mock('@/utils/cashflowPersonalization', () => ({
  personalizeGroup: mockPersonalizeGroup,
  personalizeItem: mockPersonalizeItem,
  getItemForUser: mockGetItemForUser,
  getGroupForUser: mockGetGroupForUser,
  hideTemplateGroup: mockHideTemplateGroup,
  hideTemplateItem: mockHideTemplateItem,
}));
vi.mock('@/services/impersonationLogger', () => ({
  logDataUpdate: vi.fn(),
  logSensitiveEndpointAccess: vi.fn(),
}));
vi.mock('jsonwebtoken', () => ({
  default: { verify: () => ({ id: 'user-123', email: 'test@test.com', role: 'user' }) },
}));

import { PATCH } from '../update/route';

const createRequest = (body: object) => {
  const req = new NextRequest('http://localhost/api/cashflow/update', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  Object.defineProperty(req, 'cookies', {
    get: () => ({
      get: (name: string) => (name === 'token' ? { value: 'valid-token' } : undefined),
    }),
  });
  return req;
};

describe('PATCH /api/cashflow/update — CRUD operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cria grupo com sucesso', async () => {
    mockPrisma.cashflowGroup.create.mockResolvedValue({
      id: 'new-group-1',
      name: 'Novo Grupo',
      type: 'entrada',
      userId: 'user-123',
      items: [],
      children: [],
    });

    const response = await PATCH(
      createRequest({
        operation: 'create',
        type: 'group',
        data: { name: 'Novo Grupo', type: 'entrada' },
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.group.name).toBe('Novo Grupo');
  });

  it('cria item com sucesso', async () => {
    mockGetGroupForUser.mockResolvedValue({ id: 'group-1', userId: 'user-123' });
    mockPrisma.cashflowItem.create.mockResolvedValue({
      id: 'new-item-1',
      name: 'Novo Item',
      groupId: 'group-1',
      values: [],
    });

    const response = await PATCH(
      createRequest({
        operation: 'create',
        type: 'item',
        data: { groupId: 'group-1', name: 'Novo Item' },
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.item.name).toBe('Novo Item');
  });

  it('personaliza grupo template ao atualizar', async () => {
    mockGetGroupForUser.mockResolvedValue({ id: 'tpl-1', userId: null, orderIndex: 0 });
    mockPersonalizeGroup.mockResolvedValue('pers-1');
    mockPrisma.cashflowGroup.update.mockResolvedValue({
      id: 'pers-1',
      name: 'Editado',
      items: [],
      children: [],
    });

    const response = await PATCH(
      createRequest({ operation: 'update', type: 'group', id: 'tpl-1', data: { name: 'Editado' } }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockPersonalizeGroup).toHaveBeenCalledWith('tpl-1', 'user-123');
    expect(data.success).toBe(true);
  });

  it('atualiza item do usuario sem personalizar', async () => {
    mockGetItemForUser.mockResolvedValue({ id: 'item-1', userId: 'user-123' });
    mockPrisma.cashflowItem.update.mockResolvedValue({
      id: 'item-1',
      name: 'Salario CLT',
      values: [],
    });

    const response = await PATCH(
      createRequest({
        operation: 'update',
        type: 'item',
        id: 'item-1',
        data: { name: 'Salario CLT' },
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockPersonalizeItem).not.toHaveBeenCalled();
    expect(data.item.name).toBe('Salario CLT');
  });

  it('deleta grupo vazio com sucesso', async () => {
    // findUnique resolve a linha alvo (override do usuario)
    mockPrisma.cashflowGroup.findUnique.mockResolvedValue({
      id: 'g1',
      userId: 'user-123',
      templateId: null,
    });
    mockPrisma.cashflowGroup.findMany.mockResolvedValue([]);
    mockPrisma.cashflowItem.count.mockResolvedValue(0);
    mockPrisma.cashflowGroup.delete.mockResolvedValue({});

    const response = await PATCH(createRequest({ operation: 'delete', type: 'group', id: 'g1' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockPrisma.cashflowGroup.delete).toHaveBeenCalled();
  });

  it('deleta item com sucesso', async () => {
    mockPrisma.cashflowItem.findUnique.mockResolvedValue({
      id: 'i1',
      userId: 'user-123',
      templateId: null,
    });
    mockPrisma.cashflowItem.delete.mockResolvedValue({});

    const response = await PATCH(createRequest({ operation: 'delete', type: 'item', id: 'i1' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
});

describe('PATCH /api/cashflow/update — override layer (templateId + tombstones)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Caso A: update em item-template cria override (com templateId), nao mexe no template
  it('Caso A — update em item-template invoca personalizeItem e aplica update no override', async () => {
    mockGetItemForUser.mockResolvedValue({
      id: 'tpl-item-1',
      userId: null,
      name: 'Salario',
      groupId: 'tpl-group-1',
    });
    mockPersonalizeItem.mockResolvedValue('override-item-1');
    mockPrisma.cashflowItem.update.mockResolvedValue({
      id: 'override-item-1',
      name: 'Salario CLT',
      userId: 'user-123',
      templateId: 'tpl-item-1',
      values: [],
    });

    const response = await PATCH(
      createRequest({
        operation: 'update',
        type: 'item',
        id: 'tpl-item-1',
        data: { name: 'Salario CLT' },
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockPersonalizeItem).toHaveBeenCalledWith('tpl-item-1', 'user-123');
    // O update deve ser dirigido ao override, nao ao template
    expect(mockPrisma.cashflowItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'override-item-1', userId: 'user-123' },
        data: expect.objectContaining({ name: 'Salario CLT' }),
      }),
    );
    expect(data.item.id).toBe('override-item-1');
  });

  // Caso B: delete em item-template cria tombstone (hidden=true), template intacto
  it('Caso B (item) — delete em item-template cria tombstone via hideTemplateItem', async () => {
    mockPrisma.cashflowItem.findUnique.mockResolvedValue({
      id: 'tpl-item-1',
      userId: null,
      name: 'Salario',
      groupId: 'tpl-group-1',
    });
    mockHideTemplateItem.mockResolvedValue('tombstone-item-1');

    const response = await PATCH(
      createRequest({ operation: 'delete', type: 'item', id: 'tpl-item-1' }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.hidden).toBe(true);
    expect(data.tombstoneId).toBe('tombstone-item-1');
    expect(mockHideTemplateItem).toHaveBeenCalledWith('tpl-item-1', 'user-123');
    // template nao deve ser deletado
    expect(mockPrisma.cashflowItem.delete).not.toHaveBeenCalled();
  });

  it('Caso B (grupo) — delete em grupo-template cria tombstone via hideTemplateGroup', async () => {
    mockPrisma.cashflowGroup.findUnique.mockResolvedValue({
      id: 'tpl-group-1',
      userId: null,
      name: 'Receitas',
      type: 'entrada',
    });
    mockHideTemplateGroup.mockResolvedValue('tombstone-group-1');

    const response = await PATCH(
      createRequest({ operation: 'delete', type: 'group', id: 'tpl-group-1' }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.hidden).toBe(true);
    expect(data.tombstoneId).toBe('tombstone-group-1');
    expect(mockHideTemplateGroup).toHaveBeenCalledWith('tpl-group-1', 'user-123');
    expect(mockPrisma.cashflowGroup.delete).not.toHaveBeenCalled();
  });

  // Caso C: idempotencia — 2 updates seguidos no mesmo template => personalizeItem
  // chamado 2x mas o resultado eh sempre o mesmo override (single row no DB).
  // O contrato do personalizeItem garante isso. Aqui apenas verificamos que a
  // rota nao tenta criar nova row, sempre delegando para o helper.
  it('Caso C — updates idempotentes em template usam o mesmo override', async () => {
    mockGetItemForUser.mockResolvedValue({
      id: 'tpl-item-1',
      userId: null,
      name: 'Salario',
      groupId: 'tpl-group-1',
    });
    // personalizeItem deve retornar sempre o mesmo id (idempotencia)
    mockPersonalizeItem.mockResolvedValue('override-item-1');
    mockPrisma.cashflowItem.update.mockResolvedValue({
      id: 'override-item-1',
      name: 'Salario CLT',
      values: [],
    });

    await PATCH(
      createRequest({
        operation: 'update',
        type: 'item',
        id: 'tpl-item-1',
        data: { name: 'Salario CLT' },
      }),
    );
    await PATCH(
      createRequest({
        operation: 'update',
        type: 'item',
        id: 'tpl-item-1',
        data: { name: 'Salario PJ' },
      }),
    );

    // Ambas as chamadas convergem para o mesmo override
    expect(mockPersonalizeItem).toHaveBeenCalledTimes(2);
    expect(mockPersonalizeItem.mock.results.every((r) => r.value === 'override-item-1')).toBe(true);
    // Nenhuma cashflowItem.create (override criado pelo helper, nao pela rota)
    expect(mockPrisma.cashflowItem.create).not.toHaveBeenCalled();
  });

  // Caso D: delete em override (linha userId=X com templateId !== null)
  // deve fazer DELETE simples — efetivamente "reverter para o template".
  it('Caso D (item) — delete em override faz DELETE simples (revert to template)', async () => {
    mockPrisma.cashflowItem.findUnique.mockResolvedValue({
      id: 'override-item-1',
      userId: 'user-123',
      templateId: 'tpl-item-1', // override
      name: 'Salario CLT',
      groupId: 'group-1',
    });
    mockPrisma.cashflowItem.delete.mockResolvedValue({});

    const response = await PATCH(
      createRequest({ operation: 'delete', type: 'item', id: 'override-item-1' }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockPrisma.cashflowItem.delete).toHaveBeenCalledWith({
      where: { id: 'override-item-1' },
    });
    // tombstone NAO deve ser invocado
    expect(mockHideTemplateItem).not.toHaveBeenCalled();
  });

  it('Caso D (grupo) — delete em override de grupo faz DELETE simples', async () => {
    mockPrisma.cashflowGroup.findUnique.mockResolvedValue({
      id: 'override-group-1',
      userId: 'user-123',
      templateId: 'tpl-group-1',
      name: 'Receitas',
    });
    mockPrisma.cashflowGroup.findMany.mockResolvedValue([]);
    mockPrisma.cashflowItem.count.mockResolvedValue(0);
    mockPrisma.cashflowGroup.delete.mockResolvedValue({});

    const response = await PATCH(
      createRequest({ operation: 'delete', type: 'group', id: 'override-group-1' }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockPrisma.cashflowGroup.delete).toHaveBeenCalled();
    expect(mockHideTemplateGroup).not.toHaveBeenCalled();
  });

  // Caso E: hide -> unhide. Re-update no override hidden=true zera hidden.
  it('Caso E — re-update em override oculto zera hidden=false', async () => {
    // getItemForUser retorna a linha do usuario (override hidden=true).
    mockGetItemForUser.mockResolvedValue({
      id: 'override-item-1',
      userId: 'user-123',
      templateId: 'tpl-item-1',
      hidden: true,
      name: 'Salario',
      groupId: 'group-1',
    });
    mockPrisma.cashflowItem.update.mockResolvedValue({
      id: 'override-item-1',
      name: 'Salario CLT',
      hidden: false,
      values: [],
    });

    const response = await PATCH(
      createRequest({
        operation: 'update',
        type: 'item',
        id: 'override-item-1',
        data: { name: 'Salario CLT' },
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    // O update enviado ao Prisma DEVE incluir hidden:false
    expect(mockPrisma.cashflowItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ hidden: false, name: 'Salario CLT' }),
      }),
    );
    // personalizeItem nao deve ser chamado — ja eh override do usuario
    expect(mockPersonalizeItem).not.toHaveBeenCalled();
  });
});
