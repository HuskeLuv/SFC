/**
 * GET /api/analise-ativos/ativos/[ticker]/imoveis-fii (A6, fatia A). Fixture com o FII FICTÍCIO
 * XPTO11 (números e nomes inventados).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockExigir = vi.hoisted(() => vi.fn());
const mockObter = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));
vi.mock('@/services/analiseAtivos/acesso/acessoAnalise', () => ({
  exigirRecursoAnalise: mockExigir,
}));
vi.mock('@/services/analiseAtivos/leitura/ativo/imoveisFii', () => ({
  obterImoveisFii: mockObter,
}));

import { GET } from '../route';
import { ApiError } from '@/utils/apiErrorHandler';
import type { ImoveisFiiResposta } from '@/types/analiseAtivosComplementos';

const RESPOSTA: ImoveisFiiResposta = {
  ticker: 'XPTO11',
  composicao: {
    estado: 'ok',
    valor: {
      refMonth: '2026-09-01',
      ativoTotal: 1000,
      fatias: [
        { codigo: 'imoveis', pct: 90, valor: 900 },
        { codigo: 'cri_cra', pct: 0, valor: 0 },
        { codigo: 'lci_lca', pct: 0, valor: 0 },
        { codigo: 'cotas_fii', pct: 0, valor: 0 },
        { codigo: 'caixa_renda_fixa', pct: 8, valor: 80 },
        { codigo: 'outros', pct: 2, valor: 20 },
      ],
      outrosDetalhado: false,
    },
  },
  imoveis: {
    estado: 'ausente',
    motivo: 'sem_informe_trimestral',
    texto: 'sem dado · o fundo não tem informe trimestral recente na CVM',
  },
  versao: 'v1',
};

const chamar = (ticker: string) =>
  GET(new NextRequest(`http://localhost/api/analise-ativos/ativos/${ticker}/imoveis-fii`), {
    params: Promise.resolve({ ticker }),
  });

describe('GET /api/analise-ativos/ativos/[ticker]/imoveis-fii', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T15:00:00Z'));
    mockExigir.mockReset();
    mockObter.mockReset();
    mockExigir.mockResolvedValue({ payload: { id: 'u1' }, targetUserId: 'u1', actingClient: null });
    mockObter.mockResolvedValue({ dados: RESPOSTA, cache: false });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('200 com o contrato, cache privado de 5 min e Server-Timing', async () => {
    const res = await chamar('xpto11');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(RESPOSTA);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=300');
    expect(res.headers.get('Server-Timing')).toMatch(/^imoveisfii;desc="banco";dur=/);
    expect(mockExigir).toHaveBeenCalledWith(expect.anything(), 'imoveisFii');
    expect(mockObter).toHaveBeenCalledWith('XPTO11', '2026-10-19');
  });

  it('chave desligada: 404 antes da sessão e sem ler o banco', async () => {
    const real = await vi.importActual<
      typeof import('@/services/analiseAtivos/acesso/acessoAnalise')
    >('@/services/analiseAtivos/acesso/acessoAnalise');
    vi.stubEnv('ANALISE_ATIVOS_HABILITADA', 'true');
    vi.stubEnv('ANALISE_ATIVOS_IMOVEIS_FII_HABILITADO', '');
    mockExigir.mockImplementation(real.exigirRecursoAnalise);
    const res = await chamar('XPTO11');
    expect(res.status).toBe(404);
    expect(mockObter).not.toHaveBeenCalled();
  });

  it('ação, ticker fora da área ou FII sem informe (leitura null): 404', async () => {
    mockObter.mockResolvedValue(null);
    expect((await chamar('WEGE3')).status).toBe(404);
    expect((await chamar('XPTO11')).status).toBe(404);
  });

  it('ticker fora do padrão: 400', async () => {
    const res = await chamar('<script>');
    expect(res.status).toBe(400);
    expect(mockObter).not.toHaveBeenCalled();
  });

  it('sem sessão: 401 (erro do acesso propagado)', async () => {
    mockExigir.mockRejectedValue(new ApiError(401, 'Não autenticado'));
    expect((await chamar('XPTO11')).status).toBe(401);
  });
});
