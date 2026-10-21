/**
 * fundamentei-regras (F2, A4.b/A4.c): DY e DPA de ações por data-ex (pregão seguinte à data-com
 * real), corte de data-ex futura e DPA do exercício real fora de dezembro. Fixtures SINTÉTICAS (sem
 * valores de terceiros). v1/v2 (sem os campos novos) = o DPA de hoje, byte a byte.
 */
import { describe, expect, it } from 'vitest';
import {
  dataExDoProvento,
  dpaNoAno,
  opcoesDpaDoFy,
  rendimento12m,
} from '@/services/analiseAtivos/regras/calculo/proventos';
import { pregaoSeguinte } from '@/services/analiseAtivos/regras/comum/pregoes';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import { SCORING_PARAMS_V2 } from '@/services/analiseAtivos/params/scoringParamsV2';
import { SCORING_PARAMS_V3 } from '@/services/analiseAtivos/params/scoringParamsV3';
import type { ProventoAuditado } from '@/services/analiseAtivos/tipos';

type Prov = Pick<ProventoAuditado, 'tipoNormalizado' | 'status' | 'dataComReal' | 'valor'>;
const prov = (dataComReal: string, valor: number, tipo: Prov['tipoNormalizado'] = 'DIVIDENDO') =>
  ({ tipoNormalizado: tipo, status: 'valido', dataComReal, valor }) as Prov;

describe('pregaoSeguinte', () => {
  it('sexta ⇒ segunda; véspera de 24/12, 31/12 e 01/01 ⇒ o 1º pregão de janeiro', () => {
    expect(pregaoSeguinte('2026-10-16')).toBe('2026-10-19');
    expect(pregaoSeguinte('2025-12-23')).toBe('2025-12-26');
    expect(pregaoSeguinte('2025-12-30')).toBe('2026-01-02');
    expect(pregaoSeguinte('2026-10-20')).toBe('2026-10-21');
  });

  it('a data-ex de um provento é o pregão seguinte à data-com real', () => {
    expect(dataExDoProvento(prov('2025-12-30', 1))).toBe('2026-01-02');
    expect(dataExDoProvento({ dataComReal: null })).toBeNull();
  });
});

describe('DPA do ano: data-com × data-ex na virada do ano', () => {
  const provs = [prov('2025-06-10', 0.4), prov('2025-12-30', 0.6)];

  it("base 'com' (hoje): a data-com de 30/12/2025 fica em 2025", () => {
    expect(dpaNoAno(provs, 2025, 'fim_do_ano', [])).toEqual({ estado: 'ok', valor: 1 });
    expect(dpaNoAno(provs, 2026, 'fim_do_ano', [])).toEqual({ estado: 'ok', valor: 0 });
  });

  it("base 'ex' (v3): data-ex 02/01/2026 passa para 2026", () => {
    const o = { baseJanela: 'ex' as const };
    expect(dpaNoAno(provs, 2025, 'fim_do_ano', [], undefined, o)).toEqual({
      estado: 'ok',
      valor: 0.4,
    });
    expect(dpaNoAno(provs, 2026, 'fim_do_ano', [], undefined, o)).toEqual({
      estado: 'ok',
      valor: 0.6,
    });
  });
});

