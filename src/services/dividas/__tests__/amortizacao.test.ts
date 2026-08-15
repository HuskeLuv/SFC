import { describe, it, expect } from 'vitest';
import {
  pmtPrice,
  corrigirCronograma,
  gerarCronogramaSAC,
  gerarCronogramaPrice,
  gerarCronograma,
  calcularCorteAmortizacao,
  saldoFinanciamento,
  saldoRotativa,
  resumoDivida,
  type PagamentoDividaInput,
} from '../amortizacao';

// Caso de referência clássico: R$ 100.000, 1% a.m., 120 meses.
const PRINCIPAL = 100_000;
const TAXA = 0.01;
const PRAZO = 120;
const INICIO = '2026-01';

const pg = (over: Partial<PagamentoDividaInput> = {}): PagamentoDividaInput => ({
  valor: 0,
  parcelaNumero: null,
  tipo: 'pagamento',
  month: '2026-01',
  ...over,
});

describe('pmtPrice', () => {
  it('calcula a parcela Price do caso de referência (≈ 1.434,71)', () => {
    expect(pmtPrice(PRINCIPAL, TAXA, PRAZO)).toBeCloseTo(1434.71, 2);
  });

  it('degenera em principal/prazo com taxa zero', () => {
    expect(pmtPrice(12_000, 0, 12)).toBe(1000);
  });

  it('retorna 0 com prazo inválido', () => {
    expect(pmtPrice(1000, 0.01, 0)).toBe(0);
  });
});

describe('gerarCronogramaSAC', () => {
  const rows = gerarCronogramaSAC(PRINCIPAL, TAXA, PRAZO, INICIO);

  it('tem uma linha por mês, com meses corretos', () => {
    expect(rows).toHaveLength(PRAZO);
    expect(rows[0].mes).toBe('2026-01');
    expect(rows[11].mes).toBe('2026-12');
    expect(rows[12].mes).toBe('2027-01');
    expect(rows.at(-1)!.mes).toBe('2035-12');
  });

  it('amortização constante e juros decrescentes', () => {
    expect(rows[0].amortizacao).toBeCloseTo(833.33, 2);
    expect(rows[0].juros).toBeCloseTo(1000, 2);
    expect(rows[0].parcela).toBeCloseTo(1833.33, 2);
    expect(rows[1].juros).toBeLessThan(rows[0].juros);
    expect(rows.at(-1)!.parcela).toBeLessThan(rows[0].parcela);
  });

  it('soma das amortizações == principal e saldo final 0.00 exato', () => {
    const soma = rows.reduce((acc, r) => acc + r.amortizacao, 0);
    expect(soma).toBeCloseTo(PRINCIPAL, 2);
    expect(rows.at(-1)!.saldoDevedor).toBe(0);
  });

  it('taxa zero: parcela == amortização, juros 0', () => {
    const semJuros = gerarCronogramaSAC(12_000, 0, 12, INICIO);
    expect(semJuros[0].juros).toBe(0);
    expect(semJuros[0].parcela).toBe(1000);
    expect(semJuros.at(-1)!.saldoDevedor).toBe(0);
  });

  it('prazo 1: quita tudo na única parcela', () => {
    const unica = gerarCronogramaSAC(1000, 0.02, 1, INICIO);
    expect(unica).toHaveLength(1);
    expect(unica[0].amortizacao).toBe(1000);
    expect(unica[0].juros).toBe(20);
    expect(unica[0].saldoDevedor).toBe(0);
  });

  it('entrada inválida → vazio', () => {
    expect(gerarCronogramaSAC(0, TAXA, PRAZO, INICIO)).toEqual([]);
    expect(gerarCronogramaSAC(PRINCIPAL, TAXA, 0, INICIO)).toEqual([]);
  });
});

