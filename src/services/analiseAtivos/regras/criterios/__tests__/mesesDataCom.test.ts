/**
 * fundamentei-regras (F1) — critério 'mes' dos FIIs pelo mês da DATA-COM
 * (criteria_params.meses.mesReferencia = 'data_com', v5). Calendários sintéticos; o de HCTR11
 * 2021–2022 é o do banco de DEV (duas datas-com em jan/2022, nenhuma em fev).
 *  - RZTR11: data-com em 30/09 conta setembro (no modo 'pagamento', outubro);
 *  - HCTR11: duas datas-com em jan e fev vazio NÃO quebram a sequência — só no modo 'data_com';
 *  - modo 'pagamento' (padrão) = o de antes: a regressão com KNRI11/BTHF11/RZTR11/HCTR11 está no
 *    snapshot de regressaoFundamentei.test.ts; aqui, a assinatura e o padrão das funções.
 */
import { describe, expect, it } from 'vitest';
import {
  criteriaParamsSchema,
  type CriteriaParams,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { CRITERIA_PARAMS_V2 } from '@/services/analiseAtivos/params/criteriaParamsV2';
import { CRITERIA_PARAMS_V4_JSON } from '@/services/analiseAtivos/params/criteriaParamsV4';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import {
  mesDoProventoFii,
  mesesComRendimentoConsecutivos,
  mesesComRendimentoDetalhado,
  mesesPreenchidosPeloVizinho,
} from '@/services/analiseAtivos/regras/calculo/sequencias';
import {
  avaliarMeses,
  mesesAteAnoFim,
  type ProventoMeses,
} from '@/services/analiseAtivos/regras/criterios/mesesJanela';
import { mesesFii } from '@/services/analiseAtivos/regras/criterios/seriesFii';

const S = SCORING_PARAMS_V1;
const DATA_COM: CriteriaParams = (() => {
  const j = structuredClone(CRITERIA_PARAMS_V4_JSON) as unknown as {
    meses: Record<string, unknown>;
  };
  j.meses.mesReferencia = 'data_com';
  return criteriaParamsSchema.parse(j);
})();

const prov = (dataComReal: string | null, dataPagamento: string | null): ProventoMeses => ({
  status: 'valido',
  tipoNormalizado: 'RENDIMENTO',
  dataComReal,
  dataPagamento,
});

function meses(de: string, ate: string): string[] {
  const out: string[] = [];
  let [a, m] = de.split('-').map(Number);
  const [aFim, mFim] = ate.split('-').map(Number);
  while (a < aFim || (a === aFim && m <= mFim)) {
    out.push(`${a}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      a++;
    }
  }
  return out;
}

/** Data-com no dia 1 e pagamento no dia 15 do mesmo mês, de `de` a `ate`. */
const mensal = (de: string, ate: string, pular: string[] = []) =>
  meses(de, ate)
    .filter((m) => !pular.includes(m))
    .map((m) => prov(`${m}-01`, `${m}-15`));

const HCTR11_2122: ProventoMeses[] = [
  prov('2021-10-06', '2021-10-15'),
  prov('2021-11-05', '2021-11-16'),
  prov('2021-12-06', '2021-12-14'),
  prov('2022-01-06', '2022-01-14'),
  prov('2022-01-28', '2022-02-07'),
  prov('2022-03-07', '2022-03-15'),
  prov('2022-04-06', '2022-04-14'),
];

describe('mesDoProventoFii', () => {
  it("'pagamento' (padrão): mês do pagamento; sem ele, o seguinte ao da data-com", () => {
    expect(mesDoProventoFii(prov('2025-09-30', '2025-10-14'))).toEqual({
      mes: '2025-10',
      estimado: false,
    });
    expect(mesDoProventoFii(prov('2025-09-30', null))).toEqual({ mes: '2025-10', estimado: true });
  });

  it("'data_com': mês da data-com (RZTR11 30/09 → setembro); sem ela, o anterior ao pagamento", () => {
    expect(mesDoProventoFii(prov('2025-09-30', '2025-10-14'), 'data_com')).toEqual({
      mes: '2025-09',
      estimado: false,
    });
    expect(mesDoProventoFii(prov(null, '2025-10-14'), 'data_com')).toEqual({
      mes: '2025-09',
      estimado: true,
    });
    expect(mesDoProventoFii(prov(null, null), 'data_com')).toBeNull();
  });
});

describe('regra do vizinho (só data_com)', () => {
  it('mês com duas datas-com preenche o seguinte vazio, uma vez', () => {
    const porMes = new Map([
      ['2022-01', 2],
      ['2022-03', 1],
      ['2022-05', 3],
    ]);
    expect([...mesesPreenchidosPeloVizinho(porMes)].sort()).toEqual(['2022-02', '2022-06']);
    // seguinte já com provento: nada a preencher
    expect(
      mesesPreenchidosPeloVizinho(
        new Map([
          ['2022-01', 2],
          ['2022-02', 1],
        ]),
      ).size,
    ).toBe(0);
  });

  it('HCTR11 jan/fev 2022: data_com sem a regra quebraria a sequência; com ela, não quebra', () => {
    const p = [...mensal('2019-01', '2021-09'), ...HCTR11_2122, ...mensal('2022-05', '2025-12')];
    // pagamento (padrão): fev/2022 tem o pagamento da 2ª data-com de jan → sequência inteira
    const pag = mesesAteAnoFim(p, 2025, S);
    expect(pag.consecutivos).toBe(84);
    // data_com: fev/2022 sem data-com, mas jan tem duas → não quebra
    const dc = mesesAteAnoFim(p, 2025, S, undefined, { mesReferencia: 'data_com' });
    expect(dc.consecutivos).toBe(84);
    expect(dc.mesesPagos).toContain('2022-02');
    expect(avaliarMeses(dc, 2025, 5, DATA_COM)).toEqual({
      estado: 'atende',
      n: 60,
      de: 60,
      fato: '60 de 60 meses com rendimento (mês da data-com, jan/2021–dez/2025)',
    });
  });

  it('mês vazio sem vizinho duplo quebra a sequência no modo data_com', () => {
    const p = mensal('2019-01', '2025-12', ['2023-06']);
    const dc = mesesAteAnoFim(p, 2025, S, undefined, { mesReferencia: 'data_com' });
    expect(dc.consecutivos).toBe(30);
    expect(avaliarMeses(dc, 2025, 5, DATA_COM)).toMatchObject({
      estado: 'nao_atende',
      n: 59,
      de: 60,
    });
  });

  it('a regra não existe no modo pagamento (vizinhoExplica igual ao de antes)', () => {
    // dois pagamentos em jan, nenhum em fev: no modo pagamento fev quebra a sequência
    const p = [
      ...mensal('2020-01', '2021-12'),
      prov('2022-01-03', '2022-01-10'),
      prov('2022-01-20', '2022-01-28'),
      ...mensal('2022-03', '2025-12'),
    ];
    expect(mesesAteAnoFim(p, 2025, S).consecutivos).toBe(46);
    // no modo data_com, as duas datas-com de jan preenchem fev
    expect(mesesAteAnoFim(p, 2025, S, undefined, { mesReferencia: 'data_com' }).consecutivos).toBe(
      72,
    );
  });

  it('RZTR11: data-com no último dia útil do mês conta o próprio mês no modo data_com', () => {
    // data-com no dia 30 e pagamento no mês seguinte; a última data-com do ano é 30/12/2025
    const p = meses('2019-12', '2025-12').map((m) => prov(`${m}-28`, null));
    const comPag = p.map((x) => {
      const [a, m] = (x.dataComReal as string).split('-').map(Number);
      const seg = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
      return { ...x, dataPagamento: `${seg}-14` };
    });
    const pag = mesesAteAnoFim(comPag, 2025, S);
    const dc = mesesAteAnoFim(comPag, 2025, S, undefined, { mesReferencia: 'data_com' });
    // pagamento: a data-com de dez/2025 paga em jan/2026 (fora da janela); o mês de dez/2025 tem o
    // pagamento da data-com de nov → dez/2019 não conta, jan/2020 sim
    expect(pag.inicioBase).toBe('2020-01');
    expect(dc.inicioBase).toBe('2019-12');
    expect(dc.mesesPagos).toContain('2025-12');
  });
});

describe('padrões e assinaturas (o job scores não muda)', () => {
  it('mesesComRendimentoDetalhado sem opção = modo pagamento', () => {
    const p = [...mensal('2024-01', '2025-12'), prov('2025-12-28', '2026-01-14')];
    const sem = mesesComRendimentoDetalhado(p, '2026-01-20', S);
    const pag = mesesComRendimentoDetalhado(p, '2026-01-20', S, { mesReferencia: 'pagamento' });
    expect(sem).toEqual(pag);
    expect(mesesComRendimentoConsecutivos(p, '2026-01-20', S)).toBe(sem.meses);
  });

  it("mesesFii sem mesReferencia = 'pagamento'", () => {
    const b = { proventos: mensal('2020-01', '2025-12', ['2022-04']), dyMesCvm: undefined };
    expect(mesesFii(b, 2025, S)).toEqual(mesesFii(b, 2025, S, 'pagamento'));
  });

  it('a v2 sem mesReferencia usa o texto de antes no fato', () => {
    const m = mesesAteAnoFim(mensal('2020-01', '2025-12'), 2025, S);
    expect(avaliarMeses(m, 2025, 5, CRITERIA_PARAMS_V2).fato).toBe(
      '60 de 60 meses com rendimento pago (jan/2021–dez/2025)',
    );
  });
});
