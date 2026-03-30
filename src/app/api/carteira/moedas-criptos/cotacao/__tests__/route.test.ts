import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/services/impersonationLogger', () => ({
  logDataUpdate: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from '../route';

const createRequest = (body: object) =>
  new NextRequest('http://localhost/api/carteira/moedas-criptos/cotacao', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('POST /api/carteira/moedas-criptos/cotacao', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('atualiza cotação com sucesso', async () => {
    const response = await POST(
      createRequest({
        ativoId: 'asset-1',
        cotacao: 25.5,
      }),
    );
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toContain('Cotação atualizada');
  });

  it('retorna 400 quando ativoId está ausente', async () => {
    const response = await POST(
      createRequest({
        cotacao: 25.5,
      }),
    );
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toContain('Parâmetros obrigatórios');
  });

  it('retorna 400 quando cotacao está ausente', async () => {
    const response = await POST(
      createRequest({
        ativoId: 'asset-1',
      }),
    );
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toContain('Parâmetros obrigatórios');
  });

  it('retorna 400 quando cotação é zero', async () => {
    const response = await POST(
      createRequest({
        ativoId: 'asset-1',
        cotacao: 0,
      }),
    );
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toContain('maior que zero');
  });

  it('retorna 400 quando cotação é negativa', async () => {
    const response = await POST(
      createRequest({
        ativoId: 'asset-1',
        cotacao: -10,
      }),
    );
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toContain('maior que zero');
  });
});
