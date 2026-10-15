/**
 * Job 'criterios' da Análise de Ativos v2.4 (Filtros de Fundamentos) — diário 10:30 UTC, entre o
 * 'scores' (10:10) e o 'quadro' (10:40). Só banco: nenhum provedor externo.
 *
 * 1. Se o 'scores' ainda está executando (run aberto mais novo que o lock), termina 'pulado' com
 *    alerta: o 'quadro' usa a avaliação anterior.
 * 2. CriteriaParams ativo (criteria_params; ausente = alerta de erro e falha, nada é gravado).
 * 3. Universo = cadastro do Quadro (CvmCompanyTicker vigente ∪ FiiTickerMap vigente), em lotes de
 *    50 (empresas / FIIs), lendo só as colunas usadas: séries de ação (seriesAcao) e de FII
 *    (seriesFii + meses), perfil (perfilCriterios) e avaliação pura (avaliarAtivo) nas 3 janelas,
 *    com a âncora global (anoFimGlobal).
 * 4. Grava criteria_eval numa transação (deleteMany + createMany; idempotente) com a paramsVersion.
 *    Estourou o prazo antes do fim ⇒ 'parcial' SEM gravar (a versão anterior fica inteira).
 *
 * v2.5 (camada de fontes): as séries de cada ativo saem do resolverSeries — os pontos da CVM
 * (FonteCvm: as mesmas leituras e regras de seriesAcao/seriesFii, agora como pontos; vacância física
 * do informe trimestral) + os pontos APROVADOS de provedores (asset_fundamentals_serie e
 * fii_property_quality, lidos só quando params.fontes cita uma fonte além da CVM), pela prioridade de
 * params.fontes; o resultado leva fonte e obs (fallback do lucro descontado, dados incompletos).
 * Lê a versão VIGENTE do criteria_params ou, com --versao-params=N no runner, a versão N (dry-run de
 * uma versão ainda não vigente). Com sanidade.aplicaA incluindo 'cvm', a regra de variação da §6
 * também tira pontos da CVM (contados em detalhes.cvmEmRevisao).
 * Alertas: params ausente; cobertura das ações não financeiras do Quadro na janela 5 abaixo do
 * mínimo em algum critério (90%; margem 85%, coberturaMinima); scores ainda rodando ('pulado').
 */
