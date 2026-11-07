import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));

import { gerarCronograma } from '@/services/dividas/amortizacao';
import {
  SEM_CORRECAO,
  fatorFimDoMes,
  montarBlocoDividas,
  type EntradaDivida,
  type FatoresDivida,
} from '../dividas';

const MES = '2026-11';
const MESES_6 = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];

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

const pagas = (meses: string[]) =>
  meses.map((month, k) => ({ valor: 1, parcelaNumero: k + 1, tipo: 'pagamento', month }));

// SAC de 120.000 em 120 meses a 1% a.m., 1º vencimento em jun/26, parcelas 1–5 pagas (jun–out).
const SAC = divida({
  id: 'sac',
  principal: 120_000,
  taxaAm: 0.01,
  prazoMeses: 120,
  sistema: 'SAC',
  primeiroVencimento: '2026-06',
  pagamentos: pagas(MESES_6.slice(0, 5)),
});
const CRONO_SAC = gerarCronograma({
  principal: 120_000,
  taxaAm: 0.01,
  prazoMeses: 120,
  primeiroVencimento: '2026-06',
  sistema: 'SAC',
});

// Rotativa de 2.000 desde set/26 a 10% a.m., pagou 500 em out/26.
const ROT = divida({
  id: 'rot',
  modalidade: 'rotativa',
  tipo: 'cartao_credito',
  primeiroVencimento: null,
  saldoInicial: 2_000,
  dataSaldoInicial: '2026-09',
  taxaAm: 0.1,
  pagamentos: [{ valor: 500, parcelaNumero: null, tipo: 'pagamento', month: '2026-10' }],
});

const sem = (ds: EntradaDivida[]) => ds.map((entrada) => ({ entrada, fatores: SEM_CORRECAO }));
const total = (b: ReturnType<typeof montarBlocoDividas>) =>
  Math.round(b.itens.reduce((a, i) => a + i.saldo, 0) * 100) / 100;