describe('corte de data-ex futura (cortarFuturos)', () => {
  const provs = [prov('2026-04-10', 0.5), prov('2026-11-30', 0.7)];
  const hoje = '2026-10-20';

  it('v1/v2: o anunciado com data-com futura entra no DPA do ano (como hoje)', () => {
    for (const p of [SCORING_PARAMS_V1, SCORING_PARAMS_V2]) {
      const o = opcoesDpaDoFy({ dtIni: '2026-01-01', dtFim: '2026-12-31' }, hoje, p);
      expect(o).toEqual({});
      expect(dpaNoAno(provs, 2026, 'fim_do_ano', [], undefined, o)).toEqual(
        dpaNoAno(provs, 2026, 'fim_do_ano', []),
      );
      expect(dpaNoAno(provs, 2026, 'fim_do_ano', [], undefined, o)).toEqual({
        estado: 'ok',
        valor: 1.2,
      });
    }
  });

  it('v3: data-ex depois de hoje fica fora', () => {
    const o = opcoesDpaDoFy({ dtIni: '2026-01-01', dtFim: '2026-12-31' }, hoje, SCORING_PARAMS_V3);
    expect(o).toEqual({ baseJanela: 'ex', cortarApos: hoje });
    expect(dpaNoAno(provs, 2026, 'fim_do_ano', [], undefined, o)).toEqual({
      estado: 'ok',
      valor: 0.5,
    });
  });
});

describe('DPA por exercício fora de dezembro (CAML3 sintético, exercício mar–fev)', () => {
  // exercício 2026 = 01/03/2025 a 28/02/2026; proventos sintéticos
  const fy = { dtIni: '2025-03-01', dtFim: '2026-02-28' };
  const provs = [
    prov('2025-02-20', 0.1), // exercício anterior
    prov('2025-05-12', 0.2),
    prov('2025-11-28', 0.3),
    prov('2026-01-15', 0.4),
    prov('2026-11-30', 0.9), // anunciado, data-ex futura
  ];
  const hoje = '2026-10-20';

  it('v1/v2: ano CIVIL 2026 (inclusive a data-com futura)', () => {
    const o = opcoesDpaDoFy(fy, hoje, SCORING_PARAMS_V2);
    expect(dpaNoAno(provs, 2026, 'fim_do_ano', [], undefined, o).estado).toBe('ok');
    const v = dpaNoAno(provs, 2026, 'fim_do_ano', [], undefined, o);
    expect(v.estado === 'ok' && v.valor).toBeCloseTo(1.3, 10);
  });

  it('v3: data-ex em [dtIni, dtFim] do exercício', () => {
    const o = opcoesDpaDoFy(fy, hoje, SCORING_PARAMS_V3);
    expect(o.periodo).toEqual(fy);
    const v = dpaNoAno(provs, 2026, 'fim_do_ano', [], undefined, o);
    expect(v.estado === 'ok' && v.valor).toBeCloseTo(0.9, 10);
  });

  it('v3 com exercício em dezembro: ano civil por data-ex (sem janela do exercício)', () => {
    const o = opcoesDpaDoFy({ dtIni: '2025-01-01', dtFim: '2025-12-31' }, hoje, SCORING_PARAMS_V3);
    expect(o.periodo).toBeUndefined();
  });
});

describe('DY 12m por data-ex (só ações)', () => {
  // data-com na borda da janela: (hoje − 12m, hoje] = (20/10/2025, 20/10/2026]
  const provs = [prov('2025-10-20', 1), prov('2026-03-10', 2)];
  const hoje = '2026-10-20';

  it('v1/v2: a data-com de 20/10/2025 fica fora da janela', () => {
    for (const p of [SCORING_PARAMS_V1, SCORING_PARAMS_V2]) {
      expect(rendimento12m(provs, hoje, 'acao', [], p)).toEqual({ estado: 'ok', valor: 2 });
    }
  });

  it('v3: data-ex 21/10/2025 entra na janela', () => {
    expect(rendimento12m(provs, hoje, 'acao', [], SCORING_PARAMS_V3)).toEqual({
      estado: 'ok',
      valor: 3,
    });
  });

  it('v3: FII segue pela data-com', () => {
    const fii = provs.map((x) => ({ ...x, tipoNormalizado: 'RENDIMENTO' as const }));
    expect(rendimento12m(fii, hoje, 'fii', [], SCORING_PARAMS_V3)).toEqual(
      rendimento12m(fii, hoje, 'fii', [], SCORING_PARAMS_V2),
    );
  });
});
