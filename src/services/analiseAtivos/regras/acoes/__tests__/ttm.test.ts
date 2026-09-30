import { describe, expect, it } from 'vitest';
import { extrairFundamentos } from '@/services/analiseAtivos/regras/acoes/extrairFundamentos';
import {
  calcularTtm,
  calcularTtmPeriodo,
  type PeriodoFluxo,
} from '@/services/analiseAtivos/regras/acoes/ttm';
import { mesesDoPeriodo } from '@/services/analiseAtivos/regras/acoes/periodoFiscal';
import {
  CNPJ,
  P,
  lerFixture,
  type LinhaFixture,
} from '@/services/analiseAtivos/regras/acoes/__tests__/helpers';

const linhas = lerFixture('itr_dre_wege_bbas.csv');

/** Períodos (FY/YTD/3M) de um emissor a partir do recorte real DFP 2025 + ITR 2025/2026. */
function periodos(cnpj: string): PeriodoFluxo[] {
  const grupos = new Map<string, LinhaFixture[]>();
  for (const l of linhas.filter((x) => x.cnpj === cnpj)) {
    const k = `${l.arquivo.startsWith('dfp') ? 'dfp' : 'itr'}|${l.dtIni}|${l.dtFim}`;
    grupos.set(k, [...(grupos.get(k) ?? []), l]);
  }
  const out: PeriodoFluxo[] = [];
  for (const [k, ls] of grupos) {
    const [doc, dtIni, dtFim] = k.split('|');
    const meses = mesesDoPeriodo(dtIni, dtFim);
    const tipos: PeriodoFluxo['tipoPeriodo'][] =
      doc === 'dfp'
        ? ['FY']
        : meses === 3
          ? dtIni.endsWith('-01-01')
            ? ['3M', 'YTD']
            : ['3M']
          : ['YTD'];
    for (const tipoPeriodo of tipos) {
      const f = extrairFundamentos(ls, {
        demonstrativos: new Set(['DRE']),
        ehFinanceira: false,
        tipoPeriodo,
        escopo: 'con',
        dtIni,
        dtFim,
        mesFimExercicio: 12,
      });
      out.push({
        tipoPeriodo,
        dtFim,
        valores: {
          receita: f.receita,
          lucroAtribuivel: f.lucroAtribuivel,
          lucroLiquido: f.lucroLiquido,
        },
      });
    }
  }
  return out;
}

const mi = (x: number | null) => (x === null ? null : Math.round(x / 1e5) / 10);

describe('TTM 2T26 por dois caminhos (regra 14) — recortes reais', () => {
  it('WEGE3: receita 40.130,2 mi e lucro atribuível 6.254,1 mi pelo YTD E pela soma dos 4 trimestres', () => {
    const r = calcularTtmPeriodo(
      periodos(CNPJ.WEGE3),
      { tipoPeriodo: 'YTD', dtFim: '2026-06-30' },
      12,
      P,
    );
    expect(mi(r.valores.receita)).toBe(40130.2);
    expect(mi(r.valores.lucroAtribuivel)).toBe(6254.1);
    expect(r.metodos.receita).toBe('ytd');
    expect(r.divergencias.receita).toBeLessThan(0.01);
    expect(r.divergencias.lucroAtribuivel).toBeLessThan(0.01);
    expect(r.flags).toEqual(['ttm_metodo_ytd']);
  });

  it('BBAS3: lucro atribuível TTM = 12.272 mi pelo YTD (não os 18.493 da Fase A)', () => {
    const r = calcularTtmPeriodo(
      periodos(CNPJ.BBAS3),
      { tipoPeriodo: 'YTD', dtFim: '2026-06-30' },
      12,
      P,
    );
    expect(mi(r.valores.lucroAtribuivel)).toBe(12272);
    expect(r.metodos.lucroAtribuivel).toBe('ytd');
    expect(r.flags).not.toContain('reapresentacao');
  });

  it('BBAS3 com a controladora de um trimestre zerada (regra 12) ⇒ o trimestre é ausente e o YTD segue valendo', () => {
    const ps = periodos(CNPJ.BBAS3).map((p) =>
      p.tipoPeriodo === '3M' && p.dtFim === '2025-09-30'
        ? { ...p, valores: { ...p.valores, lucroAtribuivel: null } }
        : p,
    );
    const r = calcularTtmPeriodo(ps, { tipoPeriodo: 'YTD', dtFim: '2026-06-30' }, 12, P);
    expect(mi(r.valores.lucroAtribuivel)).toBe(12272);
    expect(r.divergencias.lucroAtribuivel).toBeUndefined();
  });

  it('base no DFP ⇒ TTM = FY (método fy)', () => {
    const r = calcularTtmPeriodo(
      periodos(CNPJ.WEGE3),
      { tipoPeriodo: 'FY', dtFim: '2025-12-31' },
      12,
      P,
    );
    expect(mi(r.valores.lucroAtribuivel)).toBe(6376.2);
    expect(r.flags).toEqual(['ttm_metodo_fy']);
  });
});

describe('calcularTtm', () => {
  it('divergência YTD × Σ4tri > 2% ⇒ usa o YTD e sinaliza reapresentação', () => {
    const r = calcularTtm(
      {
        fyAnterior: 13_698,
        ytdAtual: 4_795,
        ytdMesmoPeriodoAnoAnterior: 6_221,
        ultimos4Trimestres: [2_237, 5_240, 2_397, 8_619],
        trimestreAtual: 2,
      },
      P,
    );
    expect(r.valor).toEqual({ estado: 'ok', valor: 12_272 });
    expect(r.metodo).toBe('ytd');
    expect(r.reapresentacao).toBe(true);
    expect(r.divergenciaPct).toBeGreaterThan(2);
  });

  it('só a soma dos trimestres disponível ⇒ soma4; nada ⇒ ausente', () => {
    const soma = calcularTtm(
      {
        fyAnterior: null,
        ytdAtual: 5,
        ytdMesmoPeriodoAnoAnterior: 4,
        ultimos4Trimestres: [1, 2, 3, 4],
        trimestreAtual: 2,
      },
      P,
    );
    expect(soma).toMatchObject({ valor: { estado: 'ok', valor: 10 }, metodo: 'soma4' });
    const nada = calcularTtm(
      {
        fyAnterior: null,
        ytdAtual: null,
        ytdMesmoPeriodoAnoAnterior: null,
        ultimos4Trimestres: [1, null, 3, 4],
        trimestreAtual: 3,
      },
      P,
    );
    expect(nada.valor.estado).toBe('ausente');
  });

  it('zero é dado: TTM 0 com trimestres 0 não diverge', () => {
    const r = calcularTtm(
      {
        fyAnterior: 0,
        ytdAtual: 0,
        ytdMesmoPeriodoAnoAnterior: 0,
        ultimos4Trimestres: [0, 0, 0, 0],
        trimestreAtual: 1,
      },
      P,
    );
    expect(r).toMatchObject({
      valor: { estado: 'ok', valor: 0 },
      divergenciaPct: 0,
      reapresentacao: false,
    });
  });
});
