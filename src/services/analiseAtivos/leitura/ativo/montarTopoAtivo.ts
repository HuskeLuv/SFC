/**
 * Topo da página do ativo numa chamada (fatia B): GET /api/analise-ativos/ativos/[ticker].
 *
 * Só banco (nenhum provedor externo): a linha do Quadro (fonte única da cotação e dos
 * Estado<number>) + as tabelas da Fase 0 por ticker/CNPJ, em Promise.all e só por índices
 * existentes (PK/unique da Fase 0):
 *  - v2.4 (fatia C2): critérios de fundamentos nas 3 janelas (criteria_eval via obterCriteriosAtivo,
 *    com cache próprio). SEM Índice nem semáforo: nenhuma chave /indice|semaforo|destaque/ no JSON;
 *  - asset_multiples_current (PK), asset_per_share_yearly e asset_multiples_yearly (unique
 *    symbol+anoFiscal) dos últimos 11 anos;
 *  - asset_corporate_action_checks (idx symbol), aplicados por series.fatorAjusteAte;
 *  - ações: asset_eventos futuros (idx cnpj+data) e a última DFP/ITR (idx emissor+tipo+dtFim);
 *  - FIIs: fii_monthly de 11 anos (unique cnpj+refMonth) e a cotação de fim de mês
 *    (DISTINCT ON month em asset_quotes_daily, PK symbol+date);
 *  - asset_proventos_auditados válidos com data-com entre hoje e hoje + 2 anos (idx symbol+data);
 *  - painel de frescor em cache de 10 min;
 *  - bloco C: casos de curadoria ABERTOS do ticker (somente leitura, sem dado de autor).
 *
 * Bloco C (fatia B): "em conferência" e frescor por bloco. Com params v2 (row.paramsVersion ≥ 2)
 * vão `conferencias` (flags 'conf:' da linha + das linhas anuais) e `frescorBlocos`; com a v1 os
 * dois ficam AUSENTES e a resposta é a mesma da Fase 1.
 *
 * Cache em memória por ticker:versão do Quadro (TTL 30 min, LRU 800): a versão muda quando o job
 * 'quadro' grava, e o topo é refeito na próxima leitura.
 *
 * v2.5 (fatia B): tags do FII com o tipo EXIBIDO ('FII de tijolo' | 'FII de papel', pelo perfil dos
 * critérios) e FoF/Híbrido como prefixo do segmento; `fiiTipoCvm` leva o tipo CVM BRUTO (seção
 * automática da Carteira, fatia C); a frase de fonte do card de critérios é montada pelas origens
 * (textoNotaFonte + rótulos do registro de fontes) quando a avaliação traz `fontes`.
 *
 * Stocks e REITs (fatia C): linha stock/reit SÓ com `opts.eua.habilitado` (senão null = 404).
 * montarTopoAtivoEua lê os 10-K da SEC (lerPeriodosSec) e o cadastro (SecCompany): tags de setor/
 * segmento, bolsa e 'FY termina em …' (SEM índice), KPIs do último FY (montarKpisEua), gráfico 'LPA
 * por ano' (stock) ou 'Caixa operacional por ação por ano' (REIT), dividendo por ação por FY e o bloco
 * `eua` (link dos 10-K na SEC). Sem a chave de preço: cotação nula e motivoSemPreco 'licenca'.
 *
 * A6 (fundamentei-trazer, fatia 0; leitura da fatia C): com ANALISE_ATIVOS_RETORNOS_HABILITADO,
 * `retornos` (asset_retornos_cotacao, PK symbol, por lerRetornosAtivo; falha = ausente). Sem a chave
 * nada é consultado e a resposta é a de hoje.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  obterLinhaQuadro,
  paraLinhaQuadroApi,
  versaoQuadro,
} from '@/services/analiseAtivos/leitura/linhasQuadro';
import { anosFechados } from '@/services/analiseAtivos/leitura/ativo/series';
import { montarDividendos } from '@/services/analiseAtivos/leitura/ativo/dividendosAnuais';
import { montarEventos } from '@/services/analiseAtivos/leitura/ativo/eventosAtivo';
import {
  montarFrescor,
  painelFrescorEmCache,
} from '@/services/analiseAtivos/leitura/ativo/frescorAtivo';
import { montarKpis } from '@/services/analiseAtivos/leitura/ativo/kpisAtivo';
import {
  flagsAnuaisConf,
  lerCasosAbertos,
  montarConferenciasTela,
} from '@/services/analiseAtivos/leitura/ativo/conferenciasAtivo';
import { montarFrescorBlocos } from '@/services/analiseAtivos/leitura/ativo/frescorBlocos';
import { gruposConf } from '@/services/analiseAtivos/regras/comum/conferencia';
import { obterCriteriosAtivo } from '@/services/analiseAtivos/leitura/criterios/lerCriterios';
import { obterCriteriaParamsQuadro } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { CRITERIA_PARAMS_CODIGO } from '@/services/analiseAtivos/params/criteriaParamsCodigo';
import {
  montarGraficoAcao,
  montarGraficoFii,
  type EventoAjuste,
} from '@/services/analiseAtivos/leitura/ativo/seriesGrafico';
import { FLAG_CNPJ_EM_CONFERENCIA } from '@/services/analiseAtivos/quadro/montarLinhasQuadro';
import { lerRetornosAtivo } from '@/services/analiseAtivos/leitura/ativo/retornosAtivo';
import { analiseAtivosRetornosHabilitado } from '@/lib/analiseAtivosConfig';
import type { RetornosCotacaoApi } from '@/types/analiseAtivosComplementos';
import {
  rotuloSegmentoFii,
  segmentoTipoDe,
  tipoFiiExibido,
} from '@/services/analiseAtivos/quadro/tipoFiiExibido';
import { rotulosFontes } from '@/services/analiseAtivos/fontes/fundamentos/registro';
import { textoNotaFonte } from '@/services/analiseAtivos/textosCriterios';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import { LINK_EDUCACAO } from '@/constants/analiseAtivosVisual';
import {
  ehClasseEua,
  type AtivoTopoResposta,
  type ClasseQuadro,
  type FiiTipoTela,
  type LinhaQuadroApi,
  type DividendosAtivo,
  type GraficoAtivo,
  type PontoSerieAnual,
} from '@/types/analiseAtivosApi';
import type { AnaliseQuadroLinha } from '@prisma/client';
import { montarKpisEua } from '@/services/analiseAtivos/leitura/ativo/kpisAtivo';
import {
  lerPeriodosSec,
  valoresAnoSec,
  type PeriodoSec,
} from '@/services/analiseAtivos/leitura/ativo/fundamentosEssencialEua';
import { comCotacaoEua } from '@/services/analiseAtivos/quadro/consultaQuadro';
import { textoExercicio } from '@/services/analiseAtivos/textosEua';
import { TEXTOS_EUA_TELAS, formatarTexto } from '@/services/analiseAtivos/textosEuaTelas';
import {
  BOLSAS_EUA,
  SEC_URLS,
  SEGMENTOS_REIT,
  cikDoEmissorId,
  type BolsaEua,
  type SegmentoReit,
} from '@/types/analiseAtivosEua';
import type { CriteriosAtivo, IdCriterio, PontoCriterio } from '@/types/analiseAtivosCriterios';

export const TTL_TOPO_MS = 30 * 60_000;
export const MAX_TOPO_EM_CACHE = 800;
const ANOS_HISTORICO = 11;

interface EntradaCache {
  valor: AtivoTopoResposta;
  expiraEm: number;
}

/** LRU simples: Map mantém a ordem de inserção; acesso reinsere no fim. */
const cache = new Map<string, EntradaCache>();

