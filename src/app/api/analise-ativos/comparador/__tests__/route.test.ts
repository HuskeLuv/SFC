import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockExigir = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  analiseQuadroLinha: { aggregate: vi.fn(), findMany: vi.fn() },
  assetMultiplesCurrent: { findMany: vi.fn() },
  fiiQuarterly: { findMany: vi.fn() },
  assetPerShareYearly: { findMany: vi.fn() },
  fiiMonthly: { findMany: vi.fn() },
  criteriaParams: { findFirst: vi.fn(), findUnique: vi.fn() },
}));
const mockCriteriosVarios = vi.hoisted(() => vi.fn());

vi.mock('@/services/analiseAtivos/acesso/acessoAnalise', () => ({
  exigirRecursoAnalise: mockExigir,
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/analiseAtivos/leitura/criterios/lerCriterios', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  obterCriteriosVarios: mockCriteriosVarios,
}));

import { GET } from '../route';
import { ApiError } from '@/utils/apiErrorHandler';
import { _resetarCacheLinhasQuadro } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { _limparCacheComparador } from '@/services/analiseAtivos/leitura/comparador/montarComparador';
import { GERADO_EM_FIXTURE, LINHAS_FIXTURE } from '@/test/fixtures/analiseAtivos/linhasDb';
import { CRITERIA_PARAMS_V1 } from '@/services/analiseAtivos/params/criteriaParamsV1';
import type { ComparadorResposta } from '@/types/analiseAtivosBlocoD';
import { CRITERIOS_LINHA_WEGE3 } from '@/test/fixtures/analiseAtivos/criterios';
import type { Janela } from '@/types/analiseAtivosCriterios';

/** Todas as chaves (recursivo) de um JSON. */
function chaves(x: unknown, out: string[] = []): string[] {
  if (Array.isArray(x)) x.forEach((v) => chaves(v, out));
  else if (x && typeof x === 'object') {
    for (const [k, v] of Object.entries(x)) {
      out.push(k);
      chaves(v, out);
    }
  }
  return out;
}

const chamar = (q: string) =>
  GET(new NextRequest(`http://localhost/api/analise-ativos/comparador${q}`));

