import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  estimarDataResultado,
  periodoRef,
  proximoPeriodoEsperado,
  rotuloPeriodo,
  somarUmAno,
  subtipoResultado,
} from '@/services/analiseAtivos/regras/eventos/estimativaResultado';
import type { EntregaDocumento } from '@/services/analiseAtivos/tipos';

const WEG = '84429695000111';

/**
 * Entregas reais da WEG (índices itr/dfp_cia_aberta_2024–2026.csv da CVM): DT_RECEB da versão 1 de
 * cada documento — o mesmo que repositorio.acoes.entregasDocumentos devolve (menor DT_RECEB).
 */
function entregasWeg(): EntregaDocumento[] {
  const linhas = readFileSync(path.join(__dirname, 'fixtures/entregas_itr_dfp_wege3.csv'), 'latin1')
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(1);
  return linhas.map((l) => {
    const c = l.split(';');
    const dtFim = c[2];
    const docTipo = c[6] as 'ITR' | 'DFP';
    return {
      cnpj: c[1].replace(/\D/g, ''),
      docTipo,
      dtFim,
      anoFiscal: Number(dtFim.slice(0, 4)),
      trimestreFiscal: docTipo === 'ITR' ? Math.ceil(Number(dtFim.slice(5, 7)) / 3) : null,
      dtEntregaOriginal: c[8],
    };
  });
}

describe('estimarDataResultado', () => {
  it('WEGE3 2T25 entregue em 23/07/2025 ⇒ 2T26 estimado em 23/07/2026 (real 22/07/2026: erro de 1 dia)', () => {
    const entregas = entregasWeg().filter(
      (e) => !(e.anoFiscal === 2026 && e.trimestreFiscal === 2),
    );
    const est = estimarDataResultado(
      entregas,
      { cnpj: WEG, docTipo: 'ITR', anoFiscal: 2026, trimestreFiscal: 2 },
      '2026-07-01',
    );
    expect(est).toEqual({
      data: '2026-07-23',
      estimado: true,
      base: 'ITR 2T25 entregue em 2025-07-23',
      atrasado: false,
    });
    const real = entregasWeg().find((e) => e.anoFiscal === 2026 && e.trimestreFiscal === 2)!;
    expect(real.dtEntregaOriginal).toBe('2026-07-22');
    const erroDias = (Date.parse(est!.data) - Date.parse(real.dtEntregaOriginal)) / 86_400_000;
    expect(erroDias).toBe(1);
  });

  it('DFP: WEG FY24 entregue em 26/02/2025 ⇒ FY25 estimado em 26/02/2026 (real 25/02/2026)', () => {
    const est = estimarDataResultado(
      entregasWeg().filter((e) => !(e.docTipo === 'DFP' && e.anoFiscal === 2025)),
      { cnpj: WEG, docTipo: 'DFP', anoFiscal: 2025, trimestreFiscal: null },
      '2026-01-10',
    );
    expect(est?.data).toBe('2026-02-26');
  });

  it('aniversário em sábado/feriado ⇒ próximo pregão', () => {
    const base = (dt: string): EntregaDocumento[] => [
      {
        cnpj: WEG,
        docTipo: 'ITR',
        dtFim: '2025-09-30',
        anoFiscal: 2025,
        trimestreFiscal: 3,
        dtEntregaOriginal: dt,
      },
    ];
    const alvo = { cnpj: WEG, docTipo: 'ITR' as const, anoFiscal: 2026, trimestreFiscal: 3 };
    // 07/11/2025 (sex) + 1 ano = 07/11/2026 (sábado) ⇒ segunda 09/11/2026
    expect(estimarDataResultado(base('2025-11-07'), alvo, '2026-09-30')?.data).toBe('2026-11-09');
    // 20/11/2025 + 1 ano = 20/11/2026 (sexta, Consciência Negra — feriado B3) ⇒ 23/11/2026
    expect(estimarDataResultado(base('2025-11-20'), alvo, '2026-09-30')?.data).toBe('2026-11-23');
  });

  it('sem entrega do mesmo período no ano anterior ⇒ sem estimativa (null)', () => {
    expect(
      estimarDataResultado(
        entregasWeg(),
        { cnpj: WEG, docTipo: 'ITR', anoFiscal: 2025, trimestreFiscal: 1 },
        '2026-09-30',
      ),
    ).not.toBeNull();
    expect(
      estimarDataResultado(
        entregasWeg(),
        { cnpj: WEG, docTipo: 'ITR', anoFiscal: 2024, trimestreFiscal: 1 },
        '2026-09-30',
      ),
    ).toBeNull();
    expect(
      estimarDataResultado(
        [],
        { cnpj: WEG, docTipo: 'DFP', anoFiscal: 2026, trimestreFiscal: null },
        '2026-09-30',
      ),
    ).toBeNull();
  });

  it('estimativa vencida sem entrega ⇒ atrasado=true', () => {
    const est = estimarDataResultado(
      entregasWeg().filter((e) => !(e.anoFiscal === 2026 && e.trimestreFiscal === 2)),
      { cnpj: WEG, docTipo: 'ITR', anoFiscal: 2026, trimestreFiscal: 2 },
      '2026-08-01',
    );
    expect(est?.atrasado).toBe(true);
  });
});

describe('proximoPeriodoEsperado', () => {
  it('WEG em 30/09/2026: 3T26 (22/10/2026), FY26, 1T27 e 2T27, em ordem de data', () => {
    const entregas = entregasWeg();
    const alvos = proximoPeriodoEsperado(entregas, WEG, '2026-09-30');
    expect(alvos.map((a) => rotuloPeriodo(a))).toEqual(['3T26', 'FY26', '1T27', '2T27']);
    const datas = alvos.map(
      (a) => estimarDataResultado(entregas, { cnpj: WEG, ...a }, '2026-09-30')!.data,
    );
    expect(datas).toEqual(['2026-10-22', '2027-02-25', '2027-04-29', '2027-07-22']);
  });

  it('emissor sem entregas ⇒ []; estimativa vencida há mais de 45 dias some', () => {
    expect(proximoPeriodoEsperado(entregasWeg(), '00000000000191', '2026-09-30')).toEqual([]);
    const soAntigas = entregasWeg().filter((e) => e.anoFiscal === 2024);
    // último ITR 3T24 ⇒ 3T25 estimado em 30/10/2025: vencido há ~11 meses em 30/09/2026
    expect(proximoPeriodoEsperado(soAntigas, WEG, '2026-09-30')).toEqual([]);
  });
});

describe('rótulos e chaves', () => {
  it('periodoRef / subtipo / rótulo', () => {
    const itr = { docTipo: 'ITR' as const, anoFiscal: 2026, trimestreFiscal: 3 };
    const dfp = { docTipo: 'DFP' as const, anoFiscal: 2026, trimestreFiscal: null };
    expect([periodoRef(itr), subtipoResultado(itr), rotuloPeriodo(itr)]).toEqual([
      '2026-3T',
      'ITR3',
      '3T26',
    ]);
    expect([periodoRef(dfp), subtipoResultado(dfp), rotuloPeriodo(dfp)]).toEqual([
      '2026-FY',
      'DFP',
      'FY26',
    ]);
  });

  it('somarUmAno: 29/02 ⇒ 28/02', () => {
    expect(somarUmAno('2024-02-29')).toBe('2025-02-28');
    expect(somarUmAno('2025-07-23')).toBe('2026-07-23');
  });
});
