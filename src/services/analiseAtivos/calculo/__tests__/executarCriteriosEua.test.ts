/**
 * Job 'criterios-eua' (fatia B) com dependências injetadas e um Postgres fake de criteria_eval que
 * respeita os filtros de classe: o job EUA NUNCA toca nas linhas acao/fii (gravador isolado da
 * fatia 0 com CLASSES_EUA), e a versão de params sem os perfis EUA não grava nada.
 */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  agruparUniversoEua,
  ajustarFatosEua,
  coberturaPerfil,
  executarCriteriosEua,
  fontesDoMercado,
  type DependenciasCriteriosEua,
  type EmpresaCriteriosEua,
} from '@/services/analiseAtivos/calculo/executarCriteriosEua';
import { fontesEfetivas } from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { CRITERIA_PARAMS_V2 } from '@/services/analiseAtivos/params/criteriaParamsV2';
import { CRITERIA_PARAMS_V3 } from '@/services/analiseAtivos/params/criteriaParamsV3';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import { gravarCriteriaEval } from '@/services/analiseAtivos/repositorio/criterios';
import type { EmpresaEua } from '@/services/analiseAtivos/repositorio/eua';
import type { BrutoSec, FySec } from '@/services/analiseAtivos/regras/criterios/seriesStock';
import type { AlertaJob, JobContexto } from '@/services/analiseAtivos/tipos';
import { CLASSES_EUA } from '@/types/analiseAtivosApi';
import type { AvaliacaoAtivo } from '@/types/analiseAtivosCriterios';
import fixture from '../../regras/criterios/__tests__/fixtures/eua-dev.json';

interface EmpresaFixture {
  symbol: string;
  cik: string;
  classe: 'stock' | 'reit';
  ehFinanceira: boolean;
  sic: number;
  fys: FySec[];
}
const EMPRESAS = fixture.empresas as unknown as EmpresaFixture[];
const pegar = (s: string) => EMPRESAS.find((e) => e.symbol === s) as EmpresaFixture;

// ---------------------------------------------------------------- Postgres fake (criteria_eval)
interface LinhaFake {
  symbol: string;
  classe: string;
  janela: number;
  cnpj?: string;
}
type Where = { symbol?: { in: string[] }; classe?: { in?: string[]; notIn?: string[] } };
const casa = (l: LinhaFake, w?: Where) =>
  !w ||
  ((!w.symbol || w.symbol.in.includes(l.symbol)) &&
    (!w.classe?.in || w.classe.in.includes(l.classe)) &&
    (!w.classe?.notIn || !w.classe.notIn.includes(l.classe)));

function bancoFake(iniciais: LinhaFake[]) {
  let linhas = [...iniciais];
  const deletes: Where[] = [];
  const prisma = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<number>) => {
      let copia = [...linhas];
      const tx = {
        criteriaEval: {
          findMany: async ({ where }: { where?: Where }) =>
            copia
              .filter((l) => casa(l, where))
              .map((l) => ({ symbol: l.symbol, classe: l.classe })),
          deleteMany: async ({ where }: { where?: Where }) => {
            deletes.push(where ?? {});
            const antes = copia.length;
            copia = copia.filter((l) => !casa(l, where));
            return { count: antes - copia.length };
          },
          createMany: async ({ data }: { data: LinhaFake[] }) => {
            copia.push(...data);
            return { count: data.length };
          },
        },
      };
      const r = await fn(tx);
      linhas = copia;
      return r;
    }),
  };
  return { prisma: prisma as unknown as PrismaClient, linhas: () => linhas, deletes };
}

function ctx(
  prisma: PrismaClient,
  extra: Partial<JobContexto> = {},
): JobContexto & {
  alertas: AlertaJob[];
} {
  const alertas: AlertaJob[] = [];
  return {
    prisma,
    prazo: Date.now() + 60_000,
    restanteMs: () => 60_000,
    estourouPrazo: () => false,
    alertar: (a) => alertas.push(a),
    contar: vi.fn(),
    params: SCORING_PARAMS_V1,
    paramsVersion: 1,
    hoje: '2026-10-17',
    origem: 'script',
    aplicar: true,
    alertas,
    ...extra,
  };
}

