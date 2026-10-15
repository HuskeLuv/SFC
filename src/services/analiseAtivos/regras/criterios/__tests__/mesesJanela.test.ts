import { describe, expect, it } from 'vitest';
import { CRITERIA_PARAMS_V1 } from '@/services/analiseAtivos/params/criteriaParamsV1';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import {
  avaliarMeses,
  mesesAteAnoFim,
  type ProventoMeses,
} from '@/services/analiseAtivos/regras/criterios/mesesJanela';

const P = CRITERIA_PARAMS_V1;
const S = SCORING_PARAMS_V1;

/** Um rendimento pago no dia 15 de cada mês de `de` a `ate` (AAAA-MM), menos os de `pular`. */
function pagamentos(de: string, ate: string, pular: string[] = []): ProventoMeses[] {
  const out: ProventoMeses[] = [];
  let [a, m] = de.split('-').map(Number);
  const [aFim, mFim] = ate.split('-').map(Number);
  while (a < aFim || (a === aFim && m <= mFim)) {
    const mes = `${a}-${String(m).padStart(2, '0')}`;
    if (!pular.includes(mes)) {
      out.push({
        status: 'valido',
        tipoNormalizado: 'RENDIMENTO',
        dataPagamento: `${mes}-15`,
        dataComReal: `${mes}-01`,
      });
    }
    m++;
    if (m > 12) {
      m = 1;
      a++;
    }
  }
  return out;
}

describe('mesesAteAnoFim (âncora em dez/anoFim, rec. 4)', () => {
  it('lacuna em mar/2026 com anoFim 2025 NÃO afeta a janela 2021–2025 → atende na janela 5', () => {
    const prov = pagamentos('2018-01', '2026-09', ['2026-03']);
    const m = mesesAteAnoFim(prov, 2025, S);
    expect(m.consecutivos).toBe(96);
    expect(m.inicioBase).toBe('2018-01');
    expect(avaliarMeses(m, 2025, 5, P)).toEqual({
      estado: 'atende',
      n: 60,
      de: 60,
      fato: '60 de 60 meses com rendimento pago (jan/2021–dez/2025)',
    });
  });

  it('lacuna em 2024 → não atende na janela 5; o fato conta TODOS os meses pagos da janela', () => {
    const prov = pagamentos('2018-01', '2026-09', ['2024-06']);
    const m = mesesAteAnoFim(prov, 2025, S);
    expect(m.consecutivos).toBe(18);
    const r = avaliarMeses(m, 2025, 5, P);
    expect(r).toEqual({
      estado: 'nao_atende',
      n: 59,
      de: 60,
      fato: '59 de 60 meses com rendimento pago (jan/2021–dez/2025)',
    });
    // a janela 3 (jan/2023–dez/2025) também pega a lacuna
    expect(avaliarMeses(m, 2025, 3, P).estado).toBe('nao_atende');
  });

  it('o mês corrente nunca é tolerado (dez/anoFim sem pagamento = 0 meses)', () => {
    const m = mesesAteAnoFim(pagamentos('2018-01', '2025-11'), 2025, S);
    expect(m.consecutivos).toBe(0);
    expect(avaliarMeses(m, 2025, 3, P)).toMatchObject({
      estado: 'nao_atende',
      fato: '35 de 36 meses com rendimento pago (jan/2023–dez/2025)',
    });
  });

  it('sem data de pagamento usa o mês seguinte à data-com; inválidos e outros tipos não contam', () => {
    const prov: ProventoMeses[] = [
      {
        status: 'valido',
        tipoNormalizado: 'RENDIMENTO',
        dataPagamento: null,
        dataComReal: '2025-11-28',
      },
      {
        status: 'valido',
        tipoNormalizado: 'RENDIMENTO',
        dataPagamento: '2025-11-14',
        dataComReal: null,
      },
      {
        status: 'duplicata',
        tipoNormalizado: 'RENDIMENTO',
        dataPagamento: '2025-10-14',
        dataComReal: null,
      },
      {
        status: 'valido',
        tipoNormalizado: 'AMORTIZACAO',
        dataPagamento: '2025-10-14',
        dataComReal: null,
      },
    ];
    expect(mesesAteAnoFim(prov, 2025, S)).toEqual({
      consecutivos: 2,
      inicioBase: '2025-11',
      mesesPagos: ['2025-11', '2025-12'],
    });
  });
});