/** Só para testes. */
export function _limparCacheTopo(): void {
  cache.clear();
}

function lerCache(chave: string, agora: number): AtivoTopoResposta | null {
  const e = cache.get(chave);
  if (!e) return null;
  cache.delete(chave);
  if (e.expiraEm <= agora) return null;
  cache.set(chave, e);
  return e.valor;
}

function gravarCache(chave: string, valor: AtivoTopoResposta, agora: number): void {
  cache.set(chave, { valor, expiraEm: agora + TTL_TOPO_MS });
  while (cache.size > MAX_TOPO_EM_CACHE) {
    const maisAntiga = cache.keys().next().value;
    if (maisAntiga === undefined) break;
    cache.delete(maisAntiga);
  }
}

/**
 * Critérios das 3 janelas (fatia A grava; < 30 KB no topo). Falha de leitura = null ("sem
 * avaliação"): o topo nunca quebra por causa dos critérios.
 */
async function lerCriteriosTopo(ticker: string): Promise<CriteriosAtivo | null> {
  try {
    return await obterCriteriosAtivo(prisma, ticker);
  } catch {
    return null;
  }
}

/** A6: retornos da cotação (fatia C). Falha de leitura = null: o topo nunca quebra por isto. */
async function lerRetornosTopo(
  ticker: string,
  classe: 'acao' | 'fii',
): Promise<RetornosCotacaoApi | null> {
  try {
    return await lerRetornosAtivo(prisma, ticker, classe);
  } catch {
    return null;
  }
}

