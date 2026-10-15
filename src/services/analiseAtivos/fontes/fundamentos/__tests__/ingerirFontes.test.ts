/**
 * Job 'fontes-fundamentos' com a FONTE DE EXEMPLO (dublê do conector pago), banco em memória e a
 * CVM real da fixture do DEV (WEGE3, HGLG11): point-in-time, descarte do que está fora do catálogo,
 * sanidade da §6 (variação, divergência contra a CVM, confiança, obrigatórias), caso de curadoria
 * 'fonte_externa' e a prioridade de fontes no resolvedor (provedor aprovado sobrepõe a CVM; pending
 * nunca aparece).
 */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { pontosCvmAcao } from '@/services/analiseAtivos/fontes/fundamentos/fonteCvm';
import {
  criarFonteExemplo,
  FONTE_EXEMPLO,
  itensExemplo,
  type ItemFonteExemplo,
} from '@/services/analiseAtivos/fontes/fundamentos/fonteExemplo';
import {
  DEPENDENCIAS_INGESTAO,
  ingerirFontes,
  type DependenciasIngestao,
  type RelatorioFonte,
} from '@/services/analiseAtivos/fontes/fundamentos/ingerirFontes';
import { obterFonte } from '@/services/analiseAtivos/fontes/fundamentos/registro';
import { resolverSeries } from '@/services/analiseAtivos/fontes/fundamentos/resolverSeries';
import {
  criteriaParamsSchema,
  fontesEfetivas,
  type CriteriaParams,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { CRITERIA_PARAMS_V2_JSON } from '@/services/analiseAtivos/params/criteriaParamsV2';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import type {
  CasoFonteParaAbrir,
  LinhaPontoNova,
  QualidadeGravada,
} from '@/services/analiseAtivos/repositorio/fontesFundamentosEscrita';
import { assinaturaQualidade } from '@/services/analiseAtivos/repositorio/fontesFundamentosEscrita';
import { maiorVersaoPorChave } from '@/services/analiseAtivos/repositorio/fontesFundamentos';
import type { BrutoAcao } from '@/services/analiseAtivos/regras/criterios/seriesAcao';
import type { AlertaJob, JobContexto } from '@/services/analiseAtivos/tipos';
import type { PontoSerieVigente } from '@/types/analiseAtivosFontes';
import fixture from '../../../regras/criterios/__tests__/fixtures/dev-2026-10-13.json';

type AcaoFixture = BrutoAcao & { symbols: string[] };
const WEGE = (fixture.acoes as unknown as AcaoFixture[]).find((a) => a.symbols.includes('WEGE3'))!;

/** v2 com o provedor de exemplo à frente da CVM (o que uma versão nova de params faria). */
const PARAMS: CriteriaParams = (() => {
  const json = structuredClone(CRITERIA_PARAMS_V2_JSON) as unknown as {
    fontes: { prioridade: { padrao: string[]; porSerie: Record<string, string[]> } };
  };
  json.fontes.prioridade.padrao = ['exemplo', 'cvm'];
  json.fontes.prioridade.porSerie = { vacancy_physical: ['exemplo', 'cvm'] };
  return criteriaParamsSchema.parse(json);
})();

type LinhaMemoria = LinhaPontoNova & { reviewedBy: string | null };

function memoria() {
  const pontos: LinhaMemoria[] = [];
  const qualidade: Array<Record<string, unknown>> = [];
  const casos: CasoFonteParaAbrir[] = [];
  let seq = 0;
  const deps: Partial<DependenciasIngestao> = {
    gerarId: () => `p${++seq}`,
    lerHistoricoPontos: vi.fn(async (_p, fonte, symbols, series) =>
      pontos
        .filter((l) => l.fonte === fonte && symbols.includes(l.symbol) && series.includes(l.serie))
        .map((l) => ({
          id: l.id,
          symbol: l.symbol,
          serie: l.serie,
          tipoPeriodo: l.tipoPeriodo,
          dtFim: l.dtFim,
          valor: l.valor,
          versao: l.versao,
          reviewStatus: l.reviewStatus,
          incompleto: l.incompleto,
        })),
    ),
    gravarPontos: vi.fn(async (_p, linhas) => {
      pontos.push(...linhas.map((l) => ({ ...l, reviewedBy: null })));
      return linhas.length;
    }),
    lerHistoricoQualidade: vi.fn(
      async (_p, fonte, cnpjs): Promise<QualidadeGravada[]> =>
        qualidade
          .filter((q) => q.fonte === fonte && cnpjs.includes(q.cnpj as string))
          .map((q) => ({
            id: q.id as string,
            cnpj: q.cnpj as string,
            periodo: q.periodo as string,
            versao: q.versao as number,
            reviewStatus: q.reviewStatus as string,
            defaultPct: (q.defaultPct as number) ?? null,
            ltvAvg: (q.ltvAvg as number) ?? null,
            conteudo: assinaturaQualidade(q),
          })),
    ),
    gravarQualidade: vi.fn(async (_p, linhas) => {
      qualidade.push(...linhas.map((l) => ({ ...l })));
      return linhas.length;
    }),
    abrirCasoFonte: vi.fn(async (_p, c: CasoFonteParaAbrir) => {
      const i = casos.findIndex(
        (x) => x.symbol === c.symbol && x.campo === c.campo && x.periodo === c.periodo,
      );
      if (i >= 0) {
        casos[i] = c;
        return 'atualizado' as const;
      }
      casos.push(c);
      return 'aberto' as const;
    }),
  };
  /** O que a TELA leria: approved, maior versão (repositorio/fontesFundamentos). */
  const vigentes = (): PontoSerieVigente[] =>
    maiorVersaoPorChave(
      pontos
        .filter((l) => l.reviewStatus === 'approved')
        .map((l) => ({
          symbol: l.symbol,
          serie: l.serie,
          tipoPeriodo: l.tipoPeriodo,
          anoFiscal: l.anoFiscal,
          dtFim: l.dtFim,
          valor: l.valor,
          fonte: l.fonte,
          versao: l.versao,
          incompleto: l.incompleto,
        })),
      (p) => `${p.symbol}|${p.serie}|${p.tipoPeriodo}|${p.dtFim}|${p.fonte}`,
    );
  return { pontos, qualidade, casos, deps, vigentes };
}

function ctxCom(opts: { aplicar?: boolean } = {}) {
  const alertas: AlertaJob[] = [];
  const contagem = { linhasLidas: 0, linhasGravadas: 0, rejeitadas: 0 };
  const ctx: JobContexto = {
    prisma: {} as PrismaClient,
    prazo: Date.now() + 60_000,
    restanteMs: () => 60_000,
    estourouPrazo: () => false,
    alertar: (a) => alertas.push(a),
    contar: (campo, n = 1) => {
      contagem[campo] += n;
    },
    params: SCORING_PARAMS_V1,
    paramsVersion: 1,
    hoje: '2026-10-15',
    origem: 'script',
    aplicar: opts.aplicar ?? true,
  };
  return { ctx, alertas, contagem };
}

function depsCom(
  mem: ReturnType<typeof memoria>,
  itens: readonly ItemFonteExemplo[] | null,
  over: Partial<DependenciasIngestao> = {},
): DependenciasIngestao {
  const fonte = itens ? criarFonteExemplo({ itens }) : FONTE_EXEMPLO;
  return {
    ...DEPENDENCIAS_INGESTAO,
    obterParams: vi.fn(async () => ({ versao: 3, params: PARAMS })),
    carregarUniverso: vi.fn(async () => ({
      empresas: [
        {
          cnpj: WEGE.cnpj,
          ehFinanceira: false,
          escopoPreferido: 'con' as const,
          symbols: ['WEGE3'],
        },
      ],
      fiis: [{ symbol: 'HGLG11', cnpj: 'F-HGLG', conferido: true }],
    })),
    lerBrutosAcoes: vi.fn(async (_p, empresas) => new Map(empresas.map((e) => [e.cnpj, WEGE]))),
    lerBrutosFii: vi.fn(async () => new Map()),
    obterFonte: (id) => (id === 'exemplo' ? fonte : null),
    idsHabilitados: () => ['exemplo'],
    credenciais: () => ({}),
    ...mem.deps,
    ...over,
  };
}

const ponto = (
  serie: string,
  ano: number,
  valor: number | null,
  extra: Record<string, unknown> = {},
): ItemFonteExemplo => ({
  symbol: 'WEGE3',
  classe: 'acao',
  serie,
  tipoPeriodo: 'FY',
  anoFiscal: ano,
  dtFim: `${ano}-12-31`,
  valor,
  extractedBy: 'api',
  ...extra,
});

/** Receita e lucro da CVM (em reais) para os itens que concordam com ela. */
const CVM_WEGE = pontosCvmAcao(WEGE, ['WEGE3']);
const cvm = (serie: string, ano: number) =>
  CVM_WEGE.find((p) => p.serie === serie && p.anoFiscal === ano)?.valor as number;

/** Itens "bons": receita/lucro iguais à CVM e o descontado = 95% do lucro, 2019–2025. */
function itensBons(): ItemFonteExemplo[] {
  return [2019, 2020, 2021, 2022, 2023, 2024, 2025].flatMap((ano) => [
    ponto('revenue', ano, cvm('revenue', ano)),
    ponto('net_income', ano, cvm('net_income', ano)),
    ponto('net_income_adjusted', ano, Math.round(cvm('net_income', ano) * 0.95)),
  ]);
}

const rel = (r: Awaited<ReturnType<typeof ingerirFontes>>) =>
  (r.detalhes?.porFonte as Record<string, RelatorioFonte>).exemplo;

describe("job 'fontes-fundamentos'", () => {
  it("sem conector habilitado termina 'pulado' sem ler nada", async () => {
    const mem = memoria();
    const d = depsCom(mem, [], { idsHabilitados: () => [] });
    const r = await ingerirFontes(ctxCom().ctx, d);
    expect(r.pulado).toMatch(/nenhum conector/);
    expect(d.obterParams).not.toHaveBeenCalled();
  });

  it("'exemplo' em produção é recusado (alerta de erro, nada gravado)", async () => {
    const mem = memoria();
    const { ctx, alertas } = ctxCom();
    await ingerirFontes(
      ctx,
      depsCom(mem, itensBons(), { obterFonte: (id) => obterFonte(id, 'production') }),
    );
    expect(alertas).toContainEqual(
      expect.objectContaining({ codigo: 'fontes_exemplo_em_producao', nivel: 'erro' }),
    );
    expect(mem.pontos).toHaveLength(0);
  });

  it('point-in-time: valor igual não cria versão; valor diferente cria versao+1', async () => {
    const mem = memoria();
    const r1 = await ingerirFontes(ctxCom().ctx, depsCom(mem, itensBons()));
    expect(rel(r1)).toMatchObject({ gravados: 21, pendentes: 0, iguais: 0 });
    expect(mem.pontos.every((p) => p.versao === 1 && p.reviewStatus === 'approved')).toBe(true);

    const r2 = await ingerirFontes(ctxCom().ctx, depsCom(mem, itensBons()));
    expect(rel(r2)).toMatchObject({ gravados: 0, iguais: 21 });
    expect(mem.pontos).toHaveLength(21);

    // o provedor revisa o descontado de 2025 em 2% (dentro da sanidade)
    const revisados = itensBons().map((i) =>
      (i as { serie: string; anoFiscal: number }).serie === 'net_income_adjusted' &&
      (i as { anoFiscal: number }).anoFiscal === 2025
        ? { ...i, valor: Math.round(cvm('net_income', 2025) * 0.97) }
        : i,
    );
    const r3 = await ingerirFontes(ctxCom().ctx, depsCom(mem, revisados));
    expect(rel(r3)).toMatchObject({ gravados: 1, iguais: 20 });
    const versoes = mem.pontos.filter(
      (p) => p.serie === 'net_income_adjusted' && p.anoFiscal === 2025,
    );
    expect(versoes.map((v) => v.versao)).toEqual([1, 2]);
    // nunca UPDATE: a versão 1 continua lá, com o valor antigo
    expect(versoes[0].valor).toBe(Math.round(cvm('net_income', 2025) * 0.95));
  });

  it("descarta 'rating' (fora do catálogo) e campos fora do contrato", async () => {
    const mem = memoria();
    const { ctx, alertas } = ctxCom();
    const r = await ingerirFontes(
      ctx,
      depsCom(mem, [
        ...itensBons(),
        { ...(ponto('rating', 2025, 7) as object) },
        ponto('revenue', 2018, 1e9, { score: 9, rating: 'AAA' }),
      ]),
    );
    expect(rel(r).descartados).toEqual({ fora_do_catalogo: 1 });
    expect(rel(r).seriesDescartadas).toEqual(['rating']);
    expect(alertas.find((a) => a.codigo === 'fontes_series_descartadas')?.mensagem).toContain(
      'rating',
    );
    const linha = mem.pontos.find((p) => p.serie === 'revenue' && p.anoFiscal === 2018)!;
    expect(linha).toBeDefined();
    expect(Object.keys(linha).some((k) => /score|rating|nota|indice/i.test(k))).toBe(false);
    expect(mem.pontos.some((p) => (p.serie as string) === 'rating')).toBe(false);
  });

  it('o gerador do exemplo manda um rating por ano e ele nunca é gravado', async () => {
    const itens = itensExemplo(
      { symbol: 'WEGE3', emissorId: WEGE.cnpj, classe: 'acao', mercado: 'br_acoes' },
      2024,
      2025,
    );
    expect(itens.filter((i) => (i as { serie?: string }).serie === 'rating')).toHaveLength(2);
    const mem = memoria();
    const r = await ingerirFontes(ctxCom().ctx, depsCom(mem, itens));
    expect(rel(r).descartados.fora_do_catalogo).toBe(2);
  });

  it('variação > 40% contra o período anterior aprovado → pending + caso fonte_externa', async () => {
    const mem = memoria();
    await ingerirFontes(ctxCom().ctx, depsCom(mem, itensBons()));
    const salto = [
      ponto('net_income_adjusted', 2026, Math.round(cvm('net_income', 2025) * 0.95 * 1.5)),
    ];
    const r = await ingerirFontes(ctxCom().ctx, depsCom(mem, salto));
    expect(rel(r)).toMatchObject({ pendentes: 1, casosAbertos: 1 });
    const pend = mem.pontos.find((p) => p.reviewStatus === 'pending')!;
    expect(pend.motivosRevisao).toEqual(['variacao']);
    expect(mem.casos[0]).toMatchObject({
      symbol: 'WEGE3',
      campo: 'net_income_adjusted',
      periodo: '2026-12-31',
      contexto: {
        tipo: 'fonte_externa',
        referencia: { tabela: 'asset_fundamentals_serie', id: pend.id },
        fonte: 'exemplo',
        motivos: ['variacao'],
      },
    });
  });

  it('divergência de 6% contra a CVM → pending, e o resolvedor usa a CVM', async () => {
    const mem = memoria();
    const itens = itensBons().map((i) =>
      (i as { serie: string }).serie === 'revenue' &&
      (i as { anoFiscal: number }).anoFiscal === 2025
        ? { ...i, valor: Math.round(cvm('revenue', 2025) * 1.06) }
        : i,
    );
    const r = await ingerirFontes(ctxCom().ctx, depsCom(mem, itens));
    expect(rel(r).pendentes).toBe(1);
    const pend = mem.pontos.find((p) => p.reviewStatus === 'pending')!;
    expect(pend).toMatchObject({ serie: 'revenue', anoFiscal: 2025 });
    expect(pend.motivosRevisao).toContain('divergencia_cvm');
    expect(mem.casos[0].contexto.valorCvm).toBeCloseTo(cvm('revenue', 2025), 0);

    // tela: provedor aprovado sobrepõe a CVM nos outros anos; o pending de 2025 não aparece
    const res = resolverSeries({
      pontos: [...CVM_WEGE, ...mem.vigentes()],
      series: ['revenue'],
      fontes: fontesEfetivas(PARAMS),
    });
    expect(res.origens.revenue?.[2024]?.fonte).toBe('exemplo');
    expect(res.origens.revenue?.[2025]?.fonte).toBe('cvm');
    expect(res.series.revenue?.[2025]).toBeCloseTo(cvm('revenue', 2025) / 1e6, 6);
  });

  it('confiança 0,7 da extração → pending', async () => {
    const mem = memoria();
    const r = await ingerirFontes(
      ctxCom().ctx,
      depsCom(mem, [
        ...itensBons(),
        ponto('net_income_adjusted', 2026, 1, { extractedBy: 'llm', confianca: 0.7 }),
      ]),
    );
    expect(rel(r).pendentes).toBe(1);
    expect(mem.pontos.find((p) => p.reviewStatus === 'pending')?.motivosRevisao).toContain(
      'confianca',
    );
  });

  it('série obrigatória ausente no período → ponto incompleto (valor null)', async () => {
    const mem = memoria();
    const r = await ingerirFontes(
      ctxCom().ctx,
      depsCom(mem, [ponto('net_income_adjusted', 2025, 5e9)]),
    );
    expect(rel(r).incompletos).toBe(2);
    const inc = mem.pontos.filter((p) => p.incompleto);
    expect(inc.map((p) => p.serie).sort()).toEqual(['net_income', 'revenue']);
    expect(inc.every((p) => p.valor === null && p.reviewStatus === 'approved')).toBe(true);
    // no resolvedor: o ponto incompleto do provedor (à frente da CVM) NÃO apaga a receita da CVM
    const res = resolverSeries({
      pontos: [...CVM_WEGE, ...mem.vigentes()],
      series: ['revenue'],
      fontes: fontesEfetivas(PARAMS),
    });
    expect(res.series.revenue?.[2025]).not.toBeNull();
    expect(res.origens.revenue?.[2025]).toMatchObject({ fonte: 'cvm', incompleto: false });
    // sem a CVM no ano, o ano fica incompleto (selo §6)
    const soProvedor = resolverSeries({
      pontos: mem.vigentes(),
      series: ['revenue'],
      fontes: fontesEfetivas(PARAMS),
    });
    expect(soProvedor.series.revenue?.[2025]).toBeNull();
    expect(soProvedor.origens.revenue?.[2025]).toMatchObject({
      fonte: 'exemplo',
      incompleto: true,
    });
  });

  it('FII: vacância trimestral e qualidade (default_pct/ltv_avg) gravadas pelo gerador', async () => {
    const mem = memoria();
    const r = await ingerirFontes(ctxCom().ctx, depsCom(mem, null));
    expect(rel(r).qualidadeGravadas).toBeGreaterThan(0);
    expect(mem.pontos.some((p) => p.serie === 'vacancy_physical' && p.tipoPeriodo === 'Q')).toBe(
      true,
    );
    expect(mem.qualidade[0]).toMatchObject({ symbol: 'HGLG11', fonte: 'exemplo' });
    // nenhuma coluna de nota/score/rating na qualidade
    expect(Object.keys(mem.qualidade[0]).some((k) => /score|rating|nota|indice/i.test(k))).toBe(
      false,
    );
  });

  it('dry-run (aplicar=false): relata sem gravar nem abrir caso', async () => {
    const mem = memoria();
    const r = await ingerirFontes(ctxCom({ aplicar: false }).ctx, depsCom(mem, itensBons()));
    expect(rel(r).gravados).toBe(0);
    expect(mem.pontos).toHaveLength(0);
    expect(mem.casos).toHaveLength(0);
  });

  it('--fonte e --versao-params do runner chegam ao job', async () => {
    const mem = memoria();
    const d = depsCom(mem, itensBons(), { idsHabilitados: () => [] });
    const r = await ingerirFontes(ctxCom().ctx, d, { fonte: 'exemplo', versaoParams: 2 });
    expect(d.obterParams).toHaveBeenCalledWith(expect.anything(), { versao: 2 });
    expect(rel(r).gravados).toBe(21);
  });
});
