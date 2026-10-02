import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  categoriaEfetiva,
  valuatePortfolioItem,
  type AssetLike,
  type ItemValuationInput,
} from '../itemValuation';
import { categoriaDaAba, CATEGORIAS_CAIXA_RF } from '@/lib/carteiraMover';
import type { FixedIncomeAssetWithAsset } from '../patrimonioHistoricoBuilder';

const ligar = () => vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'true');
const desligar = () => vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'false');
afterEach(() => vi.unstubAllEnvs());

const item = (categoriaOverride: string | null = null) => ({
  assetId: 'a-1',
  quantity: 1,
  avgPrice: 0,
  totalInvested: 1000,
  categoriaOverride,
});

const reservaManual: AssetLike = { symbol: 'RESERVA-EMERG-1', type: 'emergency' };
const contaOport: AssetLike = { symbol: 'CONTA-CORRENTE-OPORT-1', type: 'opportunity' };
const cdb: AssetLike = { symbol: 'RENDA-FIXA-1', type: 'bond' };
const tesouro: AssetLike = {
  symbol: 'TESOURO-SELIC-2031',
  type: 'tesouro-direto',
  currentPrice: 0,
};
const cash: AssetLike = { symbol: 'CAIXA-1', type: 'cash' };

const fi = {
  id: 'fi-1',
  assetId: 'a-1',
  type: 'CDB_PRE',
  indexer: 'CDI',
  annualRate: 0,
  investedAmount: 1000,
} as unknown as FixedIncomeAssetWithAsset;

describe('categoriaEfetiva — chave desligada (fase 1)', () => {
  it('reserva ignora qualquer override; RF ignora override do trio', () => {
    desligar();
    expect(categoriaEfetiva(reservaManual, 'rendaFixaFundos', { isReserva: true })).toBe(
      'reservaEmergencia',
    );
    expect(categoriaEfetiva(cdb, 'reservaEmergencia')).toBe('rendaFixaFundos');
    expect(
      categoriaEfetiva(tesouro, 'rendaFixaFundos', {
        isReserva: true,
        tesouroReservaDestino: 'emergencia',
      }),
    ).toBe('reservaEmergencia');
  });
});

describe('categoriaEfetiva — chave ligada (pizza/Saúde seguem a aba)', () => {
  it('título movido entre o trio conta na aba escolhida', () => {
    ligar();
    expect(categoriaEfetiva(cdb, 'reservaEmergencia')).toBe('reservaEmergencia');
    expect(categoriaEfetiva(reservaManual, 'reservaOportunidade', { isReserva: true })).toBe(
      'reservaOportunidade',
    );
    expect(
      categoriaEfetiva(tesouro, 'rendaFixaFundos', {
        isReserva: true,
        tesouroReservaDestino: 'emergencia',
      }),
    ).toBe('rendaFixaFundos');
  });

  it('override de outro grupo ou igual à base é ignorado', () => {
    ligar();
    expect(categoriaEfetiva(cdb, 'acoes')).toBe('rendaFixaFundos');
    expect(categoriaEfetiva(cdb, 'rendaFixaFundos')).toBe('rendaFixaFundos');
    expect(categoriaEfetiva(reservaManual, 'fiis', { isReserva: true })).toBe('reservaEmergencia');
  });
});

describe('valuatePortfolioItem: reserva movida muda SÓ a categoria', () => {
  const casos: { nome: string; input: Omit<ItemValuationInput, 'item'> }[] = [
    { nome: 'reserva manual sem FI', input: { asset: reservaManual } },
    {
      nome: 'reserva com FI',
      input: { asset: reservaManual, fixedIncome: fi, fiGetCurrentValue: () => 1100 },
    },
    {
      nome: 'Tesouro de catálogo da Emergência',
      input: {
        asset: tesouro,
        tesouroReservaDestino: 'emergencia',
        fixedIncome: fi,
        fiGetCurrentValue: () => 1050,
      },
    },
    { nome: 'CDB da RF', input: { asset: cdb, fixedIncome: fi, fiGetCurrentValue: () => 1200 } },
    { nome: 'conta da Oportunidade', input: { asset: contaOport } },
  ];

  it.each(casos)('$nome', ({ input }) => {
    ligar();
    const semOverride = valuatePortfolioItem({ ...input, item: item(null) });
    for (const destino of CATEGORIAS_CAIXA_RF) {
      const movido = valuatePortfolioItem({ ...input, item: item(destino) });
      expect(movido.valorAtualBRL).toBe(semOverride.valorAtualBRL);
      expect(movido.valorAplicadoBRL).toBe(semOverride.valorAplicadoBRL);
      expect(movido.fonte).toBe(semOverride.fonte);
      expect(movido.contaNoSaldoBruto).toBe(semOverride.contaNoSaldoBruto);
      expect(movido.categoria).toBe(destino);
    }
    desligar();
    for (const destino of CATEGORIAS_CAIXA_RF) {
      const off = valuatePortfolioItem({ ...input, item: item(destino) });
      expect(off).toEqual(semOverride);
    }
  });

  it('a categoria da pizza é a MESMA aba do mover (um item, uma aba)', () => {
    ligar();
    const linhas = [
      { asset: reservaManual, ctx: undefined },
      { asset: contaOport, ctx: undefined },
      { asset: cdb, ctx: undefined },
      { asset: cash, ctx: undefined },
      { asset: tesouro, ctx: 'emergencia' as const },
      { asset: tesouro, ctx: 'oportunidade' as const },
      { asset: tesouro, ctx: undefined },
    ];
    for (const { asset, ctx } of linhas) {
      for (const ov of [null, ...CATEGORIAS_CAIXA_RF]) {
        const pizza = valuatePortfolioItem({
          item: item(ov),
          asset,
          tesouroReservaDestino: ctx,
        }).categoria;
        expect(pizza).toBe(categoriaDaAba(asset, ov, { reservaDestino: ctx ?? null }));
      }
    }
  });
});
