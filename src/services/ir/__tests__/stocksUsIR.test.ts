import { describe, it, expect } from 'vitest';
import { apurarStocksUs, type UsTransaction } from '../stocksUsIR';

const tx = (
  params: Partial<UsTransaction> & Pick<UsTransaction, 'date' | 'type' | 'symbol'>,
): UsTransaction => ({
  quantity: 0,
  priceUsd: 0,
  fxRate: 5.0,
  ...params,
});

describe('apurarStocksUs — preço médio em BRL', () => {
  it('compra com fxRate alto + venda com fxRate baixo gera prejuízo BRL mesmo com preço USD igual', () => {
    const result = apurarStocksUs([
      tx({
        date: new Date('2025-01-15'),
        type: 'compra',
        symbol: 'VOO',
        quantity: 10,
        priceUsd: 500,
        fxRate: 6.0, // R$ 30.000 de custo
      }),
      tx({
        date: new Date('2025-02-15'),
        type: 'venda',
        symbol: 'VOO',
        quantity: 10,
        priceUsd: 500,
        fxRate: 5.0, // R$ 25.000 de receita
      }),
    ]);
    const feb = result.meses.find((m) => m.yearMonth === '2025-02')!;
    expect(feb.lucroBrutoBrl).toBe(-5000);
    expect(feb.irDevido).toBe(0);
  });

  it('compra com fxRate baixo + venda com fxRate alto gera lucro mesmo sem variação de preço USD', () => {
    const result = apurarStocksUs([
      tx({
        date: new Date('2025-01-15'),
        type: 'compra',
        symbol: 'VOO',
        quantity: 100,
        priceUsd: 500,
        fxRate: 5.0, // R$ 250.000
      }),
      tx({
        date: new Date('2025-02-15'),
        type: 'venda',
        symbol: 'VOO',
        quantity: 100,
        priceUsd: 500,
        fxRate: 5.5, // R$ 275.000
      }),
    ]);
    const feb = result.meses.find((m) => m.yearMonth === '2025-02')!;
    // Vendas BRL = 275000, > 35k → tributa.
    expect(feb.lucroBrutoBrl).toBe(25000);
    expect(feb.irDevido).toBe(3750); // 25000 * 0.15
    expect(feb.aliquota).toBe(0.15);
  });
});

describe('apurarStocksUs — isenção R$ 35k', () => {
  it('vendas ≤ R$35k → isento, mesmo com lucro', () => {
    const result = apurarStocksUs([
      tx({
        date: new Date('2025-01-15'),
        type: 'compra',
        symbol: 'AAPL',
        quantity: 10,
        priceUsd: 100,
        fxRate: 5.0,
      }),
      tx({
        date: new Date('2025-02-15'),
        type: 'venda',
        symbol: 'AAPL',
        quantity: 10,
        priceUsd: 200,
        fxRate: 5.0, // vendas BRL = 10000 ≤ 35k
      }),
    ]);
    const feb = result.meses.find((m) => m.yearMonth === '2025-02')!;
    expect(feb.vendasTotalBrl).toBe(10000);
    expect(feb.lucroBrutoBrl).toBe(5000);
    expect(feb.isento).toBe(true);
    expect(feb.motivoIsencao).toContain('35.000');
    expect(feb.irDevido).toBe(0);
  });

  it('vendas > R$35k em um único mês → tributa 15%', () => {
    const result = apurarStocksUs([
      tx({
        date: new Date('2025-01-15'),
        type: 'compra',
        symbol: 'AAPL',
        quantity: 100,
        priceUsd: 100,
        fxRate: 5.0,
      }),
      tx({
        date: new Date('2025-02-15'),
        type: 'venda',
        symbol: 'AAPL',
        quantity: 100,
        priceUsd: 200,
        fxRate: 5.0, // vendas BRL = 100000
      }),
    ]);
    const feb = result.meses.find((m) => m.yearMonth === '2025-02')!;
    expect(feb.isento).toBe(false);
    expect(feb.lucroBrutoBrl).toBe(50000);
    expect(feb.irDevido).toBe(7500);
  });

  it('soma vendas de múltiplos ativos no mês para checar limite 35k', () => {
    const result = apurarStocksUs([
      // VOO comprado 10 a $50, vendido 10 a $100 = receita 10*100*5 = 5000 BRL
      tx({
        date: new Date('2025-01-01'),
        type: 'compra',
        symbol: 'VOO',
        quantity: 10,
        priceUsd: 50,
        fxRate: 5,
      }),
      tx({
        date: new Date('2025-02-15'),
        type: 'venda',
        symbol: 'VOO',
        quantity: 10,
        priceUsd: 100,
        fxRate: 5,
      }),
      // AAPL comprado 50 a $100, vendido 50 a $150 = receita 50*150*5 = 37500 BRL
      tx({
        date: new Date('2025-01-01'),
        type: 'compra',
        symbol: 'AAPL',
        quantity: 50,
        priceUsd: 100,
        fxRate: 5,
      }),
      tx({
        date: new Date('2025-02-15'),
        type: 'venda',
        symbol: 'AAPL',
        quantity: 50,
        priceUsd: 150,
        fxRate: 5,
      }),
    ]);
    const feb = result.meses.find((m) => m.yearMonth === '2025-02')!;
    // Vendas totais = 5000 + 37500 = 42500 → > 35k, tributa.
    expect(feb.vendasTotalBrl).toBe(42500);
    expect(feb.isento).toBe(false);
    // Lucro = 500 (VOO) + 2500 (AAPL) = 3000... esperando: VOO (100-50)*10=500; AAPL (150-100)*50=2500
    expect(feb.lucroBrutoBrl).toBe(15000); // wait: VOO lucro = 10*(100-50)*5 = 2500; AAPL = 50*(150-100)*5 = 12500. Total 15000.
    expect(feb.irDevido).toBe(2250); // 15000*0.15
  });
});

