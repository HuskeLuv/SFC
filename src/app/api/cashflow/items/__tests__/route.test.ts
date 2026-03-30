import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';

const mockPrisma = vi.hoisted(() => ({
  cashflowItem: { create: vi.fn() },
}));

const mockJwtVerify = vi.hoisted(() =>
  vi.fn().mockReturnValue({ id: 'user-123', email: 'test@test.com' }),
);

const mockGetGroupForUser = vi.hoisted(() => vi.fn());
const mockPersonalizeGroup = vi.hoisted(() => vi.fn());

vi.mock('jsonwebtoken', () => ({
  default: { verify: mockJwtVerify },
  verify: mockJwtVerify,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
  default: mockPrisma,
}));

vi.mock('@/utils/cashflowPersonalization', () => ({
  getGroupForUser: mockGetGroupForUser,
  personalizeGroup: mockPersonalizeGroup,
}));

const createPostRequest = (body: Record<string, unknown>) => {
  const url = new URL('http://localhost/api/cashflow/items');
  const req = new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  req.cookies.set('token', 'valid-token');
  return req;
};

describe('POST /api/cashflow/items', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJwtVerify.mockReturnValue({ id: 'user-123', email: 'test@test.com' });
  });

  it('cria item com sucesso em grupo personalizado', async () => {
    mockGetGroupForUser.mockResolvedValue({
      id: 'group-1',
      name: 'Receitas',
      userId: 'user-123',
    });
    const newItem = {
      id: 'new-item-1',
      name: 'Freelance',
      userId: 'user-123',
      groupId: 'group-1',
      rank: null,
      significado: null,
      values: [],
    };
    mockPrisma.cashflowItem.create.mockResolvedValue(newItem);

    const response = await POST(createPostRequest({ groupId: 'group-1', name: 'Freelance' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.name).toBe('Freelance');
    expect(data.userId).toBe('user-123');
  });

  it('personaliza grupo template antes de criar item', async () => {
    mockGetGroupForUser.mockResolvedValue({
      id: 'tpl-group-1',
      name: 'Receitas',
      userId: null, // template
    });
    mockPersonalizeGroup.mockResolvedValue('personalized-group-1');
    mockPrisma.cashflowItem.create.mockResolvedValue({
      id: 'new-item-1',
      name: 'Bonus',
      userId: 'user-123',
      groupId: 'personalized-group-1',
      rank: null,
      significado: null,
      values: [],
    });

    const response = await POST(createPostRequest({ groupId: 'tpl-group-1', name: 'Bonus' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockPersonalizeGroup).toHaveBeenCalledWith('tpl-group-1', 'user-123');
    expect(data.groupId).toBe('personalized-group-1');
  });

  it('retorna 401 quando token nao fornecido', async () => {
    const url = new URL('http://localhost/api/cashflow/items');
    const req = new NextRequest(url, {
      method: 'POST',
      body: JSON.stringify({ groupId: 'g1', name: 'Test' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('Token');
  });

  it('retorna erro de validacao quando campos obrigatorios ausentes', async () => {
    const response = await POST(createPostRequest({}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('inválidos');
  });
});
