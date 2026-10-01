/**
 * Validação de eventos corporativos com os casos reais da Fase A (acoes-cvm.md §2; regras 6, 13, 22).
 * Eventos brutos = asset_corporate_actions do banco dev; contagens = CVM (amostra da Fase A).
 */
import { describe, expect, it } from 'vitest';
import {
  ajustarSerieCotaFii,
  anosBaseCandidatos,
  dataExDoEvento,
  deduplicarEventos,
  emissaoRecompraCoerente,
  fatorEventosAnoBaseApos,
  fatorEventosApos,
  fatorEventosEntre,
  saltoAcoesSemEvento,
  verificarEventosCorporativos,
} from '@/services/analiseAtivos/regras/calculo/eventosCorporativos';
import type { ContagemAcoes } from '@/services/analiseAtivos/tipos';
import { P, contagensDe, eventosBrutos, fiiInforme } from './helpers';

function achar(evs: ReturnType<typeof verificarEventosCorporativos>, data: string, fator: number) {
  const e = evs.find((x) => x.dataEvento === data && Math.abs(x.fator - fator) < 1e-6);
  if (!e) throw new Error(`evento ${data} ×${fator} não encontrado`);
  return e;
}

describe('eventos corporativos — ações (regra 6)', () => {
  it('EGIE3 2025: ×1,4 confirmado (815,9 → 1.142,3 mi) e o fantasma ×1,1 de 28/11 descartado', () => {
    const evs = verificarEventosCorporativos(eventosBrutos('EGIE3'), contagensDe('EGIE3'), P);
    const x14 = achar(evs, '2025-11-27', 1.4);
    expect(x14.status).toBe('confirmado');
    expect(x14.anoBase).toBe(2025);
    expect(x14.razaoCvm).toBeCloseTo(1142.299 / 815.928, 4);
    expect(achar(evs, '2025-11-28', 1.1).status).toBe('descartado');
    // dezembro/2018 ×1,25: 652,7 → 815,9 mi já no fim de 2018
    expect(achar(evs, '2018-12-12', 1.25)).toMatchObject({ status: 'confirmado', anoBase: 2018 });
    expect(fatorEventosAnoBaseApos(evs, 2016)).toBeCloseTo(1.75, 10);
  });

  it('BBDC3/BBDC4 2024-02-07 ×1,2 descartado (ações ×0,996)', () => {
    const cont = contagensDe('BBDC4');
    for (const s of ['BBDC3', 'BBDC4']) {
      const evs = verificarEventosCorporativos(eventosBrutos(s), cont, P);
      expect(achar(evs, '2024-02-08', 1.2).status).toBe('descartado');
    }
  });

  it('CPLE3 2021 ×10 descartado (ações ×1)', () => {
    const evs = verificarEventosCorporativos(eventosBrutos('CPLE3'), contagensDe('CPLE3'), P);
    expect(achar(evs, '2021-03-12', 10).status).toBe('descartado');
    // tipos fora da lista (RESG TOTAL RV) são ignorados
    expect(evs.some((e) => e.fator === 100)).toBe(false);
  });

  it('LREN3 2021-10-22/11-05 deduplicados num evento só (mesmo fator em ≤ 30 dias)', () => {
    const dedup = deduplicarEventos(eventosBrutos('LREN3'), P);
    const em2021 = dedup.filter((e) => e.dataEvento.startsWith('2021'));
    expect(em2021).toHaveLength(1);
    expect(em2021[0].dataEvento).toBe('2021-10-22');
    expect(em2021[0].idsOrigem).toHaveLength(2);
    // 2024: YAHOO 28/11 + BRAPI 11/12 + YAHOO 12/12 = 1 evento, confirmado (955,6 → 1.051,7 mi)
    const evs = verificarEventosCorporativos(eventosBrutos('LREN3'), contagensDe('LREN3'), P);
    const e2024 = evs.filter((e) => e.dataEvento.startsWith('2024'));
    expect(e2024).toHaveLength(1);
    expect(e2024[0].idsOrigem).toHaveLength(3);
    expect(e2024[0].fontes.sort()).toEqual(['BRAPI', 'YAHOO']);
    expect(e2024[0].status).toBe('confirmado');
  });

  it('SLCE3 2026-01-02 ×1,125 já estava no fim de 2025 ⇒ anoBase 2025, confirmado', () => {
    expect(anosBaseCandidatos('2026-01-02', P)).toEqual([2025, 2026]);
    const evs = verificarEventosCorporativos(eventosBrutos('SLCE3'), contagensDe('SLCE3'), P);
    const e = achar(evs, '2026-01-02', 1.125);
    expect(e.status).toBe('confirmado');
    expect(e.anoBase).toBe(2025);
  });

  it('CYRE3 2025-12-30 ×1,19 só aparece no ITR de 2026 ⇒ anoBase 2026, confirmado', () => {
    expect(anosBaseCandidatos('2025-12-30', P)).toEqual([2025, 2026]);
    const evs = verificarEventosCorporativos(eventosBrutos('CYRE3'), contagensDe('CYRE3'), P);
    // BRAPI grava a data-com (30/12); data ex = próximo pregão (02/01/2026)
    const e = evs.find((x) => x.dataEvento === '2026-01-02')!;
    expect(e.status).toBe('confirmado');
    expect(e.anoBase).toBe(2026);
  });

  it('sem contagem no ano ⇒ não validável; só confirmados ajustam', () => {
    const evs = verificarEventosCorporativos(eventosBrutos('CYRE3'), [], P);
    expect(evs.every((e) => e.status === 'nao_validavel')).toBe(true);
    expect(fatorEventosApos(evs, '2020-01-01')).toBe(1);
  });

  it('WEGE3: fator dos eventos posteriores a 2016 = 2,6 (1,3 × 2) — LPA 2016 ajustado 0,2663', () => {
    const evs = verificarEventosCorporativos(eventosBrutos('WEGE3'), contagensDe('WEGE3'), P);
    expect(achar(evs, '2018-04-25', 1.3).status).toBe('confirmado');
    expect(achar(evs, '2021-04-28', 2).status).toBe('confirmado');
    expect(fatorEventosAnoBaseApos(evs, 2016)).toBeCloseTo(2.6, 10);
    expect(fatorEventosEntre(evs, '2016-12-31', '2020-12-31')).toBeCloseTo(1.3, 10);
    const lpa2016 = 1117.6 / 1614.353;
    expect(lpa2016 / fatorEventosAnoBaseApos(evs, 2016)).toBeCloseTo(0.2663, 4);
  });
  it('MGLU3 2024 ×0,1 com follow-on (razão 0,11): emissao_recompra, MANTIDO no ajuste (Fase A: fator 0,105)', () => {
    const evs = verificarEventosCorporativos(eventosBrutos('MGLU3'), contagensDe('MGLU3'), P);
    const g = evs.find((x) => x.dataEvento.startsWith('2024-05'))!;
    expect(g.status).toBe('emissao_recompra');
    expect(achar(evs, '2025-12-30', 1.05).status).toBe('confirmado');
    expect(achar(evs, '2020-10-14', 4).status).toBe('confirmado');
    expect(fatorEventosAnoBaseApos(evs, 2020)).toBeCloseTo(0.105, 10);
  });
});

