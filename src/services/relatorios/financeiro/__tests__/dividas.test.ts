import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAccrued = vi.hoisted(() => vi.fn());
const mockMensais = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));
vi.mock('@/services/dividas/indexacaoDivida', async (orig) => {
  const real = await orig<typeof import('@/services/dividas/indexacaoDivida')>();
  return {
    ...real,
    accruedIndexFactor: mockAccrued,
    monthlyIndexFactors: mockMensais,
  };
});

import { aaToAm } from '@/utils/rateConversion';
import { NOTA_IMPORTACAO } from '@/services/pluggy/notaImportacao';
import type { ContextoMontador, DividaComPagamentos, Insumos } from '../insumos';
import {
  SEM_CORRECAO,
  calcularItemDivida,
  cetMedioPonderado,
  jurosAteQuitar,
  montarBlocoDividas,
  montarDividas,
  type EntradaDivida,
} from '../dividas';

const MES = '2026-11';

function divida(over: Partial<EntradaDivida>): EntradaDivida {
  return {
    id: 'd',
    nome: 'Dívida',
    instituicao: null,
    tipo: 'outro',
    modalidade: 'financiamento',
    status: 'ativa',
    notes: null,
    principal: null,
    taxaAm: null,
    prazoMeses: null,
    sistema: null,
    indexador: 'PREFIXADO',
    primeiroVencimento: MES,
    saldoInicial: null,
    dataSaldoInicial: null,
    pagamentos: [],
    ...over,
  };
}

// Os 4 contratos do protótipo do Pedro, começando no mês corrente (saldo = principal, n = prazo).
const IMOVEL = divida({
  id: 'imovel',
  nome: 'Financiamento imobiliário',
  instituicao: 'Caixa',
  tipo: 'financiamento_imobiliario',
  principal: 312_400,
  taxaAm: aaToAm(0.109),
  prazoMeses: 214,
  sistema: 'SAC',
});
const CARRO = divida({
  id: 'carro',
  nome: 'Financiamento do carro',
  instituicao: 'Banco do Brasil',
  tipo: 'financiamento_veiculo',
  principal: 38_600,
  taxaAm: aaToAm(0.214),
  prazoMeses: 31,
  sistema: 'PRICE',
});
const PARCELADO = divida({
  id: 'parcelado',
  nome: 'Compras parceladas',
  instituicao: 'Cartão Nubank',
  tipo: 'cartao_credito',
  principal: 4_850,
  taxaAm: 0,
  prazoMeses: 3,
  sistema: 'PRICE',
});
const ROTATIVO = divida({
  id: 'rotativo',
  nome: 'Rotativo do cartão',
  instituicao: 'Cartão Inter',
  tipo: 'cartao_credito',
  modalidade: 'rotativa',
  primeiroVencimento: null,
  saldoInicial: 2_300,
  dataSaldoInicial: MES,
  taxaAm: aaToAm(4.315),
});

/** As contas do protótipo (relatorio-pedro.html, DEBTS), para conferir a fórmula fechada. */
function pedro(sist: string, saldo: number, cet: number, rest: number | null) {
  const i = Math.pow(1 + cet / 100, 1 / 12) - 1;
  let parcela: number;
  let jr: number | null;
  if (sist === 'SAC') {
    const a = saldo / rest!;
    parcela = a + saldo * i;
    jr = (i * a * rest! * (rest! + 1)) / 2;
  } else if (sist === 'PRICE') {
    parcela = (saldo * i) / (1 - Math.pow(1 + i, -rest!));
    jr = parcela * rest! - saldo;
  } else if (sist === 'Cartão parcelado') {
    parcela = saldo / rest!;
    jr = 0;
  } else {
    parcela = saldo * 0.15;
    jr = null;
  }
  return { parcela, jurosMes: saldo * i, jr };
}

const calc = (d: EntradaDivida) => calcularItemDivida(d, SEM_CORRECAO, MES).item;

