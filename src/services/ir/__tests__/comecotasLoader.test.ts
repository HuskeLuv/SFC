import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    portfolio: { findMany: vi.fn() },
    stockTransaction: { findMany: vi.fn() },
  },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }));

import {
  carregarPosicoesFundos,
  inferirTipoFundo,
  resolverRegimeComecotas,
} from '../comecotasLoader';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.stockTransaction.findMany.mockResolvedValue([]);
});

describe('resolverRegimeComecotas', () => {
  it('classificação CVM manda em tudo', () => {
    expect(resolverRegimeComecotas('fia', 'Fundo Multimercado XP', 'fim')).toBe('acoes');
    expect(resolverRegimeComecotas('fund-rf', 'Fundo de Ações Alpha', 'fia')).toBe('longo-prazo');
    expect(resolverRegimeComecotas('fip-infra', null, undefined)).toBe('fip-infra');
  });

  it('sem classificação, o subtipo do wizard decide — é o caso do fundo manual', () => {
    // Antes: caía no palpite por nome e "Alpha Valor" pagava come-cotas.
    expect(resolverRegimeComecotas('fund', 'Alpha Valor', 'fia')).toBe('acoes');
    expect(resolverRegimeComecotas('funds', 'Alpha Valor', 'fip')).toBe('fip');
    expect(resolverRegimeComecotas('fund', 'Alpha Valor', 'rf')).toBe('longo-prazo');
    expect(resolverRegimeComecotas(null, 'Alpha Valor', 'fia')).toBe('acoes');
  });

  it('subtipo inválido ou ausente cai no palpite por nome', () => {
    expect(resolverRegimeComecotas('fund', 'Fundo de Ações Alpha', undefined)).toBe('acoes');
    expect(resolverRegimeComecotas('fund', 'Fundo de Ações Alpha', 'banana')).toBe('acoes');
    expect(resolverRegimeComecotas('fund', 'Fundo CP Liquidez', null)).toBe('curto-prazo');
    expect(resolverRegimeComecotas('fund', 'Fundo Genérico', undefined)).toBe('longo-prazo');
  });

  it('o wizard NÃO inventa curto prazo (o prazo médio não é perguntado)', () => {
    expect(resolverRegimeComecotas('fund', 'Fundo Genérico', 'rf')).toBe('longo-prazo');
  });
});

describe('inferirTipoFundo (palpite por nome, mantido como fallback)', () => {
  it('reconhece ações e curto prazo pelo nome', () => {
    expect(inferirTipoFundo(null, 'Fundo de Ações')).toBe('acoes');
    expect(inferirTipoFundo(null, 'XP FIA Valor')).toBe('acoes');
    expect(inferirTipoFundo(null, 'Renda Curto Prazo')).toBe('curto-prazo');
    expect(inferirTipoFundo(null, 'Fundo Qualquer')).toBe('longo-prazo');
    expect(inferirTipoFundo(null, null)).toBe('longo-prazo');
  });
});

describe('carregarPosicoesFundos', () => {
  const posicao = (over: Record<string, unknown> = {}) => ({
    id: 'p1',
    assetId: 'a1',
    quantity: 100,
    avgPrice: 10,
    totalInvested: 1000,
    lastUpdate: new Date('2026-01-10'),
    asset: { symbol: 'FUNDO-MANUAL-1', name: 'Alpha Valor', type: 'fund', currentPrice: 12 },
    ...over,
  });

  it('usa o subtipo do wizard da compra mais recente', async () => {
    mocks.prisma.portfolio.findMany.mockResolvedValue([posicao()]);
    mocks.prisma.stockTransaction.findMany.mockResolvedValue([
      { assetId: 'a1', notes: JSON.stringify({ tipoFundo: 'fia' }) },
      { assetId: 'a1', notes: JSON.stringify({ tipoFundo: 'fim' }) },
    ]);

    const [p] = await carregarPosicoesFundos('u1');
    expect(p.tipo).toBe('acoes');
    expect(p.valorAplicado).toBe(1000);
    expect(p.valorAtualizado).toBe(1200);
  });

  it('notes ilegível não derruba nada — cai no palpite por nome', async () => {
    mocks.prisma.portfolio.findMany.mockResolvedValue([
      posicao({ asset: { symbol: 'X', name: 'Fundo de Ações', type: 'fund', currentPrice: 10 } }),
    ]);
    mocks.prisma.stockTransaction.findMany.mockResolvedValue([
      { assetId: 'a1', notes: '{quebrado' },
    ]);

    const [p] = await carregarPosicoesFundos('u1');
    expect(p.tipo).toBe('acoes');
  });

  it('posição zerada fica de fora e não consulta transação à toa', async () => {
    mocks.prisma.portfolio.findMany.mockResolvedValue([posicao({ quantity: 0 })]);
    expect(await carregarPosicoesFundos('u1')).toEqual([]);
    expect(mocks.prisma.stockTransaction.findMany).not.toHaveBeenCalled();
  });
});
