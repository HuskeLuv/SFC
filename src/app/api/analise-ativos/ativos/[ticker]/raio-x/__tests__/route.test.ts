import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockExigir = vi.hoisted(() => vi.fn());
const mockObter = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));
vi.mock('@/services/analiseAtivos/acesso/acessoAnalise', () => ({
  exigirRecursoAnalise: mockExigir,
}));
vi.mock('@/services/analiseAtivos/leitura/ativo/raioX', () => ({ obterRaioX: mockObter }));

import { GET } from '../route';
import { ApiError } from '@/utils/apiErrorHandler';
import { RODAPE_LEGAL } from '@/services/analiseAtivos/textosTela';
import type { RaioXResposta } from '@/types/analiseAtivosBlocoD';

const RAIO_X: RaioXResposta = {
  ticker: 'WEGE3',
  classe: 'acao',
  nome: 'WEG S.A.',
  variante: 'acao',
  unidade: 'R$ mi',
  base: 'ano fiscal',
  fonte: 'CVM',
  padraoContabil: 'IFRS',
  escopo: 'con',
  anos: [2025, 2024],
  blocos: [
    {
      codigo: 'lucro_caixa',
      rotulo: 'Lucro e geração de caixa',
      linhas: [
        {
          codigo: 'receita',
          rotulo: 'Receita líquida',
          sub: null,
          tipo: 'valor',
          formato: 'moedaMi',
          fonteCvmAviso: false,
          campoConferencia: 'receita',
          valores: {
            2025: { estado: 'ok', valor: 40804.11 },
            2024: { estado: 'ok', valor: 37986.94 },
          },
          selos: {},
          conferencias: {},
          observacao: null,
        },
      ],
    },
  ],
  observacoes: [],
  linhasNaoAplicaveis: [],
  versao: '2026-10-03T20:20:46.010Z',
};

const chamar = (ticker: string, query = '') =>
  GET(new NextRequest(`http://localhost/api/analise-ativos/ativos/${ticker}/raio-x${query}`), {
    params: Promise.resolve({ ticker }),
  });

describe('GET /api/analise-ativos/ativos/[ticker]/raio-x', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T15:00:00Z'));
    mockExigir.mockReset();
    mockObter.mockReset();
    mockExigir.mockResolvedValue({ payload: { id: 'u1' }, targetUserId: 'u1', actingClient: null });
    mockObter.mockResolvedValue({ dados: RAIO_X, cache: false, paramsVersion: 2 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('JSON: 200 com o contrato, cache privado de 5 min e Server-Timing', async () => {
    const res = await chamar('WEGE3');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(RAIO_X);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=300');
    expect(res.headers.get('Server-Timing')).toMatch(/^raiox;desc="banco";dur=\d+(\.\d)?$/);
    expect(mockExigir).toHaveBeenCalledWith(expect.anything(), 'raioX');
    expect(mockObter).toHaveBeenCalledWith('WEGE3', '2026-10-08');
  });

  it('?formato=json e ticker minúsculo são aceitos', async () => {
    const res = await chamar('wege3', '?formato=json');
    expect(res.status).toBe(200);
    expect(mockObter).toHaveBeenCalledWith('WEGE3', '2026-10-08');
  });

  it('CSV: anexo raio-x_WEGE3_2026-10-08.csv, text/csv, nosniff, BOM e CRLF', async () => {
    const res = await chamar('WEGE3', '?formato=csv');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="raio-x_WEGE3_2026-10-08.csv"',
    );
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=300');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const texto = new TextDecoder().decode(bytes);
    expect(texto).toContain('Linha;2025;2024\r\n');
    expect(texto).toContain('Receita líquida (R$ mi);40804,11;37986,94\r\n');
    expect(texto).toContain('Parâmetros;v2\r\n');
    expect(texto).toContain(`Aviso legal;"${RODAPE_LEGAL}"\r\n`);
    // sem nenhum dado do usuário
    expect(texto).not.toContain('u1');
  });

  it('formato inválido → 400 sem ler dados', async () => {
    const res = await chamar('WEGE3', '?formato=xlsx');
    expect(res.status).toBe(400);
    expect(mockObter).not.toHaveBeenCalled();
  });

  it('ticker fora do padrão → 400', async () => {
    const res = await chamar('WEGE');
    expect(res.status).toBe(400);
    expect(mockObter).not.toHaveBeenCalled();
  });

  it('sem sessão → 401', async () => {
    mockExigir.mockRejectedValue(new ApiError(401, 'Não autenticado'));
    const res = await chamar('WEGE3');
    expect(res.status).toBe(401);
    expect(mockObter).not.toHaveBeenCalled();
  });

  it('flag desligada ou sem acesso → 404 sem ler dados (CSV também)', async () => {
    mockExigir.mockRejectedValue(new ApiError(404, 'Recurso não disponível'));
    expect((await chamar('WEGE3')).status).toBe(404);
    expect((await chamar('WEGE3', '?formato=csv')).status).toBe(404);
    expect(mockObter).not.toHaveBeenCalled();
  });

  it('ticker fora da área → 404', async () => {
    mockObter.mockResolvedValue(null);
    expect((await chamar('ZZZZ3')).status).toBe(404);
  });
});