describe('calcularItemDivida — casos do protótipo', () => {
  it('SAC 312.400 / 214 a 10,9% a.a.', () => {
    const it = calc(IMOVEL);
    const p = pedro('SAC', 312_400, 10.9, 214);
    expect(it.sistema).toBe('SAC');
    expect(it.imobiliario).toBe(true);
    expect(it.saldo).toBe(312_400);
    expect(it.cetAA).toBeCloseTo(10.9, 2);
    expect(it.parcelaMes).toBeCloseTo(p.parcela, 0);
    expect(it.jurosMes).toBeCloseTo(p.jurosMes, 1);
    expect(it.jurosAteQuitar).toBeCloseTo(p.jr!, 1);
    expect(it.parcelasRestantes).toBe(214);
    // 214 parcelas a partir de nov/26: a última em ago/44.
    expect(it.quitacao).toBe('2044-08');
  });

  it('PRICE 38.600 / 31 a 21,4% a.a.', () => {
    const it = calc(CARRO);
    const p = pedro('PRICE', 38_600, 21.4, 31);
    expect(it.sistema).toBe('PRICE');
    expect(it.cetAA).toBeCloseTo(21.4, 2);
    expect(it.parcelaMes).toBeCloseTo(p.parcela, 0);
    expect(it.jurosMes).toBeCloseTo(p.jurosMes, 1);
    expect(it.jurosAteQuitar).toBeCloseTo(p.jr!, 1);
    expect(it.quitacao).toBe('2029-05');
  });

  it('Cartão parcelado 4.850 / 3 (taxa 0, fora do Open Finance)', () => {
    const it = calc(PARCELADO);
    const p = pedro('Cartão parcelado', 4_850, 0, 3);
    expect(it.sistema).toBe('Cartão parcelado');
    expect(it.cetAA).toBe(0);
    expect(it.parcelaMes).toBeCloseTo(p.parcela, 1);
    expect(it.jurosMes).toBe(0);
    expect(it.jurosAteQuitar).toBe(0);
    expect(it.quitacao).toBe('2027-01');
  });

  it('Rotativo 2.300 a 431,5% a.a.: mínimo de 15%, sem juros até quitar nem quitação', () => {
    const it = calc(ROTATIVO);
    const p = pedro('Rotativo', 2_300, 431.5, null);
    expect(it.sistema).toBe('Rotativo');
    expect(it.cetAA).toBeCloseTo(431.5, 2);
    expect(it.parcelaMes).toBe(345);
    expect(it.jurosMes).toBeCloseTo(p.jurosMes, 1);
    expect(it.jurosAteQuitar).toBeNull();
    expect(it.parcelasRestantes).toBeNull();
    expect(it.quitacao).toBeNull();
  });

  it('jurosAteQuitar: n = 0 ou saldo 0 → 0; rotativo → null', () => {
    expect(jurosAteQuitar('SAC', 1_000, 0.01, 0)).toBe(0);
    expect(jurosAteQuitar('PRICE', 0, 0.01, 10)).toBe(0);
    expect(jurosAteQuitar('Rotativo', 1_000, 0.1, 10)).toBeNull();
  });
});

describe('calcularItemDivida — regras do app', () => {
  it('pausada / em espera: parcela 0 (não projeta no Fluxo), saldo continua', () => {
    for (const status of ['pausada', 'em_espera']) {
      expect(calc({ ...CARRO, status })).toMatchObject({ parcelaMes: 0, saldo: 38_600, status });
      expect(calc({ ...ROTATIVO, status }).parcelaMes).toBe(0);
    }
  });

  it('parcela = a linha do mês no cronograma; sem linha no mês (contrato futuro) = 0', () => {
    expect(calc({ ...CARRO, primeiroVencimento: '2027-02' }).parcelaMes).toBe(0);
  });

  it('Pluggy com taxa 0 não vira "Cartão parcelado": sistema do contrato e taxa não informada', () => {
    const it = calc({ ...PARCELADO, sistema: 'SAC', notes: `${NOTA_IMPORTACAO} · contrato 123` });
    expect(it.sistema).toBe('SAC');
    expect(it.cetAA).toBeNull();
    expect(it.jurosMes).toBeNull();
    expect(it.jurosAteQuitar).toBeNull();
  });

  it('rotativa sem CET: cetAA e juros null', () => {
    const it = calc({ ...ROTATIVO, taxaAm: null });
    expect(it).toMatchObject({
      cetAA: null,
      jurosMes: null,
      jurosAteQuitar: null,
      parcelaMes: 345,
    });
  });

  it('indexado: saldo × fator acumulado; parcela × fator do mês (aniversário)', () => {
    const tr = { ...CARRO, indexador: 'TR' };
    const base = calc(tr);
    const it = calcularItemDivida(tr, { acumulado: 1.02, mensais: { [MES]: 1.01 } }, MES).item;
    expect(it.saldo).toBe(Math.round(38_600 * 1.02 * 100) / 100);
    expect(it.parcelaMes).toBeCloseTo(base.parcelaMes * 1.01, 1);
    expect(it.jurosMes).toBeCloseTo(it.saldo * CARRO.taxaAm!, 1);
  });

  it('parcelas vencidas sem pagamento: conta o aviso e empurra a quitação', () => {
    const atrasada = { ...CARRO, primeiroVencimento: '2026-08' };
    const r = calcularItemDivida(atrasada, SEM_CORRECAO, MES);
    expect(r.vencidasSemPagamento).toBe(3);
    // Contrato terminaria em fev/29; com 31 restantes pagando de nov/26, maio/29.
    expect(r.item.quitacao).toBe('2029-05');
    const pagas = [1, 2, 3].map((n) => ({
      valor: 1,
      parcelaNumero: n,
      tipo: 'pagamento',
      month: '2026-0' + (7 + n),
    }));
    const emDia = calcularItemDivida({ ...atrasada, pagamentos: pagas }, SEM_CORRECAO, MES);
    expect(emDia.vencidasSemPagamento).toBe(0);
    expect(emDia.item.quitacao).toBe('2029-02');
  });
});

