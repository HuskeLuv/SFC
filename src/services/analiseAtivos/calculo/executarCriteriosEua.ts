/**
 * Job 'criterios-eua' — Filtros de Fundamentos de Stocks e REITs (fatia B da feature EUA; desenho
 * final.pipeline_dados §5). Só banco: nenhum provedor externo. No cron roda dentro do 'eua-diario'
 * (11:25 UTC, depois do sec-fundamentos); avulso para o dry-run com --versao-params=N.
 *
 * 1. CriteriaParams (a vigente ou, com --versao-params=N, a versão N). Versão sem os perfis EUA
 *    (v1/v2) ⇒ 'pulado' com alerta: nada é gravado (perfilDisponivel).
 * 2. Universo = SecCompany no universo (classe stock|reit; listarUniversoEua, um item por ticker
 *    vigente), agrupado por CIK de fundamentos (cikFundamentos: XOM lê o histórico do CIK antigo).
 *    Universo vazio ⇒ alerta e NADA é gravado (a versão anterior fica).
 * 3. Em lotes de 50 CIKs: lerBrutosSec → pontosSec (fonteSec: as regras de seriesStock/seriesReit)
 *    → resolverSeries com a prioridade do MERCADO (params.fontes.prioridade.porMercado us_* →
 *    ['sec']) → avaliarAtivo/avaliarCriterio INALTERADOS, com o MESMO anoFimGlobal do Brasil e o
 *    perfil de perfilCriteriosEua (stock | stock_financeira | reit).
 *    O 'pay' com caixa operacional ≤ 0 vem do motor como o fato do EBITDA ≤ 0 (a série é +Infinity):
 *    ajustarFatosEua troca pelo fato 'caixa operacional ≤ 0 em AAAA' (texto já da fatia 0) e põe
 *    'dl'/'fcl' das financeiras em 'sem dado' com o motivo factual (todas, com ou sem a tag).
 * 4. Grava criteria_eval (cnpj 'CIK:##########', classe stock|reit) pelo gravador ISOLADO da fatia 0
 *    com CLASSES_EUA: nunca apaga acao/fii; symbol já gravado com classe BR = erro antes de escrever.
 *    Estourou o prazo antes do fim ⇒ 'parcial' SEM gravar.
 * Alerta de cobertura (janela 5): stocks não financeiras ≥ 90% em rec/luc/ebitda/fcl, ≥ 85% em
 * mg/dl; REITs ≥ 85% em dl (aceites da fatia A, desenho final.fatias[A].criterios_aceite).
 *
 * fundamentei-regras (F1), tudo pela versão do params (nenhuma chave de tela):
 *  - séries da v5 nos pontos da SEC ('ebit' dos stocks; FCO ajustado pela SBC dos REITs) só quando a
 *    versão pede (incluirSeriesV5);
 *  - stock_financeira com naoSeAplica (v5: ebitda/dl/fcl) fica 'nao_se_aplica' — ajustarFatosEua só
 *    troca para 'sem dado' o que o params NÃO marcou como não se aplica ("n de 3");
 *  - 'pay' do REIT sobre o caixa operacional ajustado ≤ 0: o fato diz 'caixa operacional ajustado';
 *  - a cobertura mínima nunca listou 'ocup' (o REIT da v5 tem 5 critérios, "n de 5").
 */
