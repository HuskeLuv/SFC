import { describe, expect, it } from 'vitest';
import {
  fimDoMesAnterior,
  mesesDoPeriodo,
  periodoFiscal,
} from '@/services/analiseAtivos/regras/acoes/periodoFiscal';
import { CNPJ, lerFixture } from '@/services/analiseAtivos/regras/acoes/__tests__/helpers';

describe('periodoFiscal (regra 19)', () => {
  const camil = lerFixture('dre_camil_2026.csv').filter((l) => l.cnpj === CNPJ.CAML3);

  it('recorte real: Camil (CAML3) encerra o exercício em fevereiro (DFP 2026, DT_REFER 2026-02-28)', () => {
    const dfp = camil.find((l) => l.arquivo.startsWith('dfp_'))!;
    expect(dfp.dtFim).toBe('2026-02-28');
    expect(dfp.dtIni).toBe('2025-03-01');
    expect(periodoFiscal(dfp.dtFim, 2)).toEqual({ anoFiscal: 2026, trimestreFiscal: null });
  });

  it('ITRs da Camil em 2025 caem nos trimestres 1–3 do anoFiscal 2026', () => {
    const itr = camil.filter((l) => l.arquivo.startsWith('itr_') && l.dtIni === '2025-03-01');
    const fins = [...new Set(itr.map((l) => l.dtFim))].sort();
    expect(fins).toEqual(['2025-05-31', '2025-08-31', '2025-11-30']);
    expect(fins.map((d) => periodoFiscal(d, 2))).toEqual([
      { anoFiscal: 2026, trimestreFiscal: 1 },
      { anoFiscal: 2026, trimestreFiscal: 2 },
      { anoFiscal: 2026, trimestreFiscal: 3 },
    ]);
  });

  it('dezembro (padrão) e mesFimExercicio ausente ⇒ ano civil', () => {
    expect(periodoFiscal('2026-06-30', 12)).toEqual({ anoFiscal: 2026, trimestreFiscal: 2 });
    expect(periodoFiscal('2025-12-31', null)).toEqual({ anoFiscal: 2025, trimestreFiscal: null });
    expect(periodoFiscal('2026-03-31', 6)).toEqual({ anoFiscal: 2026, trimestreFiscal: 3 });
  });

  it('helpers de datas de trimestre', () => {
    expect(fimDoMesAnterior('2026-06-30', 3)).toBe('2026-03-31');
    expect(fimDoMesAnterior('2026-06-30', 12)).toBe('2025-06-30');
    expect(fimDoMesAnterior('2026-05-31', 3)).toBe('2026-02-28');
    expect(mesesDoPeriodo('2026-04-01', '2026-06-30')).toBe(3);
    expect(mesesDoPeriodo('2025-03-01', '2026-02-28')).toBe(12);
  });
});
