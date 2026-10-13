import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  coberturaAcoes,
  executarCriterios,
  type DependenciasCriterios,
  type UniversoCriterios,
} from '@/services/analiseAtivos/calculo/executarCriterios';
import { CRITERIA_PARAMS_V1 } from '@/services/analiseAtivos/params/criteriaParamsV1';
import { ErroParams } from '@/services/analiseAtivos/params/obterCriteriaParams';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import {
  gravarCriteriaEval,
  type LinhaCriteriaEval,
} from '@/services/analiseAtivos/repositorio/criterios';
import type {
  BrutoAcao,
  FyBrutoCriterios,
} from '@/services/analiseAtivos/regras/criterios/seriesAcao';
import type { BrutoFii } from '@/services/analiseAtivos/regras/criterios/seriesFii';
import type { AlertaJob, JobContexto } from '@/services/analiseAtivos/tipos';

/** Prisma fake: só criteria_eval em memória, com $transaction em lote (tudo ou nada). */
function prismaFake(falharCreate = false) {
  const tabela = new Map<string, LinhaCriteriaEval>();
  const chave = (l: LinhaCriteriaEval) => `${l.symbol}|${l.janela}`;
  const criteriaEval = {
    deleteMany: vi.fn(() => ({ tipo: 'delete' as const })),
    createMany: vi.fn(({ data }: { data: LinhaCriteriaEval[] }) => ({
      tipo: 'create' as const,
      data,
    })),
  };
  const $transaction = vi.fn(
    async (lote: Array<{ tipo: 'delete' } | { tipo: 'create'; data: LinhaCriteriaEval[] }>) => {
      const copia = new Map(tabela);
      const out: Array<{ count: number }> = [];
      for (const op of lote) {
        if (op.tipo === 'delete') {
          out.push({ count: copia.size });
          copia.clear();
        } else {
          if (falharCreate) throw new Error('falha no meio da transação');
          for (const l of op.data) {
            if (copia.has(chave(l))) throw new Error(`unique (symbol, janela): ${chave(l)}`);
            copia.set(chave(l), l);
          }
          out.push({ count: op.data.length });
        }
      }
      tabela.clear();
      for (const [k, v] of copia) tabela.set(k, v);
      return out;
    },
  );
  return { prisma: { criteriaEval, $transaction } as unknown as PrismaClient, tabela };
}

function ctxCom(prisma: PrismaClient, opts: { aplicar?: boolean; estourou?: boolean } = {}) {
  const alertas: AlertaJob[] = [];
  const contagem = { linhasLidas: 0, linhasGravadas: 0, rejeitadas: 0 };
  const ctx: JobContexto = {
    prisma,
    prazo: Date.now() + 60_000,
    restanteMs: () => 60_000,
    estourouPrazo: () => opts.estourou ?? false,
    alertar: (a) => alertas.push(a),
    contar: (campo, n = 1) => {
      contagem[campo] += n;
    },
    params: SCORING_PARAMS_V1,
    paramsVersion: 1,
    hoje: '2026-10-13',
    origem: 'script',
    aplicar: opts.aplicar ?? true,
  };
  return { ctx, alertas, contagem };
}

/** FY consolidado com receita e lucro crescentes desde 2015. */
function fys(cnpj: string, semReceitaDesde?: number): FyBrutoCriterios[] {
  return Array.from({ length: 11 }, (_, i) => {
    const ano = 2015 + i;
    return {
      emissorId: cnpj,
      dtFim: `${ano}-12-31`,
      escopo: 'con' as const,
      versao: 1,
      anoFiscal: ano,
      receita: semReceitaDesde !== undefined && ano >= semReceitaDesde ? null : 1e9 * (i + 1),
      ebit: 2e8 * (i + 1),
      depreciacaoAmortizacao: 1e7,
      lucroLiquido: 1e8 * (i + 1),
      lucroAtribuivel: 1e8 * (i + 1),
      caixa: 5e8,
      aplicacoesFinanceiras: 0,
      dividaBrutaCp: 1e8,
      dividaBrutaLp: 1e8,
      fco: 3e8 * (i + 1),
      capex: 1e8,
      naoSeAplica: [],
      flags: [],
    };
  });
}