/**
 * v2.5: dados dos KPIs da AÇÃO FINANCEIRA pelos mesmos params do card (kpisAtivo.kpiFinanceira):
 * perfis.acao_financeira.naoSeAplica (falha de leitura = os do código) e o último ponto (maior ano,
 * entre as janelas) das séries de 'mg' e 'dl' da avaliação de critérios.
 */
async function dadosKpisFinanceira(criterios: CriteriosAtivo | null): Promise<{
  naoSeAplica: readonly IdCriterio[];
  ultimos: Partial<Record<'mg' | 'dl', PontoCriterio | null>>;
}> {
  let naoSeAplica: readonly IdCriterio[];
  try {
    naoSeAplica = (await obterCriteriaParamsQuadro()).perfis.acao_financeira.naoSeAplica;
  } catch {
    naoSeAplica = CRITERIA_PARAMS_CODIGO.perfis.acao_financeira.naoSeAplica;
  }
  const ultimos: Partial<Record<'mg' | 'dl', PontoCriterio | null>> = {};
  for (const id of ['mg', 'dl'] as const) {
    let ultimo: PontoCriterio | null = null;
    for (const janela of Object.values(criterios?.janelas ?? {})) {
      const item = janela?.itens.find((i) => i.id === id);
      for (const p of item?.serie ?? []) if (!ultimo || p.ano > ultimo.ano) ultimo = p;
    }
    ultimos[id] = ultimo;
  }
  return { naoSeAplica, ultimos };
}

/**
 * v2.5: com as origens (CriteriosAtivo.fontes), a frase de fonte do card é montada por elas
 * ('Fonte: ‹provedor› · DFP/ITR (CVM).'); sem origens, fica a da avaliação (v2.4).
 */
export function criteriosComFonte(
  criterios: CriteriosAtivo | null,
  classe: ClasseQuadro,
): CriteriosAtivo | null {
  if (!criterios?.fontes) return criterios;
  return { ...criterios, fonte: textoNotaFonte(classe, criterios.fontes, rotulosFontes()) };
}

/** Data civil de hoje em São Paulo (AAAA-MM-DD). */
export function hojeSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
}

const iso = (d: Date | null | undefined): string | null =>
  d ? d.toISOString().slice(0, 10) : null;
const num = (d: unknown): number | null => {
  if (d === null || d === undefined) return null;
  const n = typeof d === 'number' ? d : Number(String(d));
  return Number.isFinite(n) ? n : null;
};
const somarAnos = (hoje: string, anos: number) =>
  `${Number(hoje.slice(0, 4)) + anos}${hoje.slice(4)}`;

/**
 * Tags do topo. FII (v2.5): tipo EXIBIDO (pelo perfil dos critérios; sem avaliação, tijolo = tijolo
 * e o resto = papel) + segmento com o prefixo FoF/Híbrido do tipo CVM bruto.
 */
export function tagsDe(l: LinhaQuadroApi, perfil?: string | null): string[] {
  if (l.classe === 'fii') {
    const tipos: Record<FiiTipoTela, string> = TEXTOS_TELA.ativo.tiposFii;
    const tipo = tipos[tipoFiiExibido(perfil ?? l.criterios?.perfil, l.fiiTipo)];
    const segmento = rotuloSegmentoFii(segmentoTipoDe(l.fiiTipo), l.segmentoCvm);
    return [tipo, segmento].filter((x): x is string => !!x);
  }
  // setor · segmento · listagem. SEM tag de índice de mercado (IBOV): não tem fonte (decisão 6).
  return [l.setor, l.segmento, l.listagem].filter((x): x is string => !!x);
}

