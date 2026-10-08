/**
 * Base de "Meus cenários" (Bloco D, fatia B): pré-preenchimento, conferência (selo/ocultar/
 * legado), P/L alvo com histórico curto, FII com CNPJ em conferência e o cache limitado.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const mockPrisma = vi.hoisted(() => ({
  assetMultiplesCurrent: { findUnique: vi.fn() },
}));
const mockLeitor = vi.hoisted(() => ({
  obterLinhaQuadro: vi.fn(),
  versaoQuadro: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/analiseAtivos/leitura/linhasQuadro', async (orig) => {
  const real = await orig<typeof import('@/services/analiseAtivos/leitura/linhasQuadro')>();
  return { ...real, ...mockLeitor };
});

import {
  _limparCacheBaseCenarios,
  montarBaseCenarios,
  obterBaseCenarios,
  type AtualCenarios,
} from '@/services/analiseAtivos/leitura/ativo/baseCenarios';
import { paraLinhaQuadroApi } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { TEXTOS_CENARIOS } from '@/services/analiseAtivos/textosCenarios';
import {
  LINHA_AURE3,
  LINHA_HGLG11,
  LINHA_WEGE3,
  linhaQuadroDb,
} from '@/test/fixtures/analiseAtivos/linhasDb';

function atual(over: Partial<AtualCenarios> = {}): AtualCenarios {
  return {
    lpaTtm: 1.490539764617915,
    vpa: 4.495275640109388,
    dpa12m: 2.003246712,
    rend12m: null,
    vpCota: null,
    pvp: 11.187,
    plMedia10a: 36.94634085407849,
    plPontosHistorico: 10,
    flags: [],
    ...over,
  };
}

describe('montarBaseCenarios — ação', () => {
  it('WEGE3: dados do ativo, P/L alvo = média 10a (1 casa), DPA com selo (legado de proventos)', () => {
    const r = montarBaseCenarios({
      linha: paraLinhaQuadroApi(LINHA_WEGE3),
      atual: atual(),
      versao: 'v1',
    });
    if (r.classe !== 'acao') throw new Error('classe');
    expect(r.base.lpa).toEqual({ estado: 'ok', valor: 1.4905 });
    expect(r.base.dpa.estado).toBe('ok');
    expect(r.base.plAlvoPadrao).toEqual({ estado: 'ok', valor: 36.9 });
    expect(r.premissasPadrao).toEqual({
      yieldPct: 6,
      gPct: 8,
      kPct: 13,
      margemPct: 20,
      plAlvo: 36.9,
    });
    expect(r.base.conferencias).toEqual([
      { campo: 'dpa', exibicao: 'selo', motivo: 'Proventos em conferência.' },
    ]);
    expect(r.cotacao.data).toBe('2026-09-29');
    expect(r.cotacao.valor).toEqual({ estado: 'ok', valor: 41.2 });
    expect(r.limites.plAlvo).toEqual([0.1, 200]);
    expect(r).not.toHaveProperty('salvo');
  });

  it('AURE3: histórico com menos de 5 anos ⇒ P/L alvo ausente com o texto e premissa null', () => {
    const r = montarBaseCenarios({
      linha: paraLinhaQuadroApi(LINHA_AURE3),
      atual: atual({
        lpaTtm: -1.04,
        vpa: 11.02,
        dpa12m: 0,
        plMedia10a: null,
        plPontosHistorico: 2,
      }),
      versao: 'v1',
    });
    if (r.classe !== 'acao') throw new Error('classe');
    expect(r.base.plAlvoPadrao).toMatchObject({
      estado: 'ausente',
      motivo: 'historico_curto',
      texto: TEXTOS_CENARIOS.campos.plAlvo.historicoCurto,
    });
    expect(r.premissasPadrao.plAlvo).toBeNull();
    expect(r.base.lpa).toEqual({ estado: 'ok', valor: -1.04 });
  });

  it('média com 4 pontos não vira padrão', () => {
    const r = montarBaseCenarios({
      linha: paraLinhaQuadroApi(LINHA_WEGE3),
      atual: atual({ plPontosHistorico: 4 }),
      versao: 'v1',
    });
    expect(r.classe === 'acao' && r.premissasPadrao.plAlvo).toBeNull();
  });

  it('CBAV3 (acoes_escala, "ocultar"): LPA e VPA ausentes e não pré-preenchem', () => {
    const linha = linhaQuadroDb({
      symbol: 'CBAV3',
      flags: ['conf:acoes_escala:pvp_minimo@2026-06-30'],
    });
    const r = montarBaseCenarios({
      linha: paraLinhaQuadroApi(linha),
      atual: atual({ lpaTtm: 918.37, vpa: 7778.4, dpa12m: 0.088, plMedia10a: null }),
      versao: 'v1',
    });
    if (r.classe !== 'acao') throw new Error('classe');
    expect(r.base.lpa.estado).toBe('ausente');
    expect(r.base.vpa.estado).toBe('ausente');
    expect(r.base.lpa).not.toHaveProperty('valorNaoPublicado');
    expect(r.base.dpa).toEqual({ estado: 'ok', valor: 0.088 });
    expect(r.base.conferencias.map((c) => [c.campo, c.exibicao])).toEqual([
      ['lpa', 'ocultar'],
      ['vpa', 'ocultar'],
    ]);
    expect(r.base.conferencias[0].motivo).toMatch(/P\/VP abaixo de 0,08/);
  });

  it('sem asset_multiples_current: tudo "sem dado", sem quebrar', () => {
    const r = montarBaseCenarios({
      linha: paraLinhaQuadroApi(LINHA_WEGE3),
      atual: null,
      versao: 'v',
    });
    if (r.classe !== 'acao') throw new Error('classe');
    expect(r.base.lpa.estado).toBe('ausente');
    expect(r.premissasPadrao.plAlvo).toBeNull();
  });
});

describe('montarBaseCenarios — FII', () => {
  it('HGLG11: rendimento 12m e VP/cota; premissas do FII', () => {
    const r = montarBaseCenarios({
      linha: paraLinhaQuadroApi(LINHA_HGLG11),
      atual: atual({
        lpaTtm: null,
        vpa: null,
        dpa12m: null,
        rend12m: 13.34,
        vpCota: 165.95,
        pvp: 0.89,
      }),
      versao: 'v1',
    });
    if (r.classe !== 'fii') throw new Error('classe');
    expect(r.base.rend12m).toEqual({ estado: 'ok', valor: 13.34 });
    expect(r.base.vpCota).toEqual({ estado: 'ok', valor: 165.95 });
    expect(r.base.pvpAtual).toEqual({ estado: 'ok', valor: 0.89 });
    expect(r.premissasPadrao).toEqual({
      yieldPct: 8,
      margemPct: 10,
      rendaMensal: 1000,
      pvpAlvo: 1,
    });
  });

  it('CNPJ em conferência ⇒ VP/cota oculto com chip', () => {
    const linha = linhaQuadroDb({
      ...LINHA_HGLG11,
      flags: ['cnpj_em_conferencia'],
    });
    const r = montarBaseCenarios({
      linha: paraLinhaQuadroApi(linha),
      atual: atual({ rend12m: 13.34, vpCota: 165.95, pvp: 0.89 }),
      versao: 'v1',
    });
    if (r.classe !== 'fii') throw new Error('classe');
    expect(r.base.vpCota.estado).toBe('ausente');
    expect(r.base.pvpAtual.estado).toBe('ausente');
    expect(r.base.conferencias).toEqual([
      expect.objectContaining({ campo: 'vpCota', exibicao: 'ocultar' }),
    ]);
  });

  it('fii_vp "ocultar" pela flag conf:', () => {
    const linha = linhaQuadroDb({ ...LINHA_HGLG11, flags: ['conf:fii_vp:vp_salto@2026-08'] });
    const r = montarBaseCenarios({
      linha: paraLinhaQuadroApi(linha),
      atual: atual({ rend12m: 13.34, vpCota: 165.95 }),
      versao: 'v1',
    });
    if (r.classe !== 'fii') throw new Error('classe');
    expect(r.base.vpCota.estado).toBe('ausente');
    expect(r.base.rend12m.estado).toBe('ok');
  });
});

describe('obterBaseCenarios (banco + cache)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _limparCacheBaseCenarios();
    mockLeitor.versaoQuadro.mockResolvedValue('2026-09-30T10:40:00.000Z');
  });

  it('ticker fora da área ⇒ null, sem ler múltiplos', async () => {
    mockLeitor.obterLinhaQuadro.mockResolvedValue(null);
    expect(await obterBaseCenarios('XXXX3')).toBeNull();
    expect(mockPrisma.assetMultiplesCurrent.findUnique).not.toHaveBeenCalled();
  });

  it('lê uma vez e serve do cache na mesma versão', async () => {
    mockLeitor.obterLinhaQuadro.mockResolvedValue(LINHA_WEGE3);
    mockPrisma.assetMultiplesCurrent.findUnique.mockResolvedValue(atual());
    const a = await obterBaseCenarios('wege3');
    const b = await obterBaseCenarios('WEGE3');
    expect(a).toBe(b);
    expect(mockPrisma.assetMultiplesCurrent.findUnique).toHaveBeenCalledTimes(1);
    expect(mockPrisma.assetMultiplesCurrent.findUnique.mock.calls[0][0].where).toEqual({
      symbol: 'WEGE3',
    });
    mockLeitor.versaoQuadro.mockResolvedValue('nova');
    await obterBaseCenarios('WEGE3');
    expect(mockPrisma.assetMultiplesCurrent.findUnique).toHaveBeenCalledTimes(2);
  });

  it('preço Decimal da linha vira número', async () => {
    mockLeitor.obterLinhaQuadro.mockResolvedValue(
      linhaQuadroDb({ symbol: 'PETR4', preco: new Prisma.Decimal('49.1') }),
    );
    mockPrisma.assetMultiplesCurrent.findUnique.mockResolvedValue(null);
    const r = await obterBaseCenarios('PETR4');
    expect(r?.cotacao.valor).toEqual({ estado: 'ok', valor: 49.1 });
  });
});
