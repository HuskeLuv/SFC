import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  exigir: vi.fn(),
  sugestoes: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ default: { tag: 'prisma' }, prisma: { tag: 'prisma' } }));
vi.mock('@/services/analiseAtivos/acesso/acessoAnalise', () => ({
  exigirRecursoAnalise: mocks.exigir,
}));
vi.mock('@/services/analiseAtivos/leitura/ativo/sugestoesComparar', () => ({
  sugestoesComparar: mocks.sugestoes,
}));

import { GET } from '../route';
import { ApiError } from '@/utils/apiErrorHandler';

const RESPOSTA = {
  ticker: 'WEGE3',
  janela: 5,
  itens: [
    {
      ticker: 'EMBJ3',
      nome: 'Embraer',
      mesmoSetor: true,
      metrica: { rotulo: 'P/L', valor: { estado: 'ok', valor: 12 }, formato: 'multiplo' },
      criterios: { n: 3, de: 6 },
    },
  ],
};

const chamar = (ticker: string, qs = '') =>
  GET(
    new NextRequest(`http://localhost/api/analise-ativos/ativos/${ticker}/comparar-sugestoes${qs}`),
    { params: Promise.resolve({ ticker }) },
  );

describe('GET /api/analise-ativos/ativos/[ticker]/comparar-sugestoes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exigir.mockResolvedValue({
      payload: { id: 'u1' },
      targetUserId: 'u1',
      actingClient: null,
    });
    mocks.sugestoes.mockResolvedValue(RESPOSTA);
  });

  it('200 com o contrato; janela padrão 5; ticker normalizado; recurso comparador', async () => {
    const res = await chamar('wege3');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(RESPOSTA);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=300');
    expect(mocks.exigir).toHaveBeenCalledWith(expect.anything(), 'comparador');
    expect(mocks.sugestoes).toHaveBeenCalledWith(
      { tag: 'prisma' },
      { ticker: 'WEGE3', janela: 5, q: null },
    );
  });

  it('q e janela repassados (q aparado)', async () => {
    await chamar('WEGE3', '?q=%20emb%20&janela=10');
    expect(mocks.sugestoes).toHaveBeenCalledWith(expect.anything(), {
      ticker: 'WEGE3',
      janela: 10,
      q: 'emb',
    });
  });

  it('400: janela fora de 3|5|10, q com mais de 40 caracteres, ticker inválido', async () => {
    expect((await chamar('WEGE3', '?janela=7')).status).toBe(400);
    expect((await chamar('WEGE3', `?q=${'a'.repeat(41)}`)).status).toBe(400);
    expect((await chamar('WEGE')).status).toBe(400);
    expect(mocks.sugestoes).not.toHaveBeenCalled();
  });

  it('404 sem acesso (sem ler dados) e 404 ticker fora da área', async () => {
    mocks.exigir.mockRejectedValueOnce(new ApiError(404, 'Recurso não disponível'));
    expect((await chamar('WEGE3')).status).toBe(404);
    expect(mocks.sugestoes).not.toHaveBeenCalled();
    mocks.sugestoes.mockResolvedValueOnce(null);
    expect((await chamar('ZZZZ3')).status).toBe(404);
  });

  it('nenhuma chave de nota/índice/semáforo/destaque na resposta', async () => {
    const corpo = await (await chamar('WEGE3')).text();
    expect(corpo).not.toMatch(/indice|semaforo|destaque|nota|rating|score/i);
  });
});
