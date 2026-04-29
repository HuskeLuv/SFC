import { describe, it, expect } from 'vitest';
import { apurarRendaVariavel, type RvTransaction } from '../rendaVariavelIR';

const tx = (
  params: Partial<RvTransaction> & Pick<RvTransaction, 'date' | 'type' | 'symbol'>,
): RvTransaction => ({
  category: 'acao_br',
  quantity: 0,
  price: 0,
  ...params,
});

describe('apurarRendaVariavel — preço médio', () => {
  it('preço médio com duas compras a preços diferentes', () => {
    const result = apurarRendaVariavel([
      tx({
        date: new Date('2025-01-15'),
        type: 'compra',
        symbol: 'PETR4',
        quantity: 100,
        price: 30,
      }),
      tx({
        date: new Date('2025-02-15'),
        type: 'compra',
        symbol: 'PETR4',
        quantity: 100,
        price: 40,
      }),
      // Vende 50 a 50 → lucro = (50 - 35) * 50 = 750
      tx({ date: new Date('2025-03-15'), type: 'venda', symbol: 'PETR4', quantity: 50, price: 50 }),
    ]);
    const mar = result.meses.find((m) => m.yearMonth === '2025-03')!;
    expect(mar.porCategoria.acao_br?.lucroBruto).toBe(750);
  });

  it('taxa de compra entra no custo, taxa de venda sai da receita', () => {
    const result = apurarRendaVariavel([
      tx({
        date: new Date('2025-01-15'),
        type: 'compra',
        symbol: 'PETR4',
        quantity: 100,
        price: 30,
        fees: 10,
      }),
      // Custo total = 3010, qty 100 → preço médio 30,1.
      // Venda 100 a 35, fee 5 → receita 3500-5 = 3495; custo 3010 → lucro 485.
      tx({
        date: new Date('2025-02-15'),
        type: 'venda',
        symbol: 'PETR4',
        quantity: 100,
        price: 35,
        fees: 5,
      }),
    ]);
    const feb = result.meses.find((m) => m.yearMonth === '2025-02')!;
    expect(feb.porCategoria.acao_br?.lucroBruto).toBeCloseTo(485, 1);
    expect(feb.porCategoria.acao_br?.vendasTotal).toBeCloseTo(3495, 1);
  });
});

describe('apurarRendaVariavel — isenção R$ 20k', () => {
  it('vendas de ações ≤ 20k → isento', () => {
    const result = apurarRendaVariavel([
      tx({
        date: new Date('2025-01-15'),
        type: 'compra',
        symbol: 'PETR4',
        quantity: 100,
        price: 30,
      }),
      tx({
        date: new Date('2025-02-15'),
        type: 'venda',
        symbol: 'PETR4',
        quantity: 100,
        price: 50,
      }), // R$5k
    ]);
    const feb = result.meses.find((m) => m.yearMonth === '2025-02')!;
    const cat = feb.porCategoria.acao_br!;
    expect(cat.isento).toBe(true);
    expect(cat.motivoIsencao).toContain('20.000');
    expect(cat.irDevido).toBe(0);
    expect(cat.lucroBruto).toBe(2000);
  });

  it('vendas de ações > 20k → tributa 15%', () => {
    const result = apurarRendaVariavel([
      tx({
        date: new Date('2025-01-15'),
        type: 'compra',
        symbol: 'PETR4',
        quantity: 1000,
        price: 30,
      }),
      tx({
        date: new Date('2025-02-15'),
        type: 'venda',
        symbol: 'PETR4',
        quantity: 600,
        price: 40,
      }), // R$24k
    ]);
    const feb = result.meses.find((m) => m.yearMonth === '2025-02')!;
    const cat = feb.porCategoria.acao_br!;
    expect(cat.isento).toBe(false);
    expect(cat.lucroBruto).toBe(6000); // (40-30)*600
    expect(cat.aliquota).toBe(0.15);
    expect(cat.irDevido).toBe(900); // 6000 * 0.15
  });

  it('isenção dos 20k só vale para acao_br, não para ETF', () => {
    const result = apurarRendaVariavel([
      tx({
        date: new Date('2025-01-15'),
        type: 'compra',
        symbol: 'BOVA11',
        quantity: 100,
        price: 100,
        category: 'etf_br',
      }),
      tx({
        date: new Date('2025-02-15'),
        type: 'venda',
        symbol: 'BOVA11',
        quantity: 100,
        price: 110,
        category: 'etf_br',
      }), // R$11k
    ]);
    const feb = result.meses.find((m) => m.yearMonth === '2025-02')!;
    const cat = feb.porCategoria.etf_br!;
    expect(cat.isento).toBe(false);
    expect(cat.lucroBruto).toBe(1000);
    expect(cat.irDevido).toBe(150); // 1000 * 0.15
  });
});