describe('gerarCronogramaPrice', () => {
  const rows = gerarCronogramaPrice(PRINCIPAL, TAXA, PRAZO, INICIO);

  it('parcela constante (exceto resíduo na última) e amortização crescente', () => {
    expect(rows[0].parcela).toBeCloseTo(1434.71, 2);
    expect(rows[60].parcela).toBeCloseTo(1434.71, 1);
    expect(rows[1].amortizacao).toBeGreaterThan(rows[0].amortizacao);
    expect(rows[0].juros).toBeCloseTo(1000, 2);
  });

  it('soma das amortizações == principal e saldo final 0.00 exato', () => {
    const soma = rows.reduce((acc, r) => acc + r.amortizacao, 0);
    expect(soma).toBeCloseTo(PRINCIPAL, 2);
    expect(rows.at(-1)!.saldoDevedor).toBe(0);
  });

  it('última parcela absorve o resíduo sem divergir mais que centavos', () => {
    expect(Math.abs(rows.at(-1)!.parcela - rows[0].parcela)).toBeLessThan(1);
  });

  it('taxa zero degenera em principal/prazo', () => {
    const semJuros = gerarCronogramaPrice(12_000, 0, 12, INICIO);
    expect(semJuros[0].parcela).toBe(1000);
    expect(semJuros.at(-1)!.saldoDevedor).toBe(0);
  });
});

describe('gerarCronograma (dispatch)', () => {
  const params = {
    principal: PRINCIPAL,
    taxaAm: TAXA,
    prazoMeses: PRAZO,
    primeiroVencimento: INICIO,
  };

  it('despacha por sistema', () => {
    expect(gerarCronograma({ ...params, sistema: 'SAC' })[0].parcela).toBeCloseTo(1833.33, 2);
    expect(gerarCronograma({ ...params, sistema: 'PRICE' })[0].parcela).toBeCloseTo(1434.71, 2);
  });

  it('sistema desconhecido → vazio', () => {
    expect(gerarCronograma({ ...params, sistema: 'BULLET' })).toEqual([]);
  });
});

describe('saldoFinanciamento', () => {
  const cronograma = gerarCronogramaPrice(PRINCIPAL, TAXA, PRAZO, INICIO);

  it('sem pagamentos: saldo = principal, próxima = parcela 1', () => {
    const s = saldoFinanciamento(PRINCIPAL, cronograma, []);
    expect(s.saldoDevedor).toBe(PRINCIPAL);
    expect(s.parcelasPagas).toBe(0);
    expect(s.proximaParcela?.numero).toBe(1);
  });

  it('3 parcelas pagas: saldo teórico do cronograma, próxima = 4', () => {
    const pagos = [1, 2, 3].map((n) =>
      pg({ parcelaNumero: n, valor: 1434.71, month: `2026-0${n}` }),
    );
    const s = saldoFinanciamento(PRINCIPAL, cronograma, pagos);
    expect(s.parcelasPagas).toBe(3);
    expect(s.saldoDevedor).toBe(cronograma[2].saldoDevedor);
    expect(s.proximaParcela?.numero).toBe(4);
  });

  it('conta parcelas por COUNT, não max (parcela 7 sem a 6 avança 1)', () => {
    const s = saldoFinanciamento(PRINCIPAL, cronograma, [pg({ parcelaNumero: 7, valor: 1434.71 })]);
    expect(s.parcelasPagas).toBe(1);
    expect(s.saldoDevedor).toBe(cronograma[0].saldoDevedor);
  });

  it('pagamento extra (parcelaNumero null) subtrai direto; ajuste soma', () => {
    const s = saldoFinanciamento(PRINCIPAL, cronograma, [
      pg({ valor: 10_000 }),
      pg({ valor: 500, tipo: 'ajuste' }),
    ]);
    expect(s.saldoDevedor).toBeCloseTo(PRINCIPAL - 10_000 + 500, 2);
    expect(s.parcelasPagas).toBe(0);
  });

  it('todas pagas: saldo 0 e sem próxima parcela', () => {
    const todos = cronograma.map((r) => pg({ parcelaNumero: r.numero, valor: r.parcela }));
    const s = saldoFinanciamento(PRINCIPAL, cronograma, todos);
    expect(s.saldoDevedor).toBe(0);
    expect(s.proximaParcela).toBeNull();
  });

  it('nunca fica negativo', () => {
    const s = saldoFinanciamento(1000, gerarCronogramaPrice(1000, 0.01, 2, INICIO), [
      pg({ valor: 5000 }),
    ]);
    expect(s.saldoDevedor).toBe(0);
  });
});

