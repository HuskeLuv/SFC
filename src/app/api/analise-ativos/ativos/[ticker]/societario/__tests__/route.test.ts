import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockAuth = vi.hoisted(() => vi.fn());
const mockLinha = vi.hoisted(() => vi.fn());
const mockLer = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', async (orig) => ({
  ...(await orig<object>()),
  requireAuthWithActing: mockAuth,
}));
vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));
vi.mock('@/services/analiseAtivos/leitura/linhasQuadro', () => ({
  obterLinhaQuadro: mockLinha,
}));
vi.mock('@/services/analiseAtivos/repositorio/societario', () => ({
  lerSocietarioCnpj: mockLer,
}));

import { GET } from '../route';
import { _limparCacheSocietario } from '@/services/analiseAtivos/leitura/ativo/societarioAtivo';
import type { DadosSocietarioDb } from '@/services/analiseAtivos/repositorio/societario';

const chamar = (ticker: string) =>
  GET(new NextRequest(`http://localhost/api/analise-ativos/ativos/${ticker}/societario`), {
    params: Promise.resolve({ ticker }),
  });

const LINHAS: Record<string, { classe: string; cnpj: string; segmentoListagem: string | null }> = {
  WEGE3: { classe: 'acao', cnpj: '84429695000111', segmentoListagem: 'NM' },
  HGLG11: { classe: 'fii', cnpj: '11728688000147', segmentoListagem: null },
};

const DADOS: DadosSocietarioDb = {
  societario: {
    anoFre: 2026,
    versao: 3,
    dtReceb: '2026-09-22',
    pctCirculacaoOn: 34.796,
    pctCirculacaoPn: 0,
    pctCirculacaoTotal: 34.796,
    nAcionistasPf: 359032,
    nAcionistasPj: 2900,
    nAcionistasInst: 1130,
    linkDocFre: 'https://www.rad.cvm.gov.br/ENETCONSULTA/frmDownloadDocumento.aspx?x=1',
  },
  posicao: [
    {
      idAcionista: '1',
      nome: 'WPA Participações e Serviços S.A.',
      pctOn: 50.088,
      pctPn: 0,
      pctTotal: 50.088,
      controlador: true,
      acordoAcionistas: false,
      sintetica: false,
    },
  ],
  direitos: [
    {
      especie: 'ON',
      classePn: '',
      pctTagAlong: 100,
      direitoDividendoTexto: '25% do lucro líquido ajustado',
      pctDividendoMinimo: 25,
    },
  ],
  classesTickers: ['ON'],
};

describe('GET /api/analise-ativos/ativos/[ticker]/societario', () => {
  beforeEach(() => {
    vi.stubEnv('ANALISE_ATIVOS_HABILITADA', 'true');
    vi.stubEnv('ANALISE_ATIVOS_ACESSO', 'todos');
    vi.stubEnv('ANALISE_ATIVOS_SOCIETARIO_HABILITADO', 'true');
    mockAuth.mockReset();
    mockAuth.mockResolvedValue({ payload: { id: 'u1' }, targetUserId: 'u1', actingClient: null });
    mockLinha.mockReset();
    mockLinha.mockImplementation(async (s: string) => LINHAS[s] ?? null);
    mockLer.mockReset();
    mockLer.mockResolvedValue(DADOS);
    _limparCacheSocietario('WEGE3');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('200 com o contrato, cache privado de 5 min e Server-Timing', async () => {
    const res = await chamar('WEGE3');
    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.ticker).toBe('WEGE3');
    expect(corpo.acionistas.valor.dtReceb).toBe('2026-09-22');
    expect(corpo.segmentoListagem).toBe('Novo Mercado');
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=300');
    expect(res.headers.get('Server-Timing')).toMatch(/^societario;desc="banco";dur=/);
    expect((await chamar('WEGE3')).headers.get('Server-Timing')).toContain('desc="cache"');
    expect(mockLer).toHaveBeenCalledTimes(1);
  });

  it('nenhuma chave nem valor com CPF/CNPJ de acionista', async () => {
    const texto = await (await chamar('WEGE3')).text();
    expect(texto).not.toMatch(/cpf|cnpj/i);
    expect(texto).not.toContain('84429695000111');
  });

  it('chave desligada → 404 antes da sessão (tela e API como hoje)', async () => {
    vi.stubEnv('ANALISE_ATIVOS_SOCIETARIO_HABILITADO', 'false');
    expect((await chamar('WEGE3')).status).toBe(404);
    vi.stubEnv('ANALISE_ATIVOS_SOCIETARIO_HABILITADO', '');
    expect((await chamar('WEGE3')).status).toBe(404);
    expect(mockAuth).not.toHaveBeenCalled();
    expect(mockLer).not.toHaveBeenCalled();
  });

  it('área desligada → 404; sem sessão → 401', async () => {
    vi.stubEnv('ANALISE_ATIVOS_HABILITADA', 'false');
    expect((await chamar('WEGE3')).status).toBe(404);
    vi.stubEnv('ANALISE_ATIVOS_HABILITADA', 'true');
    mockAuth.mockRejectedValueOnce(new Error('Não autorizado'));
    expect((await chamar('WEGE3')).status).toBe(401);
  });

  it('FII → 404; ticker fora da área → 404; formato inválido → 400', async () => {
    expect((await chamar('HGLG11')).status).toBe(404);
    expect((await chamar('ZZZZ3')).status).toBe(404);
    expect((await chamar('WEGE3%3B')).status).toBe(400);
    expect(mockLer).not.toHaveBeenCalled();
  });
});