describe('apurarRendaVariavel — alíquotas', () => {
  it('FII: 20% sobre o lucro, sem isenção', () => {
    const result = apurarRendaVariavel([
      tx({
        date: new Date('2025-01-15'),
        type: 'compra',
        symbol: 'HGLG11',
        quantity: 10,
        price: 100,
        category: 'fii',
      }),
      tx({
        date: new Date('2025-02-15'),
        type: 'venda',
        symbol: 'HGLG11',
        quantity: 10,
        price: 150,
        category: 'fii',
      }), // R$1500
    ]);
    const feb = result.meses.find((m) => m.yearMonth === '2025-02')!;
    const cat = feb.porCategoria.fii!;
    expect(cat.isento).toBe(false);
    expect(cat.lucroBruto).toBe(500);
    expect(cat.aliquota).toBe(0.2);
    expect(cat.irDevido).toBe(100);
  });

  it('ETF: 15% sem isenção', () => {
    const result = apurarRendaVariavel([
      tx({
        date: new Date('2025-01-15'),
        type: 'compra',
        symbol: 'BOVA11',
        quantity: 10,
        price: 100,
        category: 'etf_br',
      }),
      tx({
        date: new Date('2025-02-15'),
        type: 'venda',
        symbol: 'BOVA11',
        quantity: 10,
        price: 150,
        category: 'etf_br',
      }),
    ]);
    const feb = result.meses.find((m) => m.yearMonth === '2025-02')!;
    expect(feb.porCategoria.etf_br?.aliquota).toBe(0.15);
    expect(feb.porCategoria.etf_br?.irDevido).toBe(75);
  });
});