describe('montarBlocoDividas — série mensal', () => {
  it('vazio: um ponto zerado por mês do período', () => {
    const b = montarBlocoDividas([], MES, MESES_6);
    expect(b.serie).toHaveLength(6);
    expect(b.serie.map((p) => p.mes)).toEqual(MESES_6);
    expect(b.serie.every((p) => p.saldo === 0 && p.juros === 0 && p.amortizacao === 0)).toBe(true);
  });

  it('padrão (sem meses): só o mês corrente, com o saldo do KPI', () => {
    const b = montarBlocoDividas(sem([SAC]), MES);
    expect(b.serie).toHaveLength(1);
    expect(b.serie[0].saldo).toBe(total(b));
  });

  it('típico: SAC pelos pagamentos registrados + rotativa a partir da data do saldo', () => {
    const b = montarBlocoDividas(sem([SAC, ROT]), MES, MESES_6);
    const s = b.serie;
    // Saldo do SAC no fim de cada mês = saldo do cronograma depois da k-ésima parcela paga.
    expect(s[0].saldo).toBe(CRONO_SAC[0].saldoDevedor);
    expect(s[2].saldo).toBe(CRONO_SAC[2].saldoDevedor);
    // Rotativa: 2.000 em set, 1.500 depois do pagamento de out.
    expect(s[3].saldo).toBe(Math.round((CRONO_SAC[3].saldoDevedor + 2_000) * 100) / 100);
    expect(s[4].saldo).toBe(Math.round((CRONO_SAC[4].saldoDevedor + 1_500) * 100) / 100);
    // O mês corrente bate com o KPI "Saldo devedor total" (parcela 6 ainda não paga).
    expect(s[5].saldo).toBe(total(b));
    expect(s[5].saldo).toBe(Math.round((CRONO_SAC[4].saldoDevedor + 1_500) * 100) / 100);

    // Pago no mês: a linha do cronograma da parcela registrada; rotativa = o pago em out (500),
    // todo como amortização (o saldo do rotativo cai 500, sem juros somados).
    expect(s[0].juros).toBe(CRONO_SAC[0].juros);
    expect(s[0].amortizacao).toBe(CRONO_SAC[0].amortizacao);
    expect(s[3].juros).toBe(CRONO_SAC[3].juros);
    expect(s[3].amortizacao).toBe(CRONO_SAC[3].amortizacao);
    expect(s[4].juros).toBeCloseTo(CRONO_SAC[4].juros, 2);
    expect(s[4].amortizacao).toBeCloseTo(CRONO_SAC[4].amortizacao + 500, 2);
    // Mês corrente com a parcela 6 em aberto: nada pago.
    expect(s[5].juros).toBe(0);
    expect(s[5].amortizacao).toBe(0);
  });

  it('sem pagamento registrado: o saldo fica parado e nada entra como pago', () => {
    const b = montarBlocoDividas(sem([{ ...SAC, pagamentos: [] }]), MES, MESES_6);
    expect(b.serie.every((p) => p.saldo === 120_000)).toBe(true);
    expect(b.serie.every((p) => p.juros === 0 && p.amortizacao === 0)).toBe(true);
  });

  it('pagamento avulso e amortização de prazo entram como amortização do mês', () => {
    const b = montarBlocoDividas(
      sem([
        {
          ...SAC,
          pagamentos: [
            ...pagas(MESES_6.slice(0, 1)),
            { valor: 1_000, parcelaNumero: null, tipo: 'pagamento', month: '2026-08' },
            { valor: 2_000, parcelaNumero: 3, tipo: 'amortizacao_prazo', month: '2026-08' },
          ],
        },
      ]),
      MES,
      MESES_6,
    );
    expect(b.serie[1]).toMatchObject({ juros: 0, amortizacao: 0 });
    expect(b.serie[2]).toMatchObject({ juros: 0, amortizacao: 3_000 });
  });

  it('mês antes do início do contrato não conta', () => {
    const meses = ['2026-04', '2026-05', ...MESES_6];
    const b = montarBlocoDividas(sem([SAC, ROT]), MES, meses);
    expect(b.serie[0]).toEqual({ mes: '2026-04', saldo: 0, juros: 0, amortizacao: 0 });
    expect(b.serie[1]).toEqual({ mes: '2026-05', saldo: 0, juros: 0, amortizacao: 0 });
    // Rotativa só a partir de set/26.
    expect(b.serie[2].saldo).toBe(CRONO_SAC[0].saldoDevedor);
  });

  it('borda: pagamento de mês futuro não entra no passado; quitada fora; pausada sem parcela', () => {
    const adiantado = divida({
      ...SAC,
      id: 'adiantado',
      // Registrou as 5 parcelas todas em out/26: até set o saldo é o principal.
      pagamentos: pagas(['2026-10', '2026-10', '2026-10', '2026-10', '2026-10']),
    });
    const pausada = divida({ ...SAC, id: 'pausada', status: 'pausada', pagamentos: [] });
    const quitada = divida({ ...SAC, id: 'quitada', status: 'quitada' });
    const b = montarBlocoDividas(sem([adiantado, pausada, quitada]), MES, MESES_6);
    expect(b.serie[3].saldo).toBe(240_000);
    expect(b.serie[4].saldo).toBe(CRONO_SAC[4].saldoDevedor + 120_000);
    expect(b.serie[5].saldo).toBe(total(b));
    // As 5 parcelas registradas em out entram em out; pausada e quitada, nunca.
    expect(b.serie[0].juros).toBe(0);
    expect(b.serie[4].juros).toBeCloseTo(
      CRONO_SAC.slice(0, 5).reduce((a, p) => a + p.juros, 0),
      2,
    );
  });

  it('borda: rotativa sem taxa conta no saldo e o pago entra como amortização', () => {
    const b = montarBlocoDividas(sem([{ ...ROT, taxaAm: null }]), MES, MESES_6);
    expect(b.serie[3].saldo).toBe(2_000);
    expect(b.serie[4].saldo).toBe(1_500);
    expect(b.serie[4].juros).toBe(0);
    expect(b.serie[4].amortizacao).toBe(500);
  });

  it('borda: indexado corrige o saldo passado pelo fator até o fim do mês e a parcela pelo do mês', () => {
    const tr = { ...SAC, indexador: 'TR' };
    const mensais: Record<string, number> = {};
    MESES_6.forEach((m, k) => (mensais[m] = 1 + k * 0.01));
    const fatores: FatoresDivida = { acumulado: 1.06, mensais };
    const b = montarBlocoDividas([{ entrada: tr, fatores }], MES, MESES_6);
    // Fim de jun = fator do aniversário de jul (1,01).
    expect(b.serie[0].saldo).toBeCloseTo(CRONO_SAC[0].saldoDevedor * 1.01, 1);
    expect(b.serie[0].juros).toBeCloseTo(CRONO_SAC[0].juros * 1, 2);
    expect(b.serie[2].juros).toBeCloseTo(CRONO_SAC[2].juros * 1.02, 1);
    expect(b.serie[5].juros).toBe(0);
    // Corrente: o saldo do item (fator acumulado até hoje).
    expect(b.serie[5].saldo).toBe(total(b));
    expect(b.serie[5].saldo).toBeCloseTo(CRONO_SAC[4].saldoDevedor * 1.06, 1);
  });

  it('fatorFimDoMes: mês seguinte; fora do mapa, o último até ali; sem mapa, 1', () => {
    expect(fatorFimDoMes({ '2026-06': 1, '2026-07': 1.02 }, '2026-06')).toBe(1.02);
    expect(fatorFimDoMes({ '2026-06': 1, '2026-07': 1.02 }, '2026-09')).toBe(1.02);
    expect(fatorFimDoMes({ '2026-06': 1, '2026-07': 1.02 }, '2026-04')).toBe(1);
    expect(fatorFimDoMes({}, '2026-06')).toBe(1);
  });
});
