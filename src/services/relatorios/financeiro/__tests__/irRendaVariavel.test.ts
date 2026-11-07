import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCarregar = vi.hoisted(() => vi.fn());
vi.mock('@/services/ir/rendaVariavelLoader', () => ({
  carregarApuracaoRendaVariavel: mockCarregar,
}));

import { apurarRendaVariavel, type RvTransaction } from '@/services/ir/rendaVariavelIR';
import type { ContextoMontador, Insumos } from '../insumos';
import { irRendaVariavelDoPeriodo, montarIrRendaVariavel } from '../irRendaVariavel';

/** Meio do dia local (a apuração agrupa pelo mês local, como a aba Análises > IR). */
const dia = (ano: number, mes: number, d = 15) => new Date(ano, mes - 1, d, 12);
const tx = (
  date: Date,
  type: RvTransaction['type'],
  symbol: string,
  category: RvTransaction['category'],
  quantity: number,
  price: number,
): RvTransaction => ({ date, type, symbol, category, quantity, price });

const PERIODO_3 = ['2026-09', '2026-10', '2026-11'];

describe('irRendaVariavelDoPeriodo (puro)', () => {
  it('vazio: sem operação, um mês zerado por mês do período e DARF "sem"', () => {
    const b = irRendaVariavelDoPeriodo(apurarRendaVariavel([]), PERIODO_3);
    expect(b.meses.map((m) => m.mes)).toEqual(PERIODO_3);
    for (const m of b.meses) {
      expect(m.vendasAcoes).toBe(0);
      expect(m.irMes).toBe(0);
      expect(m.darf).toEqual({ status: 'sem', valor: 0 });
    }
  });

  it('típico: prejuízo de antes do período compensa o lucro; FII a 20%; mês sem venda zerado', () => {
    const apuracao = apurarRendaVariavel([
      tx(dia(2026, 1), 'compra', 'PETR4', 'acao_br', 1000, 10),
      tx(dia(2026, 1), 'compra', 'HGLG11', 'fii', 100, 100),
      tx(dia(2026, 3), 'venda', 'PETR4', 'acao_br', 100, 9), // prejuízo de 100, fora do período
      tx(dia(2026, 9), 'venda', 'PETR4', 'acao_br', 900, 30), // 27 mil vendidos, lucro 18 mil
      tx(dia(2026, 11), 'venda', 'HGLG11', 'fii', 10, 110), // lucro 100
    ]);
    const [set, out, nov] = irRendaVariavelDoPeriodo(apuracao, PERIODO_3).meses;
    expect(set).toMatchObject({
      mes: '2026-09',
      vendasAcoes: 27000,
      isentoAcoes: false,
      lucroAcoes: 18000,
      prejuizoCompensadoAcoes: 100,
      irAcoes: 2685, // (18.000 − 100) × 15%
      irFii: 0,
      darf: { status: 'pagar', valor: 2685 },
    });
    expect(out).toMatchObject({ mes: '2026-10', vendasAcoes: 0, irMes: 0 });
    expect(out.darf.status).toBe('sem');
    expect(nov).toMatchObject({
      lucroFii: 100,
      irFii: 20,
      irMes: 20,
      darf: { status: 'pagar', valor: 20 },
    });
    // o mês de março não entra (fora do período)
    expect(irRendaVariavelDoPeriodo(apuracao, PERIODO_3).meses).toHaveLength(3);
  });

  it('isenção de R$ 20 mil vale só para ações; ETF soma na coluna das ações a 15%', () => {
    const apuracao = apurarRendaVariavel([
      tx(dia(2026, 2), 'compra', 'ITUB4', 'acao_br', 1000, 10),
      tx(dia(2026, 2), 'compra', 'BOVA11', 'etf_br', 100, 100),
      tx(dia(2026, 10), 'venda', 'ITUB4', 'acao_br', 1000, 15), // 15 mil: isento
      tx(dia(2026, 10), 'venda', 'BOVA11', 'etf_br', 100, 110), // ETF: lucro 1.000 tributado
    ]);
    const out = irRendaVariavelDoPeriodo(apuracao, PERIODO_3).meses[1];
    expect(out).toMatchObject({
      vendasAcoes: 15000,
      vendasEtf: 11000,
      isentoAcoes: true,
      lucroAcoes: 6000,
      irAcoes: 150,
      darf: { status: 'pagar', valor: 150 },
    });
  });

  it('borda: DARF abaixo de R$ 10 acumula (inclusive de antes do período e em mês sem venda)', () => {
    const apuracao = apurarRendaVariavel([
      tx(dia(2026, 1), 'compra', 'HGLG11', 'fii', 100, 100),
      tx(dia(2026, 8), 'venda', 'HGLG11', 'fii', 3, 110), // lucro 30 → IR 6 (agosto, fora)
      tx(dia(2026, 10), 'venda', 'HGLG11', 'fii', 5, 105), // lucro 25 → IR 5
      tx(dia(2026, 11), 'venda', 'HGLG11', 'fii', 1, 120), // lucro 20 → IR 4
    ]);
    const [set, out, nov] = irRendaVariavelDoPeriodo(apuracao, PERIODO_3).meses;
    expect(set).toMatchObject({ irMes: 0, acumuladoAnterior: 6 });
    expect(set.darf).toEqual({ status: 'acumula', valor: 6 });
    expect(out).toMatchObject({ irFii: 5, acumuladoAnterior: 6 });
    expect(out.darf).toEqual({ status: 'pagar', valor: 11 });
    expect(nov).toMatchObject({ irFii: 4, acumuladoAnterior: 0 });
    expect(nov.darf).toEqual({ status: 'acumula', valor: 4 });
  });

  it('borda: n=1 traz só o mês corrente; prejuízo do mês fica com lucro negativo e sem DARF', () => {
    const apuracao = apurarRendaVariavel([
      tx(dia(2026, 1), 'compra', 'PETR4', 'acao_br', 100, 40),
      tx(dia(2026, 11, 3), 'venda', 'PETR4', 'acao_br', 100, 30),
    ]);
    const b = irRendaVariavelDoPeriodo(apuracao, ['2026-11']);
    expect(b.meses).toHaveLength(1);
    expect(b.meses[0]).toMatchObject({ lucroAcoes: -1000, irAcoes: 0, isentoAcoes: false });
    expect(b.meses[0].darf.status).toBe('sem');
  });
});