describe('apurarRendaVariavel — compensação de prejuízo', () => {
  it('prejuízo de janeiro compensa lucro de fevereiro na MESMA categoria', () => {
    const result = apurarRendaVariavel([
      // Posição grande pra ultrapassar o limite de 20k em ambas as vendas.
      tx({
        date: new Date('2025-01-01'),
        type: 'compra',
        symbol: 'PETR4',
        quantity: 1000,
        price: 30,
      }),
      // Janeiro: prejuízo de 5000. Vendas = 25000 (acima do limite).
      tx({
        date: new Date('2025-01-15'),
        type: 'venda',
        symbol: 'PETR4',
        quantity: 1000,
        price: 25,
      }),
      // Recompra para nova venda em fevereiro.
      tx({
        date: new Date('2025-01-20'),
        type: 'compra',
        symbol: 'PETR4',
        quantity: 1000,
        price: 30,
      }),
      // Fevereiro: lucro bruto = 8000. Vendas = 38000 (tributa).
      tx({
        date: new Date('2025-02-15'),
        type: 'venda',
        symbol: 'PETR4',
        quantity: 1000,
        price: 38,
      }),
    ]);
    const jan = result.meses.find((m) => m.yearMonth === '2025-01')!;
    const feb = result.meses.find((m) => m.yearMonth === '2025-02')!;
    expect(jan.porCategoria.acao_br?.lucroBruto).toBe(-5000);
    expect(jan.porCategoria.acao_br?.saldoPrejuizoFinal).toBe(5000);
    expect(feb.porCategoria.acao_br?.lucroBruto).toBe(8000);
    expect(feb.porCategoria.acao_br?.prejuizoCompensado).toBe(5000);
    expect(feb.porCategoria.acao_br?.lucroTributavel).toBe(3000);
    expect(feb.porCategoria.acao_br?.irDevido).toBe(450); // 3000 * 0.15
    expect(feb.porCategoria.acao_br?.saldoPrejuizoFinal).toBe(0);
    expect(result.saldosPrejuizoAtual.rvComum).toBe(0);
  });

  it('prejuízo de FII NÃO compensa com lucro de ações', () => {
    const result = apurarRendaVariavel([
      // FII com prejuízo
      tx({
        date: new Date('2025-01-01'),
        type: 'compra',
        symbol: 'HGLG11',
        quantity: 10,
        price: 200,
        category: 'fii',
      }),
      tx({
        date: new Date('2025-01-15'),
        type: 'venda',
        symbol: 'HGLG11',
        quantity: 10,
        price: 150,
        category: 'fii',
      }),
      // Ações com lucro (acima do limite pra tributar)
      tx({
        date: new Date('2025-02-01'),
        type: 'compra',
        symbol: 'PETR4',
        quantity: 1000,
        price: 30,
      }),
      tx({
        date: new Date('2025-02-15'),
        type: 'venda',
        symbol: 'PETR4',
        quantity: 1000,
        price: 35,
      }),
    ]);
    const feb = result.meses.find((m) => m.yearMonth === '2025-02')!;
    expect(feb.porCategoria.acao_br?.prejuizoCompensado).toBe(0);
    expect(feb.porCategoria.acao_br?.irDevido).toBe(750); // 5000 * 0.15
    expect(result.saldosPrejuizoAtual.fii).toBe(500); // prejuízo do FII permanece
    expect(result.saldosPrejuizoAtual.rvComum).toBe(0);
  });

  it('lucro isento (≤ 20k) NÃO consome saldo de prejuízo de mês anterior', () => {
    const result = apurarRendaVariavel([
      // Janeiro: prejuízo 5000 (vendas > 20k).
      tx({
        date: new Date('2025-01-01'),
        type: 'compra',
        symbol: 'PETR4',
        quantity: 1000,
        price: 30,
      }),
      tx({
        date: new Date('2025-01-15'),
        type: 'venda',
        symbol: 'PETR4',
        quantity: 1000,
        price: 25,
      }),
      // Fevereiro: vendas pequenas (≤20k) com lucro. Isento → saldo de prejuízo permanece.
      tx({
        date: new Date('2025-01-20'),
        type: 'compra',
        symbol: 'PETR4',
        quantity: 100,
        price: 30,
      }),
      tx({
        date: new Date('2025-02-15'),
        type: 'venda',
        symbol: 'PETR4',
        quantity: 100,
        price: 50,
      }), // R$5k vendas
    ]);
    const feb = result.meses.find((m) => m.yearMonth === '2025-02')!;
    expect(feb.porCategoria.acao_br?.isento).toBe(true);
    expect(feb.porCategoria.acao_br?.prejuizoCompensado).toBe(0);
    expect(feb.porCategoria.acao_br?.saldoPrejuizoFinal).toBe(5000); // intacto
    expect(result.saldosPrejuizoAtual.rvComum).toBe(5000);
  });

  it('prejuízo de ETF compensa lucro de ações no mesmo pool rvComum', () => {
    const result = apurarRendaVariavel([
      // Janeiro: ETF com prejuízo de 5000.
      tx({
        date: new Date('2025-01-01'),
        type: 'compra',
        symbol: 'BOVA11',
        quantity: 100,
        price: 100,
        category: 'etf_br',
      }),
      tx({
        date: new Date('2025-01-15'),
        type: 'venda',
        symbol: 'BOVA11',
        quantity: 100,
        price: 50,
        category: 'etf_br',
      }),
      // Fevereiro: ações com lucro 8000 (vendas > 20k para tributar).
      tx({
        date: new Date('2025-02-01'),
        type: 'compra',
        symbol: 'PETR4',
        quantity: 1000,
        price: 30,
      }),
      tx({
        date: new Date('2025-02-15'),
        type: 'venda',
        symbol: 'PETR4',
        quantity: 1000,
        price: 38,
      }),
    ]);
    const feb = result.meses.find((m) => m.yearMonth === '2025-02')!;
    expect(feb.porCategoria.acao_br?.lucroBruto).toBe(8000);
    expect(feb.porCategoria.acao_br?.prejuizoCompensado).toBe(5000);
    expect(feb.porCategoria.acao_br?.lucroTributavel).toBe(3000);
    expect(feb.porCategoria.acao_br?.irDevido).toBe(450);
    expect(result.saldosPrejuizoAtual.rvComum).toBe(0);
  });
});

describe('apurarRendaVariavel — bordas', () => {
  it('input vazio retorna meses vazios', () => {
    const result = apurarRendaVariavel([]);
    expect(result.meses).toEqual([]);
    expect(result.saldosPrejuizoAtual).toEqual({ rvComum: 0, fii: 0 });
  });

  it('apenas compras (sem vendas) não geram apuração', () => {
    const result = apurarRendaVariavel([
      tx({
        date: new Date('2025-01-15'),
        type: 'compra',
        symbol: 'PETR4',
        quantity: 100,
        price: 30,
      }),
    ]);
    expect(result.meses).toEqual([]);
  });

  it('venda sem compra anterior usa preço médio 0 (lucro = receita)', () => {
    const result = apurarRendaVariavel([
      tx({
        date: new Date('2025-01-15'),
        type: 'venda',
        symbol: 'PETR4',
        quantity: 100,
        price: 30,
      }),
    ]);
    const jan = result.meses.find((m) => m.yearMonth === '2025-01')!;
    expect(jan.porCategoria.acao_br?.lucroBruto).toBe(3000);
  });
});