describe('eventos corporativos — correções do QA de 30/09', () => {
  const cont = (data: string, total: number): ContagemAcoes => ({
    cnpj: 'X',
    data,
    on: total,
    pn: 0,
    total,
    fonte: data.endsWith('12-31') ? 'dfp' : 'itr',
    razaoLpa: 1,
    status: 'ok',
  });
  const ev = (
    symbol: string,
    date: string,
    factor: number,
    source: string,
    type = 'DESDOBRAMENTO',
  ) => ({
    id: `${symbol}-${date}-${factor}-${source}`,
    symbol,
    date,
    type,
    factor,
    source,
  });
  const statusDe = (evs: ReturnType<typeof verificarEventosCorporativos>) =>
    evs.map((e) => `${e.fator}:${e.status}`);

  it('LIGT3 2021: par fantasma ×10/×0,01 no mesmo dia com follow-on (razão 1,226) NÃO ajusta', () => {
    const evs = verificarEventosCorporativos(
      [
        ev('LIGT3', '2021-06-25', 10, 'BRAPI'),
        ev('LIGT3', '2021-06-25', 0.01, 'BRAPI', 'GRUPAMENTO'),
      ],
      [cont('2020-12-31', 303_934_060), cont('2021-12-31', 372_555_324)],
      P,
    );
    expect(statusDe(evs)).toEqual(['10:nao_validavel', '0.01:nao_validavel']);
    expect(fatorEventosAnoBaseApos(evs, 2020)).toBe(1);
  });

  it('CALI3 2022: ×400 (BRAPI) e ×5 (YAHOO) com razão 9,9994 ⇒ nenhum ajusta', () => {
    const evs = verificarEventosCorporativos(
      [ev('CALI3', '2022-06-03', 400, 'BRAPI'), ev('CALI3', '2022-06-06', 5, 'YAHOO')],
      [cont('2021-12-31', 1_000_000), cont('2022-12-31', 9_999_411)],
      P,
    );
    expect(evs.every((e) => e.status === 'nao_validavel')).toBe(true);
    expect(fatorEventosAnoBaseApos(evs, 2021)).toBe(1);
  });

  it('IFCM3 2025: dois ×0,05 com ações SUBINDO 3,51× ⇒ nenhum ajusta', () => {
    const evs = verificarEventosCorporativos(
      [
        ev('IFCM3', '2025-07-31', 0.05, 'YAHOO', 'GRUPAMENTO'),
        ev('IFCM3', '2025-11-07', 0.05, 'YAHOO', 'GRUPAMENTO'),
      ],
      [cont('2024-12-31', 10_000_000), cont('2025-12-31', 35_120_463)],
      P,
    );
    expect(evs.every((e) => e.status === 'nao_validavel')).toBe(true);
    expect(fatorEventosAnoBaseApos(evs, 2020)).toBe(1);
  });

  it('AZUL3 2026: ×0,0133 e ×0,0000067 (produto 8,9e-8) contra razão 0,122 ⇒ nenhum ajusta', () => {
    const evs = verificarEventosCorporativos(
      [
        ev('AZUL3', '2026-02-18', 0.01333333, 'BRAPI', 'GRUPAMENTO'),
        ev('AZUL3', '2026-04-17', 0.00000667, 'BRAPI', 'GRUPAMENTO'),
      ],
      [cont('2025-12-31', 100_000_000), cont('2026-06-30', 12_184_498)],
      P,
    );
    expect(evs.every((e) => e.status === 'nao_validavel')).toBe(true);
  });

  it('emissaoRecompraCoerente: um evento, mesmo lado de 1, razão/fator em [0,5; 2]', () => {
    expect(emissaoRecompraCoerente(1, 0.1, 0.11, P)).toBe(true); // MGLU3 2024
    expect(emissaoRecompraCoerente(2, 0.1, 0.11, P)).toBe(false);
    expect(emissaoRecompraCoerente(1, 0.05, 3.51, P)).toBe(false);
    expect(emissaoRecompraCoerente(1, 400, 9.9994, P)).toBe(false);
  });

  it('SBSP3 2026: YAHOO ×1,028 de fonte única descartado; bonificação ×1,0016 e split 1:5 confirmados', () => {
    const evs = verificarEventosCorporativos(
      [
        ev('SBSP3', '2025-12-23', 1.03, 'BRAPI', 'BONIFICACAO'),
        ev('SBSP3', '2025-12-26', 1.029647, 'YAHOO'),
        ev('SBSP3', '2026-03-19', 1.0016098, 'BRAPI', 'BONIFICACAO'),
        ev('SBSP3', '2026-03-19', 1.028346, 'YAHOO'),
        ev('SBSP3', '2026-03-20', 1.00161, 'YAHOO'),
        ev('SBSP3', '2026-04-28', 5, 'BRAPI'),
        ev('SBSP3', '2026-04-29', 5, 'YAHOO'),
      ],
      [
        cont('2024-12-31', 683_509_869),
        cont('2025-12-31', 700_219_438),
        cont('2026-03-31', 701_352_376),
        cont('2026-06-30', 3_506_830_477),
      ],
      P,
    );
    expect(achar(evs, '2026-03-19', 1.028346).status).toBe('descartado');
    expect(achar(evs, '2026-03-20', 1.0016098).status).toBe('confirmado');
    expect(achar(evs, '2026-04-29', 5).status).toBe('confirmado');
    // antes: 5,15001 (o ×1,028 espúrio entrava); correto ≈ razão CVM 5,008
    expect(fatorEventosAnoBaseApos(evs, 2025)).toBeCloseTo(5.008049, 5);
  });

  it('data do evento = data EX: BRAPI grava a data-com (VBBR3 25/11/2025 ⇒ ex 26/11)', () => {
    const [d] = deduplicarEventos(
      [
        ev('VBBR3', '2025-11-25', 1.071, 'BRAPI', 'BONIFICACAO'),
        ev('VBBR3', '2025-11-26', 1.0711, 'YAHOO'),
      ],
      P,
    );
    expect(d.dataEvento).toBe('2025-11-26');
    // só YAHOO (data ex) fica como está; BRAPI no feriado/fim de semana vai ao próximo pregão
    expect(dataExDoEvento({ date: '2025-11-26', source: 'YAHOO' }, P)).toBe('2025-11-26');
    expect(dataExDoEvento({ date: '2025-12-30', source: 'BRAPI' }, P)).toBe('2026-01-02');
  });
});

