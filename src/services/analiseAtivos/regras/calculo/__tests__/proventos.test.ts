/**
 * Auditoria de proventos (regras 16 e 26 da Fase A; revisão da spec da Fase 0) com linhas reais do
 * asset_dividend_history do dev e os casos de prod descritos nas decisões (PETR4 ex 03/05/2024).
 */
import { describe, expect, it } from 'vitest';
import { verificarEventosCorporativos } from '@/services/analiseAtivos/regras/calculo/eventosCorporativos';
import { menosMeses } from '@/services/analiseAtivos/regras/calculo/proventos';
import {
  auditarProventos,
  dataComReal,
  especieDoTicker,
  dpaNoAno,
  motivoProventosDefasados,
  normalizarTipo,
  planejarReescritaProventos,
  rendimento12m,
  ultimaDataCom,
  valorProventosComCobertura,
} from '@/services/analiseAtivos/regras/calculo/proventos';
import type { EventoCorporativoVerificado } from '@/services/analiseAtivos/tipos';
import { P, bruto, proventosBrutos } from './helpers';

const evento = (
  dataEvento: string,
  fator: number,
  anoBase: number,
): EventoCorporativoVerificado => ({
  symbol: 'MGLU3',
  dataEvento,
  fator,
  tipo: fator > 1 ? 'DESDOBRAMENTO' : 'GRUPAMENTO',
  anoBase,
  status: 'confirmado',
  razaoCvm: null,
  idsOrigem: [],
});

describe('data-com real', () => {
  it('PETR4: data ex gravada 03/05/2024 ⇒ data-com real 02/05/2024 (01/05 é feriado)', () => {
    expect(dataComReal('2024-05-03', 'BRAPI', P)).toBe('2024-05-02');
  });

  it('YAHOO (dataCom null, date = ex 03/05/2024) ⇒ data-com 02/05/2024, sem pagamento, nunca sem_data_com', () => {
    const [a] = auditarProventos(
      [
        bruto({
          id: 'y1',
          symbol: 'PETR4',
          source: 'YAHOO',
          tipo: 'Dividendo',
          valor: 1.4,
          dataExGravada: '2024-05-03',
          dataPagamento: null,
          dataExOrigem: 'date',
        }),
      ],
      [],
      P,
      { classe: 'acao' },
    );
    expect(a.dataComReal).toBe('2024-05-02');
    expect(a.dataPagamento).toBeNull();
    expect(a.status).toBe('valido');
    expect(a.tipoNormalizado).toBe('DIVIDENDO');
  });

  it('linhas YAHOO reais do dev (TGAR11): date vira data ex, nenhuma sem_data_com', () => {
    const brutos = proventosBrutos('TGAR11');
    expect(brutos.length).toBeGreaterThan(10);
    expect(brutos.every((b) => b.dataPagamento === null && b.dataExOrigem === 'date')).toBe(true);
    const aud = auditarProventos(brutos, [], P, { classe: 'fii' });
    expect(aud.every((a) => a.status === 'valido' && a.dataComReal !== null)).toBe(true);
    // 2025-01-02 (ex) ⇒ 2024-12-30 (31/12 não tem pregão)
    expect(aud.find((a) => a.dataExGravada === '2025-01-02')?.dataComReal).toBe('2024-12-30');
  });

  it('sem data ex ⇒ sem_data_com (não usa o pagamento como fallback)', () => {
    const [a] = auditarProventos(
      [bruto({ id: 'x', dataExGravada: null, dataPagamento: '2024-05-20', dataExOrigem: null })],
      [],
      P,
    );
    expect(a.status).toBe('sem_data_com');
    expect(a.dataComReal).toBeNull();
  });
});