describe('montarIrRendaVariavel', () => {
  const ctxCom = (insumos: Insumos): ContextoMontador =>
    ({ userId: 'u1', mesesDoPeriodo: PERIODO_3, insumos }) as unknown as ContextoMontador;

  beforeEach(() => vi.clearAllMocks());

  it('uma apuração por carga dos insumos (períodos reaproveitam)', async () => {
    mockCarregar.mockResolvedValue(apurarRendaVariavel([]));
    const insumos = {} as Insumos;
    await montarIrRendaVariavel(ctxCom(insumos));
    await montarIrRendaVariavel(ctxCom(insumos));
    expect(mockCarregar).toHaveBeenCalledTimes(1);
    expect(mockCarregar).toHaveBeenCalledWith('u1');
  });

  it('falha na apuração: null (a 4b segue) e tenta de novo na próxima', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockCarregar.mockRejectedValueOnce(new Error('db fora'));
    const insumos = {} as Insumos;
    expect(await montarIrRendaVariavel(ctxCom(insumos))).toBeNull();
    mockCarregar.mockResolvedValueOnce(apurarRendaVariavel([]));
    expect(await montarIrRendaVariavel(ctxCom(insumos))).not.toBeNull();
    expect(erro).toHaveBeenCalledTimes(1);
    erro.mockRestore();
  });
});
