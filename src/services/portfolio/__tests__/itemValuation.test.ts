import { describe, it, expect } from 'vitest';
import {
  valuatePortfolioItem,
  categorizarAsset,
  getFixedIncomeCurrentValue,
  CATEGORIA_ASSET_TYPE_FILTERS,
} from '../itemValuation';
import type { FixedIncomeAssetWithAsset } from '../patrimonioHistoricoBuilder';

const item = (
  over: Partial<{ quantity: number; avgPrice: number; totalInvested: number }> = {},
) => ({
  assetId: 'asset-1',
  quantity: 100,
  avgPrice: 25,
  totalInvested: 2500,
  ...over,
});

const fi = (over: Partial<FixedIncomeAssetWithAsset> = {}): FixedIncomeAssetWithAsset => ({
  id: 'fi-1',
  userId: 'u-1',
  assetId: 'asset-1',
  type: 'CDB_PRE',
  description: 'CDB',
  startDate: new Date('2026-01-15'),
  maturityDate: new Date('2028-01-15'),
  investedAmount: 10000,
  annualRate: 110,
  indexer: 'CDI',
  indexerPercent: 100,
  liquidityType: null,
  taxExempt: false,
  asset: null,
  ...over,
});

describe('valuatePortfolioItem — fontes de valor', () => {
  it('usa cotação live quando disponível (BRL)', () => {
    const v = valuatePortfolioItem({
      item: item(),
      asset: { symbol: 'PETR4', type: 'stock', currency: 'BRL' },
      quote: 41.16,
    });
    expect(v.valorAtualBRL).toBeCloseTo(4116);
    expect(v.fonte).toBe('quote');
    expect(v.categoria).toBe('acoes');
    expect(v.contaNoSaldoBruto).toBe(true);
  });

  it('converte USD→BRL quando o asset é USD e há cotação do dólar', () => {
    const v = valuatePortfolioItem({
      item: item({ quantity: 10, avgPrice: 500, totalInvested: 5000 }),
      asset: { symbol: 'VOO', type: 'etf', currency: 'USD' },
      quote: 400,
      cotacaoDolar: 5.5,
    });
    expect(v.valorAtualBRL).toBeCloseTo(10 * 400 * 5.5);
  });

  it('NÃO converte crypto (getAssetPrices já devolve BRL)', () => {
    const v = valuatePortfolioItem({
      item: item({ quantity: 0.5, avgPrice: 300000, totalInvested: 150000 }),
      asset: { symbol: 'BTC', type: 'crypto', currency: 'USD' },
      quote: 600000,
      cotacaoDolar: 5.5,
    });
    expect(v.valorAtualBRL).toBeCloseTo(300000);
    expect(v.categoria).toBe('moedasCriptos');
  });

  it('fallback sem cotação = qty×avgPrice (já em BRL, sem dupla conversão)', () => {
    const v = valuatePortfolioItem({
      item: item({ quantity: 10, avgPrice: 2448, totalInvested: 24480 }),
      asset: { symbol: 'VOO', type: 'etf', currency: 'USD' },
      quote: null,
      cotacaoDolar: 5.5,
    });
    expect(v.valorAtualBRL).toBeCloseTo(24480);
    expect(v.fonte).toBe('fallback');
  });

  it('reserva editada: avgPrice×qty tem prioridade sobre totalInvested (igual em qualquer tela)', () => {
    const v = valuatePortfolioItem({
      item: item({ quantity: 1, avgPrice: 8000, totalInvested: 10000 }),
      asset: { symbol: 'RESERVA-EMERG-1', type: 'emergency', currency: 'BRL' },
    });
    expect(v.valorAtualBRL).toBe(8000);
    expect(v.fonte).toBe('reserva');
    expect(v.categoria).toBe('reservaEmergencia');
  });

  it('imóvel/personalizado: totalInvested, fora do saldo bruto', () => {
    const v = valuatePortfolioItem({
      item: item({ quantity: 1, avgPrice: 500000, totalInvested: 500000 }),
      asset: { symbol: 'PERSONALIZADO-1', type: 'personalizado', currency: 'BRL' },
    });
    expect(v.valorAtualBRL).toBe(500000);
    expect(v.contaNoSaldoBruto).toBe(false);
    expect(v.categoria).toBe('imoveisBens');
  });

  it('tesouro do catálogo destinado a reserva vai para a categoria da reserva', () => {
    const v = valuatePortfolioItem({
      item: item({ quantity: 1, avgPrice: 2000, totalInvested: 2000 }),
      asset: { symbol: 'TD-SELIC-2030', type: 'tesouro-direto', currency: 'BRL' },
      tesouroReservaDestino: 'oportunidade',
    });
    expect(v.categoria).toBe('reservaOportunidade');
  });
});