describe('GET /api/analise-ativos/comparador', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetarCacheLinhasQuadro();
    _limparCacheComparador();
    mockExigir.mockResolvedValue({ payload: { id: 'u1' }, targetUserId: 'u1', actingClient: null });
    mockPrisma.analiseQuadroLinha.aggregate.mockResolvedValue({
      _max: { geradoEm: GERADO_EM_FIXTURE },
    });
    mockPrisma.analiseQuadroLinha.findMany.mockResolvedValue(LINHAS_FIXTURE);
    mockPrisma.assetMultiplesCurrent.findMany.mockResolvedValue([]);
    mockPrisma.fiiQuarterly.findMany.mockResolvedValue([]);
    mockPrisma.assetPerShareYearly.findMany.mockResolvedValue([]);
    mockPrisma.fiiMonthly.findMany.mockResolvedValue([]);
    mockPrisma.criteriaParams.findFirst.mockResolvedValue({
      version: 1,
      params: CRITERIA_PARAMS_V1,
    });
    mockCriteriosVarios.mockImplementation(
      async (_p: unknown, symbols: readonly string[], janela: Janela) =>
        new Map(
          symbols
            .filter((s) => s === 'WEGE3')
            .map((s) => [s, { ...CRITERIOS_LINHA_WEGE3, janela }]),
        ),
    );
  });

  it('200 com cache privado de 5 min e Server-Timing; o recurso pedido é o comparador', async () => {
    const res = await chamar('?t=WEGE3,ITUB4');
    expect(res.status).toBe(200);
    expect(mockExigir).toHaveBeenCalledWith(expect.anything(), 'comparador');
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=300');
    expect(res.headers.get('Server-Timing')).toMatch(/^comparador;desc="banco";dur=/);
    const body = (await res.json()) as ComparadorResposta;
    expect(body.tickers).toEqual(['WEGE3', 'ITUB4']);
    const de2 = await chamar('?t=ITUB4,WEGE3');
    expect(de2.headers.get('Server-Timing')).toContain('desc="cache"');
  });

  it('flag desligada / sem acesso → 404; sem sessão → 401', async () => {
    mockExigir.mockRejectedValueOnce(new ApiError(404, 'Recurso não disponível'));
    expect((await chamar('?t=WEGE3')).status).toBe(404);
    mockExigir.mockRejectedValueOnce(new Error('Não autorizado'));
    expect((await chamar('?t=WEGE3')).status).toBe(401);
    expect(mockPrisma.analiseQuadroLinha.findMany).not.toHaveBeenCalled();
  });

  it('400: sem t, nenhum válido, ou t acima de 80 caracteres', async () => {
    expect((await chamar('')).status).toBe(400);
    expect((await chamar('?t=;;;,x')).status).toBe(400);
    expect((await chamar(`?t=${'WEGE3,'.repeat(14)}`)).status).toBe(400);
  });

  it('dedupe, maiúsculas, classe do 1º e ignorados', async () => {
    const res = await chamar('?t=wege3,WEGE3,HGLG11,ZZZZ3,AURE3,TGMA3,ITUB4,CEDO4');
    const body = (await res.json()) as ComparadorResposta;
    expect(body.classe).toBe('acao');
    expect(body.tickers).toEqual(['WEGE3', 'AURE3', 'TGMA3', 'ITUB4']);
    expect(body.ignorados).toEqual([
      { ticker: 'HGLG11', motivo: 'outra_classe' },
      { ticker: 'ZZZZ3', motivo: 'inexistente' },
      { ticker: 'CEDO4', motivo: 'excesso' },
    ]);
  });

  it('1º ticker FII ⇒ classe FII', async () => {
    const body = (await (await chamar('?t=HGLG11,WEGE3,HFOF11')).json()) as ComparadorResposta;
    expect(body.classe).toBe('fii');
    expect(body.tickers).toEqual(['HGLG11', 'HFOF11']);
  });

  it('sem dado do usuário na resposta', async () => {
    const txt = await (await chamar('?t=WEGE3')).text();
    expect(txt).not.toContain('u1');
  });

  it('janela: padrão 5; 3 e 10 aceitas e repassadas; outro valor ⇒ 400', async () => {
    const b5 = (await (await chamar('?t=WEGE3')).json()) as ComparadorResposta;
    expect(b5.janela).toBe(5);
    expect(b5.ativos[0].criterios?.janela).toBe(5);
    const b10 = (await (await chamar('?t=WEGE3&janela=10')).json()) as ComparadorResposta;
    expect(b10.janela).toBe(10);
    expect(b10.leitura.janela).toBe(10);
    expect(mockCriteriosVarios).toHaveBeenLastCalledWith(expect.anything(), ['WEGE3'], 10);
    expect((await chamar('?t=WEGE3&janela=3')).status).toBe(200);
    for (const j of ['7', '0', 'abc', '5.0', '', '-5', '100']) {
      const res = await chamar(`?t=WEGE3&janela=${j}`);
      expect(res.status, `janela=${j}`).toBe(400);
    }
  });

  it('contrato isonômico: nenhuma chave casa /indice|semaforo|destaque/ (busca por substring)', async () => {
    for (const q of ['?t=WEGE3,ITUB4', '?t=HGLG11,HFOF11', '?t=WEGE3&janela=10']) {
      const body = await (await chamar(q)).json();
      const ruins = chaves(body).filter((k) =>
        /indice|semaforo|destaque|direcao|nota|rating|score/i.test(k),
      );
      expect(ruins, q).toEqual([]);
      expect(body).not.toHaveProperty('resumo');
      expect(body).toHaveProperty('leitura.contagens');
      expect(body).toHaveProperty('criterios.rotulos');
    }
  });
});
