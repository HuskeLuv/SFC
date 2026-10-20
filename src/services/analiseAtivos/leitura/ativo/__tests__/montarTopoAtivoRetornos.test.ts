/**
 * A6 (fundamentei-trazer, fatia 0): o topo só lê os retornos da cotação com
 * ANALISE_ATIVOS_RETORNOS_HABILITADO. Desligada, nenhuma consulta a mais e nenhum campo novo (a
 * resposta é a de hoje); ligada, `retornos` vem da leitura da fatia C (stub = ausente) e falha de
 * leitura não quebra o topo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnaliseQuadroLinha } from '@prisma/client';
import { LINHA_HGLG11, LINHA_WEGE3 } from '@/test/fixtures/analiseAtivos/linhasDb';
import type { RetornosCotacaoApi } from '@/types/analiseAtivosComplementos';

const m = vi.hoisted(() => ({
  linhas: new Map<string, unknown>(),
  retornos: vi.fn(),
  prisma: {
    assetMultiplesCurrent: { findUnique: vi.fn() },
    assetPerShareYearly: { findMany: vi.fn() },
    assetMultiplesYearly: { findMany: vi.fn() },
    assetCorporateActionCheck: { findMany: vi.fn() },
    assetEvento: { findMany: vi.fn() },
    assetProventoAuditado: { findMany: vi.fn() },
    assetFundamentalsPeriod: { findFirst: vi.fn() },
    fiiMonthly: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: m.prisma }));
vi.mock('@/services/analiseAtivos/observabilidade/frescor', () => ({
  obterPainelFrescor: vi.fn().mockResolvedValue({ geradoEm: '', camadas: {}, atrasadas: [] }),
}));
vi.mock('@/services/analiseAtivos/leitura/linhasQuadro', async (orig) => ({
  ...(await orig<typeof import('@/services/analiseAtivos/leitura/linhasQuadro')>()),
  versaoQuadro: vi.fn(async () => 'v1'),
  obterLinhaQuadro: vi.fn(async (s: string) => m.linhas.get(s.toUpperCase()) ?? null),
}));
vi.mock('@/services/analiseAtivos/leitura/criterios/lerCriterios', async (orig) => ({
  ...(await orig<typeof import('@/services/analiseAtivos/leitura/criterios/lerCriterios')>()),
  obterCriteriosAtivo: vi.fn(async () => null),
}));
vi.mock('@/services/analiseAtivos/leitura/ativo/retornosAtivo', () => ({
  lerRetornosAtivo: m.retornos,
}));

import {
  _limparCacheTopo,
  montarTopoAtivo,
} from '@/services/analiseAtivos/leitura/ativo/montarTopoAtivo';
import { lerRetornosAtivo as lerRetornosStub } from '../retornosAtivo';

const AGORA = new Date('2026-10-02T15:00:00Z');

const RETORNOS: RetornosCotacaoApi = {
  classe: 'acao',
  ateData: '2026-10-01',
  janelas: [
    { janela: '1m', valor: { estado: 'ok', valor: 2.4 }, anualizado: false },
    { janela: '12m', valor: { estado: 'ok', valor: -8.1 }, anualizado: false },
    { janela: '5a', valor: { estado: 'ok', valor: 11.6 }, anualizado: true },
    {
      janela: '10a',
      valor: { estado: 'ausente', motivo: 'serie_curta', texto: 'menos de 10 anos' },
      anualizado: true,
    },
  ],
  distanciaMaxima: { estado: 'ok', valor: -14.2 },
  maxima: { preco: 58.1, data: '2025-08-12' },
  inicioSerie: '2015-01-02',
  flags: ['serie_curta_10a'],
};

beforeEach(() => {
  _limparCacheTopo();
  m.linhas.clear();
  for (const l of [LINHA_WEGE3, LINHA_HGLG11]) {
    m.linhas.set((l as AnaliseQuadroLinha).symbol, l);
  }
  const p = m.prisma;
  p.assetMultiplesCurrent.findUnique.mockReset().mockResolvedValue(null);
  p.assetPerShareYearly.findMany.mockReset().mockResolvedValue([]);
  p.assetMultiplesYearly.findMany.mockReset().mockResolvedValue([]);
  p.assetCorporateActionCheck.findMany.mockReset().mockResolvedValue([]);
  p.assetEvento.findMany.mockReset().mockResolvedValue([]);
  p.assetProventoAuditado.findMany.mockReset().mockResolvedValue([]);
  p.assetFundamentalsPeriod.findFirst.mockReset().mockResolvedValue(null);
  p.fiiMonthly.findMany.mockReset().mockResolvedValue([]);
  p.$queryRaw.mockReset().mockResolvedValue([]);
  m.retornos.mockReset().mockResolvedValue(RETORNOS);
});
afterEach(() => vi.unstubAllEnvs());

describe('montarTopoAtivo × retornos (A6, fatia 0)', () => {
  it('chave desligada (padrão): não lê e não tem a chave `retornos`', async () => {
    for (const t of ['WEGE3', 'HGLG11']) {
      const r = await montarTopoAtivo(t, { agora: AGORA });
      expect(r).not.toBeNull();
      expect(Object.keys(r!)).not.toContain('retornos');
    }
    expect(m.retornos).not.toHaveBeenCalled();
  });

  it('chave ligada: lê pela classe e devolve o contrato da fatia C', async () => {
    vi.stubEnv('ANALISE_ATIVOS_RETORNOS_HABILITADO', 'true');
    const acao = await montarTopoAtivo('WEGE3', { agora: AGORA });
    expect(acao!.retornos).toEqual(RETORNOS);
    expect(m.retornos).toHaveBeenCalledWith(m.prisma, 'WEGE3', 'acao');
    await montarTopoAtivo('HGLG11', { agora: AGORA });
    expect(m.retornos).toHaveBeenLastCalledWith(m.prisma, 'HGLG11', 'fii');
  });

  it('chave ligada: sem linha (null) ou falha de leitura → sem `retornos`, o topo não quebra', async () => {
    vi.stubEnv('ANALISE_ATIVOS_RETORNOS_HABILITADO', 'true');
    m.retornos.mockResolvedValueOnce(null);
    expect(Object.keys((await montarTopoAtivo('WEGE3', { agora: AGORA }))!)).not.toContain(
      'retornos',
    );
    _limparCacheTopo();
    m.retornos.mockRejectedValueOnce(new Error('tabela ausente'));
    const r = await montarTopoAtivo('WEGE3', { agora: AGORA });
    expect(r).not.toBeNull();
    expect(Object.keys(r!)).not.toContain('retornos');
  });

  it('o stub da fatia 0 devolve null sem tocar no banco', async () => {
    const real = await vi.importActual<typeof import('../retornosAtivo')>('../retornosAtivo');
    expect(lerRetornosStub).toBe(m.retornos);
    const proibido = new Proxy(
      {},
      {
        get(_a, prop) {
          throw new Error(`stub acessou prisma.${String(prop)}`);
        },
      },
    ) as never;
    expect(await real.lerRetornosAtivo(proibido, 'WEGE3', 'acao')).toBeNull();
  });
});
