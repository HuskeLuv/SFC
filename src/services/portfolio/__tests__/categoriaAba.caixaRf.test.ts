import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ASSET_WHERE_BASE_POR_CATEGORIA,
  assetWhereBaseDaCategoria,
  filtrarDaCategoria,
  wherePortfolioDaCategoria,
  wherePortfolioGrupoCaixaRf,
} from '../categoriaAba';
import {
  CATEGORIAS_CAIXA_RF,
  CATEGORIAS_MOVIVEIS,
  CATEGORIAS_MOVIVEIS_TODAS,
  type AssetMovivelLike,
  type BaseCtx,
} from '@/lib/carteiraMover';

const ligar = () => vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'true');
const desligar = () => vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'false');
afterEach(() => vi.unstubAllEnvs());

type Row = {
  id: string;
  categoriaOverride: string | null;
  asset: AssetMovivelLike;
  reservaDestino?: BaseCtx['reservaDestino'];
};
const r = (
  id: string,
  symbol: string,
  type: string,
  categoriaOverride: string | null = null,
  reservaDestino?: BaseCtx['reservaDestino'],
): Row => ({ id, categoriaOverride, asset: { symbol, type, currency: 'BRL' }, reservaDestino });

const ROWS: Row[] = [
  r('emerg', 'RESERVA-EMERG-1', 'emergency'),
  r('conta', 'CONTA-CORRENTE-OPORT-1', 'opportunity'),
  r('cash', 'CAIXA-1', 'cash'),
  r('cdb', 'RENDA-FIXA-1', 'bond'),
  r('cdb-mov', 'RENDA-FIXA-2', 'bond', 'reservaEmergencia'),
  r('emerg-mov', 'RESERVA-EMERG-2', 'emergency', 'rendaFixaFundos'),
  r('tes-rf', 'TESOURO-SELIC-2029', 'tesouro-direto'),
  r('tes-emerg', 'TESOURO-SELIC-2031', 'tesouro-direto', null, 'emergencia'),
  r('tes-misto-mov', 'TESOURO-IPCA-2035', 'tesouro-direto', 'rendaFixaFundos', 'emergencia'),
  r('fii', 'HGLG11', 'fii'),
  r('fii-lixo', 'XPML11', 'fii', 'rendaFixaFundos'),
];
const ctxDe = (row: Row): BaseCtx => ({ reservaDestino: row.reservaDestino ?? null });

describe('where das abas', () => {
  it('RF lista cash com a chave desligada (como antes) e não com ela ligada', () => {
    desligar();
    expect(assetWhereBaseDaCategoria('rendaFixaFundos')).toEqual({
      type: { in: ['bond', 'cash', 'tesouro-direto'] },
    });
    ligar();
    expect(assetWhereBaseDaCategoria('rendaFixaFundos')).toEqual(
      ASSET_WHERE_BASE_POR_CATEGORIA.rendaFixaFundos,
    );
    expect(ASSET_WHERE_BASE_POR_CATEGORIA.reservaOportunidade).toEqual({
      type: { in: ['opportunity', 'cash'] },
    });
  });

  it('chave desligada: where das abas da fase 1 idêntico ao de antes', () => {
    desligar();
    expect(wherePortfolioDaCategoria('u1', 'fiis')).toEqual({
      userId: 'u1',
      OR: [
        { categoriaOverride: 'fiis' },
        { categoriaOverride: null, asset: { type: 'fii' } },
        { categoriaOverride: { notIn: [...CATEGORIAS_MOVIVEIS] }, asset: { type: 'fii' } },
      ],
    });
  });

  it('chave ligada: o notIn é do grupo (override de outro grupo não tira o item da base)', () => {
    ligar();
    const fiis = wherePortfolioDaCategoria('u1', 'fiis').OR as { categoriaOverride: unknown }[];
    expect(fiis[2].categoriaOverride).toEqual({ notIn: [...CATEGORIAS_MOVIVEIS] });
    const rf = wherePortfolioDaCategoria('u1', 'rendaFixaFundos').OR as {
      categoriaOverride: unknown;
    }[];
    expect(rf[2].categoriaOverride).toEqual({ notIn: [...CATEGORIAS_CAIXA_RF] });
  });

  it('grupo do trio: types, símbolos de reserva e override do trio', () => {
    const w = wherePortfolioGrupoCaixaRf('u1');
    expect(w.userId).toBe('u1');
    expect(w.OR).toContainEqual({
      asset: { type: { in: ['emergency', 'opportunity', 'cash', 'bond', 'tesouro-direto'] } },
    });
    expect(w.OR).toContainEqual({ categoriaOverride: { in: [...CATEGORIAS_CAIXA_RF] } });
  });
});

describe('filtrarDaCategoria — um item, uma aba (chave ligada)', () => {
  it('cada linha cai em exatamente uma aba', () => {
    ligar();
    const porAba = new Map<string, string[]>();
    for (const cat of CATEGORIAS_MOVIVEIS_TODAS) {
      for (const row of filtrarDaCategoria(ROWS, cat, ctxDe)) {
        porAba.set(row.id, [...(porAba.get(row.id) ?? []), cat]);
      }
    }
    for (const row of ROWS) expect(porAba.get(row.id)).toHaveLength(1);
    const aba = (id: string) => porAba.get(id)![0];
    expect(aba('emerg')).toBe('reservaEmergencia');
    expect(aba('conta')).toBe('reservaOportunidade');
    expect(aba('cash')).toBe('reservaOportunidade');
    expect(aba('cdb')).toBe('rendaFixaFundos');
    expect(aba('cdb-mov')).toBe('reservaEmergencia');
    expect(aba('emerg-mov')).toBe('rendaFixaFundos');
    expect(aba('tes-rf')).toBe('rendaFixaFundos');
    expect(aba('tes-emerg')).toBe('reservaEmergencia');
    expect(aba('tes-misto-mov')).toBe('rendaFixaFundos');
    expect(aba('fii')).toBe('fiis');
    expect(aba('fii-lixo')).toBe('fiis');
  });

  it('sem o ctx, o Tesouro da reserva seria RF (o ctx é obrigatório nas rotas do trio)', () => {
    ligar();
    const ids = filtrarDaCategoria(ROWS, 'rendaFixaFundos').map((x) => x.id);
    expect(ids).toContain('tes-emerg');
  });

  it('chave desligada: o trio não lista nada pelo mover; fase 1 igual', () => {
    desligar();
    for (const cat of CATEGORIAS_CAIXA_RF) {
      expect(filtrarDaCategoria(ROWS, cat, ctxDe)).toEqual([]);
    }
    expect(filtrarDaCategoria(ROWS, 'fiis', ctxDe).map((x) => x.id)).toEqual(['fii', 'fii-lixo']);
  });
});
