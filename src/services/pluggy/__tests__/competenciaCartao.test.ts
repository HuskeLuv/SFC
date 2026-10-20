import { describe, expect, it } from 'vitest';
import {
  competenciaEstimada,
  competenciasDoCartao,
  deslocamentosDeParcela,
  montarCalendario,
  rotuloCompetencia,
  type FaturaCartao,
  type TxCartao,
} from '../competenciaCartao';

const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

const tx = (id: string, date: string, extra: Partial<TxCartao> = {}): TxCartao => ({
  id,
  date: d(date),
  billId: null,
  description: 'MERCADO',
  amount: 100,
  installmentNumber: null,
  installmentTotal: null,
  ...extra,
});

// Fecha dia 05, vence dia 12.
const FATURAS: FaturaCartao[] = [
  { providerBillId: 'b-set', dueDate: d('2026-09-12'), closingDate: d('2026-09-05') },
  { providerBillId: 'b-out', dueDate: d('2026-10-12'), closingDate: d('2026-10-05') },
];

describe('montarCalendario', () => {
  it('tira o dia de fechamento e o prazo das faturas com fechamento', () => {
    const cal = montarCalendario(FATURAS, null)!;
    expect(cal.diaFechamento).toBe(5);
    expect(cal.diasAteVencimento).toBe(7);
  });

  it('sem fechamento nas faturas, usa o vencimento da conta menos 7 dias', () => {
    const cal = montarCalendario([], d('2026-10-16'))!;
    expect(cal.diaFechamento).toBe(9);
    expect(cal.diasAteVencimento).toBe(7);
  });

  it('sem nenhuma data, não há calendário', () => {
    expect(montarCalendario([], null)).toBeNull();
  });
});

describe('competenciaEstimada', () => {
  const cal = montarCalendario(FATURAS, null)!;

  it('dentro do período de uma fatura conhecida usa o vencimento dela', () => {
    expect(competenciaEstimada(d('2026-09-20'), cal)).toEqual({ ano: 2026, mes: 9 }); // out
    expect(competenciaEstimada(d('2026-10-05'), cal)).toEqual({ ano: 2026, mes: 9 }); // no fechamento
  });

  it('depois do último fechamento conhecido segue a regra do dia de fechamento', () => {
    expect(competenciaEstimada(d('2026-10-06'), cal)).toEqual({ ano: 2026, mes: 10 }); // nov
    expect(competenciaEstimada(d('2026-11-05'), cal)).toEqual({ ano: 2026, mes: 10 });
    expect(competenciaEstimada(d('2026-12-20'), cal)).toEqual({ ano: 2027, mes: 0 }); // vira o ano
  });

  it('fechamento no fim do mês com vencimento no mês seguinte', () => {
    const c = montarCalendario(
      [{ providerBillId: 'x', dueDate: d('2026-10-08'), closingDate: d('2026-09-30') }],
      null,
    )!;
    expect(competenciaEstimada(d('2026-10-31'), c)).toEqual({ ano: 2026, mes: 11 }); // fecha 30/11 → dez
    expect(competenciaEstimada(d('2027-02-28'), c)).toEqual({ ano: 2027, mes: 2 }); // fev curto → mar
  });
});

describe('deslocamentosDeParcela', () => {
  it('parcelas com a data da compra andam 1 mês por parcela', () => {
    const txs = [1, 2, 3].map((n) =>
      tx(`p${n}`, '2026-09-30', {
        description: 'PARQUE AQUATICO',
        installmentNumber: n,
        installmentTotal: 3,
      }),
    );
    const m = deslocamentosDeParcela(txs);
    expect(m.get('p1')).toEqual({ base: 'p1', meses: 0 });
    expect(m.get('p3')).toEqual({ base: 'p1', meses: 2 });
  });

  it('parcelas já datadas no mês delas (e com "n/N" na descrição) não andam', () => {
    const txs = [
      tx('a1', '2026-09-25', {
        description: 'LOJA 01/03',
        installmentNumber: 1,
        installmentTotal: 3,
      }),
      tx('a2', '2026-11-09', {
        description: 'LOJA 02/03',
        installmentNumber: 2,
        installmentTotal: 3,
      }),
      tx('a3', '2026-12-09', {
        description: 'LOJA 03/03',
        installmentNumber: 3,
        installmentTotal: 3,
      }),
    ];
    expect(deslocamentosDeParcela(txs).size).toBe(0);
  });
});

describe('competenciasDoCartao', () => {
  it('billId conhecido manda; sem billId estima; parcelas com a mesma data andam', () => {
    const txs = [
      tx('com-bill', '2026-09-03', { billId: 'b-out' }), // billId vence (out) mesmo comprada antes do fechamento de set
      tx('aberta', '2026-10-20'), // fatura aberta → nov
      ...[1, 2, 3].map((n) =>
        tx(`p${n}`, '2026-09-30', {
          description: 'PARQUE',
          installmentNumber: n,
          installmentTotal: 3,
        }),
      ),
    ];
    const r = competenciasDoCartao(txs, FATURAS, null);
    expect(r.get('com-bill')).toEqual({ ano: 2026, mes: 9 });
    expect(r.get('aberta')).toEqual({ ano: 2026, mes: 10 });
    expect(r.get('p1')).toEqual({ ano: 2026, mes: 9 }); // out
    expect(r.get('p2')).toEqual({ ano: 2026, mes: 10 }); // nov
    expect(r.get('p3')).toEqual({ ano: 2026, mes: 11 }); // dez
  });

  it('sem fatura nem vencimento fica no mês da data (como antes)', () => {
    const r = competenciasDoCartao([tx('t', '2026-09-20')], [], null);
    expect(r.get('t')).toEqual({ ano: 2026, mes: 8 });
  });
});

describe('rotuloCompetencia', () => {
  it('formata o mês da fatura', () => {
    expect(rotuloCompetencia('2026-10')).toBe('out/2026');
    expect(rotuloCompetencia('2027-01')).toBe('jan/2027');
  });
});