describe('tipos', () => {
  it('REST CAP DIN / AMORTIZAÇÃO excluídos; tipo desconhecido ⇒ OUTRO excluído com flag', () => {
    expect(normalizarTipo('REST CAP DIN', P).tipo).toBe('REST_CAP');
    expect(normalizarTipo('AMORTIZAÇÃO', P).tipo).toBe('AMORTIZACAO');
    expect(normalizarTipo('amortizacao', P).tipo).toBe('AMORTIZACAO');
    const aud = auditarProventos(
      [
        bruto({ id: 'a', tipo: 'REST CAP DIN', dataExGravada: '2024-05-03' }),
        bruto({ id: 'b', tipo: 'AMORTIZAÇÃO', dataExGravada: '2024-05-03' }),
        bruto({ id: 'c', tipo: 'BONUS XYZ', dataExGravada: '2024-05-03' }),
      ],
      [],
      P,
    );
    expect(aud.map((a) => a.status)).toEqual(['tipo_excluido', 'tipo_excluido', 'tipo_excluido']);
    expect(aud[2].tipoNormalizado).toBe('OUTRO');
    expect(aud[2].flags).toContain('tipo_desconhecido');
  });

  it('RENDIMENTO só em FII: PETR4 (Selic sobre dividendo) sai; em FII entra', () => {
    const petr = auditarProventos(proventosBrutos('PETR4'), [], P, { classe: 'acao' });
    const rend = petr.filter((a) => a.tipoOriginal === 'RENDIMENTO');
    expect(rend.length).toBeGreaterThan(0);
    expect(rend.every((a) => a.status === 'tipo_excluido')).toBe(true);
    const xpml = auditarProventos(proventosBrutos('XPML11'), [], P, { classe: 'fii' });
    expect(xpml.every((a) => a.status === 'valido')).toBe(true);
  });
});

describe('duplicatas e tranches', () => {
  it('repetição da BRAPI com outra data-com e pagamentos a ≤ 5 dias (2 linhas) ⇒ 1 duplicata', () => {
    const aud = auditarProventos(
      [
        bruto({
          id: 'p1',
          symbol: 'PETR4',
          valor: 0.44806668,
          dataExGravada: '2024-06-12',
          dataPagamento: '2024-09-20',
        }),
        bruto({
          id: 'p2',
          symbol: 'PETR4',
          valor: 0.44806668,
          dataExGravada: '2024-08-22',
          dataPagamento: '2024-09-23',
        }),
      ],
      [],
      P,
      { classe: 'acao' },
    );
    expect(aud.filter((a) => a.status === 'duplicata')).toHaveLength(1);
    expect(aud[1]).toMatchObject({ status: 'duplicata', duplicataDe: 'p1' });
    expect(aud[0].status).toBe('valido');
  });

  it('repetição com o MESMO pagamento (1 linha com valor em dobro) ⇒ flag possivel_soma_duplicada, sem corrigir', () => {
    const aud = auditarProventos(
      [
        bruto({
          id: 'd1',
          symbol: 'PETR4',
          valor: 0.44806668,
          dataExGravada: '2024-06-12',
          dataPagamento: '2024-08-20',
        }),
        bruto({
          id: 'd2',
          symbol: 'PETR4',
          valor: 0.89613336,
          dataExGravada: '2024-08-22',
          dataPagamento: '2024-09-20',
        }),
      ],
      [],
      P,
      { classe: 'acao' },
    );
    expect(aud[1].flags).toContain('possivel_soma_duplicada');
    expect(aud[1].valor).toBe(0.89613336);
    expect(aud.every((a) => a.status === 'valido')).toBe(true);
  });

  it('duas tranches iguais com a mesma data-com e pagamentos a ≥ 20 dias ⇒ ambas válidas', () => {
    const aud = auditarProventos(
      [
        bruto({ id: 't1', valor: 0.7, dataExGravada: '2023-11-22', dataPagamento: '2024-02-20' }),
        bruto({ id: 't2', valor: 0.7, dataExGravada: '2023-11-22', dataPagamento: '2024-03-20' }),
      ],
      [],
      P,
      { classe: 'acao' },
    );
    expect(aud.map((a) => a.status)).toEqual(['valido', 'valido']);
    expect(aud.every((a) => !a.flags.includes('tranche_ambigua'))).toBe(true);
  });

  it('YAHOO descartado quando há BRAPI do símbolo no ano; mantido em ano sem BRAPI', () => {
    const aud = auditarProventos(
      [
        bruto({
          id: 'b',
          source: 'BRAPI',
          valor: 1,
          dataExGravada: '2024-05-03',
          dataPagamento: '2024-05-20',
        }),
        bruto({
          id: 'y',
          source: 'YAHOO',
          tipo: 'Dividendo',
          valor: 1,
          dataExGravada: '2024-05-03',
          dataExOrigem: 'date',
        }),
        bruto({
          id: 'y2',
          source: 'YAHOO',
          tipo: 'Dividendo',
          valor: 1,
          dataExGravada: '2019-05-03',
          dataExOrigem: 'date',
        }),
      ],
      [],
      P,
      { classe: 'acao' },
    );
    expect(aud.map((a) => a.status)).toEqual(['valido', 'fonte_secundaria_descartada', 'valido']);
  });
});