import type { PrismaClient } from '@prisma/client';
import { limparCacheCriterios } from '@/services/analiseAtivos/leitura/criterios/lerCriterios';
import { obterCriteriaParams } from '@/services/analiseAtivos/params/obterCriteriaParams';
import {
  criteriosDoPerfil,
  fontesEfetivas,
  perfilDisponivel,
  type CriteriaParams,
  type FontesParams,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { SERIES_REIT_AJUSTADAS } from '@/services/analiseAtivos/regras/criterios/seriesStock';
import { pontosSec } from '@/services/analiseAtivos/fontes/fundamentos/fonteSec';
import { resolverSeries } from '@/services/analiseAtivos/fontes/fundamentos/resolverSeries';
import { anoFimGlobal } from '@/services/analiseAtivos/regras/criterios/ancoraJanela';
import {
  avaliarAtivo,
  contarResultados,
} from '@/services/analiseAtivos/regras/criterios/avaliarAtivo';
import { perfilCriteriosEua } from '@/services/analiseAtivos/regras/criterios/perfilCriteriosEua';
import { lerBrutosSec, type BrutoSec } from '@/services/analiseAtivos/regras/criterios/seriesStock';
import {
  gravarCriteriaEval,
  linhasCriteriaEval,
  type AvaliacaoGravar,
} from '@/services/analiseAtivos/repositorio/criterios';
import { listarUniversoEua, type EmpresaEua } from '@/services/analiseAtivos/repositorio/eua';
import { formatarTexto, TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';
import type { JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';
import { CLASSES_EUA, type ClasseEua } from '@/types/analiseAtivosApi';
import { emissorIdSec, mercadoDaClasse } from '@/types/analiseAtivosEua';
import type {
  AvaliacaoAtivo,
  ChaveJanela,
  IdCriterio,
  Janela,
  PerfilCriterio,
  PerfilCriterioEua,
  ResultadoCriterio,
} from '@/types/analiseAtivosCriterios';
import type { SerieFundamento } from '@/types/analiseAtivosFontes';

/** CIKs por lote (o mesmo tamanho de lote do job BR). */
export const LOTE_CRITERIOS_EUA = 50;
export const JANELA_COBERTURA_EUA: Janela = 5;

/** Cobertura mínima (com dado) por perfil × critério na janela 5. */
export const COBERTURA_MINIMA_EUA: Partial<
  Record<PerfilCriterioEua, Partial<Record<IdCriterio, number>>>
> = {
  stock: { rec: 0.9, luc: 0.9, ebitda: 0.9, mg: 0.85, dl: 0.85, fcl: 0.9 },
  reit: { dl: 0.85 },
};

/** Uma empresa do universo EUA (todos os tickers vigentes do CIK). */
export interface EmpresaCriteriosEua {
  /** CIK do cadastro (vai para criteria_eval.cnpj como 'CIK:…') */
  cik: string;
  /** CIK de onde vêm os fundamentos (cikHistorico ou o próprio) */
  cikFundamentos: string;
  classe: ClasseEua;
  ehFinanceira: boolean;
  sic: number | null;
  /** tickers na forma da Análise (BRK.B) */
  symbols: string[];
}

/** Agrupa o universo (um item por ticker) por CIK. Pura. */
export function agruparUniversoEua(itens: readonly EmpresaEua[]): EmpresaCriteriosEua[] {
  const porCik = new Map<string, EmpresaCriteriosEua>();
  for (const e of itens) {
    const atual = porCik.get(e.cik);
    if (atual) {
      if (!atual.symbols.includes(e.symbol)) atual.symbols.push(e.symbol);
      continue;
    }
    porCik.set(e.cik, {
      cik: e.cik,
      cikFundamentos: e.cikFundamentos,
      classe: e.classe,
      ehFinanceira: e.ehFinanceira,
      sic: e.sic,
      symbols: [e.symbol],
    });
  }
  return [...porCik.values()];
}

export interface DependenciasCriteriosEua {
  obterParams: (
    prisma: PrismaClient,
    opts?: { versao?: number },
  ) => Promise<{ versao: number; params: CriteriaParams }>;
  carregarUniverso: (prisma: PrismaClient) => Promise<EmpresaCriteriosEua[]>;
  lerBrutos: (
    prisma: PrismaClient,
    ciks: readonly string[],
    desdeAno: number,
  ) => Promise<Map<string, BrutoSec>>;
  gravar: typeof gravarCriteriaEval;
}

export const DEPENDENCIAS_CRITERIOS_EUA: DependenciasCriteriosEua = {
  obterParams: (prisma, opts) => obterCriteriaParams(prisma, opts),
  carregarUniverso: async (prisma) =>
    agruparUniversoEua(await listarUniversoEua(prisma, CLASSES_EUA)),
  lerBrutos: (prisma, ciks, desdeAno) => lerBrutosSec(prisma, ciks, desdeAno),
  gravar: gravarCriteriaEval,
};

export interface OpcoesCriteriosEua {
  /** versão do criteria_params (runner: --versao-params=N); padrão = a vigente */
  versaoParams?: number;
}

/**
 * Prioridade de fontes do MERCADO como a prioridade padrão: o resolverSeries (puro, fatia 0 da
 * v2.5) lê porSerie/padrao; aqui porMercado[us_*] vira o padrão e porSerie some (não há série EUA
 * com prioridade própria). Sem porMercado, 'sec'. Pura.
 */
export function fontesDoMercado(fontes: FontesParams, classe: ClasseEua): FontesParams {
  const doMercado = fontes.prioridade.porMercado?.[mercadoDaClasse(classe)] ?? ['sec'];
  return {
    ...fontes,
    prioridade: { padrao: [...doMercado], porSerie: {} },
  };
}

/** Séries (principal + fallback) dos critérios de um perfil EUA. Pura. */
export function seriesDoPerfilEua(
  params: CriteriaParams,
  perfil: PerfilCriterio,
): SerieFundamento[] {
  const out = new Set<SerieFundamento>();
  for (const d of criteriosDoPerfil(params, perfil)) {
    out.add(d.serie);
    if (d.serieFallback) out.add(d.serieFallback);
  }
  return [...out];
}

/** stock_financeira: dl e fcl ficam 'sem dado' para TODAS as financeiras, com o motivo fixo. */
const FATO_FINANCEIRA: Partial<Record<IdCriterio, string>> = {
  dl: TEXTOS_CRITERIOS.fatos.financeiraSemDividaLiquida,
  fcl: TEXTOS_CRITERIOS.fatos.financeiraSemFcl,
};

/**
 * Ajustes EUA sobre a saída do motor (inalterado). Pura.
 * - 'pay' com FCO ≤ 0: o motor devolve 'nao_atende' com o fato do EBITDA ≤ 0, porque a série vem
 *   +Infinity. Troca pelo fato do caixa operacional (TEXTOS_CRITERIOS) e tira o motivo do EBITDA.
 *   O ano é o último da janela com o valor infinito (na série gravada ele fica null).
 * - stock_financeira (n de 6 literal, decisão de 17/10): 'dl' e 'fcl' = 'sem dado' com o motivo
 *   factual, para todas as financeiras. Sem isso o resultado dependia da tag existir no XBRL (JPM e
 *   BRK sem dado; BAC, AFL, AXP e UNH "atende" — no BAC a dívida líquida desconta caixa e depósitos e
 *   vira caixa líquido). As contagens da janela são refeitas (contarResultados).
 */
export function ajustarFatosEua(
  a: AvaliacaoAtivo,
  serieValores: Readonly<Record<number, number | null>> | undefined,
  /**
   * fundamentei-regras (v5): payout sobre o caixa operacional AJUSTADO (cash_payout_adjusted_pct);
   * usado quando o 'pay' não caiu no fallback (sem a obs 'sbc_indisponivel')
   */
  serieAjustada?: Readonly<Record<number, number | null>>,
): AvaliacaoAtivo {
  const janelas = { ...a.janelas };
  const financeira = a.perfil === 'stock_financeira';
  for (const k of Object.keys(janelas) as ChaveJanela[]) {
    const j = janelas[k];
    const resultados = j.resultados.map((r): ResultadoCriterio => {
      // v5: o que o params marcou como não se aplica fica como veio (n de 3)
      const fatoFinanceira =
        financeira && r.estado !== 'nao_se_aplica' ? FATO_FINANCEIRA[r.id] : undefined;
      if (fatoFinanceira) {
        return {
          id: r.id,
          estado: 'sem_dado',
          n: null,
          de: null,
          fato: fatoFinanceira,
          motivo: 'sem_dado_demonstracoes',
          serie: null,
        };
      }
      if (r.id !== 'pay' || r.motivo !== 'ebitda_nao_positivo') return r;
      const ajustada = !!serieAjustada && !(r.obs ?? []).includes('sbc_indisponivel');
      const valores = ajustada ? serieAjustada : serieValores;
      const anos = (r.serie ?? [])
        .map((p) => p.ano)
        .filter((ano) => valores?.[ano] === Number.POSITIVE_INFINITY);
      const ano = anos.length > 0 ? anos[anos.length - 1] : j.anoFim;
      const { motivo: _motivo, ...resto } = r;
      return {
        ...resto,
        fato: formatarTexto(
          ajustada
            ? TEXTOS_CRITERIOS.fatos.caixaOperacionalAjustadoNaoPositivo
            : TEXTOS_CRITERIOS.fatos.caixaOperacionalNaoPositivo,
          { ano },
        ),
      };
    });
    janelas[k] = financeira
      ? { ...j, ...contarResultados(resultados), resultados }
      : { ...j, resultados };
  }
  return { ...a, janelas };
}

/** Cobertura (com dado) por critério de um perfil numa janela. Pura. */
export function coberturaPerfil(
  avaliacoes: readonly AvaliacaoAtivo[],
  perfil: PerfilCriterio,
  janela: Janela,
): { total: number; porCriterio: Partial<Record<IdCriterio, number>> } {
  const chave = String(janela) as ChaveJanela;
  const doPerfil = avaliacoes.filter((a) => a.perfil === perfil);
  const com: Partial<Record<IdCriterio, number>> = {};
  const ids = new Set<IdCriterio>();
  for (const a of doPerfil) {
    for (const r of a.janelas[chave]?.resultados ?? []) {
      ids.add(r.id);
      if (r.estado === 'sem_dado' || r.estado === 'nao_se_aplica') continue;
      com[r.id] = (com[r.id] ?? 0) + 1;
    }
  }
  const porCriterio: Partial<Record<IdCriterio, number>> = {};
  for (const id of ids) {
    porCriterio[id] = doPerfil.length
      ? Math.round(((com[id] ?? 0) / doPerfil.length) * 1000) / 1000
      : 0;
  }
  return { total: doPerfil.length, porCriterio };
}

const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : String(e));
const mb = () => Math.round(process.memoryUsage().rss / 1024 / 1024);

export async function executarCriteriosEua(
  ctx: JobContexto,
  deps: DependenciasCriteriosEua = DEPENDENCIAS_CRITERIOS_EUA,
  opcoes: OpcoesCriteriosEua = {},
): Promise<ResultadoJob> {
  const inicio = Date.now();
  const tempos: Record<string, number> = {};
  const rss: Record<string, number> = {};

  // 1. params (com os perfis EUA)
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
  const semPerfis = (['stock', 'stock_financeira', 'reit'] as const).filter(
    (p) => !perfilDisponivel(params, p),
  );
  if (semPerfis.length > 0) {
    const motivo =
      `criteria_params v${paramsVersion} sem os perfis EUA (${semPerfis.join(', ')}): ` +
      'criterios-eua pulado (rode com --versao-params=3 ou torne a v3 vigente)';
    ctx.alertar({ codigo: 'criterios_eua_sem_perfis', nivel: 'aviso', mensagem: motivo });
    return { pulado: motivo, detalhes: { pulado: 'params_sem_perfis_eua', paramsVersion } };
  }

  const anoFim = anoFimGlobal(ctx.hoje, params);
  const desdeAno = anoFim - Math.max(...params.janelas);
  const fontes = fontesEfetivas(params);
  const fontesPor: Record<ClasseEua, FontesParams> = {
    stock: fontesDoMercado(fontes, 'stock'),
    reit: fontesDoMercado(fontes, 'reit'),
  };
  const seriesPor: Record<PerfilCriterioEua, SerieFundamento[]> = {
    stock: seriesDoPerfilEua(params, 'stock'),
    stock_financeira: seriesDoPerfilEua(params, 'stock_financeira'),
    reit: seriesDoPerfilEua(params, 'reit'),
  };
  // fundamentei-regras: séries da v5 ('ebit', FCO ajustado do REIT) só quando a versão pede
  const seriesV5 = new Set<SerieFundamento>(['ebit', ...SERIES_REIT_AJUSTADAS]);
  const incluirSeriesV5 = Object.values(seriesPor).some((l) => l.some((s) => seriesV5.has(s)));
  const opcoesStock = {
    receitaMenorQueLucro: params.criterios.margem.receitaMenorQueLucro,
    ...(incluirSeriesV5 ? { incluirSeriesV5 } : {}),
  };
  // o 'pay' do REIT da versão lê o payout ajustado (v5) ou o de antes (v3/v4)
  const payAjustado = criteriosDoPerfil(params, 'reit').some(
    (d) => d.id === 'pay' && d.serie === 'cash_payout_adjusted_pct',
  );

  // 2. universo
  let t = Date.now();
  const universo = await deps.carregarUniverso(ctx.prisma);
  tempos.universo = Date.now() - t;
  rss.universo = mb();
  const nSimbolos = universo.reduce((s, e) => s + e.symbols.length, 0);
  ctx.contar('linhasLidas', nSimbolos);
  if (universo.length === 0) {
    ctx.alertar({
      codigo: 'criterios_eua_universo_vazio',
      nivel: 'aviso',
      mensagem: 'nenhuma empresa EUA no universo (rode sec-cadastro): nada foi gravado',
    });
    return { detalhes: { anoFim, paramsVersion, simbolos: 0, linhasGravadas: 0 } };
  }

  // 3. avaliação em lotes de CIKs
  const avaliadas: AvaliacaoGravar[] = [];
  const porPerfil: Partial<Record<PerfilCriterio, number>> = {};
  let semFundamentos = 0;
  t = Date.now();
  for (let i = 0; i < universo.length; i += LOTE_CRITERIOS_EUA) {
    if (ctx.estourouPrazo()) {
      ctx.alertar({
        codigo: 'criterios_eua_prazo',
        nivel: 'erro',
        mensagem: `prazo estourou (${i}/${universo.length} CIKs); nada gravado — a avaliação anterior continua`,
      });
      return { parcial: true, detalhes: { feitos: i, total: universo.length, gravado: false } };
    }
    const lote = universo.slice(i, i + LOTE_CRITERIOS_EUA);
    const brutos = await deps.lerBrutos(
      ctx.prisma,
      [...new Set(lote.map((e) => e.cikFundamentos))],
      desdeAno,
    );
    for (const e of lote) {
      const bruto = brutos.get(e.cikFundamentos) ?? { cik: e.cikFundamentos, fys: [] };
      if (bruto.fys.length === 0) semFundamentos++;
      const perfil = perfilCriteriosEua({
        classe: e.classe,
        ehFinanceira: e.ehFinanceira,
        sic: e.sic,
      });
      const pontos = pontosSec(bruto, e.symbols, e.classe, opcoesStock);
      for (const symbol of e.symbols) {
        const r = resolverSeries({
          pontos: pontos.filter((p) => p.symbol === symbol),
          series: seriesPor[perfil],
          fontes: fontesPor[e.classe],
        });
        const avaliacao = ajustarFatosEua(
          avaliarAtivo(
            {
              symbol,
              classe: e.classe,
              perfil,
              anoFim,
              series: r.series,
              origens: r.origens,
              meses: null,
            },
            params,
            paramsVersion,
          ),
          r.series.cash_payout_pct,
          payAjustado ? r.series.cash_payout_adjusted_pct : undefined,
        );
        avaliadas.push({ symbol, cnpj: emissorIdSec(e.cik), avaliacao });
        porPerfil[perfil] = (porPerfil[perfil] ?? 0) + 1;
      }
    }
  }
  tempos.avaliar = Date.now() - t;
  rss.avaliar = mb();
  if (semFundamentos > 0) {
    ctx.alertar({
      codigo: 'criterios_eua_sem_fundamentos',
      nivel: 'aviso',
      mensagem: `${semFundamentos} CIK(s) do universo sem nenhuma linha FY da SEC desde ${desdeAno} (rode sec-fundamentos)`,
    });
  }

  // cobertura na janela 5
  const coberturas: Partial<Record<PerfilCriterioEua, ReturnType<typeof coberturaPerfil>>> = {};
  const abaixo: string[] = [];
  for (const [perfil, minimos] of Object.entries(COBERTURA_MINIMA_EUA) as Array<
    [PerfilCriterioEua, Partial<Record<IdCriterio, number>>]
  >) {
    const c = coberturaPerfil(
      avaliadas.map((a) => a.avaliacao),
      perfil,
      JANELA_COBERTURA_EUA,
    );
    coberturas[perfil] = c;
    if (c.total === 0) continue;
    for (const [id, min] of Object.entries(minimos) as Array<[IdCriterio, number]>) {
      const v = c.porCriterio[id] ?? 0;
      if (v < min) {
        abaixo.push(`${perfil}.${id} ${Math.round(v * 1000) / 10}% (mín. ${min * 100}%)`);
      }
    }
  }
  if (abaixo.length > 0) {
    ctx.alertar({
      codigo: 'criterios_eua_cobertura_baixa',
      nivel: 'aviso',
      mensagem: `cobertura EUA (janela ${JANELA_COBERTURA_EUA}) abaixo do mínimo: ${abaixo.join(', ')}`,
    });
  }

  // 4. gravação isolada por classe
  const computedAt = new Date();
  const linhas = avaliadas.flatMap((a) => linhasCriteriaEval(a, computedAt));
  let gravadas = 0;
  if (ctx.aplicar) {
    t = Date.now();
    gravadas = await deps.gravar(ctx.prisma, linhas, CLASSES_EUA);
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
      empresas: universo.length,
      simbolos: avaliadas.length,
      porPerfil,
      linhas: linhas.length,
      linhasGravadas: gravadas,
      aplicar: ctx.aplicar,
      semFundamentos,
      coberturaJanela5: coberturas,
      tempos,
      rssMb: rss,
    },
  };
}