describe('FII: fatorDesdobramento gravado sem PL estável não vira evento (achado 30/09)', () => {
  it('IRIM11 nov/25 (PL ×18,5) ⇒ nenhum evento; rendimento anterior não é dividido', () => {
    const evs = verificarEventosCorporativos(
      [],
      [],
      P,
      [
        { refMonth: '2025-10-01', cotas: 1_920_000, fatorDesdobramento: null, pl: 160_117_646.5 },
        {
          refMonth: '2025-11-01',
          cotas: 35_225_778,
          fatorDesdobramento: 18.3468,
          pl: 2_962_321_736.41,
        },
      ],
      'IRIM11',
    );
    expect(evs).toEqual([]);
  });

  it('ONDA11 fev→mar/26: cotas ÷101 e depois ×101 (informe com cotas erradas) ⇒ nenhum evento', () => {
    const evs = verificarEventosCorporativos(
      [],
      [],
      P,
      [
        { refMonth: '2026-01-01', cotas: 8_358_357, fatorDesdobramento: null, pl: 100_838_108.98 },
        {
          refMonth: '2026-02-01',
          cotas: 82_644,
          fatorDesdobramento: 0.009900990099009901,
          pl: 100_870_762.38,
        },
        { refMonth: '2026-03-01', cotas: 8_358_357, fatorDesdobramento: 101, pl: 95_319_243.03 },
      ],
      'ONDA11',
    );
    expect(evs).toEqual([]);
  });

  it('ida e volta invertida: salto ×100 por erro e grupamento ÷100 no mês seguinte ⇒ nenhum evento', () => {
    const evs = verificarEventosCorporativos(
      [],
      [],
      P,
      [
        { refMonth: '2026-01-01', cotas: 1_000_000, fatorDesdobramento: null, pl: 100_000_000 },
        { refMonth: '2026-02-01', cotas: 100_000_000, fatorDesdobramento: 100, pl: 100_500_000 },
        { refMonth: '2026-03-01', cotas: 1_000_000, fatorDesdobramento: 0.01, pl: 100_700_000 },
      ],
      'XPTO11',
    );
    expect(evs).toEqual([]);
  });

  it('salto ×10 cujas cotas voltam ao nível anterior meses depois ⇒ nenhum evento', () => {
    const evs = verificarEventosCorporativos(
      [],
      [],
      P,
      [
        { refMonth: '2026-01-01', cotas: 1_000_000, fatorDesdobramento: null, pl: 100_000_000 },
        { refMonth: '2026-02-01', cotas: 10_000_000, fatorDesdobramento: 10, pl: 100_000_000 },
        { refMonth: '2026-03-01', cotas: 10_000_000, fatorDesdobramento: null, pl: 100_000_000 },
        { refMonth: '2026-04-01', cotas: 1_010_000, fatorDesdobramento: null, pl: 100_000_000 },
      ],
      'XPTO11',
    );
    expect(evs).toEqual([]);
  });

  it('desdobramento real seguido de meses estáveis continua confirmado', () => {
    const evs = verificarEventosCorporativos(
      [],
      [],
      P,
      [
        { refMonth: '2026-01-01', cotas: 1_000_000, fatorDesdobramento: null, pl: 100_000_000 },
        { refMonth: '2026-02-01', cotas: 10_000_000, fatorDesdobramento: 10, pl: 100_000_000 },
        { refMonth: '2026-03-01', cotas: 10_050_000, fatorDesdobramento: null, pl: 101_000_000 },
      ],
      'XPTO11',
    );
    expect(evs.map((e) => [e.fator, e.status])).toEqual([[10, 'confirmado']]);
  });

  it('FIIC11 jan/26: PL negativo ⇒ fator ×87 mi não vira evento', () => {
    const evs = verificarEventosCorporativos(
      [],
      [],
      P,
      [
        { refMonth: '2025-12-01', cotas: 5_738, fatorDesdobramento: null, pl: -4_029.68 },
        {
          refMonth: '2026-01-01',
          cotas: 500_000_005_738,
          fatorDesdobramento: 87_138_377,
          pl: -16_344.43,
        },
      ],
      'FIIC11',
    );
    expect(evs).toEqual([]);
  });

  it('HGLG11 abr/2018 (PL estável) continua confirmado cvm_cotas', () => {
    const evs = verificarEventosCorporativos(
      [],
      [],
      P,
      [
        { refMonth: '2018-03-01', cotas: 788_134, fatorDesdobramento: null, pl: 924_856_003.25 },
        { refMonth: '2018-04-01', cotas: 7_881_340, fatorDesdobramento: 10, pl: 922_047_939.58 },
      ],
      'HGLG11',
    );
    expect(evs.map((e) => [e.fator, e.status, e.fontes])).toEqual([
      [10, 'confirmado', ['cvm_cotas']],
    ]);
  });

  it('evento bruto de FII incoerente com a razão de cotas ⇒ não validável (não ajusta)', () => {
    const evs = verificarEventosCorporativos(
      [
        {
          id: 'y',
          symbol: 'XXXX11',
          date: '2025-11-10',
          type: 'DESDOBRAMENTO',
          factor: 10,
          source: 'YAHOO',
        },
      ],
      [],
      P,
      [
        { refMonth: '2025-10-01', cotas: 1_000_000, fatorDesdobramento: null },
        { refMonth: '2025-11-01', cotas: 1_300_000, fatorDesdobramento: null },
      ],
      'XXXX11',
    );
    expect(evs[0].status).toBe('nao_validavel');
  });
});