describe('ajuste por evento (MGLU3 2020: proventos antes e depois do 4:1)', () => {
  const eventos = [evento('2020-10-13', 4, 2020), evento('2024-05-24', 0.1, 2024)];

  it('fatorAjusteHoje por evento posterior à data-com', () => {
    const aud = auditarProventos(proventosBrutos('MGLU3'), eventos, P, { classe: 'acao' });
    const julho = aud.find((a) => a.dataComReal === '2020-07-30')!;
    const dezembro = aud.find((a) => a.dataComReal === '2020-12-29')!;
    expect(julho.fatorAjusteHoje).toBeCloseTo(0.4, 10);
    expect(julho.valorAjustadoHoje).toBeCloseTo(0.0941659675 / 0.4, 10);
    expect(dezembro.fatorAjusteHoje).toBeCloseTo(0.1, 10);
    // JCP com data ex 02/01/2020 tem data-com real em 30/12/2019 (31/12 sem pregão): conta em 2019
    expect(
      aud.find((a) => a.tipoNormalizado === 'JCP' && a.dataComReal === '2019-12-30'),
    ).toBeTruthy();
  });

  it('DPA 2020 na base do fim do ano e na base de hoje', () => {
    const aud = auditarProventos(proventosBrutos('MGLU3'), eventos, P, { classe: 'acao' });
    const fim = dpaNoAno(aud, 2020, 'fim_do_ano', eventos);
    const hoje = dpaNoAno(aud, 2020, 'hoje', eventos);
    expect(fim.estado).toBe('ok');
    expect((fim as { valor: number }).valor).toBeCloseTo(0.0941659675 / 4 + 0.0263019985, 9);
    expect((hoje as { valor: number }).valor).toBeCloseTo(
      0.0941659675 / 0.4 + 0.0263019985 / 0.1,
      9,
    );
  });
});

describe('rendimento 12 meses e cobertura', () => {
  it('janela de calendário por data-com (hoje − 12 meses, hoje]', () => {
    expect(menosMeses('2026-06-30', 12)).toBe('2025-06-30');
    expect(menosMeses('2024-02-29', 12)).toBe('2023-02-28');
    const aud = auditarProventos(proventosBrutos('VISC11'), [], P, { classe: 'fii' });
    const r = rendimento12m(aud, '2026-06-30', 'fii', [], P);
    // data-com real (pregão anterior à data ex gravada) de jul/25 a mai/26: 0,81×6 + 0,84×5
    expect((r as { valor: number }).valor).toBeCloseTo(0.81 * 6 + 0.84 * 5, 9);
  });

  it('provento zero × ausente: EMPTY ⇒ ok(0); FETCH_FAIL/GAP_QUEUED/sem registro ⇒ ausente', () => {
    const zero = { estado: 'ok' as const, valor: 0 };
    expect(valorProventosComCobertura(zero, false, 'EMPTY')).toEqual({ estado: 'ok', valor: 0 });
    expect(valorProventosComCobertura(zero, false, 'FETCH_FAIL').estado).toBe('ausente');
    expect(valorProventosComCobertura(zero, false, 'GAP_QUEUED').estado).toBe('ausente');
    expect(valorProventosComCobertura(zero, false, null).estado).toBe('ausente');
    expect(valorProventosComCobertura(zero, true, null)).toEqual(zero);
  });
});

describe('reescrita por símbolo (auditoria completa, sem órfão)', () => {
  it('linha Yahoo reinserida com id novo ⇒ reescreve o símbolo; símbolo fora do universo ⇒ órfão', () => {
    const antigo = auditarProventos(
      [
        bruto({
          id: 'y-old',
          symbol: 'TGAR11',
          source: 'YAHOO',
          tipo: 'Dividendo',
          dataExGravada: '2025-01-02',
          dataExOrigem: 'date',
        }),
      ],
      [],
      P,
      { classe: 'fii' },
    );
    const novo = auditarProventos(
      [
        bruto({
          id: 'y-new',
          symbol: 'TGAR11',
          source: 'YAHOO',
          tipo: 'Dividendo',
          dataExGravada: '2025-01-02',
          dataExOrigem: 'date',
        }),
      ],
      [],
      P,
      { classe: 'fii' },
    );
    const outro = auditarProventos(proventosBrutos('VISC11'), [], P, { classe: 'fii' });
    const sumiu = { ...antigo[0], symbol: 'OLD11', origemId: 'z' };
    const plano = planejarReescritaProventos(
      [...novo, ...outro],
      [...antigo, ...outro, sumiu],
      ['TGAR11', 'VISC11'],
    );
    expect(plano.reescrever).toEqual(['TGAR11']);
    expect(plano.orfaos).toEqual(['OLD11']);
  });

  it('nada mudou ⇒ nada a reescrever (2ª execução idempotente)', () => {
    const a = auditarProventos(proventosBrutos('XPML11'), [], P, { classe: 'fii' });
    const b = auditarProventos(proventosBrutos('XPML11'), [], P, { classe: 'fii' });
    expect(planejarReescritaProventos(a, b, ['XPML11'])).toEqual({ reescrever: [], orfaos: [] });
  });
});