describe('apurarStocksUs — compensação intra-mês, sem cross-month', () => {
  it('prejuízo e lucro do MESMO mês compensam (somatório)', () => {
    const result = apurarStocksUs([
      // VOO: compra 10@500, venda 10@400 → prejuízo de R$5000 (vendas 20k)
      tx({
        date: new Date('2025-01-01'),
        type: 'compra',
        symbol: 'VOO',
        quantity: 10,
        priceUsd: 500,
        fxRate: 5,
      }),
      tx({
        date: new Date('2025-02-15'),
        type: 'venda',
        symbol: 'VOO',
        quantity: 10,
        priceUsd: 400,
        fxRate: 5,
      }),
      // AAPL: compra 50@100, venda 50@200 → lucro de R$25000 (vendas 50k)
      tx({
        date: new Date('2025-01-01'),
        type: 'compra',
        symbol: 'AAPL',
        quantity: 50,
        priceUsd: 100,
        fxRate: 5,
      }),
      tx({
        date: new Date('2025-02-15'),
        type: 'venda',
        symbol: 'AAPL',
        quantity: 50,
        priceUsd: 200,
        fxRate: 5,
      }),
    ]);
    const feb = result.meses.find((m) => m.yearMonth === '2025-02')!;
    // Vendas total = 20k + 50k = 70k (> 35k, não isento)
    expect(feb.vendasTotalBrl).toBe(70000);
    // Lucro líquido = -5000 + 25000 = 20000 (compensação intra-mês)
    expect(feb.lucroBrutoBrl).toBe(20000);
    expect(feb.irDevido).toBe(3000); // 20000 * 0.15
  });

  it('prejuízo de janeiro NÃO compensa lucro de fevereiro (sem carryforward em ME)', () => {
    const result = apurarStocksUs([
      tx({
        date: new Date('2025-01-01'),
        type: 'compra',
        symbol: 'VOO',
        quantity: 100,
        priceUsd: 500,
        fxRate: 5,
      }),
      tx({
        date: new Date('2025-01-20'),
        type: 'venda',
        symbol: 'VOO',
        quantity: 100,
        priceUsd: 400,
        fxRate: 5,
      }), // prej 50k
      tx({
        date: new Date('2025-02-01'),
        type: 'compra',
        symbol: 'AAPL',
        quantity: 100,
        priceUsd: 200,
        fxRate: 5,
      }),
      tx({
        date: new Date('2025-02-20'),
        type: 'venda',
        symbol: 'AAPL',
        quantity: 100,
        priceUsd: 300,
        fxRate: 5,
      }), // lucro 50k, vendas 150k
    ]);
    const jan = result.meses.find((m) => m.yearMonth === '2025-01')!;
    const feb = result.meses.find((m) => m.yearMonth === '2025-02')!;
    expect(jan.lucroBrutoBrl).toBe(-50000);
    expect(jan.irDevido).toBe(0);
    expect(feb.lucroBrutoBrl).toBe(50000);
    // Sem carryforward em ME — fevereiro paga IR cheio.
    expect(feb.irDevido).toBe(7500);
  });
});

describe('apurarStocksUs — bordas', () => {
  it('input vazio retorna meses vazios', () => {
    const result = apurarStocksUs([]);
    expect(result.meses).toEqual([]);
  });

  it('apenas compras (sem vendas) não geram apuração', () => {
    const result = apurarStocksUs([
      tx({
        date: new Date('2025-01-15'),
        type: 'compra',
        symbol: 'AAPL',
        quantity: 10,
        priceUsd: 100,
        fxRate: 5,
      }),
    ]);
    expect(result.meses).toEqual([]);
  });

  it('mês com prejuízo isolado: ir=0 mas mês entra no resultado', () => {
    const result = apurarStocksUs([
      tx({
        date: new Date('2025-01-01'),
        type: 'compra',
        symbol: 'AAPL',
        quantity: 10,
        priceUsd: 100,
        fxRate: 5,
      }),
      tx({
        date: new Date('2025-02-15'),
        type: 'venda',
        symbol: 'AAPL',
        quantity: 10,
        priceUsd: 80,
        fxRate: 5,
      }),
    ]);
    const feb = result.meses.find((m) => m.yearMonth === '2025-02')!;
    expect(feb.lucroBrutoBrl).toBe(-1000);
    expect(feb.irDevido).toBe(0);
    expect(feb.isento).toBe(false); // prejuízo não é isenção
  });
});
