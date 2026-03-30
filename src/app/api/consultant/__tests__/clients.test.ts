import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

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

    expect(response.headers.get('Cache-Control')).toBe('s-maxage=300, stale-while-revalidate=60');
  });

  it('retorna 401 quando nao autenticado', async () => {
    mockAuthenticateConsultant.mockRejectedValue({ status: 401, message: 'Não autenticado' });

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBeDefined();
  });

  it('retorna 403 quando usuario nao e consultor', async () => {
    mockAuthenticateConsultant.mockRejectedValue({
      status: 403,
      message: 'Acesso restrito a consultores',
    });

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBeDefined();
  });
});
