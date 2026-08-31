import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ApiError } from '@/utils/apiErrorHandler';

const mockAuthenticateConsultant = vi.hoisted(() => vi.fn());
const mockGetClientsByConsultant = vi.hoisted(() => vi.fn());

vi.mock('@/utils/consultantAuth', () => ({
  authenticateConsultant: mockAuthenticateConsultant,
}));

vi.mock('@/services/consultantService', () => ({
  getClientsByConsultant: mockGetClientsByConsultant,
}));

import { GET } from '../../consultant/clients/route';

const createRequest = () =>
  new NextRequest('http://localhost/api/consultant/clients', { method: 'GET' });

describe('GET /api/consultant/clients', () => {
  const mockClients = [
    {
      id: 'cc-1',
      clientId: 'client-1',
      name: 'Client One',
      email: 'client1@test.com',
      status: 'active',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateConsultant.mockResolvedValue({
      consultantId: 'consultant-1',
      userId: 'user-1',
    });
    mockGetClientsByConsultant.mockResolvedValue(mockClients);
  });

  it('retorna lista de clientes do consultor', async () => {
    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.clients).toEqual(mockClients);
    expect(mockGetClientsByConsultant).toHaveBeenCalledWith('consultant-1');
  });

  it('retorna Cache-Control header', async () => {
    const response = await GET(createRequest());

    expect(response.headers.get('Cache-Control')).toBe(
      'private, no-cache, no-store, must-revalidate',
    );
  });

  it('retorna 401 quando nao autenticado', async () => {
    mockAuthenticateConsultant.mockRejectedValue(new ApiError(401, 'Não autorizado'));

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Não autorizado');
  });

  it('retorna 403 quando usuario nao e consultor', async () => {
    mockAuthenticateConsultant.mockRejectedValue(new ApiError(403, 'Acesso negado'));

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Acesso negado');
  });
});
