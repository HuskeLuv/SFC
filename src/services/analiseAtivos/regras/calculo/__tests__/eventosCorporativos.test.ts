/**
 * Validação de eventos corporativos com os casos reais da Fase A (acoes-cvm.md §2; regras 6, 13, 22).
 * Eventos brutos = asset_corporate_actions do banco dev; contagens = CVM (amostra da Fase A).
 */
import { describe, expect, it } from 'vitest';
import {
  ajustarSerieCotaFii,
  anosBaseCandidatos,
  deduplicarEventos,
  fatorEventosAnoBaseApos,
  fatorEventosApos,
  fatorEventosEntre,
  saltoAcoesSemEvento,
  verificarEventosCorporativos,
} from '@/services/analiseAtivos/regras/calculo/eventosCorporativos';
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
      expect(achar(evs, '2024-02-07', 1.2).status).toBe('descartado');
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
    const e = evs.find((x) => x.dataEvento === '2025-12-30')!;
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
    expect(achar(evs, '2018-04-24', 1.3).status).toBe('confirmado');
    expect(achar(evs, '2021-04-27', 2).status).toBe('confirmado');
    expect(fatorEventosAnoBaseApos(evs, 2016)).toBeCloseTo(2.6, 10);
    expect(fatorEventosEntre(evs, '2016-12-31', '2020-12-31')).toBeCloseTo(1.3, 10);
    const lpa2016 = 1117.6 / 1614.353;
    expect(lpa2016 / fatorEventosAnoBaseApos(evs, 2016)).toBeCloseTo(0.2663, 4);
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
