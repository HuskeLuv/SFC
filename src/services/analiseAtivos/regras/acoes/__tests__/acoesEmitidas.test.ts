import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  deduplicarEventos,
  fatorEventosEntre,
  resolverAcoesExercicio,
  type EntradaResolucaoAcoes,
  type EventoAcoes,
} from '@/services/analiseAtivos/regras/acoes/acoesEmitidas';
import { P } from '@/services/analiseAtivos/regras/acoes/__tests__/helpers';
import type { EventoCorporativoBruto } from '@/services/analiseAtivos/tipos';

interface Caso {
  cnpj: string;
  lucroTotal: number;
  lucroAtribuivel: number;
  lpa: Record<string, number>;
  pl: number;
  composicao: Record<string, number> | null;
  freItemF: number | null;
}
const dados = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures', 'casos_acoes_cvm.json'), 'utf8'),
) as {
  casos: Record<string, Caso>;
  eventosDevUGPA3: Array<{ date: string; type: string; factor: number; source: string }>;
};

function entrada(chave: string, extra: Partial<EntradaResolucaoAcoes> = {}): EntradaResolucaoAcoes {
  const c = dados.casos[chave];
  const nz = (x: number | undefined) => (x ? x : null);
  const comp = c.composicao;
  return {
    ano: Number(chave.split('-')[1]),
    lucroAtribuivel: c.lucroAtribuivel,
    lucroTotal: c.lucroTotal,
    lpaOn: nz(c.lpa.ON),
    lpaPn: nz(c.lpa.PN ?? c.lpa.PNA),
    pl: c.pl,
    composicao: comp
      ? {
          on: comp.QT_ACAO_ORDIN_CAP_INTEGR,
          pn: comp.QT_ACAO_PREF_CAP_INTEGR,
          tesOn: comp.QT_ACAO_ORDIN_TESOURO,
          tesPn: comp.QT_ACAO_PREF_TESOURO,
        }
      : null,
    freAcoes: c.freItemF,
    eventos: [],
    ...extra,
  };
}

const mi = (x: number | null) => (x === null ? null : Math.round(x / 1e4) / 100);