describe('avaliarMeses — base de proventos e dado ausente', () => {
  it('caso 28: base desde jan/2021 (cobre a janela) e 48 seguidos → "48 de 60" e "36 de 36"', () => {
    const m = { consecutivos: 48, inicioBase: '2021-01' };
    expect(avaliarMeses(m, 2025, 5, P)).toMatchObject({
      estado: 'nao_atende',
      fato: '48 de 60 meses com rendimento pago (jan/2021–dez/2025)',
    });
    expect(avaliarMeses(m, 2025, 3, P)).toMatchObject({
      estado: 'atende',
      fato: '36 de 36 meses com rendimento pago (jan/2023–dez/2025)',
    });
  });

  it('base curta (começa depois de jan/2021) e a sequência chega até ela → sem dado com o fato', () => {
    const m = mesesAteAnoFim(pagamentos('2022-03', '2026-09'), 2025, S);
    expect(m).toMatchObject({ consecutivos: 46, inicioBase: '2022-03' });
    expect(avaliarMeses(m, 2025, 5, P)).toEqual({
      estado: 'sem_dado',
      n: null,
      de: null,
      fato: 'sem dado nas demonstrações (proventos registrados desde 03/2022)',
      motivo: 'base_proventos_curta',
    });
    // na janela 3 (jan/2023) a base cobre: atende
    expect(avaliarMeses(m, 2025, 3, P).estado).toBe('atende');
  });

  it('base curta com lacuna DENTRO dela → não atende (o dado existe)', () => {
    const m = mesesAteAnoFim(pagamentos('2022-03', '2026-09', ['2023-07']), 2025, S);
    // 46 meses de mar/2022 a dez/2025 menos jul/2023 = 45 pagos dentro da janela
    expect(avaliarMeses(m, 2025, 5, P)).toMatchObject({ estado: 'nao_atende', n: 45 });
  });

  it("params.meses.mesesBaseCurta = 'nao_atende' troca o sem dado pela contagem", () => {
    const m = { consecutivos: 46, inicioBase: '2022-03' };
    const p = { ...P, meses: { ...P.meses, mesesBaseCurta: 'nao_atende' as const } };
    expect(avaliarMeses(m, 2025, 5, p)).toMatchObject({
      estado: 'nao_atende',
      fato: '46 de 60 meses com rendimento pago (jan/2021–dez/2025)',
    });
  });

  it('nenhum provento = sem dado nas demonstrações', () => {
    expect(avaliarMeses(mesesAteAnoFim([], 2025, S), 2025, 5, P)).toMatchObject({
      estado: 'sem_dado',
      fato: 'sem dado nas demonstrações',
      motivo: 'sem_dado_demonstracoes',
    });
    expect(avaliarMeses(null, 2025, 5, P).estado).toBe('sem_dado');
  });

  it('base que começa depois do fim da janela → sem dado (base curta)', () => {
    const m = mesesAteAnoFim(pagamentos('2026-02', '2026-09'), 2025, S);
    expect(m.consecutivos).toBe(0);
    expect(avaliarMeses(m, 2025, 3, P).motivo).toBe('base_proventos_curta');
  });

  it('lacuna ANTIGA (jan/2021) com o resto pago: conta 59 de 60, não só a sequência final', () => {
    const m = mesesAteAnoFim(pagamentos('2019-01', '2025-12', ['2021-01', '2021-05']), 2025, S);
    expect(m.consecutivos).toBe(55);
    expect(avaliarMeses(m, 2025, 5, P)).toEqual({
      estado: 'nao_atende',
      n: 58,
      de: 60,
      fato: '58 de 60 meses com rendimento pago (jan/2021–dez/2025)',
    });
    // a janela 3 (jan/2023–dez/2025) não pega as lacunas
    expect(avaliarMeses(m, 2025, 3, P).estado).toBe('atende');
  });
});