describe('provento com data-com = data-com do evento (achado qa-codigo 30/09)', () => {
  it('VBBR3 nov/2025: dividendo de data-com 25/11 (ações antigas) é ajustado pela bonificação ×1,071', () => {
    const evs = verificarEventosCorporativos(
      [
        {
          id: 'b',
          symbol: 'VBBR3',
          date: '2025-11-25',
          type: 'BONIFICACAO',
          factor: 1.071,
          source: 'BRAPI',
        },
        {
          id: 'y',
          symbol: 'VBBR3',
          date: '2025-11-26',
          type: 'DESDOBRAMENTO',
          factor: 1.0711,
          source: 'YAHOO',
        },
      ],
      [
        {
          cnpj: 'X',
          data: '2024-12-31',
          on: null,
          pn: null,
          total: 1_000_000,
          fonte: 'dfp',
          razaoLpa: 1,
          status: 'ok',
        },
        {
          cnpj: 'X',
          data: '2025-12-31',
          on: null,
          pn: null,
          total: 1_071_000,
          fonte: 'dfp',
          razaoLpa: 1,
          status: 'ok',
        },
      ],
      P,
    );
    const [a] = auditarProventos(
      [
        {
          id: '6812af98',
          symbol: 'VBBR3',
          source: 'BRAPI',
          tipo: 'DIVIDENDO',
          valor: 0.76344892045,
          dataPagamento: '2025-12-19',
          dataExGravada: '2025-11-26',
          dataExOrigem: 'dataCom',
        },
      ],
      evs,
      P,
      { classe: 'acao' },
    );
    expect(a.dataComReal).toBe('2025-11-25');
    // antes: 1 (evento datado na data-com da BRAPI e comparação estrita)
    expect(a.fatorAjusteHoje).toBeCloseTo(1.071, 6);
  });
});

