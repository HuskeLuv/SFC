import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import bcrypt from 'bcrypt';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
  userConsent: { updateMany: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 't@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
);

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { GET, PATCH, DELETE } from '../route';

const reqGet = () => new NextRequest('http://localhost/api/profile', { method: 'GET' });
const reqPatch = (body: object) =>
  new NextRequest('http://localhost/api/profile', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
const reqDelete = (body: object) =>
  new NextRequest('http://localhost/api/profile', {
    method: 'DELETE',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthWithActing.mockResolvedValue({
    payload: { id: 'user-1', email: 't@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  });
});

describe('GET /api/profile', () => {
  it('retorna perfil do usuário autenticado', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 't@t.com',
      name: 'Test',
      avatarUrl: null,
      role: 'user',
      createdAt: new Date('2025-01-01'),
    });
    const res = await GET(reqGet());
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.id).toBe('user-1');
    expect(data.email).toBe('t@t.com');
  });

  it('retorna 404 quando user não encontrado', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const res = await GET(reqGet());
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/profile', () => {
  it('atualiza nome', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 't@t.com',
      name: 'Old',
      avatarUrl: null,
      role: 'user',
      password: 'h',
    });
    mockPrisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: 't@t.com',
      name: 'New',
      avatarUrl: null,
      role: 'user',
    });

    const res = await PATCH(reqPatch({ name: 'New' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe('New');
  });

  it('exige currentPassword pra trocar senha', async () => {
    const res = await PATCH(reqPatch({ newPassword: 'novasenha123' }));
    expect(res.status).toBe(400);
  });

  it('rejeita senha atual incorreta', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 't@t.com',
      name: 'X',
      avatarUrl: null,
      role: 'user',
      password: await bcrypt.hash('correta', 4),
    });
    const res = await PATCH(reqPatch({ currentPassword: 'errada', newPassword: 'NovaSenha123!' }));
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/profile', () => {
  it('anonimiza usuário quando senha confere', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 't@t.com',
      name: 'X',
      avatarUrl: null,
      role: 'user',
      password: await bcrypt.hash('123', 4),
    });
    mockPrisma.user.update.mockResolvedValue({});
    mockPrisma.userConsent.updateMany.mockResolvedValue({ count: 2 });

    const res = await DELETE(reqDelete({ currentPassword: '123', confirm: true }));
    expect(res.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Usuário removido' }),
      }),
    );
    expect(mockPrisma.userConsent.updateMany).toHaveBeenCalled();
  });

  it('exige confirmação explícita', async () => {
    const res = await DELETE(reqDelete({ currentPassword: '123', confirm: false }));
    expect(res.status).toBe(400);
  });

  it('rejeita senha incorreta', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 't@t.com',
      name: 'X',
      avatarUrl: null,
      role: 'user',
      password: await bcrypt.hash('correta', 4),
    });
    const res = await DELETE(reqDelete({ currentPassword: 'errada', confirm: true }));
    expect(res.status).toBe(403);
  });
});
