import { beforeAll, describe, expect, it } from 'vitest';
import { SCORING_PARAMS_V1 as P } from '@/services/analiseAtivos/params/scoringParamsV1';
import { sanearMes, type FiiMesBruto } from '@/services/analiseAtivos/regras/fii/saneamentoMensal';
import { CNPJ, mensalFixture, mes } from './fixturesFii';

let m26: FiiMesBruto[] = [];
let m25: FiiMesBruto[] = [];
let m19: FiiMesBruto[] = [];
beforeAll(async () => {
  m26 = (await mensalFixture('2026_amostra')).meses;
  m25 = (await mensalFixture('2025_hfof')).meses;
  m19 = (await mensalFixture('2019_paby')).meses;
});

describe('sanearMes — casos reais', () => {
  it('HGLG11 ago/26: VP/cota 165,95, cotistas 608.345, PL ≈ 7.568 mi (±1%)', () => {
    const atual = mes(m26, CNPJ.HGLG, '2026-08-01');
    const { mes: s, flags } = sanearMes(atual, mes(m26, CNPJ.HGLG, '2026-07-01'), P);
    expect(s.vpCota).toBeCloseTo(165.95, 2);
    expect(s.vpCotaRecalculado).toBe(false);
    expect(s.cotistas).toBe(608_345);
    expect(Math.abs(s.pl! / 1e6 - 7568) / 7568).toBeLessThan(0.01);
    expect(s.dyMesCvmPct).toBeCloseTo(0.7027, 4); // fração 0,007027 ×100
    expect(flags).toEqual([]);
  });

  it('XPML11 jan/26: DY CVM negativo (−5,88% sobre o VP ≈ −6,52 R$/cota) ⇒ descartado', () => {
    const { mes: s, flags } = sanearMes(mes(m26, CNPJ.XPML, '2026-01-01'), null, P);
    expect(s.dyMesCvmPct).toBeNull();
    expect(flags).toContain('dy_cvm_descartado');
  });

  it('DY do mês > 5% ⇒ descartado (nunca usado como rendimento)', () => {
    const base = mes(m26, CNPJ.HGLG, '2026-08-01');
    const { mes: s, flags } = sanearMes({ ...base, dyMesCvmPct: 15 }, null, P);
    expect(s.dyMesCvmPct).toBeNull();
    expect(flags).toContain('dy_cvm_descartado');
  });

  it('TRXF11 Obrigações/PL ≈ 70,3% sem flag; > 100% ⇒ flag obrigacoes_revisao', () => {
    const trxf = mes(m26, CNPJ.TRXF, '2026-08-01');
    const a = sanearMes(trxf, null, P);
    expect(a.mes.obrigacoesPlPct).toBeCloseTo(70.27, 1);
    expect(a.flags).not.toContain('obrigacoes_revisao');
    const b = sanearMes({ ...trxf, passivoTotal: trxf.pl! * 1.2 }, null, P);
    expect(b.flags).toContain('obrigacoes_revisao');
  });

  it('VP/cota ≠ PL/cotas > 1% ⇒ recomputado (vpCotaRecalculado=true)', () => {
    const base = mes(m26, CNPJ.HGLG, '2026-08-01');
    const { mes: s, flags } = sanearMes({ ...base, vpCota: base.vpCota! * 1.05 }, null, P);
    expect(s.vpCotaRecalculado).toBe(true);
    expect(s.vpCota).toBeCloseTo(base.pl! / base.cotas!, 6);
    expect(flags).toContain('vp_cota_recalculado');
    // dentro de 1% mantém o informado
    const ok = sanearMes({ ...base, vpCota: base.vpCota! * 1.005 }, null, P);
    expect(ok.mes.vpCotaRecalculado).toBe(false);
  });

  it('PABY11 dez/2019 PL ≤ 0 ⇒ flag pl_nao_positivo (layout antigo CNPJ_Fundo)', () => {
    const { flags, mes: s } = sanearMes(
      mes(m19, CNPJ.PABY, '2019-12-01'),
      mes(m19, CNPJ.PABY, '2019-11-01'),
      P,
    );
    expect(s.pl).toBeLessThan(0);
    expect(flags).toContain('pl_nao_positivo');
    expect(s.obrigacoesPlPct).toBeNull(); // base não positiva
  });

  it('HFOF11 desdobramento 1:10 em mai/25 ⇒ fatorDesdobramento = 10', () => {
    const { mes: s, flags } = sanearMes(
      mes(m25, CNPJ.HFOF, '2025-05-01'),
      mes(m25, CNPJ.HFOF, '2025-04-01'),
      P,
    );
    expect(s.fatorDesdobramento).toBe(10);
    expect(flags).toContain('desdobramento');
    const jun = sanearMes(mes(m25, CNPJ.HFOF, '2025-06-01'), mes(m25, CNPJ.HFOF, '2025-05-01'), P);
    expect(jun.mes.fatorDesdobramento).toBeNull();
  });

  it('cotistas ±50% (base > 1.000) e VP/cota ±30% sem mudar cotas ⇒ alertas', () => {
    const ant = mes(m26, CNPJ.HGLG, '2026-07-01');
    const atual = mes(m26, CNPJ.HGLG, '2026-08-01');
    const r = sanearMes(
      {
        ...atual,
        cotistas: 100_000,
        cotas: ant.cotas,
        pl: ant.pl! * 1.5,
        vpCota: ant.vpCota! * 1.5,
      },
      ant,
      P,
    );
    expect(r.alertas.map((a) => a.codigo)).toEqual(
      expect.arrayContaining(['fii_cotistas_variacao', 'fii_vp_cota_salto']),
    );
  });
});

