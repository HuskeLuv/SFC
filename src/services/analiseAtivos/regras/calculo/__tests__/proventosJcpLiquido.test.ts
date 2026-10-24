/**
 * Regra jcpLiquido (igual ao Fundamentei): JCP entra no DPA/DY de ações líquido de IR — 15% com
 * data-com até 2025, 17,5% a partir de 2026 (LC 224/2025). Fixtures SINTÉTICAS. Sem a regra (v1–v4),
 * o DPA continua bruto.
 */
import { describe, expect, it } from 'vitest';
import {
  aliquotaJcpPorDataCom,
  dpaNoAno,
  opcoesDpaDoFy,
  rendimento12m,
  valorParaDpa,
} from '@/services/analiseAtivos/regras/calculo/proventos';
import { SCORING_PARAMS_V3 } from '@/services/analiseAtivos/params/scoringParamsV3';
import type { ScoringParams } from '@/services/analiseAtivos/params/scoringParamsSchema';
import type { ProventoAuditado } from '@/services/analiseAtivos/tipos';

type Prov = Pick<ProventoAuditado, 'tipoNormalizado' | 'status' | 'dataComReal' | 'valor'>;
const prov = (dataComReal: string, valor: number, tipo: Prov['tipoNormalizado'] = 'DIVIDENDO') =>
  ({ tipoNormalizado: tipo, status: 'valido', dataComReal, valor }) as Prov;

const COM_REGRA: ScoringParams = {
  ...SCORING_PARAMS_V3,
  proventos: { ...SCORING_PARAMS_V3.proventos, jcpLiquido: true },
};

describe('aliquotaJcpPorDataCom / valorParaDpa', () => {
  it('15% até 31/12/2025 e 17,5% a partir de 01/01/2026', () => {
    expect(aliquotaJcpPorDataCom('2025-12-31')).toBe(0.15);
    expect(aliquotaJcpPorDataCom('2026-01-01')).toBe(0.175);
  });

  it('só o JCP muda; dividendo e regra desligada ficam no bruto', () => {
    expect(valorParaDpa(prov('2025-09-30', 1, 'JCP'), true)).toBeCloseTo(0.85, 10);
    expect(valorParaDpa(prov('2026-03-31', 1, 'JCP'), true)).toBeCloseTo(0.825, 10);
    expect(valorParaDpa(prov('2026-03-31', 1, 'DIVIDENDO'), true)).toBe(1);
    expect(valorParaDpa(prov('2026-03-31', 1, 'JCP'), false)).toBe(1);
  });
});

describe('rendimento12m e dpaNoAno com jcpLiquido', () => {
  const provs = [
    prov('2025-12-03', 0.4, 'DIVIDENDO'),
    prov('2025-12-03', 0.1, 'JCP'), // 0,085
    prov('2026-03-20', 0.2, 'JCP'), // 0,165
  ];

  it('DPA 12m: JCP líquido com a regra; bruto sem ela', () => {
    const com = rendimento12m(provs, '2026-10-24', 'acao', [], COM_REGRA);
    const sem = rendimento12m(provs, '2026-10-24', 'acao', [], SCORING_PARAMS_V3);
    expect(com.estado === 'ok' && com.valor).toBeCloseTo(0.4 + 0.085 + 0.165, 10);
    expect(sem.estado === 'ok' && sem.valor).toBeCloseTo(0.7, 10);
  });

  it('FII não muda (sem JCP na regra)', () => {
    const r = rendimento12m(
      [prov('2026-05-29', 1, 'RENDIMENTO')],
      '2026-10-24',
      'fii',
      [],
      COM_REGRA,
    );
    expect(r.estado === 'ok' && r.valor).toBe(1);
  });

  it('DPA do ano: opcoesDpaDoFy liga o líquido pela versão', () => {
    const f = { dtIni: '2025-01-01', dtFim: '2025-12-31' };
    const opts = opcoesDpaDoFy(f, '2026-10-24', COM_REGRA);
    expect(opts.jcpLiquido).toBe(true);
    const r = dpaNoAno(provs, 2025, 'hoje', [], undefined, opts);
    expect(r.estado === 'ok' && r.valor).toBeCloseTo(0.4 + 0.085, 10);
    expect(opcoesDpaDoFy(f, '2026-10-24', SCORING_PARAMS_V3).jcpLiquido).toBeUndefined();
  });
});