describe('frescor da base de proventos (achado qa-dados 30/09)', () => {
  const pr = (dataComReal: string, tipoNormalizado: 'RENDIMENTO' | 'DIVIDENDO' = 'RENDIMENTO') => ({
    status: 'valido' as const,
    tipoNormalizado,
    dataComReal,
  });
  // HGLG11 no dev: rendimento mensal até a data-com de 28/05/2026 (base parada desde jun/2026)
  const hglg = [
    '2025-06-30',
    '2025-07-31',
    '2025-08-29',
    '2025-09-30',
    '2025-10-31',
    '2025-11-28',
    '2025-12-30',
    '2026-01-30',
    '2026-02-27',
    '2026-03-31',
    '2026-04-30',
    '2026-05-28',
  ].map((d) => pr(d));

  it('base da classe parada (última data-com de jun/2026 com hoje 29/09) ⇒ base_parada', () => {
    expect(
      motivoProventosDefasados(
        {
          classe: 'fii',
          proventos: hglg,
          verificadoEm: '2026-09-28',
          ultimaDataComDaClasse: '2026-06-10',
          hoje: '2026-09-29',
        },
        P,
      ),
    ).toBe('base_parada');
  });

  it('cobertura verificada há mais de 45 dias (FII) ⇒ cobertura_antiga; ação tolera 200', () => {
    const e = {
      proventos: [],
      verificadoEm: '2026-06-10',
      ultimaDataComDaClasse: '2026-09-26',
      hoje: '2026-09-29',
    };
    expect(motivoProventosDefasados({ ...e, classe: 'fii' }, P)).toBe('cobertura_antiga');
    expect(motivoProventosDefasados({ ...e, classe: 'acao' }, P)).toBeNull();
  });

  it('HGLG11: pagador mensal sem rendimento há 4 meses com a base viva ⇒ pagador_recorrente_parado', () => {
    expect(
      motivoProventosDefasados(
        {
          classe: 'fii',
          proventos: hglg,
          verificadoEm: '2026-09-28',
          ultimaDataComDaClasse: '2026-09-26',
          hoje: '2026-09-29',
        },
        P,
      ),
    ).toBe('pagador_recorrente_parado');
  });

  it('BBSE3: semestral com a última data-com em 11/02/2026 (231 dias) ⇒ defasado; anual não', () => {
    const base = {
      verificadoEm: '2026-09-28',
      ultimaDataComDaClasse: '2026-09-26',
      hoje: '2026-09-29',
    };
    const semestral = [pr('2025-08-12', 'DIVIDENDO'), pr('2026-02-11', 'DIVIDENDO')];
    expect(motivoProventosDefasados({ ...base, classe: 'acao', proventos: semestral }, P)).toBe(
      'pagador_recorrente_parado',
    );
    const anual = [pr('2025-02-11', 'DIVIDENDO'), pr('2026-02-11', 'DIVIDENDO')];
    expect(motivoProventosDefasados({ ...base, classe: 'acao', proventos: anual }, P)).toBeNull();
  });

  describe('rodada 3 (02/10/2026): prazo pela cadência do pagador e parcela agendada', () => {
    const base = {
      classe: 'acao' as const,
      verificadoEm: '2026-09-28',
      ultimaDataComDaClasse: '2026-10-01',
      hoje: '2026-09-29',
    };
    const prPag = (dataComReal: string, dataPagamento: string) => ({
      ...pr(dataComReal, 'DIVIDENDO'),
      dataPagamento,
    });

    it('KLBN11: dividendo de 2026 declarado em 15/12/2025 em 4 parcelas (fev–nov/2026) ⇒ não parado', () => {
      const klbn = [
        prPag('2025-03-05', '2025-03-14'),
        prPag('2025-05-13', '2025-05-22'),
        prPag('2025-08-08', '2025-08-19'),
        prPag('2025-11-07', '2025-11-19'),
        prPag('2025-12-15', '2026-02-27'),
        prPag('2025-12-15', '2026-05-20'),
        prPag('2025-12-15', '2026-08-19'),
        prPag('2025-12-15', '2026-11-12'),
      ];
      expect(motivoProventosDefasados({ ...base, proventos: klbn }, P)).toBeNull();
      // só com as parcelas já pagas antes de hoje − 200 dias (fonte sem as de mai/ago/nov) ⇒ parado
      expect(motivoProventosDefasados({ ...base, proventos: klbn.slice(0, 5) }, P)).toBe(
        'pagador_recorrente_parado',
      );
    });

    it('pagamento "a definir" (9999-12-31) ou 3+ anos após a data-com não conta como fonte viva', () => {
      const trimestral = [
        prPag('2025-03-05', '2025-03-14'),
        prPag('2025-06-05', '2025-06-14'),
        prPag('2025-09-05', '2025-09-14'),
        prPag('2025-12-05', '9999-12-31'),
      ];
      expect(motivoProventosDefasados({ ...base, proventos: trimestral }, P)).toBe(
        'pagador_recorrente_parado',
      );
    });

    it('CYRE3: anual/semestral que antecipou em dez/2025 ⇒ prazo = maior intervalo × 1,25', () => {
      // intervalos de até 365 dias nos 36 meses anteriores ⇒ prazo 456 dias; 294 dias sem data-com
      const cyre = ['2023-05-02', '2023-12-11', '2024-04-25', '2025-04-25', '2025-12-09'].map((d) =>
        prPag(d, d.slice(0, 8) + '28'),
      );
      expect(motivoProventosDefasados({ ...base, proventos: cyre }, P)).toBeNull();
      // a regra antiga (só maxDias = 200) marcava; no prazo esperado vencido volta a marcar
      expect(
        motivoProventosDefasados(
          {
            ...base,
            hoje: '2027-03-15',
            verificadoEm: '2027-03-14',
            ultimaDataComDaClasse: '2027-03-12',
            proventos: cyre,
          },
          P,
        ),
      ).toBe('pagador_recorrente_parado');
    });

    it('DASA3: anual sem provento desde dez/2022 ⇒ parou de pagar (DY 0), não defasada', () => {
      const dasa = ['2019-12-30', '2021-01-12', '2021-12-27', '2022-12-26'].map((d) =>
        prPag(d, d.slice(0, 4) + '-12-31'),
      );
      expect(motivoProventosDefasados({ ...base, proventos: dasa }, P)).toBeNull();
    });

    it('GSFI11: rendimento declarado com data-com depois de hoje e pagamento em out/2026 ⇒ fonte viva', () => {
      const gsfi = [
        ...['2025-06-01', '2025-07-01', '2025-08-01', '2025-09-01', '2025-10-01', '2025-11-03'].map(
          (d) => ({ ...pr(d), dataPagamento: d.slice(0, 8) + '15' }),
        ),
        { ...pr('2026-09-30'), dataPagamento: '2026-10-15' },
      ];
      const fii = { ...base, classe: 'fii' as const };
      expect(motivoProventosDefasados({ ...fii, proventos: gsfi }, P)).toBeNull();
      expect(motivoProventosDefasados({ ...fii, proventos: gsfi.slice(0, 6) }, P)).toBe(
        'pagador_recorrente_parado',
      );
    });

    it('TGMA3 com a base sem a data-com de ago/2026: trimestral parado há 301 dias ⇒ parado', () => {
      const tgma = [
        '2024-08-08',
        '2024-11-07',
        '2025-04-09',
        '2025-08-07',
        '2025-11-06',
        '2025-12-02',
      ].map((d) => prPag(d, d.slice(0, 8) + '21'));
      expect(motivoProventosDefasados({ ...base, proventos: tgma }, P)).toBe(
        'pagador_recorrente_parado',
      );
    });
  });

  it('base fresca e pagador em dia ⇒ null; ultimaDataCom ignora data futura e inválidos', () => {
    const emDia = [...hglg, pr('2026-06-30'), pr('2026-07-31'), pr('2026-08-31')];
    expect(
      motivoProventosDefasados(
        {
          classe: 'fii',
          proventos: emDia,
          verificadoEm: '2026-09-28',
          ultimaDataComDaClasse: '2026-09-26',
          hoje: '2026-09-29',
        },
        P,
      ),
    ).toBeNull();
    expect(
      ultimaDataCom(
        [pr('2026-08-31'), pr('2026-10-30'), { status: 'descartado', dataComReal: '2026-09-15' }],
        '2026-09-29',
      ),
    ).toBe('2026-08-31');
  });
});

