import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FakeSalvos } from '@/services/analiseAtivos/salvos/__tests__/fakeSalvosPrisma';

const h = vi.hoisted(() => ({ fake: null as unknown as FakeSalvos, auth: vi.fn() }));

vi.mock('@/lib/prisma', async () => {
  const { criarBancoRotas } =
    await import('@/services/analiseAtivos/salvos/__tests__/apoioRotasSalvos');
  h.fake = criarBancoRotas();
  return { prisma: h.fake.prisma, default: h.fake.prisma };
});
vi.mock('@/utils/auth', async (orig) => ({
  ...(await orig<object>()),
  requireAuthWithActing: h.auth,
}));
vi.mock('@/services/analiseAtivos/leitura/criterios/lerCriterios', async (orig) => {
  const real = await orig<object>();
  const f = await import('@/test/fixtures/analiseAtivos/criterios');
  return {
    ...real,
    obterCriteriosVarios: vi.fn(
      async (_p: unknown, symbols: readonly string[], janela: number) =>
        new Map(
          symbols
            .filter((s) => s === 'WEGE3')
            .map((s) => [s, { ...f.CRITERIOS_LINHA_WEGE3, janela }] as const),
        ),
    ),
  };
});

import { GET } from '../route';
import { ligarFlags, requisicao } from '@/services/analiseAtivos/salvos/__tests__/apoioRotasSalvos';
import { _resetarCacheLinhasQuadro } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { _limparCacheComparador } from '@/services/analiseAtivos/leitura/comparador/montarComparador';
import { _limparCotaPdf } from '@/services/analiseAtivos/salvos/comparacoesService';
import { mockAuthAsConsultant, mockAuthAsUser } from '@/test/mocks/auth';

const chamar = (q: string) => GET(requisicao('GET', `/comparacao-pdf${q}`));

beforeEach(() => {
  _resetarCacheLinhasQuadro();
  _limparCacheComparador();
  _limparCotaPdf();
  h.auth.mockReset();
  h.auth.mockResolvedValue(mockAuthAsUser('u-1'));
  ligarFlags();
});
afterEach(() => vi.unstubAllEnvs());

describe('GET /api/analise-ativos/comparacao-pdf', () => {
  it('200 application/pdf, começa com %PDF, nome do arquivo e no-store', async () => {
    const res = await chamar('?t=WEGE3,ITUB4');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Content-Disposition')).toMatch(
      /^attachment; filename="comparacao-acoes-WEGE3-ITUB4-\d{4}-\d{2}-\d{2}\.pdf"/,
    );
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(Number(res.headers.get('Content-Length'))).toBe(bytes.length);
  }, 20_000);

  it('404 sem pdfComparador OU sem comparador, antes da sessão', async () => {
    ligarFlags(['ANALISE_ATIVOS_PDF_HABILITADO']);
    expect((await chamar('?t=WEGE3')).status).toBe(404);
    ligarFlags(['ANALISE_ATIVOS_COMPARADOR_HABILITADO']);
    expect((await chamar('?t=WEGE3')).status).toBe(404);
    expect(h.auth).not.toHaveBeenCalled();
  });

  it('400 com query inválida (sem t, 5 tickers, janela 7, parâmetro extra)', async () => {
    for (const q of ['', '?t=', '?t=A1,B2,C3,D4,E5', '?t=WEGE3&janela=7', '?t=WEGE3&x=1']) {
      expect((await chamar(q)).status, q).toBe(400);
    }
  });

  it('404 quando nenhum ticker existe (sem consumir a cota)', async () => {
    expect((await chamar('?t=ZZZZ3')).status).toBe(404);
    for (let i = 0; i < 10; i += 1) expect((await chamar('?t=WEGE3')).status).toBe(200);
  }, 30_000);

  it('11º PDF da hora → 429 com Retry-After; a cota é por usuário', async () => {
    for (let i = 0; i < 10; i += 1) expect((await chamar('?t=WEGE3')).status).toBe(200);
    const r = await chamar('?t=WEGE3');
    expect(r.status).toBe(429);
    expect(Number(r.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect((await r.json()).error).toMatch(/10 PDFs na última hora/);
    h.auth.mockResolvedValue(mockAuthAsUser('u-2'));
    expect((await chamar('?t=WEGE3')).status).toBe(200);
  }, 30_000);

  it('consultor agindo pode gerar (o PDF não leva dado pessoal)', async () => {
    h.auth.mockResolvedValue(mockAuthAsConsultant('c-1', 'cliente-1'));
    expect((await chamar('?t=HGLG11,HCTR11&janela=10')).status).toBe(200);
  }, 20_000);
});