describe('montarBlocoDividas', () => {
  const comFatores = (ds: EntradaDivida[]) =>
    ds.map((entrada) => ({ entrada, fatores: SEM_CORRECAO }));

  it('ordena por CET desc com os sem CET no fim e fora da média ponderada', () => {
    const semCet = { ...ROTATIVO, id: 'rot-sem-cet', taxaAm: null, saldoInicial: 10_000 };
    const b = montarBlocoDividas(comFatores([IMOVEL, PARCELADO, semCet, CARRO, ROTATIVO]), MES);
    expect(b.itens.map((i) => i.id)).toEqual([
      'rotativo',
      'carro',
      'imovel',
      'parcelado',
      'rot-sem-cet',
    ]);
    expect(b.avisos.semCet).toBe(1);
    const p = [
      [312_400, 10.9],
      [38_600, 21.4],
      [4_850, 0],
      [2_300, 431.5],
    ];
    const esperado = p.reduce((a, [s, c]) => a + s * c, 0) / p.reduce((a, [s]) => a + s, 0);
    expect(cetMedioPonderado(b.itens)).toBeCloseTo(esperado, 1);
  });

  it('sem dívidas fora o imóvel: maior quitação dos não imobiliários; rotativo marca com_rotativo', () => {
    expect(
      montarBlocoDividas(comFatores([IMOVEL, CARRO, PARCELADO, ROTATIVO]), MES)
        .semDividasForaImovel,
    ).toEqual({ mes: '2029-05', motivo: 'com_rotativo' });
    expect(
      montarBlocoDividas(comFatores([IMOVEL, CARRO, PARCELADO]), MES).semDividasForaImovel,
    ).toEqual({
      mes: '2029-05',
      motivo: 'ok',
    });
    expect(montarBlocoDividas(comFatores([IMOVEL]), MES).semDividasForaImovel).toEqual({
      mes: null,
      motivo: 'so_imovel',
    });
    expect(montarBlocoDividas([], MES).semDividasForaImovel).toEqual({
      mes: null,
      motivo: 'sem_dividas',
    });
  });

  it('quitadas ficam fora dos itens', () => {
    const b = montarBlocoDividas(comFatores([{ ...CARRO, status: 'quitada' }, IMOVEL]), MES);
    expect(b.itens.map((i) => i.id)).toEqual(['imovel']);
  });
});

describe('montarDividas (loader)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccrued.mockResolvedValue(1.05);
    mockMensais.mockResolvedValue({ [MES]: 1.04 });
  });

  const row = (d: EntradaDivida): DividaComPagamentos =>
    ({
      ...d,
      userId: 'u1',
      principal: d.principal === null ? null : String(d.principal),
      taxaAm: d.taxaAm === null ? null : String(d.taxaAm),
      saldoInicial: d.saldoInicial === null ? null : String(d.saldoInicial),
      taxaUnidadeEntrada: 'am',
      diaVencimento: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      pagamentos: [],
    }) as unknown as DividaComPagamentos;

  it('lê os insumos, corrige só os indexados e ignora as quitadas', async () => {
    const insumos = {
      dividasComPagamentos: vi.fn(async () => [
        row({ ...IMOVEL, indexador: 'TR' }),
        row(CARRO),
        row({ ...PARCELADO, status: 'quitada' }),
        row(ROTATIVO),
      ]),
    } as unknown as Insumos;
    const agora = new Date('2026-11-03T12:00:00Z');
    const ctx = {
      agora,
      hojeSP: { ano: 2026, mes0: 10, dia: 3 },
      insumos,
    } as unknown as ContextoMontador;
    const b = await montarDividas(ctx);
    expect(b.itens.map((i) => i.id).sort()).toEqual(['carro', 'imovel', 'rotativo']);
    expect(mockAccrued).toHaveBeenCalledTimes(1);
    expect(mockAccrued).toHaveBeenCalledWith('TR', MES, agora);
    expect(mockMensais).toHaveBeenCalledWith('TR', MES, '2044-08', agora);
    const imovel = b.itens.find((i) => i.id === 'imovel')!;
    expect(imovel.saldo).toBe(Math.round(312_400 * 1.05 * 100) / 100);
    const base = calc(IMOVEL);
    expect(imovel.parcelaMes).toBeCloseTo(base.parcelaMes * 1.04, 1);
    expect(b.itens.find((i) => i.id === 'carro')!.saldo).toBe(38_600);
  });
});