export interface OpcoesTopoAtivo {
  agora?: Date;
  /** chaves EUA resolvidas pela rota; ausente = desligadas (stock/reit = null) */
  eua?: { habilitado: boolean; preco: boolean };
}

/** Monta o topo; null = ticker fora da área (a rota responde 404). */
export async function montarTopoAtivo(
  tickerBruto: string,
  opts: OpcoesTopoAtivo = {},
): Promise<AtivoTopoResposta | null> {
  const ticker = tickerBruto.toUpperCase();
  const agora = opts.agora ?? new Date();
  const versao = await versaoQuadro(agora.getTime());
  const precoEua = opts.eua?.habilitado === true && opts.eua.preco;
  const chave = `${ticker}:${versao}${precoEua ? ':preco' : ''}`;
  const row = await obterLinhaQuadro(ticker);
  if (row && ehClasseEua(row.classe)) {
    if (opts.eua?.habilitado !== true) return null;
    const emCacheEua = lerCache(chave, agora.getTime());
    if (emCacheEua) return emCacheEua;
    const topoEua = await montarTopoAtivoEua(row, { agora, versao, preco: precoEua });
    gravarCache(chave, topoEua, agora.getTime());
    return topoEua;
  }
  const emCache = lerCache(chave, agora.getTime());
  if (emCache) return emCache;
  if (!row || (row.classe !== 'acao' && row.classe !== 'fii')) return null;
  const linha = paraLinhaQuadroApi(row);
  const classe = linha.classe as ClasseQuadro;
  const hoje = hojeSaoPaulo(agora);
  const anoAtual = Number(hoje.slice(0, 4));
  const desdeAno = anoAtual - ANOS_HISTORICO;
  const ehAcao = classe === 'acao';
  // FII com ticker↔CNPJ não conferido: o informe mensal do CNPJ pode ser de outro fundo (nem é
  // lido): sem VP/cota no gráfico, sem data de informe; cotação e proventos da B3 continuam.
  const cnpjEmConferencia = !ehAcao && row.flags.includes(FLAG_CNPJ_EM_CONFERENCIA);

  const [
    criterios,
    atuais,
    perShare,
    multAnuais,
    checks,
    eventos,
    datasCom,
    ultimaDfp,
    ultimoItr,
    mensal,
    cotacaoMensal,
    pares,
    painel,
    casos,
    retornos,
  ] = await Promise.all([
    lerCriteriosTopo(ticker),
    prisma.assetMultiplesCurrent.findUnique({ where: { symbol: ticker } }),
    prisma.assetPerShareYearly.findMany({
      where: { symbol: ticker, anoFiscal: { gte: desdeAno } },
      select: {
        anoFiscal: true,
        lpaAjHoje: true,
        dpaAjHoje: true,
        payoutDmplPct: true,
        flags: true,
      },
      orderBy: { anoFiscal: 'asc' },
    }),
    ehAcao
      ? prisma.assetMultiplesYearly.findMany({
          where: { symbol: ticker, anoFiscal: { gte: desdeAno } },
          select: { anoFiscal: true, precoFimAno: true, precoFimAnoData: true, flags: true },
          orderBy: { anoFiscal: 'asc' },
        })
      : Promise.resolve([]),
    prisma.assetCorporateActionCheck.findMany({
      where: { symbol: ticker },
      select: { dataEvento: true, fator: true, status: true },
    }),
    ehAcao
      ? prisma.assetEvento.findMany({
          where: {
            cnpj: row.cnpj,
            data: { gte: new Date(`${hoje}T00:00:00Z`) },
            substituidoEm: null,
          },
          orderBy: { data: 'asc' },
          take: 6,
        })
      : Promise.resolve([]),
    prisma.assetProventoAuditado.findMany({
      where: {
        symbol: ticker,
        status: 'valido',
        dataComReal: {
          gte: new Date(`${hoje}T00:00:00Z`),
          lte: new Date(`${somarAnos(hoje, 2)}T00:00:00Z`),
        },
      },
      select: { dataComReal: true, tipoNormalizado: true, valor: true, status: true },
      orderBy: { dataComReal: 'asc' },
      take: 12,
    }),
    ehAcao
      ? prisma.assetFundamentalsPeriod.findFirst({
          where: { emissorId: row.cnpj, tipoPeriodo: 'FY' },
          orderBy: { dtFim: 'desc' },
          select: { anoFiscal: true },
        })
      : Promise.resolve(null),
    ehAcao
      ? prisma.assetFundamentalsPeriod.findFirst({
          where: { emissorId: row.cnpj, docTipo: 'ITR' },
          orderBy: { dtFim: 'desc' },
          select: { anoFiscal: true, trimestreFiscal: true },
        })
      : Promise.resolve(null),
    ehAcao || cnpjEmConferencia
      ? Promise.resolve([])
      : prisma.fiiMonthly.findMany({
          where: { cnpj: row.cnpj, refMonth: { gte: new Date(Date.UTC(desdeAno, 0, 1)) } },
          select: { refMonth: true, vpCota: true },
          orderBy: { refMonth: 'asc' },
        }),
    ehAcao
      ? Promise.resolve([] as Array<{ date: Date; close: unknown }>)
      : prisma.$queryRaw<Array<{ date: Date; close: unknown }>>(Prisma.sql`
          SELECT DISTINCT ON (date_trunc('month', date)) date, "closeRaw" AS close
          FROM asset_quotes_daily
          WHERE symbol = ${ticker} AND date >= ${new Date(Date.UTC(desdeAno, 0, 1))}
          ORDER BY date_trunc('month', date), date DESC`),
    Promise.all(row.pares.map((p) => obterLinhaQuadro(p))),
    painelFrescorEmCache(prisma),
    // bloco C: só com flag 'conf:' na linha (v1 nunca grava ⇒ nenhuma consulta a mais)
    gruposConf(row.flags).length > 0 ? lerCasosAbertos(prisma, ticker) : Promise.resolve([]),
    // A6: só com a chave (sem ela, nenhuma consulta a mais e nenhum campo novo)
    analiseAtivosRetornosHabilitado()
      ? lerRetornosTopo(ticker, ehAcao ? 'acao' : 'fii')
      : Promise.resolve(null),
  ]);
  const v2 = (row.paramsVersion ?? 1) >= 2;
  const gruposConferencia = gruposConf(row.flags);

  const eventosAjuste: EventoAjuste[] = checks.map((c) => ({
    dataEvento: iso(c.dataEvento) as string,
    fator: num(c.fator) ?? 1,
    status: c.status as EventoAjuste['status'],
  }));
  const linhasPares = pares
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => paraLinhaQuadroApi(p));

  const lpaAnual = anosFechados(
    perShare.map((p) => ({ ano: p.anoFiscal, valor: p.lpaAjHoje })),
    hoje,
  );
  const mesesPorAno: Record<number, number> = {};
  for (const m of mensal) {
    const a = m.refMonth.getUTCFullYear();
    mesesPorAno[a] = (mesesPorAno[a] ?? 0) + 1;
  }
  const ultimoMensal = mensal.length ? iso(mensal[mensal.length - 1].refMonth) : null;

  const financeiraKpis =
    ehAcao && row.regua === 'acao_financeira' ? await dadosKpisFinanceira(criterios) : undefined;
  const kpis = montarKpis({
    linha,
    financeira: financeiraKpis,
    atuais: atuais
      ? {
          plMedia10a: atuais.plMedia10a,
          plPontosHistorico: atuais.plPontosHistorico,
          dpa12m: atuais.dpa12m,
          rend12m: atuais.rend12m,
          vpCota: atuais.vpCota,
        }
      : null,
    pares: linhasPares,
    lpaAnual,
    patrimonioData: ultimoMensal,
    motivosIncompleto: row.motivosIncompleto,
    brutos: {
      pl: row.pl,
      pvp: row.pvp,
      dy12m: row.dy12mPct,
      roe: row.roePct,
      margemLiquida: row.margemLiquidaPct,
      divLiqEbitda: row.divLiqEbitda,
      payout: row.payoutPct,
      obrigacoesPl: row.obrigacoesPlPct,
      vacanciaCvm: row.vacanciaFisicaCvmPct,
    },
  });

  const grafico = ehAcao
    ? montarGraficoAcao({
        hoje,
        lpaAnual: perShare.map((p) => ({ ano: p.anoFiscal, lpaAjHoje: p.lpaAjHoje })),
        precoAnual: multAnuais.map((m) => ({
          ano: m.anoFiscal,
          preco: num(m.precoFimAno),
          data: iso(m.precoFimAnoData),
        })),
        eventos: eventosAjuste,
        lpaTtm: atuais?.lpaTtm ?? null,
        precoAtual: linha.preco.estado === 'ok' ? linha.preco.valor : null,
      })
    : montarGraficoFii({
        hoje,
        mensal: mensal.map((m) => ({ refMonth: iso(m.refMonth) as string, vpCota: num(m.vpCota) })),
        cotacaoMensal: cotacaoMensal
          .map((c) => ({ data: iso(c.date) as string, close: num(c.close) ?? 0 }))
          .filter((c) => c.close > 0),
        eventos: eventosAjuste,
      });

  const dividendos = montarDividendos({
    classe,
    hoje,
    anos: perShare.map((p) => ({
      ano: p.anoFiscal,
      // FII: rendimento por cota na base de hoje (÷ desdobramentos/grupamentos), como Fundamentos
      valor: p.dpaAjHoje,
      payoutPct: ehAcao ? p.payoutDmplPct : null,
      flags: p.flags,
    })),
    mesesPorAno: ehAcao || cnpjEmConferencia ? undefined : mesesPorAno,
    ult12m: ehAcao ? (atuais?.dpa12m ?? null) : (atuais?.rend12m ?? null),
    ult12mData: iso(atuais?.precoData) ?? linha.precoData,
    proventosEmConferencia: linha.proventosEmConferencia,
    conferenciaProventos: gruposConferencia.includes('proventos'),
  });

  const listaEventos = montarEventos({
    classe,
    hoje,
    eventos: eventos.map((e) => ({
      tipo: e.tipo,
      subtipo: e.subtipo,
      periodoRef: e.periodoRef,
      data: iso(e.data) as string,
      estimado: e.estimado,
      substituidoEm: e.substituidoEm ? e.substituidoEm.toISOString() : null,
      assunto: e.assunto,
    })),
    datasCom: datasCom.map((d) => ({
      dataComReal: iso(d.dataComReal),
      tipoNormalizado: d.tipoNormalizado,
      valor: d.valor,
      status: d.status,
    })),
  });

  const frescor = montarFrescor({
    classe,
    precoData: linha.precoData,
    dfpAno: ultimaDfp?.anoFiscal ?? null,
    itr:
      ultimoItr && ultimoItr.trimestreFiscal
        ? { ano: ultimoItr.anoFiscal, trimestre: ultimoItr.trimestreFiscal }
        : null,
    fiiMes: ultimoMensal,
    painel,
  });

  const preco = linha.preco.estado === 'ok' ? linha.preco.valor : null;
  const pct = linha.variacaoDiaPct;
  const variacao =
    preco !== null && typeof pct === 'number' && pct > -100
      ? preco - preco / (1 + pct / 100)
      : null;
  const edu = TEXTOS_TELA.educacao[classe];

  const resposta: AtivoTopoResposta = {
    ticker,
    classe,
    nome: linha.nome,
    tags: tagsDe(linha, criterios?.perfil),
    noQuadro: linha.noQuadro,
    foraDoQuadroMotivo: linha.foraDoQuadroMotivo,
    assetId: linha.assetId,
    fiiTipoCvm: ehAcao ? null : (linha.fiiTipo ?? null),
    cotacao: {
      preco,
      data: linha.precoData,
      variacao,
      variacaoPct: pct,
      baixaLiquidez: linha.baixaLiquidez,
    },
    criterios: criteriosComFonte(criterios, classe),
    kpis,
    grafico,
    dividendos,
    eventos: listaEventos,
    educacao: { titulo: edu.titulo, href: LINK_EDUCACAO[classe], descricao: edu.descricao },
    frescor,
    versao,
  };
  const conferencias = montarConferenciasTela({
    flags: [...row.flags, ...flagsAnuaisConf(multAnuais)],
    classe,
    regua: row.regua,
    casos,
  });
  if (conferencias.length > 0) resposta.conferencias = conferencias;
  if (retornos) resposta.retornos = retornos;
  if (v2) {
    resposta.frescorBlocos = montarFrescorBlocos({
      classe,
      hoje,
      precoData: linha.precoData,
      dfpAno: ultimaDfp?.anoFiscal ?? null,
      itr:
        ultimoItr && ultimoItr.trimestreFiscal
          ? { ano: ultimoItr.anoFiscal, trimestre: ultimoItr.trimestreFiscal }
          : null,
      fiiMes: ultimoMensal,
      proventosDefasados:
        row.flags.some((f) => f.startsWith('proventos_defasados')) ||
        row.motivosIncompleto.includes('div:fonte_defasada'),
      versao,
      dataRef: iso(row.dataRef),
    });
  }
  const topo = resposta as AtivoTopoResposta;
  gravarCache(chave, topo, agora.getTime());
  return topo;
}