describe('sanearMes — salto de cotas só é desdobramento com o VP/cota acompanhando (achado 30/09)', () => {
  // cotas, PL e VP/cota reais do fii_monthly do dev
  const m = (refMonth: string, cotas: number, pl: number, vpCota: number): FiiMesBruto => ({
    ...mes(m26, CNPJ.HGLG, '2026-08-01'),
    cnpj: 'X',
    refMonth,
    cotas,
    pl,
    vpCota,
  });

  it('IRIM11 out→nov/25: cotas ×18,35 com VP/cota estável (incorporação) ⇒ sem fator, com alerta', () => {
    const {
      mes: s,
      flags,
      alertas,
    } = sanearMes(
      m('2025-11-01', 35_225_778, 2_962_321_736.41, 84.095282),
      m('2025-10-01', 1_920_000, 160_117_646.5, 83.394608),
      P,
    );
    expect(s.fatorDesdobramento).toBeNull();
    expect(flags).toContain('salto_cotas_sem_desdobramento');
    expect(alertas.map((a) => a.codigo)).toContain('fii_salto_cotas');
  });

  it('MGRI11 jun→jul/26: cotas ×8,12 com VP/cota ÷3,6 ⇒ sem fator', () => {
    const { mes: s } = sanearMes(
      m('2026-07-01', 2_691_355.1277, 36_586_915.09, 13.59423538),
      m('2026-06-01', 331_255.6169, 16_414_592.94, 49.55264787),
      P,
    );
    expect(s.fatorDesdobramento).toBeNull();
  });

  it('GSRF11 mai/26 (cotas ÷7,18 com PL ÷53) e ago/26 (volta ×7,18) ⇒ sem fator nos dois', () => {
    const abr = m('2026-04-01', 627_751, 64_850_823.11, 103.30660263);
    const mai = m('2026-05-01', 87_430, 1_230_499.28, 14.0741082);
    const jul = m('2026-07-01', 87_430, 1_230_499.28, 14.0741082);
    const ago = m('2026-08-01', 627_751, 55_002_686.81, 87.6186367);
    expect(sanearMes(mai, abr, P).mes.fatorDesdobramento).toBeNull();
    expect(sanearMes(ago, jul, P).mes.fatorDesdobramento).toBeNull();
  });

  it('HGLG11 mar→abr/2018: cotas ×10 e VP/cota 1.173,48 → 116,99 ⇒ desdobramento 10', () => {
    const { mes: s, flags } = sanearMes(
      m('2018-04-01', 7_881_340, 922_047_939.58, 116.99126539),
      m('2018-03-01', 788_134, 924_856_003.25, 1173.47558061),
      P,
    );
    expect(s.fatorDesdobramento).toBe(10);
    expect(flags).toContain('desdobramento');
  });
});
