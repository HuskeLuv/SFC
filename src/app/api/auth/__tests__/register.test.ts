import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), create: vi.fn() },
}));

const mockBcrypt = vi.hoisted(() => ({
  hash: vi.fn().mockResolvedValue('hashed-password'),
}));

const mockJwt = vi.hoisted(() => ({
  sign: vi.fn().mockReturnValue('mock-token'),
}));

const mockSetupUserCashflow = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/lib/prisma', () => ({ default: mockPrisma }));
vi.mock('bcrypt', () => ({ default: mockBcrypt }));
vi.mock('jsonwebtoken', () => ({ default: mockJwt }));
vi.mock('@/utils/cashflowSetup', () => ({ setupUserCashflow: mockSetupUserCashflow }));

import { POST } from '../../auth/register/route';

const createRequest = (body: object) =>
  new NextRequest('http://localhost/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('POST /api/auth/register', () => {
  const validBody = {
    email: 'new@test.com',
    password: 'password123',
    name: 'New User',
  };

  const createdUser = {
    id: 'user-new',
    email: 'new@test.com',
    name: 'New User',
    role: 'user',
    password: 'hashed-password',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue(createdUser);
    mockBcrypt.hash.mockResolvedValue('hashed-password');
    mockJwt.sign.mockReturnValue('mock-token');
    mockSetupUserCashflow.mockResolvedValue(undefined);
  });

  it('registra usuario com sucesso e retorna token', async () => {
    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.user).toEqual({
      id: 'user-new',
      email: 'new@test.com',
      name: 'New User',
      role: 'user',
    });

    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toContain('token=mock-token');

    expect(mockBcrypt.hash).toHaveBeenCalledWith('password123', 10);
    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: {
        email: 'new@test.com',
        password: 'hashed-password',
        name: 'New User',
        role: 'user',
      },
    });
    expect(mockSetupUserCashflow).toHaveBeenCalledWith({ userId: 'user-new' });
  });

  it('continua mesmo se setupUserCashflow falhar', async () => {
    mockSetupUserCashflow.mockRejectedValue(new Error('cashflow error'));

    const response = await POST(createRequest(validBody));

    expect(response.status).toBe(200);
  });

  describe('Validacao Zod', () => {
    it('retorna 400 quando email esta ausente', async () => {
      const response = await POST(createRequest({ password: 'pass123', name: 'Test' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('email');
    });

    it('retorna 400 quando password esta ausente', async () => {
      const response = await POST(createRequest({ email: 'test@test.com', name: 'Test' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('password');
    });

    it('retorna 400 quando name esta ausente', async () => {
      const response = await POST(createRequest({ email: 'test@test.com', password: 'pass123' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('name');
    });

    it('retorna 400 com formato de email invalido', async () => {
      const response = await POST(
        createRequest({ email: 'not-email', password: 'pass123', name: 'Test' }),
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('email');
    });
  });

  it('retorna 409 quando email ja existe', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(createdUser);

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toContain('Usuário já existe');
  });
});
