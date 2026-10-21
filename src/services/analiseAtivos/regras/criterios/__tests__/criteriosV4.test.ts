/**
 * A6 (item 7, fatia E) — criteria_params v4: o 'alav' do fii_tijolo sobre o ATIVO TOTAL
 * (leverage_assets_pct ≤ 15%), pelo caminho do job (FonteCvm → resolverSeries → avaliarAtivo), com a
 * fixture REAL do DEV (13/10/2026). As obrigações ÷ ativo são INVENTADAS no teste (a fixture é de
 * antes da A6): o que se confere é a regra, não o número de um fundo.
 *  - v2 e v3 avaliam IDÊNTICO com ou sem a série nova (snapshot de criteria_eval);
 *  - v4 valida no zod strict, mantém o id 'alav' e muda só esse critério do fii_tijolo;
 *  - obrigações > 50% do ativo em algum ano ⇒ obs 'obrigacoes_ativo_revisao' (o estado não muda).
 */
import { describe, expect, it } from 'vitest';
import { seriesDosPerfis } from '@/services/analiseAtivos/calculo/executarCriterios';
import { pontosCvmFii, SERIES_CVM_FII } from '@/services/analiseAtivos/fontes/fundamentos/fonteCvm';
import { resolverSeries } from '@/services/analiseAtivos/fontes/fundamentos/resolverSeries';
import {
  criteriaParamsSchema,
  fontesEfetivas,
  type CriteriaParams,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { CRITERIA_PARAMS_V2 } from '@/services/analiseAtivos/params/criteriaParamsV2';
import {
  CRITERIA_PARAMS_V3,
  CRITERIA_PARAMS_V3_JSON,
} from '@/services/analiseAtivos/params/criteriaParamsV3';
import {
  CRITERIA_PARAMS_V4,
  CRITERIA_PARAMS_V4_JSON,
} from '@/services/analiseAtivos/params/criteriaParamsV4';
import { validarCriteriaParams } from '@/services/analiseAtivos/params/obterCriteriaParams';
import { avaliarAtivo } from '@/services/analiseAtivos/regras/criterios/avaliarAtivo';
import { perfilCriterios } from '@/services/analiseAtivos/regras/criterios/perfilCriterios';
import {
  imoveisPlPctFii,
  mesesFii,
  seriesFii,
  type BrutoFii,
} from '@/services/analiseAtivos/regras/criterios/seriesFii';
import { TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';
import type { ScoringParams } from '@/services/analiseAtivos/tipos';
import type { AvaliacaoAtivo, ResultadoCriterio } from '@/types/analiseAtivosCriterios';
import fixture from './fixtures/dev-2026-10-13.json';
import {
  VERSOES_CODIGO,
  lerArgs,
} from '../../../../../../scripts/analise-ativos/seed-criteria-params';

const ANO_FIM = fixture.anoFim;
const SCORING = { sanidade: { proventos: fixture.proventosParams } } as unknown as ScoringParams;
const FIIS = fixture.fiis as unknown as BrutoFii[];
const fii = (s: string) => FIIS.find((f) => f.symbol === s) as BrutoFii;

/** FII com obrigações ÷ ativo inventadas por ano (o resto da fixture intacto). */
function comAtivo(f: BrutoFii, pct: (ano: number) => number | null): BrutoFii {
  return {
    ...f,
    multiplos: f.multiplos.map((m) => ({ ...m, obrigacoesAtivoPct: pct(m.anoFiscal) })),
  };
}

function avaliarFii(f: BrutoFii, P: CriteriaParams): AvaliacaoAtivo {
  const perfil = perfilCriterios(
    { classe: 'fii', ehFinanceira: false, fiiTipo: f.fiiTipo, imoveisPlPct: imoveisPlPctFii(f) },
    P,
  );
  const r = resolverSeries({
    pontos: pontosCvmFii(f, { anoFim: ANO_FIM, scoring: SCORING }),
    series: seriesDosPerfis(P, ['fii_tijolo', 'fii_papel']),
    fontes: fontesEfetivas(P),
  });
  return avaliarAtivo(
    {
      symbol: f.symbol,
      classe: 'fii',
      perfil,
      anoFim: ANO_FIM,
      series: r.series,
      origens: r.origens,
      meses: mesesFii(f, ANO_FIM, SCORING),
    },
    P,
    P.versao,
  );
}

const res = (a: AvaliacaoAtivo, id: string, j: '3' | '5' | '10' = '5') =>
  a.janelas[j].resultados.find((r) => r.id === id) as ResultadoCriterio;

describe('seriesFii + FonteCvm: as duas séries de alavancagem', () => {
  it('leverage_pct (obrigações ÷ PL) e leverage_assets_pct (obrigações ÷ ativo), cada uma a sua', () => {
    const f = comAtivo(fii('HGLG11'), () => 8);
    const s = seriesFii(f);
    expect(s.leverage_pct?.[2024]).toBeCloseTo(20.18, 2);
    expect(s.leverage_assets_pct?.[2024]).toBe(8);
    expect(SERIES_CVM_FII).toContain('leverage_assets_pct');
    const pontos = pontosCvmFii(f, { anoFim: ANO_FIM, scoring: SCORING });
    expect(
      pontos.find((p) => p.serie === 'leverage_assets_pct' && p.anoFiscal === 2024)?.valor,
    ).toBe(8);
    // fixture antiga (sem a coluna) e ticker↔CNPJ não conferido = sem dado
    expect(Object.values(seriesFii(fii('HGLG11')).leverage_assets_pct ?? {})).toEqual(
      expect.arrayContaining([null]),
    );
    expect(
      Object.values(seriesFii({ ...f, conferido: false }).leverage_assets_pct ?? {}).every(
        (v) => v === null,
      ),
    ).toBe(true);
  });
});

describe('snapshot: v2 e v3 avaliam IDÊNTICO com a série nova presente', () => {
  for (const [nome, P] of [
    ['v2', CRITERIA_PARAMS_V2],
    ['v3', CRITERIA_PARAMS_V3],
  ] as const) {
    it(`${nome}: criteria_eval de tijolo e papel não muda`, () => {
      for (const s of ['HGLG11', 'XPLG11', 'KNCR11', 'MXRF11']) {
        const antes = avaliarFii(fii(s), P);
        const depois = avaliarFii(
          comAtivo(fii(s), () => 60),
          P,
        );
        expect(depois).toEqual(antes);
      }
    });
  }
});

describe('CriteriaParams v4', () => {
  const V4 = CRITERIA_PARAMS_V4;

  it('valida no zod strict (round-trip JSON) e campo desconhecido é recusado', () => {
    expect(validarCriteriaParams(CRITERIA_PARAMS_V4_JSON).versao).toBe(4);
    expect(validarCriteriaParams(JSON.parse(JSON.stringify(CRITERIA_PARAMS_V4_JSON)))).toEqual(V4);
    const errado = structuredClone(CRITERIA_PARAMS_V4_JSON) as unknown as {
      perfis: { fii_tijolo: Array<Record<string, unknown>> };
    };
    errado.perfis.fii_tijolo[3] = { ...errado.perfis.fii_tijolo[3], observacao: 'x' };
    expect(criteriaParamsSchema.safeParse(errado).success).toBe(false);
  });

  it("mesmo id 'alav', série leverage_assets_pct, limite 15 e o rótulo da decisão 1", () => {
    const alav = V4.perfis.fii_tijolo.find((c) => c.id === 'alav')!;
    expect(alav).toMatchObject({
      id: 'alav',
      rotulo: 'Alavancagem ≤ 15% do ativo',
      tipo: 'max',
      serie: 'leverage_assets_pct',
      limite: 15,
      formato: '%',
    });
    expect(alav.definicao).toContain('ativo total');
    expect(alav.definicao).toContain(TEXTOS_CRITERIOS.alavancagemAtivoV4.observacao);
    expect(V4.perfis.fii_tijolo.map((c) => c.id)).toEqual(
      CRITERIA_PARAMS_V3.perfis.fii_tijolo.map((c) => c.id),
    );
    expect(V4.equivalencias).toEqual(CRITERIA_PARAMS_V3.equivalencias);
  });

  it('= v3 em tudo, menos o alav do fii_tijolo', () => {
    const { versao: _a, descricao: _b, perfis: p4, ...resto4 } = V4;
    const { versao: _c, descricao: _d, perfis: p3, ...resto3 } = CRITERIA_PARAMS_V3;
    expect(resto4).toEqual(resto3);
    const { fii_tijolo: t4, ...outros4 } = p4;
    const { fii_tijolo: t3, ...outros3 } = p3;
    expect(outros4).toEqual(outros3);
    expect(t4.filter((c) => c.id !== 'alav')).toEqual(t3.filter((c) => c.id !== 'alav'));
    expect(CRITERIA_PARAMS_V3_JSON.perfis.fii_tijolo.find((c) => c.id === 'alav')?.rotulo).toBe(
      'Alavancagem ≤ 20% do PL',
    );
  });

  it('seed registra a v4 (--versao=4)', () => {
    expect(VERSOES_CODIGO[4].json).toBe(CRITERIA_PARAMS_V4_JSON);
    expect(lerArgs(['--versao=4', '--valid-from=2099-01-01'])).toMatchObject({
      versao: 4,
      aplicar: false,
    });
  });
});

describe('avaliação com a v4', () => {
  const V4 = CRITERIA_PARAMS_V4;

  it('tijolo dentro de 15% do ativo atende; um ano acima não atende (fato com o máximo)', () => {
    expect(
      res(
        avaliarFii(
          comAtivo(fii('HGLG11'), () => 12),
          V4,
        ),
        'alav',
      ).estado,
    ).toBe('atende');
    const r = res(
      avaliarFii(
        comAtivo(fii('HGLG11'), (a) => (a === 2023 ? 18 : 12)),
        V4,
      ),
      'alav',
    );
    expect(r).toMatchObject({ estado: 'nao_atende' });
    expect(r.fato).toContain('18,0%');
    expect(r.obs).toBeUndefined();
  });

  it('sem a coluna (antes do backfill) = sem dado, nunca atende', () => {
    expect(res(avaliarFii(fii('HGLG11'), V4), 'alav').estado).toBe('sem_dado');
  });

  it("acima de 50% do ativo em algum ano ⇒ obs 'obrigacoes_ativo_revisao' (estado igual)", () => {
    const r = res(
      avaliarFii(
        comAtivo(fii('HGLG11'), (a) => (a === 2022 ? 55 : 12)),
        V4,
      ),
      'alav',
    );
    expect(r.estado).toBe('nao_atende');
    expect(r.obs).toEqual(['obrigacoes_ativo_revisao']);
    expect(TEXTOS_CRITERIOS.obs.obrigacoes_ativo_revisao).toMatch(/50% do ativo/);
  });

  it('os outros critérios do tijolo e o papel inteiro saem iguais aos da v3', () => {
    for (const s of ['HGLG11', 'XPLG11', 'KNCR11', 'MXRF11']) {
      const f = comAtivo(fii(s), () => 12);
      const a3 = avaliarFii(f, CRITERIA_PARAMS_V3);
      const a4 = avaliarFii(f, V4);
      for (const j of ['3', '5', '10'] as const) {
        const sem = (a: AvaliacaoAtivo) =>
          a.janelas[j].resultados.filter((r) => a.perfil !== 'fii_tijolo' || r.id !== 'alav');
        expect(sem(a4)).toEqual(sem(a3));
      }
    }
  });
});