const UNIVERSO: UniversoCriterios = {
  empresas: [
    { cnpj: 'C-WEG', ehFinanceira: false, escopoPreferido: 'con', symbols: ['WEGE3'] },
    { cnpj: 'C-ITAU', ehFinanceira: true, escopoPreferido: 'ind', symbols: ['ITUB3', 'ITUB4'] },
  ],
  fiis: [{ symbol: 'HGLG11', cnpj: 'F-HGLG', conferido: true }],
};

const BRUTO_FII: BrutoFii = {
  symbol: 'HGLG11',
  cnpj: 'F-HGLG',
  conferido: true,
  fiiTipo: 'hibrido',
  composicao: { pl: 100, imoveis: 60, spe: 0 },
  perShare: [],
  multiplos: [],
  trimestres: [],
  desdobramentos: [],
  proventos: [],
};

function deps(
  over: Partial<DependenciasCriterios> = {},
  brutosAcoes: (cnpj: string) => BrutoAcao = (cnpj) => ({
    cnpj,
    ehFinanceira: cnpj === 'C-ITAU',
    escopoPreferido: 'con',
    fys: fys(cnpj),
    flagsConf: [],
  }),
): DependenciasCriterios {
  return {
    scoresEmExecucao: vi.fn(async () => false),
    obterParams: vi.fn(async () => ({ versao: 3, params: CRITERIA_PARAMS_V1 })),
    carregarUniverso: vi.fn(async () => UNIVERSO),
    lerBrutosAcoes: vi.fn(
      async (_p, empresas) => new Map(empresas.map((e) => [e.cnpj, brutosAcoes(e.cnpj)])),
    ),
    lerBrutosFii: vi.fn(async (_p, fiis) => new Map(fiis.map((f) => [f.symbol, BRUTO_FII]))),
    simbolosNoQuadro: vi.fn(async () => new Set<string>()),
    gravar: gravarCriteriaEval,
    ...over,
  };
}

