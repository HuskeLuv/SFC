import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ApiError } from '@/utils/apiErrorHandler';
import { mockAuthAsUser } from '@/test/mocks/auth';
import { ATIVO_WEGE3 } from '@/test/fixtures/analiseAtivos/respostas';
import { LINHA_HGLG11, LINHA_WEGE3 } from '@/test/fixtures/analiseAtivos/linhasDb';
import {
  CRITERIOS_ATIVO_HGLG11,
  CRITERIOS_ATIVO_WEGE3,
} from '@/test/fixtures/analiseAtivos/criterios';

const mockExigir = vi.hoisted(() => vi.fn());
const mockMontar = vi.hoisted(() => vi.fn());
/** banco mínimo para montar o topo de verdade (contrato do JSON) */
const db = vi.hoisted(() => {
  const vazio = () => Promise.resolve([]);
  const nulo = () => Promise.resolve(null);
  return {
    linhas: new Map<string, unknown>(),
    prisma: {
      assetScore: { findFirst: nulo },
      assetMultiplesCurrent: { findUnique: nulo },
      assetPerShareYearly: { findMany: vazio },
      assetMultiplesYearly: { findMany: vazio },
      assetCorporateActionCheck: { findMany: vazio },
      assetEvento: { findMany: vazio },
      assetProventoAuditado: { findMany: vazio },
      assetFundamentalsPeriod: { findFirst: nulo },
      fiiMonthly: { findMany: vazio },
      analiseCasoDado: { findMany: vazio },
      $queryRaw: vazio,
    },
  };
});

vi.mock('@/services/analiseAtivos/acesso/acessoAnalise', () => ({
  exigirAcessoAnalise: mockExigir,
}));
vi.mock('@/services/analiseAtivos/leitura/ativo/montarTopoAtivo', () => ({
  montarTopoAtivo: mockMontar,
}));
vi.mock('@/lib/prisma', () => ({ prisma: db.prisma }));
vi.mock('@/services/analiseAtivos/observabilidade/frescor', () => ({
  obterPainelFrescor: vi.fn().mockResolvedValue({ geradoEm: '', camadas: {}, atrasadas: [] }),
}));
vi.mock('@/services/analiseAtivos/leitura/linhasQuadro', async (orig) => {
  const real = await orig<typeof import('@/services/analiseAtivos/leitura/linhasQuadro')>();
  return {
    ...real,
    versaoQuadro: vi.fn().mockResolvedValue('2026-10-13T10:40:00.000Z'),
    obterLinhaQuadro: vi.fn(async (s: string) => db.linhas.get(s.toUpperCase()) ?? null),
  };
});
vi.mock('@/services/analiseAtivos/leitura/criterios/lerCriterios', () => ({
  obterCriteriosAtivo: vi.fn(async (_p: unknown, t: string) =>
    t === 'WEGE3' ? CRITERIOS_ATIVO_WEGE3 : t === 'HGLG11' ? CRITERIOS_ATIVO_HGLG11 : null,
  ),
}));

import { GET } from '../route';

const chamar = (ticker: string) =>
  GET(new NextRequest(`http://localhost/api/analise-ativos/ativos/${ticker}`), {
    params: Promise.resolve({ ticker }),
  });

describe('GET /api/analise-ativos/ativos/[ticker]', () => {
  beforeEach(() => {
    mockExigir.mockReset().mockResolvedValue(mockAuthAsUser('u1'));
    mockMontar.mockReset().mockResolvedValue(ATIVO_WEGE3);
  });

  it('200 com o topo, cache privado de 5 min e Server-Timing', async () => {
    const res = await chamar('WEGE3');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=300');
    expect(res.headers.get('Server-Timing')).toMatch(/^topo;dur=\d+(\.\d)?$/);
    expect((await res.json()).ticker).toBe('WEGE3');
    expect(mockMontar).toHaveBeenCalledWith('WEGE3');
  });

  it('ticker em minúsculas é normalizado', async () => {
    await chamar('wege3');
    expect(mockMontar).toHaveBeenCalledWith('WEGE3');
  });

  it('ticker inexistente → 404', async () => {
    mockMontar.mockResolvedValue(null);
    const res = await chamar('XXXX3');
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Ativo não encontrado na Análise de Ativos');
  });

  it('formato inválido → 400 sem tocar no banco', async () => {
    const res = await chamar('WEG');
    expect(res.status).toBe(400);
    expect(mockMontar).not.toHaveBeenCalled();
  });

  it('sem acesso (flag/beta) → 404 antes de montar', async () => {
    mockExigir.mockRejectedValue(new ApiError(404, 'Recurso não disponível'));
    const res = await chamar('WEGE3');
    expect(res.status).toBe(404);
    expect(mockMontar).not.toHaveBeenCalled();
  });

  it('sem sessão → 401', async () => {
    mockExigir.mockRejectedValue(new Error('Não autorizado'));
    expect((await chamar('WEGE3')).status).toBe(401);
  });
});

/** Chaves (recursivas) de um JSON. */
function chaves(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => chaves(x, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      out.push(k);
      chaves(x, out);
    }
  }
  return out;
}

describe('GET /api/analise-ativos/ativos/[ticker] — contrato v2.4 (topo montado de verdade)', () => {
  beforeEach(async () => {
    mockExigir.mockReset().mockResolvedValue(mockAuthAsUser('u1'));
    const real = await vi.importActual<
      typeof import('@/services/analiseAtivos/leitura/ativo/montarTopoAtivo')
    >('@/services/analiseAtivos/leitura/ativo/montarTopoAtivo');
    real._limparCacheTopo();
    db.linhas.clear();
    // params v2 + flag de conferência: frescorBlocos e conferências também entram na resposta
    for (const l of [LINHA_WEGE3, LINHA_HGLG11] as Array<Record<string, unknown>>) {
      db.linhas.set(String(l.symbol), {
        ...l,
        paramsVersion: 2,
        flags: [...(l.flags as string[]), 'conf:proventos:salto@2026-01'],
      });
    }
    mockMontar.mockReset().mockImplementation((t: string) => real.montarTopoAtivo(t));
  });

  it.each(['WEGE3', 'HGLG11'])(
    '%s: nenhuma chave /indice|semaforo|destaque/; critérios nas 3 janelas',
    async (ticker) => {
      const res = await chamar(ticker);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(chaves(json).filter((k) => /indice|semaforo|destaque/i.test(k))).toEqual([]);
      expect(Object.keys(json.criterios.janelas).sort()).toEqual(['10', '3', '5']);
      expect(JSON.stringify(json).length).toBeLessThan(30_000);
    },
  );
});
