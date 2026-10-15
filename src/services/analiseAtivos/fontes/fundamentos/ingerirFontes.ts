/**
 * Job 'fontes-fundamentos' (v2.5, desenho final.camada_fontes §6): ingestão POINT-IN-TIME dos
 * conectores de fundamentos habilitados (ANALISE_FONTES_INGESTAO; ou `--fonte=<id>` no runner do
 * DEV). Sem conector habilitado, termina 'pulado'. Só roda no job — a tela nunca chama terceiros.
 *
 * Para cada conector (modo 'ingestao'), em lotes de ativos do cadastro do Quadro:
 *  1. buscar() do conector;
 *  2. normaliza: série fora do catálogo (ex.: 'rating', nota proprietária) é DESCARTADA e só conta no
 *     relatório; campos fora do contrato nunca são gravados; valor não numérico = descartado;
 *  3. séries obrigatórias ausentes no período → ponto incompleto (valor null);
 *  4. sanidade da §6 nas camadas de params.fontes.sanidade.aplicaA (variação > 40% contra o período
 *     anterior aprovado, confiança < 0,8, divergência > 5% contra a CVM) → 'pending';
 *  5. grava só o que mudou (versao + 1; valor igual não cria versão);
 *  6. cada 'pending' abre/atualiza um caso de curadoria do grupo 'fonte_externa' com a referência
 *     do ponto — resolver o caso é o único caminho de aprovação (curadoria/efeitoFonteExterna.ts).
 * Dry-run (aplicar=false): calcula e relata sem gravar nem abrir caso.
 */
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logger';
import {
  carregarUniversoCriterios,
  type UniversoCriterios,
} from '@/services/analiseAtivos/calculo/executarCriterios';
import { dataCivilSaoPaulo } from '@/services/analiseAtivos/curadoria/contrato';
import { pontosCvmAcao, pontosCvmFii } from '@/services/analiseAtivos/fontes/fundamentos/fonteCvm';
import {
  credenciaisDaFonte,
  ErroRegistroFonte,
  idsIngestaoHabilitados,
  obterFonte,
} from '@/services/analiseAtivos/fontes/fundamentos/registro';
import {
  avaliarSanidade,
  confiancaMinima,
  marcarIncompletos,
  type PontoPeriodo,
} from '@/services/analiseAtivos/fontes/fundamentos/sanidadeFonte';
import {
  fontesEfetivas,
  type CriteriaParams,
  type FontesParams,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { obterCriteriaParams } from '@/services/analiseAtivos/params/obterCriteriaParams';
import { anoFimGlobal } from '@/services/analiseAtivos/regras/criterios/ancoraJanela';
import {
  lerBrutosAcoes,
  opcoesSeriesAcao,
} from '@/services/analiseAtivos/regras/criterios/seriesAcao';
import { lerBrutosFii } from '@/services/analiseAtivos/regras/criterios/seriesFii';
import {
  abrirCasoFonte,
  anteriorAprovado,
  arredondarValor,
  assinaturaQualidade,
  CAMPO_QUALIDADE_FII,
  gravarPontos,
  gravarQualidade,
  lerHistoricoPontos,
  lerHistoricoQualidade,
  planejarVersoes,
  type LinhaPontoNova,
  type PontoParaGravar,
  type QualidadeGravada,
  type QualidadeParaGravar,
} from '@/services/analiseAtivos/repositorio/fontesFundamentosEscrita';
import type { JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';
import {
  camadaDaFonte,
  CATALOGO_SERIES,
  ehSerieFundamento,
  EXTRACTED_BY,
  PERIODICIDADES_SERIE,
  type AtivoFonte,
  type ExtractedBy,
  type FonteFundamentos,
  type IdFonte,
  type MercadoFonte,
  type PeriodicidadeSerie,
  type PontoSerieVigente,
} from '@/types/analiseAtivosFontes';

/** Ativos por chamada ao conector (lote). */
export const LOTE_INGESTAO = 50;

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

export interface DependenciasIngestao {
  obterParams: (
    prisma: PrismaClient,
    opts?: { versao?: number },
  ) => Promise<{ versao: number; params: CriteriaParams }>;
  carregarUniverso: (ctx: JobContexto) => Promise<UniversoCriterios>;
  lerBrutosAcoes: typeof lerBrutosAcoes;
  lerBrutosFii: typeof lerBrutosFii;
  obterFonte: (id: IdFonte) => FonteFundamentos | null;
  idsHabilitados: () => IdFonte[];
  credenciais: (id: IdFonte) => Record<string, string>;
  lerHistoricoPontos: typeof lerHistoricoPontos;
  lerHistoricoQualidade: typeof lerHistoricoQualidade;
  gravarPontos: typeof gravarPontos;
  gravarQualidade: typeof gravarQualidade;
  abrirCasoFonte: typeof abrirCasoFonte;
  gerarId?: () => string;
}

export const DEPENDENCIAS_INGESTAO: DependenciasIngestao = {
  obterParams: (prisma, opts) => obterCriteriaParams(prisma, opts),
  // funções embrulhadas: o objeto não lê os módulos na carga (mocks parciais nos testes de rota)
  carregarUniverso: (ctx) => carregarUniversoCriterios(ctx),
  lerBrutosAcoes: (prisma, empresas, desdeAno) => lerBrutosAcoes(prisma, empresas, desdeAno),
  lerBrutosFii: (prisma, fiis, desdeAno) => lerBrutosFii(prisma, fiis, desdeAno),
  obterFonte: (id) => obterFonte(id),
  idsHabilitados: () => idsIngestaoHabilitados(),
  credenciais: (id) => credenciaisDaFonte(id),
  lerHistoricoPontos,
  lerHistoricoQualidade,
  gravarPontos,
  gravarQualidade,
  abrirCasoFonte,
};

export interface OpcoesIngestao {
  /** conector pedido pelo runner (`--fonte=<id>`), no lugar de ANALISE_FONTES_INGESTAO */
  fonte?: IdFonte;
  /** versão do criteria_params (`--versao-params=N`); padrão = a vigente */
  versaoParams?: number;
}

/** Motivos de descarte de um item do conector (contados no relatório; nunca gravados). */
export type MotivoDescarte = 'fora_do_catalogo' | 'ativo_fora_do_lote' | 'invalido' | 'mercado';

export interface RelatorioFonte {
  recebidos: number;
  descartados: Partial<Record<MotivoDescarte, number>>;
  /** séries fora do catálogo vistas (amostra para o log; ex.: 'rating') */
  seriesDescartadas: string[];
  incompletos: number;
  iguais: number;
  gravados: number;
  pendentes: number;
  casosAbertos: number;
  casosAtualizados: number;
  qualidadeGravadas: number;
}

const relatorioVazio = (): RelatorioFonte => ({
  recebidos: 0,
  descartados: {},
  seriesDescartadas: [],
  incompletos: 0,
  iguais: 0,
  gravados: 0,
  pendentes: 0,
  casosAbertos: 0,
  casosAtualizados: 0,
  qualidadeGravadas: 0,
});

const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : String(e));
const finito = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const textoOuNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** Ativo do universo com o que a ingestão precisa (lote de CVM para a divergência). */
interface AtivoUniverso extends AtivoFonte {
  cnpj: string;
  conferido: boolean;
  ehFinanceira: boolean;
  escopoPreferido: 'con' | 'ind';
}

function ativosDoUniverso(u: UniversoCriterios): AtivoUniverso[] {
  const acoes = u.empresas.flatMap((e) =>
    e.symbols.map((symbol) => ({
      symbol,
      emissorId: e.cnpj,
      classe: 'acao' as const,
      mercado: 'br_acoes' as const,
      cnpj: e.cnpj,
      conferido: true,
      ehFinanceira: e.ehFinanceira,
      escopoPreferido: e.escopoPreferido,
    })),
  );
  const fiis = u.fiis.map((f) => ({
    symbol: f.symbol,
    emissorId: f.cnpj,
    classe: 'fii' as const,
    mercado: 'br_fii' as const,
    cnpj: f.cnpj,
    conferido: f.conferido,
    ehFinanceira: false,
    escopoPreferido: 'con' as const,
  }));
  return [...acoes, ...fiis];
}

/** Ponto do conector validado contra o contrato (null + motivo = descartar). Pura. */
export function validarPonto(
  item: Record<string, unknown>,
  ativo: AtivoUniverso | undefined,
  fonte: IdFonte,
): { ponto: PontoParaGravar } | { descarte: MotivoDescarte; serie?: string } {
  if (!ativo) return { descarte: 'ativo_fora_do_lote' };
  const serie = item.serie;
  if (!ehSerieFundamento(serie)) {
    return { descarte: 'fora_do_catalogo', serie: String(serie).slice(0, 40) };
  }
  const def = CATALOGO_SERIES[serie];
  if (!def.mercados.includes(ativo.mercado)) return { descarte: 'mercado' };
  const tipoPeriodo = item.tipoPeriodo;
  const dtFim = item.dtFim;
  const anoFiscal = item.anoFiscal;
  const valor = item.valor;
  const extractedBy = item.extractedBy ?? 'api';
  if (
    !(PERIODICIDADES_SERIE as readonly unknown[]).includes(tipoPeriodo) ||
    typeof dtFim !== 'string' ||
    !RE_DATA.test(dtFim) ||
    !Number.isInteger(anoFiscal) ||
    !(valor === null || finito(valor)) ||
    !(EXTRACTED_BY as readonly unknown[]).includes(extractedBy)
  ) {
    return { descarte: 'invalido' };
  }
  const confianca = item.confianca;
  const pagina = item.sourcePage;
  return {
    ponto: {
      symbol: ativo.symbol,
      emissorId: ativo.emissorId,
      classe: ativo.classe,
      mercado: ativo.mercado,
      serie,
      tipoPeriodo: tipoPeriodo as PeriodicidadeSerie,
      anoFiscal: anoFiscal as number,
      dtFim,
      valor: valor as number | null,
      unidade: def.unidade,
      fonte,
      sourceUrl: textoOuNull(item.sourceUrl),
      sourceRef: textoOuNull(item.sourceRef),
      extractedBy: extractedBy as ExtractedBy,
      confianca: finito(confianca) && confianca >= 0 && confianca <= 1 ? confianca : null,
      sourcePdfUrl: textoOuNull(item.sourcePdfUrl),
      sourcePage: Number.isInteger(pagina) ? (pagina as number) : null,
      incompleto: false,
      reviewStatus: 'approved',
      motivosRevisao: [],
    },
  };
}

const NUMEROS_QUALIDADE = [
  'padAaaPct',
  'padAaPct',
  'padAPct',
  'tenantsCount',
  'topTenantPct',
  'atypicalPct',
  'avgLeaseYears',
  'criCount',
  'avgRate',
  'ltvAvg',
  'defaultPct',
  'highYieldPct',
  'durationYears',
] as const;

/** Linha de qualidade validada (só os campos do contrato §5). Pura. */
export function validarQualidade(
  item: Record<string, unknown>,
  ativo: AtivoUniverso | undefined,
  fonte: IdFonte,
): { qualidade: QualidadeParaGravar } | { descarte: MotivoDescarte } {
  if (!ativo) return { descarte: 'ativo_fora_do_lote' };
  if (ativo.classe !== 'fii') return { descarte: 'mercado' };
  const periodo = item.periodo;
  const extractedBy = item.extractedBy ?? 'api';
  if (
    typeof periodo !== 'string' ||
    !RE_DATA.test(periodo) ||
    !(EXTRACTED_BY as readonly unknown[]).includes(extractedBy)
  ) {
    return { descarte: 'invalido' };
  }
  const numeros: Partial<Record<(typeof NUMEROS_QUALIDADE)[number], number | null>> = {};
  for (const c of NUMEROS_QUALIDADE) {
    const v = item[c];
    if (v === undefined || v === null) continue;
    if (!finito(v)) return { descarte: 'invalido' };
    numeros[c] = v;
  }
  const objetoNumerico = (v: unknown) =>
    v && typeof v === 'object' && Object.values(v).every(finito)
      ? (v as Record<string, number>)
      : null;
  return {
    qualidade: {
      symbol: ativo.symbol,
      cnpj: typeof item.cnpj === 'string' && item.cnpj ? item.cnpj : ativo.cnpj,
      periodo,
      ...numeros,
      indexMix: objetoNumerico(item.indexMix),
      sourceUrl: textoOuNull(item.sourceUrl),
      sourcePdfUrl: textoOuNull(item.sourcePdfUrl),
      sourcePage: objetoNumerico(item.sourcePage),
      extractedBy: extractedBy as ExtractedBy,
      confianca: objetoNumerico(item.confianca),
      fonte,
      reviewStatus: 'approved',
      incompleto: false,
    },
  };
}

/** Índice dos pontos da CVM do lote para a regra de divergência. */
function indiceCvm(pontos: readonly PontoSerieVigente[]) {
  const porPeriodo = new Map<string, number | null>();
  const porAnoFy = new Map<string, number | null>();
  for (const p of pontos) {
    porPeriodo.set(`${p.symbol}|${p.serie}|${p.tipoPeriodo}|${p.dtFim}`, p.valor);
    if (p.tipoPeriodo === 'FY') porAnoFy.set(`${p.symbol}|${p.serie}|${p.anoFiscal}`, p.valor);
  }
  return (p: PontoParaGravar): number | null => {
    const v =
      porPeriodo.get(`${p.symbol}|${p.serie}|${p.tipoPeriodo}|${p.dtFim}`) ??
      (p.tipoPeriodo === 'FY' ? porAnoFy.get(`${p.symbol}|${p.serie}|${p.anoFiscal}`) : null);
    return finito(v) ? v : null;
  };
}

/** Pontos da CVM do lote (só a divergência usa; nada é gravado). */
async function pontosCvmDoLote(
  ctx: JobContexto,
  deps: DependenciasIngestao,
  lote: readonly AtivoUniverso[],
  desdeAno: number,
  anoFim: number,
  params: CriteriaParams,
): Promise<PontoSerieVigente[]> {
  const out: PontoSerieVigente[] = [];
  const acoes = lote.filter((a) => a.classe === 'acao');
  const fiis = lote.filter((a) => a.classe === 'fii');
  if (acoes.length > 0) {
    const empresas = [...new Set(acoes.map((a) => a.cnpj))].map((cnpj) => {
      const da = acoes.filter((a) => a.cnpj === cnpj);
      return {
        cnpj,
        ehFinanceira: da[0].ehFinanceira,
        escopoPreferido: da[0].escopoPreferido,
        symbols: da.map((a) => a.symbol),
      };
    });
    const brutos = await deps.lerBrutosAcoes(ctx.prisma, empresas, desdeAno);
    for (const e of empresas) {
      const b = brutos.get(e.cnpj);
      if (b) out.push(...pontosCvmAcao(b, e.symbols, opcoesSeriesAcao(params)));
    }
  }
  if (fiis.length > 0) {
    const brutos = await deps.lerBrutosFii(
      ctx.prisma,
      fiis.map((f) => ({ symbol: f.symbol, cnpj: f.cnpj, conferido: f.conferido })),
      desdeAno,
    );
    for (const b of brutos.values()) {
      out.push(...pontosCvmFii(b, { anoFim, scoring: ctx.params }));
    }
  }
  return out;
}

/** Sanidade de uma linha de qualidade: confiança mínima e variação de default_pct / ltv_avg. */
function sanidadeQualidade(
  q: QualidadeParaGravar,
  historico: readonly QualidadeGravada[],
  fontes: FontesParams,
): { reviewStatus: 'approved' | 'pending'; motivos: string[] } {
  const anterior = historico
    .filter((h) => h.cnpj === q.cnpj && h.periodo < q.periodo && h.reviewStatus === 'approved')
    .sort((a, b) => b.periodo.localeCompare(a.periodo) || b.versao - a.versao)[0];
  const motivos = new Set<string>();
  const confianca = confiancaMinima(q.confianca ?? null);
  for (const [valor, ant] of [
    [q.defaultPct ?? null, anterior?.defaultPct ?? null],
    [q.ltvAvg ?? null, anterior?.ltvAvg ?? null],
  ] as const) {
    const r = avaliarSanidade({ camada: 'provedor', valor, anterior: ant, confianca }, fontes);
    for (const m of r.motivos) motivos.add(m);
  }
  if (motivos.size === 0 && confianca !== null) {
    const r = avaliarSanidade({ camada: 'provedor', valor: 0, confianca }, fontes);
    for (const m of r.motivos) motivos.add(m);
  }
  return { reviewStatus: motivos.size > 0 ? 'pending' : 'approved', motivos: [...motivos] };
}

export async function ingerirFontes(
  ctx: JobContexto,
  deps: DependenciasIngestao = DEPENDENCIAS_INGESTAO,
  opcoes: OpcoesIngestao = {},
): Promise<ResultadoJob> {
  let ids: IdFonte[];
  try {
    ids = opcoes.fonte ? [opcoes.fonte] : deps.idsHabilitados();
  } catch (e: unknown) {
    ctx.alertar({ codigo: 'fontes_config_invalida', nivel: 'erro', mensagem: mensagemDe(e) });
    throw e;
  }
  if (ids.length === 0) {
    return {
      pulado: 'nenhum conector de fundamentos habilitado (ANALISE_FONTES_INGESTAO vazio)',
      detalhes: { pulado: 'sem_conector' },
    };
  }

  const { versao: paramsVersion, params } = await deps.obterParams(
    ctx.prisma,
    opcoes.versaoParams !== undefined ? { versao: opcoes.versaoParams } : undefined,
  );
  const fontes = fontesEfetivas(params);
  const anoFim = anoFimGlobal(ctx.hoje, params);
  const desdeAno = anoFim - Math.max(...params.janelas);
  const desde = new Date(`${desdeAno}-01-01T00:00:00.000Z`);
  const agora = new Date();
  const hoje = dataCivilSaoPaulo(agora);
  const gerarId = deps.gerarId;

  const universo = ativosDoUniverso(await deps.carregarUniverso(ctx));
  const porSymbol = new Map(universo.map((a) => [a.symbol, a]));
  const mercadoDe = (symbol: string): MercadoFonte | null => porSymbol.get(symbol)?.mercado ?? null;

  const porFonte: Record<string, RelatorioFonte> = {};
  for (const id of ids) {
    const rel = relatorioVazio();
    porFonte[id] = rel;
    let fonte: FonteFundamentos | null;
    try {
      fonte = deps.obterFonte(id);
    } catch (e: unknown) {
      const codigo = e instanceof ErroRegistroFonte ? e.codigo : 'fonte_erro';
      ctx.alertar({ codigo: `fontes_${codigo}`, nivel: 'erro', mensagem: mensagemDe(e), ref: id });
      continue;
    }
    if (!fonte || fonte.modo !== 'ingestao' || !fonte.buscar) {
      ctx.alertar({
        codigo: 'fontes_conector_invalido',
        nivel: 'erro',
        mensagem: `fonte '${id}' não registrada ou sem ingestão`,
        ref: id,
      });
      continue;
    }
    const camada = camadaDaFonte(id);
    const ativos = universo.filter((a) => fonte.mercados.includes(a.mercado));
    const credenciais = deps.credenciais(id);

    for (let i = 0; i < ativos.length; i += LOTE_INGESTAO) {
      if (ctx.estourouPrazo()) {
        ctx.alertar({
          codigo: 'fontes_prazo',
          nivel: 'aviso',
          mensagem: `prazo estourou na fonte ${id} (${i}/${ativos.length} ativos); o resto fica para o próximo run`,
          ref: id,
        });
        return { parcial: true, detalhes: { paramsVersion, anoFim, porFonte } };
      }
      const lote = ativos.slice(i, i + LOTE_INGESTAO);
      const doLote = new Map(lote.map((a) => [a.symbol, a]));
      let pontos: PontoParaGravar[] = [];
      let recebidosLote = 0;
      const qualidades: QualidadeParaGravar[] = [];
      const descartar = (m: MotivoDescarte, serie?: string) => {
        rel.descartados[m] = (rel.descartados[m] ?? 0) + 1;
        if (serie && !rel.seriesDescartadas.includes(serie) && rel.seriesDescartadas.length < 20) {
          rel.seriesDescartadas.push(serie);
        }
      };
      try {
        const ctxBusca = {
          agora,
          credenciais,
          log: (mensagem: string, dados?: Record<string, unknown>) =>
            logger.info(`[analise-ativos] fonte ${id}: ${mensagem}`, dados ?? {}),
        };
        for await (const bruto of fonte.buscar(ctxBusca, lote, desde)) {
          rel.recebidos += 1;
          recebidosLote += 1;
          const item = bruto as unknown as Record<string, unknown>;
          const ativo = doLote.get(String(item.symbol ?? ''));
          if (item.tipo === 'qualidade_fii') {
            const r = validarQualidade(item, ativo, id);
            if ('descarte' in r) descartar(r.descarte);
            else qualidades.push(r.qualidade);
            continue;
          }
          const r = validarPonto(item, ativo, id);
          if ('descarte' in r) descartar(r.descarte, r.serie);
          else pontos.push(r.ponto);
        }
      } catch (e: unknown) {
        ctx.alertar({
          codigo: 'fontes_busca_falhou',
          nivel: 'erro',
          mensagem: `fonte ${id}: ${mensagemDe(e)} (lote ${i}); nada gravado deste lote`,
          ref: id,
        });
        continue;
      }
      ctx.contar('linhasLidas', recebidosLote);

      // séries obrigatórias ausentes → incompleto
      pontos = marcarIncompletos(pontos, mercadoDe, fontes, (base: PontoPeriodo) => {
        const a = doLote.get(base.symbol) as AtivoUniverso;
        return {
          ...(base as PontoPeriodo & { incompleto: boolean }),
          emissorId: a.emissorId,
          classe: a.classe,
          mercado: a.mercado,
          unidade: CATALOGO_SERIES[base.serie].unidade,
          fonte: id,
          sourceUrl: null,
          sourceRef: null,
          extractedBy: 'api',
          confianca: null,
          sourcePdfUrl: null,
          sourcePage: null,
          incompleto: true,
          reviewStatus: 'approved',
          motivosRevisao: [],
        };
      });
      rel.incompletos += pontos.filter((p) => p.incompleto).length;

      // sanidade (§6): anterior aprovado da mesma fonte + CVM do mesmo período
      const symbols = [...new Set(pontos.map((p) => p.symbol))];
      const series = [...new Set(pontos.map((p) => p.serie))];
      const historico = await deps.lerHistoricoPontos(ctx.prisma, id, symbols, series);
      const valorCvm =
        camada === 'provedor' && fontes.sanidade.aplicaA.includes('provedor') && pontos.length > 0
          ? indiceCvm(
              await pontosCvmDoLote(
                ctx,
                deps,
                lote.filter((a) => symbols.includes(a.symbol)),
                desdeAno,
                anoFim,
                params,
              ),
            )
          : () => null;
      const extras = new Map<string, { anterior: number | null; cvm: number | null }>();
      // em ordem de dtFim: o anterior pode ser um ponto já aprovado do próprio lote (1ª carga)
      const avaliados: typeof pontos = [];
      for (const p of [...pontos].sort((a, b) => a.dtFim.localeCompare(b.dtFim))) {
        if (p.incompleto) continue;
        const anterior = anteriorAprovado(historico, p, avaliados);
        const cvm = valorCvm(p);
        extras.set(chaveDoPonto(p), { anterior, cvm });
        const r = avaliarSanidade(
          { camada, valor: arredondarValor(p.valor), confianca: p.confianca, anterior, cvm },
          fontes,
        );
        p.reviewStatus = r.reviewStatus;
        p.motivosRevisao = r.motivos;
        avaliados.push(p);
      }
      const { criar, iguais } = planejarVersoes(pontos, historico, gerarId);
      rel.iguais += iguais;
      const pendentes = criar.filter((c) => c.reviewStatus === 'pending');
      rel.pendentes += pendentes.length;

      // qualidade de FII (point-in-time por cnpj × período)
      const historicoQ = await deps.lerHistoricoQualidade(ctx.prisma, id, [
        ...new Set(qualidades.map((q) => q.cnpj)),
      ]);
      const criarQ: Array<QualidadeParaGravar & { id: string; versao: number; motivos: string[] }> =
        [];
      const vistosQ = new Set<string>();
      for (const q of qualidades) {
        const k = `${q.cnpj}|${q.periodo}`;
        if (vistosQ.has(k)) continue;
        vistosQ.add(k);
        const ultima = historicoQ
          .filter((h) => h.cnpj === q.cnpj && h.periodo === q.periodo)
          .sort((a, b) => b.versao - a.versao)[0];
        if (ultima && ultima.conteudo === assinaturaQualidade(q as Record<string, unknown>)) {
          rel.iguais += 1;
          continue;
        }
        const s = sanidadeQualidade(q, historicoQ, fontes);
        criarQ.push({
          ...q,
          reviewStatus: s.reviewStatus,
          motivos: s.motivos,
          id: (gerarId ?? randomUUID)(),
          versao: (ultima?.versao ?? 0) + 1,
        });
      }
      rel.pendentes += criarQ.filter((q) => q.reviewStatus === 'pending').length;

      if (!ctx.aplicar) continue;
      rel.gravados += await deps.gravarPontos(ctx.prisma, criar, agora);
      rel.qualidadeGravadas += await deps.gravarQualidade(ctx.prisma, criarQ, agora);
      ctx.contar('linhasGravadas', criar.length + criarQ.length);
      for (const c of pendentes) {
        const ext = extras.get(chaveDoPonto(c));
        const r = await deps.abrirCasoFonte(ctx.prisma, casoDoPonto(c, ext, hoje), agora);
        if (r === 'aberto') rel.casosAbertos += 1;
        else rel.casosAtualizados += 1;
      }
      for (const q of criarQ.filter((x) => x.reviewStatus === 'pending')) {
        const r = await deps.abrirCasoFonte(
          ctx.prisma,
          {
            symbol: q.symbol,
            cnpj: q.cnpj,
            classe: 'fii',
            campo: CAMPO_QUALIDADE_FII,
            periodo: q.periodo,
            contexto: {
              tipo: 'fonte_externa',
              referencia: { tabela: 'fii_property_quality', id: q.id },
              fonte: id,
              serie: CAMPO_QUALIDADE_FII,
              valor: null,
              valorCvm: null,
              valorAnterior: null,
              motivos: q.motivos,
              versao: q.versao,
              regraDesde: hoje,
            },
          },
          agora,
        );
        if (r === 'aberto') rel.casosAbertos += 1;
        else rel.casosAtualizados += 1;
      }
    }
    const descartados = Object.values(rel.descartados).reduce((s, n) => s + (n ?? 0), 0);
    ctx.contar('rejeitadas', descartados);
    if (rel.seriesDescartadas.length > 0) {
      ctx.alertar({
        codigo: 'fontes_series_descartadas',
        nivel: 'info',
        mensagem: `fonte ${id}: séries fora do catálogo descartadas: ${rel.seriesDescartadas.join(', ')}`,
        ref: id,
      });
    }
  }
  return { detalhes: { paramsVersion, anoFim, aplicar: ctx.aplicar, porFonte } };
}

const chaveDoPonto = (p: { symbol: string; serie: string; tipoPeriodo: string; dtFim: string }) =>
  `${p.symbol}|${p.serie}|${p.tipoPeriodo}|${p.dtFim}`;

function casoDoPonto(
  c: LinhaPontoNova,
  ext: { anterior: number | null; cvm: number | null } | undefined,
  hoje: string,
) {
  return {
    symbol: c.symbol,
    cnpj: c.emissorId,
    classe: c.classe,
    campo: c.serie,
    periodo: c.dtFim,
    contexto: {
      tipo: 'fonte_externa' as const,
      referencia: { tabela: 'asset_fundamentals_serie' as const, id: c.id },
      fonte: c.fonte,
      serie: c.serie,
      valor: c.valor,
      valorCvm: ext?.cvm ?? null,
      valorAnterior: ext?.anterior ?? null,
      motivos: c.motivosRevisao,
      versao: c.versao,
      regraDesde: hoje,
    },
  };
}
