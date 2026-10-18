/**
 * Eventos corporativos — casos reais do backtest de 18/10/2026 (itens A3 e A6 do relatório).
 * Fixture = linhas de produção (somente leitura): asset_corporate_actions, fii_monthly,
 * asset_quotes_daily, asset_proventos_auditados e asset_share_counts.
 */
import { describe, expect, it } from 'vitest';
import { SCORING_PARAMS_V2 } from '@/services/analiseAtivos/params/scoringParamsV2';
import {
  dataExPelaCotacao,
  dataPeloSaltoDoRendimento,
  FONTE_COTACAO,
  FONTE_RENDIMENTO,
  verificarEventosCorporativos,
} from '@/services/analiseAtivos/regras/calculo/eventosCorporativos';
import { fatorCotasApos } from '@/services/analiseAtivos/regras/calculo/fatorCotas';
import { dpaNoAno, type ProventoParaSoma } from '@/services/analiseAtivos/regras/calculo/proventos';
import type { ContagemAcoes, EventoCorporativoBruto } from '@/services/analiseAtivos/tipos';
import fixture from './fixtures/backtest-out2026-eventos.json';

const P = SCORING_PARAMS_V2;

type CasoFii = (typeof fixture.fii)['ALZR11'];
type CasoAcao = (typeof fixture.acoes)['ORVR3'];

function fii(c: CasoFii, opts: { semPregoes?: boolean; semProventos?: boolean } = {}) {
  return verificarEventosCorporativos(
    c.brutos as EventoCorporativoBruto[],
    [],
    P,
    c.meses,
    c.symbol,
    {
      pregoes: opts.semPregoes ? [] : c.pregoes,
      proventos: opts.semProventos
        ? []
        : c.proventos.map((p) => ({ dataCom: p.dataComReal, valor: p.valor })),
    },
  );
}

/** Rendimento por cota do ano na base de hoje, como sai nos critérios (perShare ÷ fatorCotasApos). */
function rendimentoCriterios(c: CasoFii, ano: number, eventos: ReturnType<typeof fii>): number {
  const desd = c.meses
    .filter((m) => (m.fatorDesdobramento ?? 0) > 1)
    .map((m) => ({ refMonth: m.refMonth, fator: m.fatorDesdobramento as number }));
  const v = dpaNoAno(c.proventos as ProventoParaSoma[], ano, 'fim_do_ano', eventos, [
    'RENDIMENTO',
    'DIVIDENDO',
  ]);
  if (v.estado !== 'ok') throw new Error('rendimento ausente');
  return v.valor / fatorCotasApos(`${ano}-12-31`, desd);
}

function acao(c: CasoAcao, opts: { semPregoes?: boolean } = {}) {
  return verificarEventosCorporativos(
    c.brutos as EventoCorporativoBruto[],
    c.contagens as ContagemAcoes[],
    P,
    undefined,
    c.ticker.symbol,
    { pregoes: opts.semPregoes ? [] : c.pregoes },
  );
}

