import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
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
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
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

  it('retorna 200 com rememberMe true', async () => {
    const response = await POST(
      createRequest({ email: 'test@test.com', password: 'password123', rememberMe: true }),
    );

    expect(response.status).toBe(200);
    expect(mockJwt.sign).toHaveBeenCalledWith(
      { id: 'user-1', email: 'test@test.com', role: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' },
    );
  });

  it('retorna 200 com rememberMe false (expiresIn 1d)', async () => {
    const response = await POST(
      createRequest({ email: 'test@test.com', password: 'password123', rememberMe: false }),
    );

    expect(response.status).toBe(200);
    expect(mockJwt.sign).toHaveBeenCalledWith(
      { id: 'user-1', email: 'test@test.com', role: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '1d' },
    );
  });

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
});