// ---------------------------------------------------------------------------
// Stocks e REITs (fatia C)
// ---------------------------------------------------------------------------

const finitoEua = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** Tags do topo EUA: setor (stock) ou segmento + 'REIT de patrimônio', bolsa e o FY. SEM índice. */
export function tagsEua(
  l: Pick<LinhaQuadroApi, 'classe' | 'setor' | 'segmento' | 'bolsa'>,
  exercicioFimMmdd: string | null,
): string[] {
  const tags =
    l.classe === 'reit'
      ? [l.segmento, l.bolsa, TEXTOS_EUA_TELAS.ativo.tagReit]
      : [l.setor, l.bolsa];
  return [...tags, textoExercicio(exercicioFimMmdd)].filter((x): x is string => !!x);
}

/** Gráfico anual por ação (LPA do stock; caixa op./ação do REIT), só a série A. Pura. */
export function graficoEua(
  classe: 'stock' | 'reit',
  periodos: readonly PeriodoSec[],
): GraficoAtivo {
  const G = TEXTOS_EUA_TELAS.ativo.grafico;
  const pontos = periodos.slice(-10).map((p) => {
    const v = valoresAnoSec(p);
    const valor = classe === 'reit' ? v.fcoAcao : v.lpa;
    return { chave: String(p.anoFiscal), valor: finitoEua(valor) ? valor : null };
  });
  return {
    titulo: classe === 'reit' ? G.tituloReit : G.tituloStock,
    figcaption: classe === 'reit' ? G.figcaptionReit : G.figcaptionStock,
    granularidade: 'anual',
    periodos: ['10A'],
    serieA: { rotulo: classe === 'reit' ? G.serieReit : G.serieStock, pontos },
    serieB: { rotulo: '', pontos: [] },
    ult12m: null,
    lacunas: [],
    insuficiente: pontos.filter((p) => p.valor !== null).length < 3,
  };
}

