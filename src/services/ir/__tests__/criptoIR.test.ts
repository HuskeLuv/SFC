import { describe, it, expect } from 'vitest';
import { apurarCripto, type CriptoTransaction } from '../criptoIR';

const tx = (
  params: Partial<CriptoTransaction> & Pick<CriptoTransaction, 'date' | 'type' | 'symbol'>,
): CriptoTransaction => ({
  quantity: 0,
  price: 0,
  ...params,
});

describe('apurarCripto — preço médio com decimais', () => {
  it('aceita quantidade fracional (BTC com 5 casas)', () => {
    const result = apurarCripto([
      tx({
        date: new Date('2025-01-15'),
        type: 'compra',
        symbol: 'BTC',
        quantity: 0.5,
        price: 200000,
      }),
      tx({
        date: new Date('2025-02-15'),
        type: 'compra',
        symbol: 'BTC',
        quantity: 0.25,
        price: 240000,
      }),
      // PreçoMedio = (100000 + 60000) / 0.75 = 213333.33
      // Vende 0.5 a 300000 → receita 150000, custo 0.5 * 213333.33 = 106666.67
      // lucro = 43333.33
      tx({
        date: new Date('2025-03-15'),
        type: 'venda',
        symbol: 'BTC',
        quantity: 0.5,
        price: 300000,
      }),
    ]);
    const mar = result.meses.find((m) => m.yearMonth === '2025-03')!;
    expect(mar.lucroBruto).toBeCloseTo(43333.33, 1);
  });

  it('estado fica zerado após venda exata da posição', () => {
    const result = apurarCripto([
      tx({
        date: new Date('2025-01-15'),
        type: 'compra',
        symbol: 'ETH',
        quantity: 0.1,
        price: 10000,
      }),
      tx({
        date: new Date('2025-02-15'),
        type: 'venda',
        symbol: 'ETH',
        quantity: 0.1,
        price: 12000,
      }),
      // Recompra e vende de novo — não deve "carregar" preço médio anterior.
      tx({
        date: new Date('2025-03-01'),
        type: 'compra',
        symbol: 'ETH',
        quantity: 0.1,
        price: 15000,
      }),
      tx({
        date: new Date('2025-03-15'),
        type: 'venda',
        symbol: 'ETH',
        quantity: 0.1,
        price: 18000,
      }),
    ]);
    const mar = result.meses.find((m) => m.yearMonth === '2025-03')!;
    // Lucro = (18000 - 15000) * 0.1 = 300, não (18000 - 12500) * 0.1
    expect(mar.lucroBruto).toBe(300);
  });
});

describe('apurarCripto — isenção R$35k', () => {
  it('vendas totais ≤ 35k → isento', () => {
    const result = apurarCripto([
      tx({
        date: new Date('2025-01-01'),
        type: 'compra',
        symbol: 'BTC',
        quantity: 0.1,
        price: 200000,
      }),
      // Vende 0.1 BTC a 250000 → receita 25000 (≤ 35k)
      tx({
        date: new Date('2025-02-15'),
        type: 'venda',
        symbol: 'BTC',
        quantity: 0.1,
        price: 250000,
      }),
    ]);
    const feb = result.meses.find((m) => m.yearMonth === '2025-02')!;
    expect(feb.isento).toBe(true);
    expect(feb.lucroBruto).toBe(5000);
    expect(feb.irDevido).toBe(0);
    expect(feb.motivoIsencao).toContain('35.000');
  });

  it('vendas > 35k → tributa 15%', () => {
    const result = apurarCripto([
      tx({
        date: new Date('2025-01-01'),
        type: 'compra',
        symbol: 'BTC',
        quantity: 1,
        price: 200000,
      }),
      tx({
        date: new Date('2025-02-15'),
        type: 'venda',
        symbol: 'BTC',
        quantity: 1,
        price: 240000,
      }),
    ]);
    const feb = result.meses.find((m) => m.yearMonth === '2025-02')!;
    expect(feb.isento).toBe(false);
    expect(feb.lucroBruto).toBe(40000);
    expect(feb.irDevido).toBe(6000);
    expect(feb.aliquota).toBe(0.15);
  });

  it('soma vendas de múltiplas criptos para checar limite', () => {
    const result = apurarCripto([
      tx({
        date: new Date('2025-01-01'),
        type: 'compra',
        symbol: 'BTC',
        quantity: 0.05,
        price: 200000,
      }),
      tx({
        date: new Date('2025-01-01'),
        type: 'compra',
        symbol: 'ETH',
        quantity: 1,
        price: 10000,
      }),
      // Vendas: BTC 0.05 a 240000 = 12000; ETH 1 a 25000 = 25000. Total 37000 → tributa.
      tx({
        date: new Date('2025-02-15'),
        type: 'venda',
        symbol: 'BTC',
        quantity: 0.05,
        price: 240000,
      }),
      tx({ date: new Date('2025-02-15'), type: 'venda', symbol: 'ETH', quantity: 1, price: 25000 }),
    ]);
    const feb = result.meses.find((m) => m.yearMonth === '2025-02')!;
    expect(feb.vendasTotal).toBe(37000);
    expect(feb.isento).toBe(false);
    // Lucro = (240000-200000)*0.05 + (25000-10000)*1 = 2000 + 15000 = 17000
    expect(feb.lucroBruto).toBe(17000);
    expect(feb.irDevido).toBe(2550);
  });
});