describe('repetições da fonte com a mesma data-com (diagnóstico DY absurdo 02/10/2026)', () => {
  // BRAPI: dataExGravada vem de dataCom; "sem pagamento" = data de pagamento = data gravada
  const linha = (
    id: string,
    symbol: string,
    valor: number,
    pag: string,
    ex: string,
    tipo = 'DIVIDENDO',
  ) => bruto({ id, symbol, tipo, valor, dataPagamento: pag, dataExGravada: ex });

  it('KEPL3: parcela repetida sem pagamento, mesmo valor ⇒ duplicata; DY 12m conta uma vez', () => {
    const aud = auditarProventos(
      [
        linha('a', 'KEPL3', 0.144232, '2025-12-15', '2025-12-15'),
        linha('b', 'KEPL3', 0.144232, '2025-12-26', '2025-12-15'),
      ],
      [],
      P,
      { classe: 'acao' },
    );
    const a = aud.find((x) => x.origemId === 'a')!;
    expect(a.status).toBe('duplicata');
    expect(a.duplicataDe).toBe('b');
    expect(a.flags).toContain('duplicata_sem_pagamento');
    expect(aud.find((x) => x.origemId === 'b')!.status).toBe('valido');
    expect(rendimento12m(aud, '2026-09-29', 'acao', [], P)).toEqual({
      estado: 'ok',
      valor: 0.144232,
    });
  });

  it('linha sem pagamento gravada 1 dia antes (legado com fuso) também é sem pagamento', () => {
    const aud = auditarProventos(
      [
        linha('a', 'ABEV3', 0.13, '2014-04-02', '2014-04-02'),
        linha('b', 'ABEV3', 0.13, '2014-04-25', '2014-04-02'),
        linha('c', 'XPTO3', 0.5, '2012-04-28', '2012-04-29'),
        linha('d', 'XPTO3', 0.5, '2012-05-20', '2012-04-29'),
      ],
      [],
      P,
      { classe: 'acao' },
    );
    expect(aud.filter((x) => x.status === 'duplicata').map((x) => x.origemId)).toEqual(['a', 'c']);
  });

  it('CEBR5 (PN): valor da ON (÷1,1) misturado no ticker ⇒ fica o maior; ON fica o menor', () => {
    const pn = auditarProventos(
      [
        linha('s', 'CEBR5', 1.832319, '2025-09-09', '2025-09-09'),
        linha('p', 'CEBR5', 1.6657445, '2025-09-17', '2025-09-09'),
      ],
      [],
      P,
      { classe: 'acao' },
    );
    const sai = pn.find((x) => x.origemId === 'p')!;
    expect(sai).toMatchObject({ status: 'duplicata', duplicataDe: 's' });
    expect(sai.flags).toContain('duplicata_classe_irma');
    expect(pn.find((x) => x.origemId === 's')!.status).toBe('valido');

    const on = auditarProventos(
      [
        linha('s', 'CEBR3', 1.832319, '2025-09-09', '2025-09-09'),
        linha('p', 'CEBR3', 1.6657445, '2025-09-17', '2025-09-09'),
      ],
      [],
      P,
      { classe: 'acao' },
    );
    expect(on.find((x) => x.origemId === 's')!.status).toBe('duplicata');
    expect(on.find((x) => x.origemId === 'p')!.status).toBe('valido');
  });

  it('FII não usa o prêmio das PN; valores diferentes e parcelas pagas não são tocados', () => {
    const fii = auditarProventos(
      [
        linha('s', 'XPTO11', 1.1, '2025-09-09', '2025-09-09', 'RENDIMENTO'),
        linha('p', 'XPTO11', 1.0, '2025-09-17', '2025-09-09', 'RENDIMENTO'),
      ],
      [],
      P,
      { classe: 'fii' },
    );
    expect(fii.every((x) => x.status === 'valido')).toBe(true);
    // HBRE3 dez/2025: 1,165 sem pagamento + 0,486 pago (complemento real: o preço caiu ~1,16 no ex)
    const hbre = auditarProventos(
      [
        linha('s', 'HBRE3', 1.16542866, '2025-12-30', '2025-12-30'),
        linha('p', 'HBRE3', 0.485595, '2026-04-10', '2025-12-30'),
      ],
      [],
      P,
      { classe: 'acao' },
    );
    expect(hbre.every((x) => x.status === 'valido')).toBe(true);
    // duas linhas COM pagamento e mesmo valor (parcelas declaradas em dez/2025) seguem válidas
    const parcelas = auditarProventos(
      [
        linha('a', 'WEGE3', 0.412832, '2026-08-12', '2025-12-22'),
        linha('b', 'WEGE3', 0.412832, '2027-08-11', '2025-12-22'),
      ],
      [],
      P,
      { classe: 'acao' },
    );
    expect(parcelas.every((x) => x.status === 'valido')).toBe(true);
  });

  it('MELK3: DIVIDENDO que repete uma REST CAP DIN ⇒ tipo_excluido, fora do DY', () => {
    const aud = auditarProventos(
      [
        linha('r', 'MELK3', 0.7343145, '2025-03-18', '2025-03-18', 'REST CAP DIN'),
        linha('d', 'MELK3', 0.734315, '2025-03-28', '2025-03-18'),
        linha('o', 'MELK3', 0.2, '2025-08-28', '2025-08-18'),
      ],
      [],
      P,
      { classe: 'acao' },
    );
    const copia = aud.find((x) => x.origemId === 'd')!;
    expect(copia).toMatchObject({ status: 'tipo_excluido', duplicataDe: 'r' });
    expect(copia.flags).toContain('copia_de_restituicao');
    expect(aud.find((x) => x.origemId === 'o')!.status).toBe('valido');
    expect(rendimento12m(aud, '2025-12-31', 'acao', [], P)).toEqual({ estado: 'ok', valor: 0.2 });
  });

  it('amortização de FII sai do rendimento, e a cópia dela como RENDIMENTO também', () => {
    const aud = auditarProventos(
      [
        linha('a', 'RBIR11', 0.458, '2023-09-15', '2023-08-31', 'AMORTIZAÇÃO'),
        linha('r', 'RBIR11', 0.458, '2023-09-15', '2023-08-31', 'RENDIMENTO'),
        linha('x', 'RBIR11', 0.9, '2023-10-15', '2023-09-29', 'RENDIMENTO'),
      ],
      [],
      P,
      { classe: 'fii' },
    );
    expect(aud.find((x) => x.origemId === 'a')!.status).toBe('tipo_excluido');
    expect(aud.find((x) => x.origemId === 'r')!.status).toBe('tipo_excluido');
    expect(rendimento12m(aud, '2023-12-31', 'fii', [], P)).toEqual({ estado: 'ok', valor: 0.9 });
  });

  describe('data-com deslocada 1 pregão (conferência em prod 02/10/2026)', () => {
    it('CPFE3: 3,7315 pago (data-com 28/04) × 3,7315 sem pagamento (data-com 29/04) ⇒ só a sem pagamento sai; o cronograma real de 29/04 fica', () => {
      const aud = auditarProventos(
        [
          linha('pago', 'CPFE3', 3.7315361, '2026-12-31', '2026-04-29'),
          linha('rep', 'CPFE3', 3.7315361, '2026-04-29', '2026-04-30'),
          // mesma declaração, parcelas com pagamentos distintos (cronograma real): não mexer
          linha('p1', 'CPFE3', 1.128223, '2026-05-18', '2026-04-30'),
          linha('p2', 'CPFE3', 0.130179, '2026-06-18', '2026-04-30'),
          linha('p3', 'CPFE3', 0.217, '2026-08-18', '2026-04-30'),
          linha('p4', 'CPFE3', 0.6075, '2026-10-19', '2026-04-30'),
        ],
        [],
        P,
        { classe: 'acao' },
      );
      const rep = aud.find((x) => x.origemId === 'rep')!;
      expect(rep.dataComReal).toBe('2026-04-29');
      expect(rep).toMatchObject({ status: 'duplicata', duplicataDe: 'pago' });
      expect(rep.flags).toContain('duplicata_sem_pagamento');
      expect(aud.filter((x) => x.status === 'valido').map((x) => x.origemId)).toEqual([
        'pago',
        'p1',
        'p2',
        'p3',
        'p4',
      ]);
    });

    it('CEEB5: DIVIDENDO 4,2018 pago (28/10) × 4,2554 sem pagamento (29/10, +1,3%) ⇒ duplicata', () => {
      const aud = auditarProventos(
        [
          linha('pago', 'CEEB5', 4.20177845, '2025-12-05', '2025-10-29'),
          linha('rep', 'CEEB5', 4.25543, '2025-10-29', '2025-10-30'),
        ],
        [],
        P,
        { classe: 'acao' },
      );
      const rep = aud.find((x) => x.origemId === 'rep')!;
      expect(rep).toMatchObject({ status: 'duplicata', duplicataDe: 'pago' });
      expect(rep.flags).toContain('duplicata_sem_pagamento');
      expect(aud.find((x) => x.origemId === 'pago')!.status).toBe('valido');
    });

    it('CEEB5 (PN): JCP 0,5737 sem pagamento × 0,5215 pago 1 pregão depois (razão 1,10) ⇒ fica o da PN', () => {
      const aud = auditarProventos(
        [
          linha('sp', 'CEEB5', 0.57366943, '2025-10-02', '2025-10-02', 'JCP'),
          linha('pg', 'CEEB5', 0.5215177, '2025-12-31', '2025-10-03', 'JCP'),
        ],
        [],
        P,
        { classe: 'acao' },
      );
      const sai = aud.find((x) => x.origemId === 'pg')!;
      expect(sai).toMatchObject({ status: 'duplicata', duplicataDe: 'sp' });
      expect(sai.flags).toContain('duplicata_classe_irma');
      expect(aud.find((x) => x.origemId === 'sp')!.status).toBe('valido');
    });

    it('sexta × segunda é 1 pregão; 2 pregões de distância NÃO é repetição', () => {
      const fimDeSemana = auditarProventos(
        [
          linha('pago', 'XPTO3', 1, '2025-12-10', '2025-09-29'), // data-com sex 26/09
          linha('rep', 'XPTO3', 1, '2025-09-30', '2025-09-30'), // data-com seg 29/09
        ],
        [],
        P,
        { classe: 'acao' },
      );
      expect(fimDeSemana.find((x) => x.origemId === 'rep')!.status).toBe('duplicata');
      const longe = auditarProventos(
        [
          linha('pago', 'XPTO3', 1, '2025-12-10', '2025-10-01'), // data-com 30/09
          linha('rep', 'XPTO3', 1, '2025-10-03', '2025-10-03'), // data-com 02/10
        ],
        [],
        P,
        { classe: 'acao' },
      );
      expect(longe.every((x) => x.status === 'valido')).toBe(true);
    });

    it('pregoesDataCom = 0 volta a exigir a mesma data-com', () => {
      const p0 = structuredClone(P);
      p0.sanidade.proventos.duplicataSemPagamento.pregoesDataCom = 0;
      const aud = auditarProventos(
        [
          linha('pago', 'CPFE3', 3.7315361, '2026-12-31', '2026-04-29'),
          linha('rep', 'CPFE3', 3.7315361, '2026-04-29', '2026-04-30'),
        ],
        [],
        p0,
        { classe: 'acao' },
      );
      expect(aud.every((x) => x.status === 'valido')).toBe(true);
    });
  });

  it('especieDoTicker: 3 = ON, 4–8 = PN, units e o resto = outra', () => {
    expect(especieDoTicker('CEBR3')).toBe('ON');
    expect(especieDoTicker('CEBR5')).toBe('PN');
    expect(especieDoTicker('ITUB4')).toBe('PN');
    expect(especieDoTicker('TAEE11')).toBe('outra');
    expect(especieDoTicker('XYZ')).toBe('outra');
  });
});