/** Dividendo por ação por FY (US$) com o crescimento anual dos últimos 5 anos fechados. Pura. */
export function dividendosEua(periodos: readonly PeriodoSec[]): DividendosAtivo {
  const anos: PontoSerieAnual[] = periodos
    .slice(-10)
    .map((p) => ({ ano: p.anoFiscal, valor: finitoEua(p.dpa) ? p.dpa : null }));
  const fim = anos[anos.length - 1];
  const ini = anos.find((a) => fim && a.ano === fim.ano - 5);
  const cagr =
    fim && ini && finitoEua(fim.valor) && finitoEua(ini.valor) && ini.valor > 0 && fim.valor > 0
      ? (Math.pow(fim.valor / ini.valor, 1 / 5) - 1) * 100
      : null;
  return {
    anos,
    ult12m: null,
    cagr5aPct: cagr,
    cagrAnoInicio: cagr === null ? null : ini!.ano,
    cagrAnoFim: cagr === null ? null : fim!.ano,
    cagrMotivo: null,
    selo: null,
    unidade: 'dpa',
  };
}

/** Topo de um stock/REIT a partir da linha do Quadro + 10-K da SEC + cadastro. */
export async function montarTopoAtivoEua(
  row: AnaliseQuadroLinha,
  opts: { agora: Date; versao: string; preco: boolean },
): Promise<AtivoTopoResposta> {
  const classe = row.classe as 'stock' | 'reit';
  const linha = comCotacaoEua(paraLinhaQuadroApi(row), opts.preco);
  const cik = cikDoEmissorId(row.cnpj) ?? row.cnpj.replace(/^CIK:/, '');
  const [criterios, periodos, empresa] = await Promise.all([
    lerCriteriosTopo(row.symbol),
    lerPeriodosSec(row.cnpj),
    prisma.secCompany.findUnique({
      where: { cik },
      select: {
        exercicioFimMmdd: true,
        bolsa: true,
        publicFloatData: true,
        segmento: true,
      },
    }),
  ]);
  const ultimo = periodos[periodos.length - 1] ?? null;
  const v = ultimo ? valoresAnoSec(ultimo) : null;
  const kpis = montarKpisEua({
    classe,
    ano: ultimo?.anoFiscal ?? null,
    valores: v
      ? {
          roePct: v.roePct,
          margemPct: v.margemPct,
          divLiqEbitda: v.divLiqEbitda,
          dividaLiquida: v.dividaLiquida,
          lpa: v.lpa,
          dpa: v.dpa,
          payoutPct: v.payoutPct,
          fcoAcao: v.fcoAcao,
          divFcoPct: v.divFcoPct,
          receita: v.receita,
          lucro: v.lucro,
        }
      : null,
    dpaCalculado: ultimo?.dpaOrigem === 'derivado',
    anosLucroConsecutivos: row.anosLucroConsecutivos,
    anosDividendo: row.anosDividendo,
  });
  const exercicio = empresa?.exercicioFimMmdd ?? null;
  const bolsa = (BOLSAS_EUA as readonly string[]).includes(empresa?.bolsa ?? linha.bolsa ?? '')
    ? ((empresa?.bolsa ?? linha.bolsa) as BolsaEua)
    : null;
  const segmento = (SEGMENTOS_REIT as readonly string[]).includes(empresa?.segmento ?? '')
    ? (empresa?.segmento as SegmentoReit)
    : null;
  const preco = linha.preco.estado === 'ok' ? linha.preco.valor : null;
  const edu = TEXTOS_TELA.educacao[classe];
  return {
    ticker: row.symbol,
    classe,
    nome: linha.nome,
    tags: tagsEua({ ...linha, bolsa }, exercicio),
    noQuadro: linha.noQuadro,
    foraDoQuadroMotivo: linha.foraDoQuadroMotivo,
    assetId: linha.assetId,
    fiiTipoCvm: null,
    cotacao: {
      preco,
      data: opts.preco ? linha.precoData : null,
      variacao: null,
      variacaoPct: opts.preco ? linha.variacaoDiaPct : null,
      baixaLiquidez: false,
    },
    criterios: criteriosComFonte(criterios, classe),
    kpis,
    grafico: graficoEua(classe, periodos),
    dividendos: dividendosEua(periodos),
    eventos: [],
    educacao: { titulo: edu.titulo, href: LINK_EDUCACAO[classe], descricao: edu.descricao },
    frescor: {
      cotacao: null,
      fundamentos: ultimo
        ? formatarTexto(TEXTOS_TELA.ativo.frescor.sec, { ano: ultimo.anoFiscal })
        : null,
      fii: null,
      painelAtrasado: false,
    },
    versao: opts.versao,
    eua: {
      cik,
      bolsa,
      moeda: 'USD',
      exercicioFimMmdd: exercicio,
      motivoSemPreco: opts.preco ? null : 'licenca',
      linkDocumentos: SEC_URLS.documentos10k.replace('{cik}', cik),
      publicFloatData: empresa?.publicFloatData
        ? empresa.publicFloatData.toISOString().slice(0, 10)
        : null,
      segmento,
    },
  };
}
