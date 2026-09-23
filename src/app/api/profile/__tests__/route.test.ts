import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
  userConsent: { updateMany: vi.fn() },
  userChangeLog: { create: vi.fn(), deleteMany: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 't@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
);

const mockBumpSessionVersion = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/auth/sessionVersion', () => ({ bumpSessionVersion: mockBumpSessionVersion }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { GET, PATCH, DELETE } from '../route';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

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

    expect(mockPrisma.userChangeLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        section: 'perfil',
        action: 'perfil.editar',
        changes: [{ field: 'name', label: 'Nome', before: 'Old', after: 'New' }],
      }),
    });
  });

  it('troca de senha registra senha.alterar sem valores', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 't@t.com',
      name: 'X',
      avatarUrl: null,
      role: 'user',
      password: await bcrypt.hash('correta', 4),
    });
    mockPrisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: 't@t.com',
      name: 'X',
      avatarUrl: null,
      role: 'user',
    });

    const res = await PATCH(reqPatch({ currentPassword: 'correta', newPassword: 'NovaSenha123!' }));
    expect(res.status).toBe(200);

    const calls = mockPrisma.userChangeLog.create.mock.calls.map((c) => c[0].data);
    const senhaRow = calls.find((d) => d.action === 'senha.alterar');
    expect(senhaRow).toBeDefined();
    expect(senhaRow.changes).toBeUndefined();
    // Nenhuma linha pode conter valores de senha
    expect(JSON.stringify(calls)).not.toContain('NovaSenha123!');
    expect(JSON.stringify(calls)).not.toContain('correta');
  });

  it('troca de senha derruba as outras sessões e reemite o cookie deste aparelho', async () => {
    const at = Math.floor(Date.now() / 1000) - 3 * 86400;
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-1', email: 't@t.com', role: 'user', sv: 1, rm: true, at, iat: at },
      targetUserId: 'user-1',
      actingClient: null,
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 't@t.com',
      name: 'X',
      avatarUrl: null,
      role: 'user',
      password: await bcrypt.hash('correta', 4),
    });
    mockPrisma.user.update.mockResolvedValue({ id: 'user-1', role: 'user' });
    mockBumpSessionVersion.mockResolvedValue(2);

    const res = await PATCH(reqPatch({ currentPassword: 'correta', newPassword: 'NovaSenha123!' }));
    expect(res.status).toBe(200);
    expect(mockBumpSessionVersion).toHaveBeenCalledWith('user-1');

    const cookie = res.cookies.get('token');
    expect(cookie?.value).toBeTruthy();
    const claims = jwt.verify(cookie!.value, process.env.JWT_SECRET!) as Record<string, unknown>;
    expect(claims).toMatchObject({ id: 'user-1', role: 'user', sv: 2, rm: true, at });
    expect(cookie?.maxAge).toBeGreaterThan(0);
  });

  it('editar só o nome não mexe nas sessões', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', name: 'Old', password: 'h' });
    mockPrisma.user.update.mockResolvedValue({ id: 'user-1', name: 'New' });
    const res = await PATCH(reqPatch({ name: 'New' }));
    expect(res.status).toBe(200);
    expect(mockBumpSessionVersion).not.toHaveBeenCalled();
    expect(res.headers.get('set-cookie')).toBeNull();
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
    // Histórico de alterações (contém PII) é eliminado na anonimização
    expect(mockPrisma.userChangeLog.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    // Derruba todas as sessões e limpa o cookie
    expect(mockBumpSessionVersion).toHaveBeenCalledWith('user-1');
    expect(res.headers.get('set-cookie')).toMatch(/token=;.*Max-Age=0/);
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