describe('saldoRotativa', () => {
  it('saldoInicial − pagamentos + ajustes', () => {
    const saldo = saldoRotativa(5000, '2026-01', [
      pg({ valor: 1000, month: '2026-02' }),
      pg({ valor: 300, tipo: 'ajuste', month: '2026-03' }),
    ]);
    expect(saldo).toBe(4300);
  });

  it('ignora lançamentos anteriores à âncora dataSaldoInicial', () => {
    const saldo = saldoRotativa(5000, '2026-03', [
      pg({ valor: 1000, month: '2026-02' }), // antes da âncora
      pg({ valor: 500, month: '2026-03' }),
    ]);
    expect(saldo).toBe(4500);
  });

  it('nunca fica negativo', () => {
    expect(saldoRotativa(100, '2026-01', [pg({ valor: 500, month: '2026-02' })])).toBe(0);
  });
});

describe('resumoDivida', () => {
  it('financiamento: saldo, progresso, prazo restante e categoria por prazo', () => {
    const r = resumoDivida(
      {
        modalidade: 'financiamento',
        principal: PRINCIPAL,
        taxaAm: TAXA,
        prazoMeses: PRAZO,
        sistema: 'PRICE',
        primeiroVencimento: INICIO,
      },
      [pg({ parcelaNumero: 1, valor: 1434.71 })],
    );
    expect(r.parcelasPagas).toBe(1);
    expect(r.totalParcelas).toBe(120);
    expect(r.prazoRestanteMeses).toBe(119);
    expect(r.categoria).toBe('l'); // > 60 meses restantes → longo prazo
    expect(r.proximaParcela?.numero).toBe(2);
    expect(r.saldoDevedor).toBeGreaterThan(0);
    expect(r.saldoDevedor).toBeLessThan(PRINCIPAL);
  });

  it('financiamento quase quitado vira curto prazo', () => {
    const pagos = Array.from({ length: 115 }, (_, i) =>
      pg({ parcelaNumero: i + 1, valor: 1434.71 }),
    );
    const r = resumoDivida(
      {
        modalidade: 'financiamento',
        principal: PRINCIPAL,
        taxaAm: TAXA,
        prazoMeses: PRAZO,
        sistema: 'PRICE',
        primeiroVencimento: INICIO,
      },
      pagos,
    );
    expect(r.prazoRestanteMeses).toBe(5);
    expect(r.categoria).toBe('c');
  });

  it('rotativa: saldo por lançamentos, sem cronograma, sempre curto prazo', () => {
    const r = resumoDivida(
      { modalidade: 'rotativa', saldoInicial: 8000, dataSaldoInicial: '2026-01' },
      [pg({ valor: 2000, month: '2026-02' })],
    );
    expect(r.saldoDevedor).toBe(6000);
    expect(r.parcelasPagas).toBeNull();
    expect(r.totalParcelas).toBeNull();
    expect(r.proximaParcela).toBeNull();
    expect(r.prazoRestanteMeses).toBeNull();
    expect(r.categoria).toBe('c');
  });

  it('financiamento com campos incompletos degrada pra saldo 0 sem lançar', () => {
    const r = resumoDivida({ modalidade: 'financiamento', principal: 1000 }, []);
    expect(r.saldoDevedor).toBe(0);
  });
});