describe('getFixedIncomeCurrentValue — prioridade única', () => {
  const portfolioItem = { quantity: 1, avgPrice: 10000, totalInvested: 10000 };

  it('1. PU do Tesouro (Asset.currentPrice) vence tudo', () => {
    const r = getFixedIncomeCurrentValue(
      fi({ tesouroBondType: 'SELIC' }),
      { ...portfolioItem, quantity: 2 },
      { symbol: 'TD-X', type: 'tesouro-direto', currentPrice: 5100 },
      () => 9800,
    );
    expect(r.valor).toBe(10200);
    expect(r.fonte).toBe('tesouro-pu');
  });

  it('2a. curva bancária exige valor > investedAmount', () => {
    const r = getFixedIncomeCurrentValue(fi(), portfolioItem, null, () => 10358.16);
    expect(r.valor).toBeCloseTo(10358.16);
    expect(r.fonte).toBe('fixed-income');
  });

  it('2b. curva bancária abaixo do investido é rejeitada → edição manual', () => {
    const r = getFixedIncomeCurrentValue(
      fi(),
      { ...portfolioItem, avgPrice: 10500 },
      null,
      () => 9000,
    );
    expect(r.valor).toBe(10500);
    expect(r.fonte).toBe('manual');
  });

  it('2c. Tesouro via FI aceita curva abaixo do par (alta de juros)', () => {
    const r = getFixedIncomeCurrentValue(
      fi({ tesouroBondType: 'IPCA+', indexer: 'IPCA' }),
      portfolioItem,
      { symbol: 'TD-IPCA', type: 'tesouro-direto', currentPrice: null },
      () => 9200,
    );
    expect(r.valor).toBe(9200);
    expect(r.fonte).toBe('fixed-income');
  });
});

describe('categorizarAsset — tabela única', () => {
  it.each([
    [{ symbol: 'PETR4', type: 'stock', currency: 'BRL' }, 'acoes'],
    [{ symbol: 'AAPL', type: 'stock', currency: 'USD' }, 'stocks'],
    [{ symbol: 'K1EY34', type: 'bdr', currency: 'BRL' }, 'acoes'],
    [{ symbol: 'HGLG11', type: 'fii', currency: 'BRL' }, 'fiis'],
    [{ symbol: 'BOVA11', type: 'etf', currency: 'BRL' }, 'etfs'],
    [{ symbol: 'CVM-1', type: 'etf-cvm', currency: 'BRL' }, 'etfs'],
    [{ symbol: 'CVM-2', type: 'fia', currency: 'BRL' }, 'fimFia'],
    [{ symbol: 'CVM-3', type: 'multimercado', currency: 'BRL' }, 'fimFia'],
    [{ symbol: 'CVM-4', type: 'fidc', currency: 'BRL' }, 'fimFia'],
    [{ symbol: 'FUNDO-X', type: 'fund', currency: 'BRL', name: 'FII Imobiliário Y' }, 'fiis'],
    [{ symbol: 'FUNDO-Z', type: 'fund', currency: 'BRL', name: 'Fundo Multi' }, 'fimFia'],
    [{ symbol: 'RF-1', type: 'bond', currency: 'BRL' }, 'rendaFixaFundos'],
    [{ symbol: 'TD-1', type: 'tesouro-direto', currency: 'BRL' }, 'rendaFixaFundos'],
    [{ symbol: 'PREV-1', type: 'previdencia', currency: 'BRL' }, 'previdenciaSeguros'],
    [{ symbol: 'SEG-1', type: 'insurance', currency: 'BRL' }, 'previdenciaSeguros'],
    [{ symbol: 'CASH-1', type: 'cash', currency: 'BRL' }, 'reservaOportunidade'],
    [{ symbol: 'O1', type: 'opcao', currency: 'BRL' }, 'opcoes'],
    [{ symbol: 'IMOVEL-1', type: 'imovel', currency: 'BRL' }, 'imoveisBens'],
    [{ symbol: 'DESCONHECIDO11', type: 'zzz', currency: 'BRL' }, 'fiis'],
    [{ symbol: 'DESCONHECIDO', type: 'zzz', currency: 'BRL' }, 'rendaFixaFundos'],
  ])('%o → %s', (asset, esperado) => {
    expect(categorizarAsset(asset)).toBe(esperado);
  });

  it('reserva tem precedência sobre o type', () => {
    expect(
      categorizarAsset(
        { symbol: 'TD-X', type: 'tesouro-direto' },
        { isReserva: true, tesouroReservaDestino: 'emergencia' },
      ),
    ).toBe('reservaEmergencia');
  });

  it('filtros por categoria cobrem os types da própria categorização', () => {
    for (const t of CATEGORIA_ASSET_TYPE_FILTERS.fimFia) {
      const cat = categorizarAsset({ symbol: 'X', type: t, name: 'Fundo' });
      expect(['fimFia', 'fiis']).toContain(cat);
    }
    for (const t of CATEGORIA_ASSET_TYPE_FILTERS.etfs) {
      expect(categorizarAsset({ symbol: 'X', type: t })).toBe('etfs');
    }
  });
});