describe('executarCriterios', () => {
  it('avalia o universo nas 3 janelas e grava criteria_eval com a paramsVersion', async () => {
    const { prisma, tabela } = prismaFake();
    const { ctx, contagem, alertas } = ctxCom(prisma);
    const d = deps();
    const r = await executarCriterios(ctx, d);
    expect(r.parcial).toBeUndefined();
    expect(r.pulado).toBeUndefined();
    // 4 símbolos × 3 janelas
    expect(tabela.size).toBe(12);
    expect(contagem).toMatchObject({ linhasLidas: 4, linhasGravadas: 12 });
    const wege5 = tabela.get('WEGE3|5')!;
    expect(wege5).toMatchObject({
      cnpj: 'C-WEG',
      classe: 'acao',
      perfil: 'acao',
      janela: 5,
      anoInicio: 2021,
      anoFim: 2025,
      paramsVersion: 3,
      semDado: false,
    });
    expect(wege5.aplicaveis).toBe(6);
    // financeira: os 2 tickers da empresa, n de 3
    expect(tabela.get('ITUB4|5')).toMatchObject({ perfil: 'acao_financeira', aplicaveis: 3 });
    expect(tabela.get('ITUB3|10')).toMatchObject({ perfil: 'acao_financeira', aplicaveis: 3 });
    // FII híbrido com imóveis ≥ 50% do PL → tijolo; sem séries = sem dado
    expect(tabela.get('HGLG11|3')).toMatchObject({
      perfil: 'fii_tijolo',
      classe: 'fii',
      semDado: true,
    });
    // lotes de 50 com só as empresas do lote; a âncora lê desde 2015
    expect(d.lerBrutosAcoes).toHaveBeenCalledWith(prisma, UNIVERSO.empresas, 2015);
    expect(r.detalhes).toMatchObject({ anoFim: 2025, paramsVersion: 3, simbolos: 4, linhas: 12 });
    expect(alertas.filter((a) => a.codigo === 'criterios_cobertura_baixa')).toHaveLength(0);
  });

  it('idempotente: rodar 2× deixa o mesmo conjunto (deleteMany + createMany na transação)', async () => {
    const { prisma, tabela } = prismaFake();
    await executarCriterios(ctxCom(prisma).ctx, deps());
    const primeira = [...tabela.keys()].sort();
    await executarCriterios(ctxCom(prisma).ctx, deps());
    expect([...tabela.keys()].sort()).toEqual(primeira);
    expect(tabela.size).toBe(12);
  });

  it('falha no meio da gravação não deixa a tabela pela metade', async () => {
    const { prisma, tabela } = prismaFake();
    await executarCriterios(ctxCom(prisma).ctx, deps());
    const antes = new Map(tabela);
    const quebrado = prismaFake(true);
    for (const [k, v] of antes) quebrado.tabela.set(k, v);
    await expect(executarCriterios(ctxCom(quebrado.prisma).ctx, deps())).rejects.toThrow(
      'falha no meio',
    );
    expect(quebrado.tabela.size).toBe(antes.size);
  });

  it("scores ainda executando ⇒ 'pulado' com alerta, sem ler nem gravar", async () => {
    const { prisma, tabela } = prismaFake();
    const { ctx, alertas } = ctxCom(prisma);
    const d = deps({ scoresEmExecucao: vi.fn(async () => true) });
    const r = await executarCriterios(ctx, d);
    expect(r.pulado).toContain('scores');
    expect(alertas).toContainEqual(
      expect.objectContaining({ codigo: 'criterios_scores_em_execucao', nivel: 'aviso' }),
    );
    expect(d.carregarUniverso).not.toHaveBeenCalled();
    expect(tabela.size).toBe(0);
  });

  it('params ausente ⇒ alerta de erro e falha (nada gravado)', async () => {
    const { prisma, tabela } = prismaFake();
    const { ctx, alertas } = ctxCom(prisma);
    const d = deps({
      obterParams: vi.fn(async () => {
        throw new ErroParams('sem_versao_ativa', 'nenhuma versão ativa de CriteriaParams no banco');
      }),
    });
    await expect(executarCriterios(ctx, d)).rejects.toThrow('nenhuma versão ativa');
    expect(alertas).toContainEqual(
      expect.objectContaining({ codigo: 'criteria_params_ausente', nivel: 'erro' }),
    );
    expect(tabela.size).toBe(0);
  });

  it('dry-run (aplicar=false) avalia e não grava', async () => {
    const { prisma, tabela } = prismaFake();
    const { ctx } = ctxCom(prisma, { aplicar: false });
    const r = await executarCriterios(ctx, deps());
    expect(tabela.size).toBe(0);
    expect(r.detalhes).toMatchObject({ linhas: 12, linhasGravadas: 0, aplicar: false });
  });

  it("prazo estourado ⇒ 'parcial' SEM gravar (a avaliação anterior fica inteira)", async () => {
    const { prisma, tabela } = prismaFake();
    const { ctx, alertas } = ctxCom(prisma, { estourou: true });
    const r = await executarCriterios(ctx, deps());
    expect(r.parcial).toBe(true);
    expect(tabela.size).toBe(0);
    expect(alertas).toContainEqual(expect.objectContaining({ codigo: 'criterios_prazo' }));
  });

  it('cobertura das ações do Quadro na janela 5 abaixo de 90% ⇒ alerta', async () => {
    const { prisma } = prismaFake();
    const { ctx, alertas } = ctxCom(prisma);
    const d = deps({}, (cnpj) => ({
      cnpj,
      ehFinanceira: false,
      escopoPreferido: 'con',
      // receita some de 2023 em diante: rec, mg sem dado na janela 5
      fys: fys(cnpj, 2023),
      flagsConf: [],
    }));
    await executarCriterios(ctx, d);
    const a = alertas.find((x) => x.codigo === 'criterios_cobertura_baixa');
    expect(a?.mensagem).toContain('rec 0%');
    expect(a?.mensagem).toContain('mg 0%');
  });

  it('a cobertura considera só as linhas do Quadro quando há Quadro', async () => {
    const { prisma } = prismaFake();
    const { ctx } = ctxCom(prisma);
    const r = await executarCriterios(
      ctx,
      deps({ simbolosNoQuadro: vi.fn(async () => new Set(['WEGE3'])) }),
    );
    expect((r.detalhes?.coberturaAcoesJanela5 as { total: number }).total).toBe(1);
  });
});

describe('coberturaAcoes', () => {
  it('fração com dado por critério das ações não financeiras', () => {
    const r = coberturaAcoes([], 5);
    expect(r).toEqual({ total: 0, porCriterio: {} });
  });
});
