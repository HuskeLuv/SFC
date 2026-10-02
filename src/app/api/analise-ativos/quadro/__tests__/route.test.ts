import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { mockAuthAsConsultant, mockAuthAsUser } from '@/test/mocks/auth';

const mocks = vi.hoisted(() => ({
  exigir: vi.fn(),
  versao: vi.fn(),
  linhasApi: vi.fn(),
  linhas: vi.fn(),
  prisma: {
    portfolio: { findMany: vi.fn() },
    watchlist: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }));
vi.mock('@/services/analiseAtivos/acesso/acessoAnalise', () => ({
  exigirAcessoAnalise: mocks.exigir,
}));
vi.mock('@/services/analiseAtivos/leitura/linhasQuadro', async (original) => ({
  ...(await original<typeof import('@/services/analiseAtivos/leitura/linhasQuadro')>()),
  versaoQuadro: mocks.versao,
  obterLinhasQuadroApi: mocks.linhasApi,
  obterLinhasQuadro: mocks.linhas,
}));

import { GET } from '../route';
import { ApiError } from '@/utils/apiErrorHandler';
import { GERADO_EM_FIXTURE, LINHAS_FIXTURE } from '@/test/fixtures/analiseAtivos/linhasDb';
import { paraLinhaQuadroApi } from '@/services/analiseAtivos/leitura/linhasQuadro';

const VERSAO_FIXTURE_DB = GERADO_EM_FIXTURE.toISOString();

const req = (qs: string) => new NextRequest(`http://localhost/api/analise-ativos/quadro?${qs}`);

describe('GET /api/analise-ativos/quadro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exigir.mockResolvedValue(mockAuthAsUser('u1'));
    mocks.versao.mockResolvedValue(VERSAO_FIXTURE_DB);
    mocks.linhasApi.mockResolvedValue(LINHAS_FIXTURE.map(paraLinhaQuadroApi));
    mocks.linhas.mockResolvedValue(LINHAS_FIXTURE.filter((l) => l.noQuadro));
    mocks.prisma.portfolio.findMany.mockResolvedValue([{ asset: { symbol: 'WEGE3' } }]);
    mocks.prisma.watchlist.findMany.mockResolvedValue([{ asset: { symbol: 'itub4' } }]);
  });

  it('404 sem acesso (flag desligada ou fora do beta)', async () => {
    mocks.exigir.mockRejectedValue(new ApiError(404, 'Recurso não disponível'));
    const res = await GET(req('classe=acao'));
    expect(res.status).toBe(404);
    expect(mocks.linhasApi).not.toHaveBeenCalled();
  });

  it('400 com query inválida (zod)', async () => {
    for (const qs of [
      '',
      'classe=stock',
      'classe=acao&ordem=nota',
      'classe=acao&limite=500',
      'classe=fii&dyMin=-1',
    ]) {
      const res = await GET(req(qs));
      expect(res.status, qs).toBe(400);
    }
  });

  it('200 com no-store, Server-Timing e o contrato da resposta', async () => {
    const res = await GET(req('classe=acao&ordem=pl&dir=asc'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Server-Timing')).toMatch(/^quadro;dur=/);
    const corpo = await res.json();
    expect(corpo).toMatchObject({
      classe: 'acao',
      dataRef: '2026-09-29',
      versao: VERSAO_FIXTURE_DB,
      offset: 0,
      limite: 25,
    });
    expect(corpo.contagens.acao).toBeGreaterThan(0);
    // P/L ausente (AURE3) no fim
    const t = corpo.itens.map((i: { ticker: string }) => i.ticker);
    expect(t[t.length - 1]).toBe('AURE3');
    expect(mocks.prisma.portfolio.findMany).not.toHaveBeenCalled();
  });

  it('naCarteira=1 lê posições e planejados do targetUserId (cliente do consultor)', async () => {
    mocks.exigir.mockResolvedValue(mockAuthAsConsultant('consultor', 'cliente-9'));
    const res = await GET(req('classe=acao&naCarteira=1'));
    const corpo = await res.json();
    expect(corpo.itens.map((i: { ticker: string }) => i.ticker).sort()).toEqual(['ITUB4', 'WEGE3']);
    expect(mocks.prisma.portfolio.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'cliente-9' }) }),
    );
    expect(mocks.prisma.watchlist.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'cliente-9' }) }),
    );
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('booleanos aceitam 1/true e filtros combinam', async () => {
    const res = await GET(req('classe=acao&lucroConsistente=true&dyMin=4'));
    const corpo = await res.json();
    expect(corpo.itens.map((i: { ticker: string }) => i.ticker)).toEqual(['ITUB4']);
  });
});