describe('amortização com redução de prazo (amortizacao_prazo)', () => {
  // SAC 12.000 / 0% / 12m: amortização constante de 1.000, parcela 1.000.
  const cron = gerarCronograma({
    principal: 12_000,
    taxaAm: 0,
    prazoMeses: 12,
    primeiroVencimento: '2026-01',
    sistema: 'SAC',
  });
  const calc = {
    modalidade: 'financiamento',
    principal: 12_000,
    taxaAm: 0,
    prazoMeses: 12,
    sistema: 'SAC',
    primeiroVencimento: '2026-01',
  };

  it('calcularCorteAmortizacao: greedy do fim, respeitando cortes anteriores', () => {
    expect(calcularCorteAmortizacao(cron, 0, 3000)).toEqual({ parcelas: 3, valorTeorico: 3000 });
    expect(calcularCorteAmortizacao(cron, 0, 2500)).toEqual({ parcelas: 2, valorTeorico: 2000 });
    expect(calcularCorteAmortizacao(cron, 2, 2000)).toEqual({ parcelas: 2, valorTeorico: 2000 });
    expect(calcularCorteAmortizacao(cron, 0, 500).parcelas).toBe(0);
  });

  it('abate o saldo, encurta o prazo e recua a última parcela pagável', () => {
    const amort = pg({
      tipo: 'amortizacao_prazo',
      parcelaNumero: 3,
      valor: 3000,
      month: '2026-05',
    });
    const s = saldoFinanciamento(12_000, cron, [amort]);
    expect(s.saldoDevedor).toBeCloseTo(9000, 2);
    expect(s.proximaParcela?.numero).toBe(1);

    const r = resumoDivida(calc, [amort]);
    expect(r.totalParcelas).toBe(9);
    expect(r.prazoRestanteMeses).toBe(9);
  });

  it('pagar todas as parcelas efetivas zera o saldo e encerra o cronograma', () => {
    const amort = pg({
      tipo: 'amortizacao_prazo',
      parcelaNumero: 3,
      valor: 3000,
      month: '2026-05',
    });
    const parcelas = Array.from({ length: 9 }, (_, i) =>
      pg({ tipo: 'pagamento', parcelaNumero: i + 1, valor: 1000, month: '2026-06' }),
    );
    const s = saldoFinanciamento(12_000, cron, [amort, ...parcelas]);
    expect(s.saldoDevedor).toBeCloseTo(0, 2);
    expect(s.proximaParcela).toBeNull();

    const r = resumoDivida(calc, [amort, ...parcelas]);
    expect(r.prazoRestanteMeses).toBe(0);
  });
});

describe('corrigirCronograma', () => {
  it('multiplica parcela/juros/amortização/saldo pelo fator do mês (aniversário)', () => {
    const cronograma = gerarCronogramaPrice(10_000, 0.01, 3, '2026-01');
    const corrigido = corrigirCronograma(cronograma, {
      '2026-01': 1,
      '2026-02': 1.005,
      '2026-03': 1.01,
    });
    // 1ª parcela: valor contratual (fator 1).
    expect(corrigido[0].fatorIndexacao).toBe(1);
    expect(corrigido[0].parcelaCorrigida).toBe(corrigido[0].parcela);
    // 2ª parcela: +0,5% realizado.
    expect(corrigido[1].parcelaCorrigida).toBeCloseTo(cronograma[1].parcela * 1.005, 2);
    expect(corrigido[1].jurosCorrigido).toBeCloseTo(cronograma[1].juros * 1.005, 2);
    expect(corrigido[1].amortizacaoCorrigida).toBeCloseTo(cronograma[1].amortizacao * 1.005, 2);
    expect(corrigido[1].saldoDevedorCorrigido).toBeCloseTo(cronograma[1].saldoDevedor * 1.005, 2);
    // Campos base ficam intocados (moeda constante segue disponível).
    expect(corrigido[1].parcela).toBe(cronograma[1].parcela);
  });

  it('mês sem fator repete o último visto (futuro sem projeção)', () => {
    const cronograma = gerarCronogramaSAC(12_000, 0.01, 4, '2026-01');
    const corrigido = corrigirCronograma(cronograma, { '2026-01': 1, '2026-02': 1.01 });
    expect(corrigido[2].fatorIndexacao).toBe(1.01);
    expect(corrigido[3].fatorIndexacao).toBe(1.01);
    expect(corrigido[3].parcelaCorrigida).toBeCloseTo(cronograma[3].parcela * 1.01, 2);
  });

  it('fatores vazios → tudo corrigido com fator 1', () => {
    const cronograma = gerarCronogramaPrice(5_000, 0.02, 2, '2026-01');
    const corrigido = corrigirCronograma(cronograma, {});
    for (const r of corrigido) {
      expect(r.fatorIndexacao).toBe(1);
      expect(r.parcelaCorrigida).toBe(r.parcela);
    }
  });
});