describe('apurarCripto — compensação intra-mês, sem cross-month', () => {
  it('lucro e prejuízo do mesmo mês compensam', () => {
    const result = apurarCripto([
      // BTC: compra 0.5@200000, venda 0.5@180000 → prejuízo 10000 (vendas 90000)
      tx({
        date: new Date('2025-01-01'),
        type: 'compra',
        symbol: 'BTC',
        quantity: 0.5,
        price: 200000,
      }),
      tx({
        date: new Date('2025-02-15'),
        type: 'venda',
        symbol: 'BTC',
        quantity: 0.5,
        price: 180000,
      }),
      // ETH: compra 5@10000, venda 5@15000 → lucro 25000 (vendas 75000)
      tx({
        date: new Date('2025-01-01'),
        type: 'compra',
        symbol: 'ETH',
        quantity: 5,
        price: 10000,
      }),
      tx({ date: new Date('2025-02-15'), type: 'venda', symbol: 'ETH', quantity: 5, price: 15000 }),
    ]);
    const feb = result.meses.find((m) => m.yearMonth === '2025-02')!;
    expect(feb.vendasTotal).toBe(165000);
    expect(feb.lucroBruto).toBe(15000); // -10000 + 25000
    expect(feb.irDevido).toBe(2250);
  });

  it('prejuízo de janeiro NÃO compensa lucro de fevereiro (alinhado com regra de ME)', () => {
    const result = apurarCripto([
      tx({
        date: new Date('2025-01-01'),
        type: 'compra',
        symbol: 'BTC',
        quantity: 1,
        price: 200000,
      }),
      tx({
        date: new Date('2025-01-15'),
        type: 'venda',
        symbol: 'BTC',
        quantity: 1,
        price: 150000,
      }),
      tx({
        date: new Date('2025-02-01'),
        type: 'compra',
        symbol: 'BTC',
        quantity: 1,
        price: 150000,
      }),
      tx({
        date: new Date('2025-02-15'),
        type: 'venda',
        symbol: 'BTC',
        quantity: 1,
        price: 200000,
      }),
    ]);
    const feb = result.meses.find((m) => m.yearMonth === '2025-02')!;
    expect(feb.lucroBruto).toBe(50000);
    expect(feb.irDevido).toBe(7500); // 50000 * 0.15 (sem usar prejuízo de janeiro)
  });
});

describe('apurarCripto — bordas', () => {
  it('input vazio retorna meses vazios', () => {
    expect(apurarCripto([]).meses).toEqual([]);
  });

  it('apenas compras (sem vendas) não geram apuração', () => {
    const result = apurarCripto([
      tx({
        date: new Date('2025-01-15'),
        type: 'compra',
        symbol: 'BTC',
        quantity: 0.1,
        price: 200000,
      }),
    ]);
    expect(result.meses).toEqual([]);
  });
});