function universo(symbols: string[]): EmpresaCriteriosEua[] {
  return symbols.map((s) => {
    const e = pegar(s);
    return {
      cik: e.cik,
      cikFundamentos: e.cik,
      classe: e.classe,
      ehFinanceira: e.ehFinanceira,
      sic: e.sic,
      symbols: [s],
    };
  });
}

function deps(
  symbols: string[],
  extra: Partial<DependenciasCriteriosEua> = {},
): DependenciasCriteriosEua {
  return {
    obterParams: async () => ({ versao: 3, params: CRITERIA_PARAMS_V3 }),
    carregarUniverso: async () => universo(symbols),
    lerBrutos: async (_p, ciks) =>
      new Map(
        ciks.map((cik) => {
          const e = EMPRESAS.find((x) => x.cik === cik);
          return [cik, { cik, fys: e?.fys ?? [] } satisfies BrutoSec];
        }),
      ),
    gravar: gravarCriteriaEval,
    ...extra,
  };
}

const LINHAS_BR: LinhaFake[] = [
  { symbol: 'PETR4', classe: 'acao', janela: 5 },
  { symbol: 'PETR4', classe: 'acao', janela: 3 },
  { symbol: 'HGLG11', classe: 'fii', janela: 5 },
];

describe('executarCriteriosEua', () => {
  it('avalia AAPL, JPM, O e PLD e grava só stock/reit: as linhas acao/fii ficam intactas', async () => {
    const banco = bancoFake([...LINHAS_BR, { symbol: 'AAPL', classe: 'stock', janela: 5 }]);
    const c = ctx(banco.prisma);
    const r = await executarCriteriosEua(c, deps(['AAPL', 'JPM', 'O', 'PLD']));
    expect(r.pulado).toBeUndefined();
    expect(r.detalhes).toMatchObject({
      paramsVersion: 3,
      anoFim: 2025,
      simbolos: 4,
      linhas: 12,
      linhasGravadas: 12,
      porPerfil: { stock: 1, stock_financeira: 1, reit: 2 },
    });
    // o delete do job EUA só alcança as classes EUA
    expect(banco.deletes).toEqual([{ classe: { in: [...CLASSES_EUA] } }]);
    const final = banco.linhas();
    expect(final.filter((l) => l.classe === 'acao' || l.classe === 'fii')).toEqual(LINHAS_BR);
    const eua = final.filter((l) => l.classe === 'stock' || l.classe === 'reit');
    expect(eua).toHaveLength(12);
    expect(new Set(eua.map((l) => l.cnpj))).toEqual(
      new Set(['CIK:0000320193', 'CIK:0000019617', 'CIK:0000726728', 'CIK:0001045609']),
    );
  });

  it('atende / não atende / sem dado e n de 6 nas linhas gravadas', async () => {
    const capturadas: Array<{
      symbol: string;
      janela: number;
      aplicaveis: number;
      resultados: unknown;
    }> = [];
    const c = ctx({} as PrismaClient);
    await executarCriteriosEua(
      c,
      deps(['AAPL', 'JPM', 'O', 'PLD'], {
        gravar: async (_p, linhas, classes) => {
          expect(classes).toEqual(CLASSES_EUA);
          capturadas.push(...(linhas as typeof capturadas));
          return linhas.length;
        },
      }),
    );
    const estado = (symbol: string, id: string) =>
      (
        capturadas.find((l) => l.symbol === symbol && l.janela === 5)?.resultados as Array<{
          id: string;
          estado: string;
        }>
      ).find((r) => r.id === id)?.estado;
    expect(estado('AAPL', 'mg')).toBe('atende');
    expect(estado('AAPL', 'rec')).toBe('nao_atende');
    expect(estado('JPM', 'dl')).toBe('sem_dado');
    expect(estado('JPM', 'fcl')).toBe('sem_dado');
    expect(estado('O', 'fco_acao')).toBe('nao_atende');
    expect(estado('O', 'ocup')).toBe('sem_dado');
    expect(estado('PLD', 'pay')).toBe('atende');
    expect(capturadas.every((l) => l.aplicaveis === 6)).toBe(true);
  });

  it('criteria_params sem os perfis EUA (v2) ⇒ pulado com alerta, nada gravado', async () => {
    const gravar = vi.fn();
    const c = ctx({} as PrismaClient);
    const r = await executarCriteriosEua(
      c,
      deps(['AAPL'], {
        obterParams: async () => ({ versao: 2, params: CRITERIA_PARAMS_V2 }),
        gravar,
      }),
    );
    expect(r.pulado).toMatch(/sem os perfis EUA/);
    expect(gravar).not.toHaveBeenCalled();
    expect(c.alertas.map((a) => a.codigo)).toContain('criterios_eua_sem_perfis');
  });

  it('--versao-params=N chega ao obterParams', async () => {
    const obterParams = vi.fn(async () => ({ versao: 3, params: CRITERIA_PARAMS_V3 }));
    await executarCriteriosEua(
      ctx({} as PrismaClient, { aplicar: false }),
      deps(['AAPL'], { obterParams }),
      {
        versaoParams: 3,
      },
    );
    expect(obterParams).toHaveBeenCalledWith(expect.anything(), { versao: 3 });
  });

  it('universo vazio ⇒ alerta e NADA é apagado', async () => {
    const gravar = vi.fn();
    const c = ctx({} as PrismaClient);
    const r = await executarCriteriosEua(c, deps([], { gravar }));
    expect(gravar).not.toHaveBeenCalled();
    expect(r.detalhes).toMatchObject({ simbolos: 0, linhasGravadas: 0 });
    expect(c.alertas.map((a) => a.codigo)).toContain('criterios_eua_universo_vazio');
  });

  it('prazo estourado ⇒ parcial sem gravar', async () => {
    const gravar = vi.fn();
    const c = ctx({} as PrismaClient, { estourouPrazo: () => true });
    const r = await executarCriteriosEua(c, deps(['AAPL'], { gravar }));
    expect(r.parcial).toBe(true);
    expect(gravar).not.toHaveBeenCalled();
  });

  it('dry-run (aplicar=false) avalia e não grava', async () => {
    const gravar = vi.fn();
    const r = await executarCriteriosEua(
      ctx({} as PrismaClient, { aplicar: false }),
      deps(['AAPL', 'O'], { gravar }),
    );
    expect(gravar).not.toHaveBeenCalled();
    expect(r.detalhes).toMatchObject({ linhas: 6, linhasGravadas: 0, aplicar: false });
  });

  it('CIK sem nenhuma linha da SEC ⇒ tudo sem dado (n de 6) e alerta', async () => {
    const capturadas: Array<{ atendidos: number; aplicaveis: number; semDado: boolean }> = [];
    const c = ctx({} as PrismaClient);
    await executarCriteriosEua(
      c,
      deps(['AAPL'], {
        lerBrutos: async (_p, ciks) => new Map(ciks.map((cik) => [cik, { cik, fys: [] }])),
        gravar: async (_p, linhas) => {
          capturadas.push(...(linhas as typeof capturadas));
          return linhas.length;
        },
      }),
    );
    expect(capturadas.every((l) => l.atendidos === 0 && l.aplicaveis === 6 && l.semDado)).toBe(
      true,
    );
    expect(c.alertas.map((a) => a.codigo)).toContain('criterios_eua_sem_fundamentos');
  });
});