describe('regra 13 — salto de ações sem evento validado', () => {
  it('2,5× sem evento ⇒ salto; com evento confirmado de mesmo fator ⇒ sem salto', () => {
    expect(saltoAcoesSemEvento(100, 260, 1, P)).toBe(true);
    expect(saltoAcoesSemEvento(100, 260, 2.6, P)).toBe(false);
    expect(saltoAcoesSemEvento(100, 30, 1, P)).toBe(true);
    expect(saltoAcoesSemEvento(100, 120, 1, P)).toBe(false);
  });
});

describe('eventos de FII pelas cotas do Informe Mensal (regra 22)', () => {
  const meses = (t: 'HGLG11' | 'HFOF11') =>
    fiiInforme[t].meses.map((m) => ({
      refMonth: m.refMonth,
      cotas: m.cotas,
      fatorDesdobramento: null,
    }));

  it('HGLG11 2018-04 ×10 confirmado (788.134 → 7.881.340 cotas)', () => {
    const evs = verificarEventosCorporativos(
      eventosBrutos('HGLG11'),
      [],
      P,
      meses('HGLG11'),
      'HGLG11',
    );
    const e = achar(evs, '2018-04-18', 10);
    expect(e.status).toBe('confirmado');
    expect(e.razaoCvm).toBeCloseTo(10, 6);
  });

  it('HFOF11 1:10 em mai/25 confirmado', () => {
    const evs = verificarEventosCorporativos(
      eventosBrutos('HFOF11'),
      [],
      P,
      meses('HFOF11'),
      'HFOF11',
    );
    expect(achar(evs, '2025-05-12', 10).status).toBe('confirmado');
  });

  it('fatorDesdobramento do FiiMonthly sem evento bruto ⇒ evento confirmado cvm_cotas', () => {
    const m = meses('HGLG11').map((x) =>
      x.refMonth === '2018-04-01' ? { ...x, fatorDesdobramento: 10 } : x,
    );
    const evs = verificarEventosCorporativos([], [], P, m, 'HGLG11');
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({
      symbol: 'HGLG11',
      dataEvento: '2018-04-01',
      fator: 10,
      status: 'confirmado',
      fontes: ['cvm_cotas'],
    });
  });

  it('HGLG11: VP/cota de 2017 (1.105,35 cru) vai a 110,54 na base de hoje; 2018-05 não muda', () => {
    const evs = verificarEventosCorporativos(
      eventosBrutos('HGLG11'),
      [],
      P,
      meses('HGLG11'),
      'HGLG11',
    );
    const serie = fiiInforme.HGLG11.meses.map((m) => ({
      refMonth: m.refMonth,
      vpCota: m.vpCota,
      rendCota: 7.8,
    }));
    const aj = ajustarSerieCotaFii(serie, evs);
    expect(aj[0].vpCota).toBeCloseTo(110.535, 3);
    expect(aj[0].rendCota).toBeCloseTo(0.78, 6);
    const maio = aj.find((m) => m.refMonth === '2018-05-01')!;
    expect(maio.vpCota).toBeCloseTo(116.42, 2);
  });
});