describe('resolverAcoesExercicio (regra 10) — casos reais da Fase A', () => {
  it('WEGE3 2016 = 1.614,35 mi pelo FRE item f (razão LPA 0,69 × ações ÷ lucro ∈ [0,8; 1,25])', () => {
    const r = resolverAcoesExercicio(entrada('WEGE3-2016'), P);
    expect(r.fonte).toBe('fre_f');
    expect(mi(r.acoes)).toBe(1614.35);
    expect(r.razaoLpa).toBeGreaterThan(0.8);
    expect(r.razaoLpa).toBeLessThan(1.25);
    expect(r.status).toBe('ok');
  });

  it('WEGE3 2019 = 2.098,66 mi (FRE f), não os 4.197 mi do capital_social reexpresso pós-split de 2021', () => {
    const r = resolverAcoesExercicio(entrada('WEGE3-2019'), P);
    expect(r.fonte).toBe('fre_f');
    expect(mi(r.acoes)).toBe(2098.66);
    // capital_social nunca é candidato: mesmo "oferecido" como composição, o LPA o rejeita
    const comCapitalSocial = resolverAcoesExercicio(
      entrada('WEGE3-2019', {
        composicao: { on: 4_197_317_998, pn: 0, tesOn: 0, tesPn: 0 },
        freAcoes: 2_098_658_999,
      }),
      P,
    );
    expect(comCapitalSocial.fonte).toBe('fre_f');
    expect(mi(comCapitalSocial.acoes)).toBe(2098.66);
  });

  it('VALE3 2024 = 4.268,72 mi via dfp×1000 (composição em milhares sem aviso)', () => {
    const r = resolverAcoesExercicio(entrada('VALE3-2024'), P);
    expect(r.fonte).toBe('dfp_x1000');
    expect(mi(r.acoes)).toBe(4268.72);
    expect(r.flags).toContain('escala_x1000');
    expect(r.fatorEscalaLpa).toBe(1);
  });

  it('ITUB4 2019: LPA publicado 2.780 ⇒ FRE aceito com LPA corrigido ÷1000', () => {
    const r = resolverAcoesExercicio(entrada('ITUB4-2019'), P);
    expect(r.fonte).toBe('fre_f');
    expect(mi(r.acoes)).toBe(9745.6);
    expect(r.fatorEscalaLpa).toBe(0.001);
    expect(r.flags).toContain('lpa_escala_corrigida');
    expect(r.razaoLpa).toBeCloseTo(0.999, 2);
  });

  it('EGIE3 2025 = 1.142,30 mi (DFP em unidades; o evento fantasma ×1,1 não entra aqui)', () => {
    const r = resolverAcoesExercicio(entrada('EGIE3-2025'), P);
    expect(r.fonte).toBe('dfp');
    expect(mi(r.acoes)).toBe(1142.3);
  });

  it('BBAS3 2024: com o LPA ON 4,62 (o "geral" 9,24 fica de fora) a composição bate', () => {
    const r = resolverAcoesExercicio(entrada('BBAS3-2024'), P);
    expect(r.fonte).toBe('dfp');
    expect(mi(r.acoes)).toBe(5708.05);
    const comGeral = resolverAcoesExercicio(entrada('BBAS3-2024', { lpaOn: 9.24 }), P);
    expect(comGeral.fonte).not.toBe('dfp');
  });

  it('UGPA3 2018: FRE reexpresso pelo desdobramento ×2 de abr/2019 ⇒ FRE ÷ 2', () => {
    const eventos = deduplicarEventos(
      dados.eventosDevUGPA3.map((e, i) => ({ ...e, id: String(i), symbol: 'UGPA3' })),
      P,
    );
    const r = resolverAcoesExercicio(entrada('UGPA3-2018', { eventos }), P);
    expect(r.fonte).toBe('fre_f');
    expect(r.flags).toContain('fre_reexpresso');
    expect(mi(r.acoes)).toBe(Math.round(1_086_029_894 / 2 / 1e4) / 100);
    // sem o evento, o FRE reexpresso não bate e cai no implícito lucro ÷ LPA
    const semEvento = resolverAcoesExercicio(entrada('UGPA3-2018'), P);
    expect(semEvento.flags).not.toContain('fre_reexpresso');
  });

  it('razão fora de ±5% (mas dentro de [0,8; 1,25]) ⇒ status alerta', () => {
    const r = resolverAcoesExercicio(entrada('EGIE3-2025', { lpaOn: 2.26109 * 1.1 }), P);
    expect(r.fonte).toBe('dfp');
    expect(r.status).toBe('alerta');
  });

  it('KLBN-like: controladora ausente ⇒ usa o lucro total com a flag lucro_total_fallback', () => {
    const r = resolverAcoesExercicio(entrada('EGIE3-2025', { lucroAtribuivel: null }), P);
    expect(r.flags).toContain('lucro_total_fallback');
  });

  it('sem LPA: vizinhança (ano anterior validado × eventos) escolhe entre unidade e ×1000', () => {
    const r = resolverAcoesExercicio(
      entrada('VALE3-2024', {
        lpaOn: null,
        lpaPn: null,
        vizinhos: [{ ano: 2023, acoes: 4_300_000_000 }],
      }),
      P,
    );
    expect(r.fonte).toBe('vizinho');
    expect(mi(r.acoes)).toBe(4268.72);
    expect(r.status).toBe('nao_verificavel');
    expect(r.flags).toContain('origem:dfp_x1000');
  });

  it('sem LPA e sem vizinho: limiar (< 20 mi ações com PL > R$ 1 bi ⇒ milhares)', () => {
    const r = resolverAcoesExercicio(entrada('VALE3-2024', { lpaOn: null, lpaPn: null }), P);
    expect(r.fonte).toBe('limiar');
    expect(mi(r.acoes)).toBe(4268.72);
  });

  it('com LPA mas nenhum candidato perto ⇒ ações implícitas lucro ÷ LPA', () => {
    const r = resolverAcoesExercicio(
      entrada('EGIE3-2025', { composicao: { on: 10, pn: 0, tesOn: 0, tesPn: 0 } }),
      P,
    );
    expect(r.fonte).toBe('lpa_implicito');
    expect(mi(r.acoes)).toBeCloseTo(1142.3, 0);
  });

  it('sem nenhuma fonte ⇒ acoes null e flag sem_fonte', () => {
    const r = resolverAcoesExercicio(
      entrada('EGIE3-2025', { composicao: null, freAcoes: null }),
      P,
    );
    expect(r.acoes).toBeNull();
    expect(r.flags).toContain('sem_fonte');
  });
});

describe('eventos brutos (dedup local ≤ 30 dias)', () => {
  const brutos: EventoCorporativoBruto[] = [
    {
      id: '1',
      symbol: 'WEGE3',
      date: '2021-04-27',
      type: 'DESDOBRAMENTO',
      factor: 2,
      source: 'BRAPI',
    },
    {
      id: '2',
      symbol: 'WEGE3',
      date: '2021-04-28',
      type: 'DESDOBRAMENTO',
      factor: 2,
      source: 'YAHOO',
    },
    {
      id: '3',
      symbol: 'WEGE3',
      date: '2018-04-24',
      type: 'BONIFICACAO',
      factor: 1.3,
      source: 'BRAPI',
    },
    {
      id: '4',
      symbol: 'WEGE3',
      date: '2018-04-25',
      type: 'DESDOBRAMENTO',
      factor: 1.3,
      source: 'YAHOO',
    },
    {
      id: '5',
      symbol: 'WEGE3',
      date: '2019-01-01',
      type: 'INCORPORACAO',
      factor: 3,
      source: 'BRAPI',
    },
  ];

  it('WEGE3 (banco dev): BRAPI×YAHOO do mesmo evento viram 1; tipos fora da lista são ignorados', () => {
    const d: EventoAcoes[] = deduplicarEventos(brutos, P);
    expect(d).toEqual([
      { date: '2018-04-24', fator: 1.3 },
      { date: '2021-04-27', fator: 2 },
    ]);
    expect(fatorEventosEntre(d, '2019-12-31', '2021-12-31')).toBe(2);
    expect(fatorEventosEntre(d, '2016-12-31', '2026-09-30')).toBeCloseTo(2.6, 10);
  });
});