describe('helpers puros', () => {
  it('coberturaPerfil: sem dado por base ≤ 0 conta como com dado; demonstração faltando não', () => {
    const av = (
      estado: 'atende' | 'sem_dado',
      motivo?: 'base_nao_positiva' | 'sem_dado_demonstracoes',
    ) =>
      ({
        symbol: 'X',
        classe: 'stock',
        perfil: 'stock',
        paramsVersion: 6,
        janelas: {
          '5': {
            resultados: [{ id: 'luc', estado, motivo, n: null, de: null, fato: '', serie: null }],
          },
        },
      }) as unknown as AvaliacaoAtivo;
    const c = coberturaPerfil(
      [
        av('atende'),
        av('sem_dado', 'base_nao_positiva'),
        av('sem_dado', 'sem_dado_demonstracoes'),
        av('atende'),
      ],
      'stock',
      5,
    );
    expect(c).toEqual({ total: 4, porCriterio: { luc: 0.75 } });
  });

  it('coberturaPerfil: com o filtro, só conta os tickers com a janela completa', () => {
    const av = (symbol: string, estado: 'atende' | 'sem_dado') =>
      ({
        symbol,
        classe: 'stock',
        perfil: 'stock',
        paramsVersion: 6,
        janelas: {
          '5': { resultados: [{ id: 'dl', estado, n: null, de: null, fato: '', serie: null }] },
        },
      }) as unknown as AvaliacaoAtivo;
    const todos = [av('A', 'atende'), av('B', 'atende'), av('IPO', 'sem_dado')];
    expect(coberturaPerfil(todos, 'stock', 5).porCriterio.dl).toBe(0.667);
    expect(coberturaPerfil(todos, 'stock', 5, new Set(['A', 'B']))).toEqual({
      total: 2,
      porCriterio: { dl: 1 },
    });
  });

  it('agruparUniversoEua: um item por CIK com todos os tickers (GOOGL/GOOG)', () => {
    const base = {
      symbolSec: '',
      symbolNorm: '',
      principal: false,
      nome: 'Alphabet',
      classe: 'stock' as const,
      sic: 7370,
      ehFinanceira: false,
      bolsa: 'Nasdaq' as const,
      segmento: null,
      exercicioFimMmdd: '1231',
      publicFloatUsd: null,
      publicFloatData: null,
      noUniverso: true,
    };
    const itens: EmpresaEua[] = [
      { ...base, cik: '0001652044', cikFundamentos: '0001652044', symbol: 'GOOG' },
      { ...base, cik: '0001652044', cikFundamentos: '0001652044', symbol: 'GOOGL' },
      { ...base, cik: '0002115436', cikFundamentos: '0000034088', symbol: 'XOM' },
    ];
    expect(agruparUniversoEua(itens)).toEqual([
      expect.objectContaining({ cik: '0001652044', symbols: ['GOOG', 'GOOGL'] }),
      expect.objectContaining({
        cik: '0002115436',
        cikFundamentos: '0000034088',
        symbols: ['XOM'],
      }),
    ]);
  });

  it('fontesDoMercado: porMercado us_* da v3 vira a prioridade padrão', () => {
    const f = fontesDoMercado(fontesEfetivas(CRITERIA_PARAMS_V3), 'reit');
    expect(f.prioridade).toEqual({ padrao: ['sec'], porSerie: {} });
  });

  it("ajustarFatosEua: 'pay' com FCO ≤ 0 ganha o fato do caixa operacional (sem o motivo do EBITDA)", () => {
    const a: AvaliacaoAtivo = {
      symbol: 'X',
      classe: 'reit',
      perfil: 'reit',
      paramsVersion: 3,
      janelas: {
        '3': {
          janela: 3,
          anoInicio: 2023,
          anoFim: 2025,
          atendidos: 0,
          aplicaveis: 6,
          semDado: false,
          resultados: [
            {
              id: 'pay',
              estado: 'nao_atende',
              n: 2,
              de: 3,
              fato: 'EBITDA ≤ 0 em 2024',
              motivo: 'ebitda_nao_positivo',
              serie: [
                { ano: 2023, valor: 50 },
                { ano: 2024, valor: null },
                { ano: 2025, valor: 60 },
              ],
            },
            {
              id: 'dl',
              estado: 'nao_atende',
              n: 2,
              de: 3,
              fato: 'EBITDA ≤ 0 em 2025',
              motivo: 'ebitda_nao_positivo',
              serie: null,
            },
          ],
        },
      } as AvaliacaoAtivo['janelas'],
    };
    const r = ajustarFatosEua(a, { 2023: 50, 2024: Number.POSITIVE_INFINITY, 2025: 60 });
    const [pay, dl] = r.janelas['3'].resultados;
    expect(pay.fato).toBe('caixa operacional ≤ 0 em 2024');
    expect(pay.motivo).toBeUndefined();
    expect(pay.estado).toBe('nao_atende');
    // o dl continua com o fato do EBITDA
    expect(dl.fato).toBe('EBITDA ≤ 0 em 2025');
  });
});
