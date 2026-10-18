/**
 * Extração FY dos companyfacts da SEC por fixtures RECORTADAS (só os conceitos das cadeias, só
 * formulários anuais, FY de 350–380 dias; a extração dá o MESMO resultado do arquivo cheio de
 * 18/10/2026). Valores conferidos contra os 10-K.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  CADEIAS_SEC,
  CONCEITOS_PROIBIDOS,
  conceitosDasCadeias,
  passo,
} from '@/services/analiseAtivos/eua/cadeiasConceitos';
import {
  anoFiscalDoTermino,
  anuaisDoConceito,
  ehPotenciaDeMil,
  eventosDesdobramento,
  extrairFundamentosSec,
  fatorDesdobramento,
  fatorEscalaAcoes,
  resolverDpa,
  type CompanyFactsSec,
  type PeriodoSec,
} from '@/services/analiseAtivos/eua/extrairFundamentosSec';

const DIR = path.join(__dirname, 'fixtures');
function companyfacts(nome: string): CompanyFactsSec {
  return JSON.parse(readFileSync(path.join(DIR, 'companyfacts', `${nome}.json`), 'utf8'));
}
const periodos = (nome: string) =>
  extrairFundamentosSec(companyfacts(nome), { anoMinimo: 2014 }).periodos;
const fy = (ps: PeriodoSec[], ano: number) => {
  const p = ps.find((x) => x.anoFiscal === ano);
  if (!p) throw new Error(`sem FY${ano}`);
  return p;
};
const mi = (v: number | null) => (v === null ? null : Math.round(v / 1e6));

describe('ano fiscal pelo término', () => {
  it('jan/fev contam como o ano anterior (WMT 31/01/2026 = FY2025)', () => {
    expect(anoFiscalDoTermino('2026-01-31')).toBe(2025);
    expect(anoFiscalDoTermino('2025-02-28')).toBe(2024);
    expect(anoFiscalDoTermino('2025-03-01')).toBe(2025);
    expect(anoFiscalDoTermino('2025-09-27')).toBe(2025);
  });

  it('WMT: FY2025 termina em 2026-01-31, receita US$ 713,2 bi', () => {
    const p = fy(periodos('WMT'), 2025);
    expect(p.dtFim).toBe('2026-01-31');
    expect(mi(p.receita)).toBe(713163);
  });

  it('NVDA: FY2025 termina em 2026-01-25', () => {
    expect(fy(periodos('NVDA'), 2025).dtFim).toBe('2026-01-25');
  });
});

describe('último arquivado vence (reapresentação e desdobramento)', () => {
  it('AAPL 2018 vem reapresentado pelo 10-K de 2020 (split 4:1): LPA 2,98, ações ~20 bi', () => {
    const p = fy(periodos('AAPL'), 2018);
    expect(p.dtFim).toBe('2018-09-29');
    expect(mi(p.receita)).toBe(265595);
    expect(mi(p.lucroAtribuivel)).toBe(59531);
    expect(p.lpaOn).toBe(2.98);
    expect(p.acoesMediaDiluida).toBe(20000435000);
    expect(p.dtEntregaOriginal < p.dtEntrega).toBe(true);
  });

  it('AAPL 2017 (último 10-K antes do split) é levado à escala atual: LPA 9,21 ÷ 4', () => {
    const p = fy(periodos('AAPL'), 2017);
    expect(p.lpaOn).toBeCloseTo(9.21 / 4, 6);
    expect(p.dpa).toBeCloseTo(2.4 / 4, 6);
    expect(p.sourceConcept.ajusteDesdobramento).toContain('lpaOn×1/4');
  });

  it('NVDA: o fator é por valor — o 10-K pós-split reapresenta o LPA e não o DPA', () => {
    const ps = periodos('NVDA');
    expect(fy(ps, 2022).lpaOn).toBe(0.17); // reapresentado
    expect(fy(ps, 2022).dpa).toBeCloseTo(0.016, 6); // 0,16 do 10-K de 2024 ÷ 10
    expect(fy(ps, 2017).lpaOn).toBeCloseTo(4.82 / 40, 6); // 4:1 de 2021 e 10:1 de 2024
  });

  it('eventos de desdobramento ignoram erro de unidade (potência de mil)', () => {
    const ev = eventosDesdobramento(companyfacts('NVDA'));
    expect(ev.map((e) => e.razao)).toEqual([4, 10]);
    expect(eventosDesdobramento(companyfacts('DLR'))).toEqual([]);
    expect(fatorDesdobramento(ev, '2019-02-21')).toBe(40);
    expect(fatorDesdobramento(ev, '2025-02-26')).toBe(1);
    expect(ehPotenciaDeMil(0.001)).toBe(true);
    expect(ehPotenciaDeMil(1e6)).toBe(true);
    expect(ehPotenciaDeMil(4)).toBe(false);
  });

  it('ações informadas em mil/milhão por engano voltam à escala de lucro ÷ LPA', () => {
    // DLR: o 10-K de 2023 deu a média em milhares; MCD: desde 2024 em milhões
    expect(Math.round(fy(periodos('DLR'), 2021).acoesMediaDiluida! / 1e6)).toBe(283);
    expect(Math.round(fy(periodos('MCD'), 2024).acoesMediaDiluida! / 1e6)).toBe(722);
    expect(fatorEscalaAcoes(751.8, 7545e6, 10.04)).toBe(1e6);
    expect(fatorEscalaAcoes(751.8e6, 7545e6, 10.04)).toBe(1);
    expect(fatorEscalaAcoes(751.8, 7545e6, null)).toBe(1);
  });

  it('anuaisDoConceito: só formulário anual e duração de 350–380 dias', () => {
    const m = anuaisDoConceito(
      [
        {
          start: '2024-01-01',
          end: '2024-12-31',
          val: 1,
          accn: 'a',
          form: '10-K',
          filed: '2025-02-01',
        },
        {
          start: '2024-10-01',
          end: '2024-12-31',
          val: 9,
          accn: 'b',
          form: '10-K',
          filed: '2025-02-01',
        },
        {
          start: '2024-01-01',
          end: '2024-12-31',
          val: 2,
          accn: 'c',
          form: '10-K/A',
          filed: '2025-05-01',
        },
        {
          start: '2024-01-01',
          end: '2024-12-31',
          val: 7,
          accn: 'd',
          form: '10-Q',
          filed: '2025-06-01',
        },
      ],
      'duracao',
    );
    expect(m.get('2024-12-31')).toMatchObject({ val: 2, accn: 'c', primeiroFiled: '2025-02-01' });
  });

  it('anuaisDoConceito: balanço com prazo descarta o 10-K arquivado tarde demais', () => {
    const fatos = [
      { end: '2021-12-31', val: 17_715e6, accn: 'a', form: '10-K', filed: '2022-02-09' },
      { end: '2021-12-31', val: 215.3e6, accn: 'b', form: '10-K', filed: '2024-02-13' },
    ];
    expect(anuaisDoConceito(fatos, 'instante').get('2021-12-31')?.val).toBe(215.3e6);
    expect(anuaisDoConceito(fatos, 'instante', 300).get('2021-12-31')?.val).toBe(17_715e6);
  });
});

describe('balanço do 10-K do próprio exercício (nota de 10-K posterior não substitui)', () => {
  it('AMT 2019: dívida do balanço (21,1 bi + 2,9 bi), não o LongTermDebt de 1,9 mi do 10-K de 2021', () => {
    const p = fy(periodos('AMT'), 2019);
    expect(mi(p.dividaBrutaLp)).toBe(24_055);
    expect(p.sourceConcept.dividaBrutaLp).toBe(
      'LongTermDebtAndCapitalLeaseObligations+LongTermDebtAndCapitalLeaseObligationsCurrent?',
    );
  });

  it('PLD 2021 e WELL 2020: o valor do próprio 10-K vence o de um 10-K posterior', () => {
    expect(mi(fy(periodos('PLD'), 2021).dividaBrutaLp)).toBe(17_715);
    expect(mi(fy(periodos('WELL'), 2020).dividaBrutaLp)).toBe(13_888);
  });

  it('sem nenhum passo no próprio 10-K, vale o comparativo do 10-K seguinte (GOOGL 2014)', () => {
    expect(mi(fy(periodos('GOOGL'), 2014).ativoTotal)).toBe(129_187);
  });

  it('nenhum salto de dívida/caixa > 8× frente aos dois vizinhos nas fixtures', () => {
    for (const nome of ['AMT', 'PLD', 'WELL', 'AAPL', 'O', 'CCI']) {
      const r = extrairFundamentosSec(companyfacts(nome), { anoMinimo: 2014 });
      expect([nome, r.alertas.filter((a) => a.codigo === 'divida_salto')]).toEqual([nome, []]);
    }
  });
});

describe('sinal trocado no arquivo (CCI)', () => {
  it('dividendos pagos negativos voltam ao valor absoluto e o Declared deixa de ser suspeito', () => {
    const ps = periodos('CCI');
    for (const ano of [2017, 2022, 2023, 2024, 2025]) {
      const p = fy(ps, ano);
      expect(p.dividendosJcpPagos).toBeGreaterThan(0);
      expect(p.dpa).toBeGreaterThan(0);
      expect(p.sourceConcept.sinalCorrigido).toMatch(/dividendosPagos/);
    }
    expect(fy(ps, 2024)).toMatchObject({ dpaOrigem: 'declared', dpa: 6.26 });
    expect(mi(fy(ps, 2024).dividendosJcpPagos)).toBe(2_729);
    expect(fy(ps, 2021).sourceConcept.sinalCorrigido).toBeUndefined();
  });

  it('nenhum DPA, dividendo, capex ou recompra negativo nas fixtures', () => {
    for (const nome of ['AAPL', 'MSFT', 'KO', 'O', 'PLD', 'SPG', 'AMT', 'PSA', 'DLR', 'CCI']) {
      for (const p of periodos(nome)) {
        for (const v of [p.dpa, p.dividendosJcpPagos, p.capex, p.recompras]) {
          if (v !== null) expect([nome, p.anoFiscal, v >= 0]).toEqual([nome, p.anoFiscal, true]);
        }
      }
    }
  });
});

describe('cadeias de conceitos', () => {
  it('LLY: capex de PaymentsToAcquireOtherPropertyPlantAndEquipment', () => {
    const p = fy(periodos('LLY'), 2024);
    expect(p.sourceConcept.capex).toBe('PaymentsToAcquireOtherPropertyPlantAndEquipment');
    expect(mi(p.capex)).toBe(5058);
  });

  it('ARE e BXP: EBITDA pelo degrau 3 (lucro + IR opcional + juros), com flag ebitda_lucro', () => {
    for (const nome of ['ARE', 'BXP']) {
      for (const ano of [2021, 2022, 2023, 2024, 2025]) {
        const p = fy(periodos(nome), ano);
        expect(p.flags).toContain('ebitda_lucro');
        expect(p.sourceConcept.ebit).toMatch(/^lucro:.*\+ir:ausente\+juros:InterestExpense$/);
        expect(p.ebit).not.toBeNull();
        expect(p.depreciacaoAmortizacao).not.toBeNull();
      }
    }
  });

  it('degraus: AAPL pelo lucro operacional; JNJ-like (LLY) pelo pré-IR + juros', () => {
    expect(fy(periodos('AAPL'), 2025).sourceConcept.ebit).toBe('OperatingIncomeLoss');
    expect(fy(periodos('AAPL'), 2025).flags).not.toContain('ebitda_pre_ir');
    const lly = fy(periodos('LLY'), 2025);
    expect(lly.flags).toContain('ebitda_pre_ir');
    expect(lly.sourceConcept.ebit).toMatch(/^pre_ir:.*\+juros:/);
  });

  it('dividendos: PSA por PaymentsOfCapitalDistribution; SPG pelo DPA × média', () => {
    expect(fy(periodos('PSA'), 2024).sourceConcept.dividendosJcpPagos).toBe(
      'PaymentsOfCapitalDistribution',
    );
    const spg = fy(periodos('SPG'), 2024);
    expect(spg.sourceConcept.dividendosJcpPagos).toBe('derivado:dpa×acoesMediaDiluida');
    expect(mi(spg.dividendosJcpPagos)).toBe(2641);
  });

  it('DPA: CashPaid → Declared → derivado com selo (DLR 100% derivado)', () => {
    expect(fy(periodos('O'), 2024).dpaOrigem).toBe('cash_paid');
    expect(fy(periodos('PSA'), 2024)).toMatchObject({ dpaOrigem: 'declared', dpa: 12 });
    const dlr = fy(periodos('DLR'), 2024);
    expect(dlr.dpaOrigem).toBe('derivado');
    expect(dlr.flags).toContain('dpa_derivado');
    expect(dlr.dpa).toBeCloseTo(4.93, 2);
  });

  it('PLD: o Declared de 0,01 é suspeito frente a pagos ÷ média e vira derivado', () => {
    const r = resolverDpa(
      null,
      { val: 0.01, conceito: 'CommonStockDividendsPerShareDeclared', filed: 'x', accn: 'x' },
      { val: 3_570e6, conceito: 'PaymentsOfDividends', filed: 'x', accn: 'x' },
      {
        val: 927e6,
        conceito: 'WeightedAverageNumberOfDilutedSharesOutstanding',
        filed: 'x',
        accn: 'x',
      },
    );
    expect(r.origem).toBe('derivado');
    expect(r.flags).toEqual(['declared_suspeito', 'dpa_derivado']);
    expect(r.dpa).toBeCloseTo(3.85, 2);
    // no PLD real há CashPaid, que vence o Declared
    expect(fy(periodos('PLD'), 2024)).toMatchObject({ dpaOrigem: 'cash_paid', dpa: 3.84 });
  });

  it('dívida: sem conceito no ano = null (JPM, BRK), nunca zero', () => {
    expect(fy(periodos('JPM'), 2024).dividaBrutaLp).toBeNull();
    expect(fy(periodos('BRK-B'), 2024).dividaBrutaLp).toBeNull();
    expect(fy(periodos('AAPL'), 2024).dividaBrutaCp).toBeNull();
  });

  it('REIT residencial com receita só em OperatingLeaseLeaseIncome (AMH 2021+)', () => {
    expect(fy(periodos('AMH'), 2024).sourceConcept.receita).toBe('OperatingLeaseLeaseIncome');
  });

  it('XOM: o histórico do CIK 0000034088 cobre FY2014–FY2025', () => {
    const ps = periodos('XOM');
    expect(ps.map((p) => p.anoFiscal)).toEqual(Array.from({ length: 12 }, (_, i) => 2014 + i));
    expect(ps[0].emissorId).toBe('CIK:0000034088');
  });

  it('cobertura das fixtures: receita e lucro em 11/11 anos (FY2015–FY2025)', () => {
    for (const nome of [
      'AAPL',
      'MSFT',
      'KO',
      'NVDA',
      'GOOGL',
      'LLY',
      'JPM',
      'BRK-B',
      'WMT',
      'O',
      'PLD',
      'SPG',
      'AMT',
      'PSA',
      'DLR',
      'ARE',
      'CPT',
      'BXP',
      'AMH',
      'WELL',
    ]) {
      const ps = periodos(nome).filter((p) => p.anoFiscal >= 2015 && p.anoFiscal <= 2025);
      const ok = ps.filter((p) => p.receita !== null && p.lucroAtribuivel !== null).length;
      expect([nome, ok]).toEqual([nome, 11]);
    }
  });

  it('nenhum conceito inexistente: toda a cadeia está nos frames da SEC (fixture validada)', () => {
    const v = JSON.parse(readFileSync(path.join(DIR, 'conceitos-validados.json'), 'utf8')) as {
      conceitos: { conceito: string }[];
      faltando: string[];
    };
    const validados = new Set(v.conceitos.map((c) => c.conceito));
    expect(conceitosDasCadeias().filter((c) => !validados.has(c))).toEqual([]);
    expect(v.faltando).toEqual([]);
    for (const proibido of CONCEITOS_PROIBIDOS) {
      expect(conceitosDasCadeias()).not.toContain(`us-gaap:${proibido}`);
    }
    expect(CADEIAS_SEC.capex.passos.map((p) => p.rotulo)).toContain(
      'PaymentsToAcquireOtherPropertyPlantAndEquipment',
    );
    expect(CADEIAS_SEC.dividendosPagos.passos.map((p) => p.rotulo)).toContain(
      'PaymentsOfCapitalDistribution',
    );
  });

  it('passo(): soma, termo opcional e subtração', () => {
    expect(passo('A1+B2?+-C3').termos).toEqual([
      { taxonomia: 'us-gaap', conceito: 'A1', sinal: 1, opcional: false },
      { taxonomia: 'us-gaap', conceito: 'B2', sinal: 1, opcional: true },
      { taxonomia: 'us-gaap', conceito: 'C3', sinal: -1, opcional: false },
    ]);
    expect(passo('dei:EntityPublicFloat').termos[0].taxonomia).toBe('dei');
    expect(() => passo('A?')).toThrow();
  });
});