import type { PrismaClient } from '@prisma/client';
import { limparCacheCriterios } from '@/services/analiseAtivos/leitura/criterios/lerCriterios';
import { LOCK_TTL_PADRAO_MS } from '@/services/analiseAtivos/jobs/executarJob';
import { obterCriteriaParams } from '@/services/analiseAtivos/params/obterCriteriaParams';
import {
  criteriosDoPerfil,
  fontesCitadas,
  fontesEfetivas,
  type CriteriaParams,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { pontosCvmAcao, pontosCvmFii } from '@/services/analiseAtivos/fontes/fundamentos/fonteCvm';
import { resolverSeries } from '@/services/analiseAtivos/fontes/fundamentos/resolverSeries';
import { filtrarCvmPelaSanidade } from '@/services/analiseAtivos/fontes/fundamentos/sanidadeFonte';
import {
  lerPontosVigentes,
  lerQualidadeFiiVigente,
  pontosDaQualidadeFii,
} from '@/services/analiseAtivos/repositorio/fontesFundamentos';
import { anoFimGlobal } from '@/services/analiseAtivos/regras/criterios/ancoraJanela';
import { avaliarAtivo } from '@/services/analiseAtivos/regras/criterios/avaliarAtivo';
import { perfilCriterios } from '@/services/analiseAtivos/regras/criterios/perfilCriterios';
import {
  lerBrutosAcoes,
  opcoesSeriesAcao,
  type EmpresaCriterios,
} from '@/services/analiseAtivos/regras/criterios/seriesAcao';
import {
  imoveisPlPctFii,
  lerBrutosFii,
  mesesFii,
  type FiiCriterios,
} from '@/services/analiseAtivos/regras/criterios/seriesFii';
import {
  gravarCriteriaEval,
  linhasCriteriaEval,
  type AvaliacaoGravar,
} from '@/services/analiseAtivos/repositorio/criterios';
import {
  listarEmissores,
  listarFiisListados,
  listarTickersAcoes,
} from '@/services/analiseAtivos/repositorio/universo';
import type { JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';
import type {
  AvaliacaoAtivo,
  ChaveJanela,
  IdCriterio,
  Janela,
  PerfilComLista,
  PerfilCriterio,
} from '@/types/analiseAtivosCriterios';
import type { PontoSerieVigente, SerieFundamento } from '@/types/analiseAtivosFontes';

/** Empresas / FIIs por lote (pico de RSS medido no DEV: ver RUNBOOK §5). */
export const LOTE_CRITERIOS = 50;
/** Cobertura mínima (com dado) de cada critério das ações não financeiras na janela 5. */
export const COBERTURA_MINIMA_ACOES = 0.9;
/**
 * Exceções por critério. Margem: receita ≤ lucro num ano (ganho não recorrente, ex.: fusão da
 * ALOS3 em 2023) fica sem dado por regra, então a cobertura normal é menor (88,4% em prod em
 * 15/10/2026, com rec/luc acima de 94%). 85% ainda pega uma ingestão quebrada.
 */
export const COBERTURA_MINIMA_POR_CRITERIO: Partial<Record<IdCriterio, number>> = { mg: 0.85 };

export function coberturaMinima(id: IdCriterio): number {
  return COBERTURA_MINIMA_POR_CRITERIO[id] ?? COBERTURA_MINIMA_ACOES;
}
export const JANELA_COBERTURA: Janela = 5;

export interface UniversoCriterios {
  empresas: EmpresaCriterios[];
  fiis: FiiCriterios[];
}

export interface DependenciasCriterios {
  scoresEmExecucao: (prisma: PrismaClient, desde: Date) => Promise<boolean>;
  obterParams: (
    prisma: PrismaClient,
    opts?: { versao?: number },
  ) => Promise<{ versao: number; params: CriteriaParams }>;
  carregarUniverso: (ctx: JobContexto) => Promise<UniversoCriterios>;
  lerBrutosAcoes: typeof lerBrutosAcoes;
  lerBrutosFii: typeof lerBrutosFii;
  /** símbolos do Quadro (noQuadro) para a cobertura; vazio = todos os avaliados */
  simbolosNoQuadro: (prisma: PrismaClient) => Promise<Set<string>>;
  gravar: typeof gravarCriteriaEval;
  /**
   * v2.5: pontos APROVADOS de provedores dos símbolos (séries + qualidade de FII). Só chamado quando
   * params.fontes cita uma fonte além da CVM.
   */
  lerPontosProvedores?: (
    prisma: PrismaClient,
    symbols: readonly string[],
    series: readonly SerieFundamento[],
    desdeAno: number,
  ) => Promise<PontoSerieVigente[]>;
}

/** Pontos aprovados de provedores (asset_fundamentals_serie + fii_property_quality). */
export async function lerPontosProvedores(
  prisma: PrismaClient,
  symbols: readonly string[],
  series: readonly SerieFundamento[],
  desdeAno: number,
): Promise<PontoSerieVigente[]> {
  const [pontos, qualidade] = await Promise.all([
    lerPontosVigentes(prisma, symbols, series, desdeAno),
    series.some((s) => s === 'default_pct' || s === 'ltv_avg')
      ? lerQualidadeFiiVigente(prisma, symbols, `${desdeAno}-01-01`)
      : Promise.resolve([]),
  ]);
  return [...pontos.filter((p) => p.fonte !== 'cvm'), ...pontosDaQualidadeFii(qualidade)];
}

/** Séries (principal + fallback) dos critérios dos perfis. Pura. */
export function seriesDosPerfis(
  params: CriteriaParams,
  perfis: ReadonlyArray<PerfilComLista>,
): SerieFundamento[] {
  const out = new Set<SerieFundamento>();
  for (const perfil of perfis) {
    for (const d of criteriosDoPerfil(params, perfil)) {
      out.add(d.serie);
      if (d.serieFallback) out.add(d.serieFallback);
    }
  }
  return [...out];
}

/** Meses com rendimento por ano vindos de PROVEDOR (a CVM conta pelos proventos ancorados). */
export function mesesPorAnoDeProvedor(
  r: ReturnType<typeof resolverSeries>,
): Record<number, number | null> | undefined {
  const valores = r.series.months_with_income;
  const origens = r.origens.months_with_income;
  if (!valores || !origens) return undefined;
  const out: Record<number, number | null> = {};
  for (const [ano, o] of Object.entries(origens)) {
    if (o.fonte !== 'cvm') out[Number(ano)] = valores[Number(ano)] ?? null;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export async function scoresEmExecucao(prisma: PrismaClient, desde: Date): Promise<boolean> {
  const aberto = await prisma.analiseJobRun.findFirst({
    where: { job: 'scores', status: 'executando', inicio: { gt: desde } },
    select: { id: true },
  });
  return aberto !== null;
}

/** Universo do Quadro: ações agrupadas por empresa (com ehFinanceira do universo) e FIIs. */
export async function carregarUniversoCriterios(ctx: JobContexto): Promise<UniversoCriterios> {
  const [acoes, fiis] = await Promise.all([
    listarTickersAcoes(ctx.prisma),
    listarFiisListados(ctx.prisma),
  ]);
  const cnpjs = [...new Set(acoes.map((a) => a.cnpj))];
  const emissores = cnpjs.length ? await listarEmissores(ctx.prisma, cnpjs, ctx.params) : [];
  const emissorPor = new Map(emissores.map((e) => [e.cnpj, e]));
  const symbolsPor = new Map<string, string[]>();
  for (const a of acoes) {
    const l = symbolsPor.get(a.cnpj);
    if (l) l.push(a.symbol);
    else symbolsPor.set(a.cnpj, [a.symbol]);
  }
  return {
    empresas: cnpjs.map((cnpj) => {
      const e = emissorPor.get(cnpj);
      return {
        cnpj,
        ehFinanceira: e?.ehFinanceira ?? false,
        escopoPreferido: e?.escopoPreferido ?? 'con',
        symbols: symbolsPor.get(cnpj) ?? [],
      };
    }),
    fiis: fiis.map((f) => ({ symbol: f.symbol, cnpj: f.cnpj, conferido: f.conferido })),
  };
}

async function simbolosNoQuadro(prisma: PrismaClient): Promise<Set<string>> {
  const linhas = await prisma.analiseQuadroLinha.findMany({
    where: { noQuadro: true },
    select: { symbol: true },
  });
  return new Set(linhas.map((l) => l.symbol));
}

export const DEPENDENCIAS_PADRAO: DependenciasCriterios = {
  scoresEmExecucao,
  obterParams: (prisma) => obterCriteriaParams(prisma),
  carregarUniverso: carregarUniversoCriterios,
  lerBrutosAcoes,
  lerBrutosFii,
  simbolosNoQuadro,
  gravar: gravarCriteriaEval,
  lerPontosProvedores,
};

export interface OpcoesCriterios {
  /** versão do criteria_params (runner: --versao-params=N); padrão = a vigente */
  versaoParams?: number;
}

function mb(): number {
  return Math.round(process.memoryUsage().rss / 1024 / 1024);
}

const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Cobertura (com dado) por critério das ações não financeiras numa janela. */
export function coberturaAcoes(
  avaliacoes: readonly AvaliacaoAtivo[],
  janela: Janela,
): { total: number; porCriterio: Partial<Record<IdCriterio, number>> } {
  const chave = String(janela) as ChaveJanela;
  const acoes = avaliacoes.filter((a) => a.perfil === 'acao');
  const com: Partial<Record<IdCriterio, number>> = {};
  const ids = new Set<IdCriterio>();
  for (const a of acoes) {
    for (const r of a.janelas[chave]?.resultados ?? []) {
      ids.add(r.id);
      if (r.estado === 'sem_dado' || r.estado === 'nao_se_aplica') continue;
      com[r.id] = (com[r.id] ?? 0) + 1;
    }
  }
  const porCriterio: Partial<Record<IdCriterio, number>> = {};
  for (const id of ids) {
    porCriterio[id] = acoes.length ? Math.round(((com[id] ?? 0) / acoes.length) * 1000) / 1000 : 0;
  }
  return { total: acoes.length, porCriterio };
}

export async function executarCriterios(
  ctx: JobContexto,
  deps: DependenciasCriterios = DEPENDENCIAS_PADRAO,
  opcoes: OpcoesCriterios = {},
): Promise<ResultadoJob> {
  const inicio = Date.now();
  const tempos: Record<string, number> = {};
  const rss: Record<string, number> = {};

  // 1. scores ainda rodando: o quadro usa a avaliação anterior
  if (await deps.scoresEmExecucao(ctx.prisma, new Date(Date.now() - LOCK_TTL_PADRAO_MS))) {
    const motivo =
      "job 'scores' ainda em execução: criterios pulado (o quadro usa a avaliação anterior)";
    ctx.alertar({ codigo: 'criterios_scores_em_execucao', nivel: 'aviso', mensagem: motivo });
    return { pulado: motivo, detalhes: { pulado: 'scores_em_execucao' } };
  }

  // 2. params
  let params: CriteriaParams;
  let paramsVersion: number;
  try {
    const p =
      opcoes.versaoParams !== undefined
        ? await deps.obterParams(ctx.prisma, { versao: opcoes.versaoParams })
        : await deps.obterParams(ctx.prisma);
    params = p.params;
    paramsVersion = p.versao;
  } catch (e: unknown) {
    ctx.alertar({
      codigo: 'criteria_params_ausente',
      nivel: 'erro',
      mensagem: `CriteriaParams indisponível (${mensagemDe(e)}); nada foi gravado`,
    });
    throw e;
  }
  const anoFim = anoFimGlobal(ctx.hoje, params);
  const maxJanela = Math.max(...params.janelas);
  // 'up' lê o ano anterior à janela
  const desdeAno = anoFim - maxJanela;
  const fontes = fontesEfetivas(params);
  const comProvedores = fontesCitadas(fontes).some((f) => f !== 'cvm');
  const lerProvedores = deps.lerPontosProvedores ?? lerPontosProvedores;
  const seriesAcoes = seriesDosPerfis(params, ['acao']);
  const seriesFiis = seriesDosPerfis(params, ['fii_tijolo', 'fii_papel']);
  const opcoesAcao = opcoesSeriesAcao(params);
  let cvmEmRevisao = 0;
  /** pontos da CVM (com a sanidade literal quando aplicaA inclui 'cvm') + os dos provedores */
  const juntar = (cvm: PontoSerieVigente[], externos: readonly PontoSerieVigente[]) => {
    const f = filtrarCvmPelaSanidade(cvm, fontes);
    cvmEmRevisao += f.emRevisao.length;
    return [...f.pontos, ...externos];
  };

  // 3. universo + avaliação em lotes
  let t = Date.now();
  const universo = await deps.carregarUniverso(ctx);
  tempos.universo = Date.now() - t;
  rss.universo = mb();
  const nSimbolos =
    universo.empresas.reduce((s, e) => s + e.symbols.length, 0) + universo.fiis.length;
  ctx.contar('linhasLidas', nSimbolos);

  const avaliadas: AvaliacaoGravar[] = [];
  const porPerfil: Partial<Record<PerfilCriterio, number>> = {};
  const registrar = (symbol: string, cnpj: string, a: AvaliacaoAtivo) => {
    avaliadas.push({ symbol, cnpj, avaliacao: a });
    porPerfil[a.perfil] = (porPerfil[a.perfil] ?? 0) + 1;
  };

  t = Date.now();
  for (let i = 0; i < universo.empresas.length; i += LOTE_CRITERIOS) {
    if (ctx.estourouPrazo()) {
      return parcialSemGravar(ctx, 'acoes', i, universo.empresas.length);
    }
    const lote = universo.empresas.slice(i, i + LOTE_CRITERIOS);
    const brutos = await deps.lerBrutosAcoes(ctx.prisma, lote, desdeAno);
    const externos = comProvedores
      ? porSimbolo(
          await lerProvedores(
            ctx.prisma,
            lote.flatMap((e) => e.symbols),
            seriesAcoes,
            desdeAno,
          ),
        )
      : new Map<string, PontoSerieVigente[]>();
    for (const e of lote) {
      const bruto = brutos.get(e.cnpj);
      const perfil = perfilCriterios(
        { classe: 'acao', ehFinanceira: e.ehFinanceira, fiiTipo: null, imoveisPlPct: null },
        params,
      );
      for (const symbol of e.symbols) {
        const cvm = bruto ? pontosCvmAcao(bruto, [symbol], opcoesAcao) : [];
        const r = resolverSeries({
          pontos: juntar(cvm, externos.get(symbol) ?? []),
          series: seriesAcoes,
          fontes,
        });
        registrar(
          symbol,
          e.cnpj,
          avaliarAtivo(
            {
              symbol,
              classe: 'acao',
              perfil,
              anoFim,
              series: r.series,
              origens: r.origens,
              meses: null,
            },
            params,
            paramsVersion,
          ),
        );
      }
    }
  }
  tempos.acoes = Date.now() - t;
  rss.acoes = mb();

  t = Date.now();
  for (let i = 0; i < universo.fiis.length; i += LOTE_CRITERIOS) {
    if (ctx.estourouPrazo()) return parcialSemGravar(ctx, 'fiis', i, universo.fiis.length);
    const lote = universo.fiis.slice(i, i + LOTE_CRITERIOS);
    const brutos = await deps.lerBrutosFii(ctx.prisma, lote, desdeAno);
    const externos = comProvedores
      ? porSimbolo(
          await lerProvedores(
            ctx.prisma,
            lote.map((f) => f.symbol),
            seriesFiis,
            desdeAno,
          ),
        )
      : new Map<string, PontoSerieVigente[]>();
    for (const f of lote) {
      const bruto = brutos.get(f.symbol);
      const cvm = bruto ? pontosCvmFii(bruto, { anoFim, scoring: ctx.params }) : [];
      const r = resolverSeries({
        pontos: juntar(cvm, externos.get(f.symbol) ?? []),
        series: seriesFiis,
        fontes,
      });
      const perfil = perfilCriterios(
        {
          classe: 'fii',
          ehFinanceira: false,
          fiiTipo: bruto?.fiiTipo ?? null,
          imoveisPlPct: bruto ? imoveisPlPctFii(bruto) : null,
        },
        params,
      );
      registrar(
        f.symbol,
        f.cnpj,
        avaliarAtivo(
          {
            symbol: f.symbol,
            classe: 'fii',
            perfil,
            anoFim,
            series: r.series,
            origens: r.origens,
            mesesPorAno: mesesPorAnoDeProvedor(r),
            meses: bruto ? mesesFii(bruto, anoFim, ctx.params) : null,
          },
          params,
          paramsVersion,
        ),
      );
    }
  }
  tempos.fiis = Date.now() - t;
  rss.fiis = mb();

  // cobertura das ações não financeiras do Quadro (janela 5)
  const noQuadro = await deps.simbolosNoQuadro(ctx.prisma);
  const doQuadro = avaliadas
    .filter((a) => noQuadro.size === 0 || noQuadro.has(a.symbol))
    .map((a) => a.avaliacao);
  const cobertura = coberturaAcoes(doQuadro, JANELA_COBERTURA);
  const abaixo = Object.entries(cobertura.porCriterio).filter(
    ([id, v]) => (v ?? 0) < coberturaMinima(id as IdCriterio),
  );
  if (cobertura.total > 0 && abaixo.length > 0) {
    ctx.alertar({
      codigo: 'criterios_cobertura_baixa',
      nivel: 'aviso',
      mensagem:
        `cobertura das ações (janela ${JANELA_COBERTURA}) abaixo do mínimo: ` +
        abaixo
          .map(
            ([id, v]) =>
              `${id} ${Math.round((v ?? 0) * 1000) / 10}% ` +
              `(mín. ${coberturaMinima(id as IdCriterio) * 100}%)`,
          )
          .join(', '),
    });
  }

  // 4. gravação
  const computedAt = new Date();
  const linhas = avaliadas.flatMap((a) => linhasCriteriaEval(a, computedAt));
  let gravadas = 0;
  if (ctx.aplicar) {
    t = Date.now();
    gravadas = await deps.gravar(ctx.prisma, linhas);
    tempos.gravar = Date.now() - t;
    ctx.contar('linhasGravadas', gravadas);
    limparCacheCriterios();
  }
  rss.fim = mb();
  tempos.total = Date.now() - inicio;
  return {
    detalhes: {
      anoFim,
      paramsVersion,
      simbolos: avaliadas.length,
      porPerfil,
      linhas: linhas.length,
      linhasGravadas: gravadas,
      aplicar: ctx.aplicar,
      fontes: fontesCitadas(fontes),
      cvmEmRevisao,
      coberturaAcoesJanela5: cobertura,
      tempos,
      rssMb: rss,
    },
  };
}

function porSimbolo(pontos: readonly PontoSerieVigente[]): Map<string, PontoSerieVigente[]> {
  const out = new Map<string, PontoSerieVigente[]>();
  for (const p of pontos) {
    const l = out.get(p.symbol);
    if (l) l.push(p);
    else out.set(p.symbol, [p]);
  }
  return out;
}

function parcialSemGravar(
  ctx: JobContexto,
  etapa: 'acoes' | 'fiis',
  feitos: number,
  total: number,
): ResultadoJob {
  ctx.alertar({
    codigo: 'criterios_prazo',
    nivel: 'erro',
    mensagem: `prazo estourou em ${etapa} (${feitos}/${total}); nada gravado — a avaliação anterior continua`,
  });
  return { parcial: true, detalhes: { etapa, feitos, total, gravado: false } };
}