describe('A3 — FII: desdobramento datado pela data ex real, não pelo mês do informe', () => {
  it('ALZR11 1:10: informe de abril já com as cotas ×10 confirma o evento bruto de 06/05/2025', () => {
    const c = fixture.fii.ALZR11;
    const evs = fii(c);
    // antes: 2025-04-01 ×10 confirmado (cvm_cotas) + 2025-05-06 ×10 descartado
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({
      dataEvento: '2025-05-06',
      fator: 10,
      status: 'confirmado',
      anoBase: 2025,
    });
    expect(evs[0].razaoCvm).toBeCloseTo(10, 4);
    // rendimento por cota de 2025 nos critérios: 1,73 (abril sem ÷10) → ~1,00
    const antes = [{ ...evs[0], dataEvento: '2025-04-01' }];
    expect(rendimentoCriterios(c, 2025, antes)).toBeCloseTo(1.7307, 3);
    expect(rendimentoCriterios(c, 2025, evs)).toBeCloseTo(0.9968, 3);
  });

  it('EQIR11 1:10 (informe de set/2022): data ex 29/09/2022 pelo salto da cotação 92,88 → 9,79', () => {
    const c = fixture.fii.EQIR11;
    const evs = fii(c);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ dataEvento: '2022-09-29', status: 'confirmado', anoBase: 2022 });
    expect(evs[0].fontes).toEqual(['cvm_cotas', FONTE_COTACAO]);
    expect(rendimentoCriterios(c, 2022, evs)).toBeCloseTo(1.3174, 3);
    // sem cotação nem rendimento: o 1º dia do mês do informe, como antes (2,31 em 2022)
    const semFonte = fii(c, { semPregoes: true, semProventos: true });
    expect(semFonte[0]).toMatchObject({ dataEvento: '2022-09-01', fontes: ['cvm_cotas'] });
    expect(rendimentoCriterios(c, 2022, semFonte)).toBeCloseTo(2.3074, 3);
  });

  it('TSNC11 1:60 sem cotação (antes de listar): data pelo salto do rendimento 37,56 → 0,626', () => {
    const c = fixture.fii.TSNC11;
    const evs = fii(c);
    expect(evs).toHaveLength(1);
    // o de 15/07/2022 ainda é da base antiga ⇒ evento no dia seguinte
    expect(evs[0]).toMatchObject({ dataEvento: '2022-07-16', anoBase: 2022, status: 'confirmado' });
    expect(evs[0].fontes).toEqual(['cvm_cotas', FONTE_RENDIMENTO]);
    expect(rendimentoCriterios(c, 2022, evs)).toBeCloseTo(7.5115, 3);
  });

  it('MCRE11: ex 16/12/2023 com cotas ×10 só no informe de jan/2024 ⇒ anoBase 2024 (sem ÷10 duplo)', () => {
    const c = fixture.fii.MCRE11;
    const evs = fii(c);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ dataEvento: '2023-12-16', anoBase: 2024 });
  });

  it('BTYU11 grupamento ×0,01: informe de ago/2026 adiantado confirma o bruto de 01/09/2026', () => {
    const c = fixture.fii.BTYU11;
    const evs = fii(c);
    expect(evs).toHaveLength(1);
    // antes: 'descartado' — o rendimento antigo (0,09/cota) não era levado à base nova (×100)
    expect(evs[0]).toMatchObject({ dataEvento: '2026-09-01', fator: 0.01, status: 'confirmado' });
  });

  it('dataExPelaCotacao: fator pequeno (bonificação 10%) não é datado pela cotação', () => {
    const serie = [
      { date: '2026-01-02', closeRaw: 10 },
      { date: '2026-01-05', closeRaw: 9.1 },
      { date: '2026-01-06', closeRaw: 9.1 },
    ];
    expect(dataExPelaCotacao(serie, 1.1, '2026-01-01', '2026-01-10')).toBeNull();
    expect(dataExPelaCotacao(serie, 10, '2026-01-01', '2026-01-10')).toBeNull();
  });

  it('dataPeloSaltoDoRendimento: rendimento extraordinário isolado não data o evento', () => {
    const provs = [
      { dataCom: '2022-05-13', valor: 1 },
      { dataCom: '2022-06-14', valor: 10 },
      { dataCom: '2022-07-15', valor: 1 },
      { dataCom: '2022-08-12', valor: 1 },
    ];
    expect(dataPeloSaltoDoRendimento(provs, 10, '2022-06-01', '2022-08-31')).toBeNull();
  });
});

describe('A6 — ação: evento posterior à última contagem confirmado pela cotação', () => {
  it('ORVR3 ×4 em 11/08/2026 (contagem de 30/06): 67,60 → 16,40 ⇒ confirmado, razaoCvm null', () => {
    const c = fixture.acoes.ORVR3;
    const ev = acao(c).find((e) => e.dataEvento === '2026-08-11');
    expect(ev).toMatchObject({ fator: 4, status: 'confirmado', razaoCvm: null, anoBase: 2026 });
    expect(ev?.fontes).toContain(FONTE_COTACAO);
    // sem cotação: como antes (não validável — não ajusta)
    expect(acao(c, { semPregoes: true }).find((e) => e.dataEvento === '2026-08-11')?.status).toBe(
      'nao_validavel',
    );
  });

  it('ENJU3 ×0,1 em 09/10/2026: era descartado pela razão do ITR de 30/06 (que não o contém)', () => {
    const c = fixture.acoes.ENJU3;
    const ev = acao(c).find((e) => e.dataEvento === '2026-10-09');
    expect(ev).toMatchObject({ fator: 0.1, status: 'confirmado', razaoCvm: null });
    // sem cotação: como antes (razão 1 do ITR ⇒ descartado)
    expect(acao(c, { semPregoes: true }).find((e) => e.dataEvento === '2026-10-09')?.status).toBe(
      'descartado',
    );
  });

  it('RCSL3: split ×4 de mar/2026 continua confirmado pela contagem; grupamento ×0,25 de out pela cotação', () => {
    const evs = acao(fixture.acoes.RCSL3);
    const mar = evs.find((e) => e.dataEvento === '2026-03-03');
    expect(mar).toMatchObject({ status: 'confirmado', anoBase: 2026 });
    expect(mar?.razaoCvm).toBeCloseTo(4, 2);
    expect(evs.find((e) => e.dataEvento === '2026-10-05')).toMatchObject({
      fator: 0.25,
      status: 'confirmado',
      razaoCvm: null,
    });
  });
});
