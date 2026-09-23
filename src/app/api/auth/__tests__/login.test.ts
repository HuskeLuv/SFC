import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  loginEvent: { create: vi.fn() },
}));

const mockBcrypt = vi.hoisted(() => ({
  compare: vi.fn(),
}));

const mockJwt = vi.hoisted(() => ({
  sign: vi.fn().mockReturnValue('mock-token'),
}));

vi.mock('@/lib/prisma', () => ({ default: mockPrisma }));
vi.mock('bcrypt', () => ({ default: mockBcrypt }));
vi.mock('jsonwebtoken', () => ({ default: mockJwt }));

import { POST } from '../../auth/login/route';

const createRequest = (body: object) =>
  new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('POST /api/auth/login', () => {
  const mockUser = {
    id: 'user-1',
    email: 'test@test.com',
    name: 'Test User',
    password: 'hashed-password',
    role: 'user',
    sessionVersion: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockPrisma.loginEvent.create.mockResolvedValue({});
    mockBcrypt.compare.mockResolvedValue(true);
    mockJwt.sign.mockReturnValue('mock-token');
  });

  it('retorna 200 e token cookie com credenciais validas', async () => {
    const response = await POST(createRequest({ email: 'test@test.com', password: 'password123' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.user).toEqual({
      id: 'user-1',
      email: 'test@test.com',
      name: 'Test User',
      role: 'user',
    });

    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toContain('token=mock-token');
  });

  it('com rememberMe: claims sv/rm/at, JWT de 30 dias e cookie com Max-Age de 30 dias', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, sessionVersion: 4 });
    const before = Math.floor(Date.now() / 1000);
    const response = await POST(
      createRequest({ email: 'test@test.com', password: 'password123', rememberMe: true }),
    );

    expect(response.status).toBe(200);
    const [claims, , options] = mockJwt.sign.mock.calls[0];
    expect(claims).toMatchObject({ id: 'user-1', role: 'user', sv: 4, rm: true });
    expect(claims.at).toBeGreaterThanOrEqual(before);
    expect(options).toEqual({ expiresIn: 30 * 86400 });
    expect(response.headers.get('set-cookie')).toContain('Max-Age=2592000');
  });

  it('sem rememberMe: cookie de sessão (sem Max-Age nem Expires) e JWT de 12h', async () => {
    const response = await POST(
      createRequest({ email: 'test@test.com', password: 'password123', rememberMe: false }),
    );

    expect(response.status).toBe(200);
    const [claims, , options] = mockJwt.sign.mock.calls[0];
    expect(claims).toMatchObject({ id: 'user-1', role: 'user', sv: 0, rm: false });
    expect(options).toEqual({ expiresIn: 12 * 3600 });
    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('token=mock-token');
    expect(setCookie).not.toMatch(/Max-Age/i);
    expect(setCookie).not.toMatch(/Expires/i);
    expect(setCookie).toMatch(/HttpOnly/i);
  });

  it('rememberMe ausente conta como desmarcado (cookie de sessão)', async () => {
    const response = await POST(createRequest({ email: 'test@test.com', password: 'password123' }));
    expect(mockJwt.sign.mock.calls[0][0]).toMatchObject({ rm: false });
    expect(response.headers.get('set-cookie')).not.toMatch(/Max-Age/i);
  });

  it.each(['admin', 'consultant'])(
    '%s com rememberMe: 1 dia (JWT e cookie), sem os 30 dias',
    async (role) => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, role });
      const response = await POST(
        createRequest({ email: 'test@test.com', password: 'password123', rememberMe: true }),
      );
      expect(mockJwt.sign.mock.calls[0][2]).toEqual({ expiresIn: 86400 });
      expect(response.headers.get('set-cookie')).toContain('Max-Age=86400');
    },
  );

  describe('Validacao Zod', () => {
    it('retorna 400 quando email esta ausente', async () => {
      const response = await POST(createRequest({ password: 'password123' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('email');
    });

    it('retorna 400 quando password esta ausente', async () => {
      const response = await POST(createRequest({ email: 'test@test.com' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('password');
    });

    it('retorna 400 com formato de email invalido', async () => {
      const response = await POST(createRequest({ email: 'not-email', password: 'password123' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('email');
    });
  });

  describe('Credenciais invalidas', () => {
    it('retorna 401 quando usuario nao existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const response = await POST(
        createRequest({ email: 'unknown@test.com', password: 'password123' }),
      );
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toContain('Credenciais inválidas');
    });

    it('retorna 401 quando senha esta incorreta', async () => {
      mockBcrypt.compare.mockResolvedValue(false);

      const response = await POST(
        createRequest({ email: 'test@test.com', password: 'wrong-password' }),
      );
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toContain('Credenciais inválidas');
    });
  });

  describe('Login tracking (LoginEvent)', () => {
    it('grava evento de sucesso com userId e success=true', async () => {
      await POST(createRequest({ email: 'test@test.com', password: 'password123' }));

      expect(mockPrisma.loginEvent.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.loginEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          email: 'test@test.com',
          success: true,
          reason: null,
        }),
      });
    });

    it('grava falha user_not_found com userId null', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await POST(createRequest({ email: 'ghost@test.com', password: 'password123' }));

      expect(mockPrisma.loginEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: null,
          email: 'ghost@test.com',
          success: false,
          reason: 'user_not_found',
        }),
      });
    });

    it('grava falha bad_password com userId do usuario', async () => {
      mockBcrypt.compare.mockResolvedValue(false);

      await POST(createRequest({ email: 'test@test.com', password: 'wrong' }));

      expect(mockPrisma.loginEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          success: false,
          reason: 'bad_password',
        }),
      });
    });

    it('grava falha totp_required quando 2FA ativo e codigo ausente', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        totpEnabled: true,
        totpSecret: 'SECRET',
      });

      const response = await POST(
        createRequest({ email: 'test@test.com', password: 'password123' }),
      );

      expect(response.status).toBe(401);
      expect(mockPrisma.loginEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ success: false, reason: 'totp_required' }),
      });
    });

    it('login bem-sucedido mesmo se a gravacao do evento falhar (best-effort)', async () => {
      mockPrisma.loginEvent.create.mockRejectedValue(new Error('db down'));

      const response = await POST(
        createRequest({ email: 'test@test.com', password: 'password123' }),
      );

      expect(response.status).toBe(200);
      const setCookie = response.headers.get('set-cookie');
      expect(setCookie).toContain('token=mock-token');
    });
  });
});
