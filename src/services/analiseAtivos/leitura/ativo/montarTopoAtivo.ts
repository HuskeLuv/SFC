/**
 * Topo da página do ativo numa chamada (fatia B): GET /api/analise-ativos/ativos/[ticker].
 *
 * Só banco (nenhum provedor externo): a linha do Quadro (fonte única do estado do Índice, da
 * cotação e dos Estado<number>) + as tabelas da Fase 0 por ticker/CNPJ, em Promise.all e só por
 * índices existentes (PK/unique da Fase 0):
 *  - AssetScore mais recente do ticker de referência do Índice (unique symbol+dataRef);
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
import {
  lerScoreGravado,
  montarIndiceTopo,
  montarSemaforoTela,
} from '@/services/analiseAtivos/leitura/ativo/semaforoTela';
import {
  montarGraficoAcao,
  montarGraficoFii,
  type EventoAjuste,
} from '@/services/analiseAtivos/leitura/ativo/seriesGrafico';
import { FLAG_CNPJ_EM_CONFERENCIA } from '@/services/analiseAtivos/quadro/montarLinhasQuadro';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import { LINK_EDUCACAO } from '@/constants/analiseAtivosVisual';
import type {
  AtivoTopoResposta,
  ClasseQuadro,
  EstadoIndice,
  FiiTipoTela,
  LinhaQuadroApi,
} from '@/types/analiseAtivosApi';

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

function tagsDe(l: LinhaQuadroApi): string[] {
  if (l.classe === 'fii') {
    const tipos: Record<FiiTipoTela, string> = TEXTOS_TELA.ativo.tiposFii;
    return [l.fiiTipo ? tipos[l.fiiTipo] : null, l.segmentoCvm].filter((x): x is string => !!x);
  }
  // setor · segmento · listagem. SEM tag de índice de mercado (IBOV): não tem fonte (decisão 6).
  return [l.setor, l.segmento, l.listagem].filter((x): x is string => !!x);
}

/** Monta o topo; null = ticker fora da área (a rota responde 404). */
export async function montarTopoAtivo(
  tickerBruto: string,
  opts: { agora?: Date } = {},
): Promise<AtivoTopoResposta | null> {
  const ticker = tickerBruto.toUpperCase();
  const agora = opts.agora ?? new Date();
  const versao = await versaoQuadro(agora.getTime());
  const chave = `${ticker}:${versao}`;
  const emCache = lerCache(chave, agora.getTime());
  if (emCache) return emCache;

  const row = await obterLinhaQuadro(ticker);
  if (!row || (row.classe !== 'acao' && row.classe !== 'fii')) return null;
  const linha = paraLinhaQuadroApi(row);
  const classe = linha.classe as ClasseQuadro;
  const hoje = hojeSaoPaulo(agora);
  const anoAtual = Number(hoje.slice(0, 4));
  const desdeAno = anoAtual - ANOS_HISTORICO;
  const refIndice = row.tickerReferencia ?? ticker;
  const ehAcao = classe === 'acao';
  // FII com ticker↔CNPJ não conferido: o informe mensal do CNPJ pode ser de outro fundo (nem é
  // lido): sem VP/cota no gráfico, sem data de informe; cotação e proventos da B3 continuam.
  const cnpjEmConferencia = !ehAcao && row.flags.includes(FLAG_CNPJ_EM_CONFERENCIA);

  const [
    scoreRow,
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
  ] = await Promise.all([
    prisma.assetScore.findFirst({
      where: { symbol: refIndice },
      orderBy: { dataRef: 'desc' },
    }),
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

  const score = scoreRow ? lerScoreGravado(scoreRow) : null;
  const estado = linha.indice.estado as EstadoIndice;
  const indice = montarIndiceTopo(
    {
      estadoIndice: estado,
      indiceMf: row.indiceMf,
      regua: row.regua,
      motivosIncompleto: row.motivosIncompleto,
      componentesZeroRegra: row.componentesZeroRegra,
      criteriosAtendidos: row.criteriosAtendidos,
      criteriosAplicaveis: row.criteriosAplicaveis,
    },
    estado === 'sem_score' || estado === 'fora_do_indice' ? null : score,
  );
  const semaforo =
    score && estado !== 'sem_score' && estado !== 'fora_do_indice'
      ? montarSemaforoTela(score.checks, gruposConferencia)
      : [];

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

  const kpis = montarKpis({
    linha,
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
    tags: tagsDe(linha),
    noQuadro: linha.noQuadro,
    foraDoQuadroMotivo: linha.foraDoQuadroMotivo,
    tickerReferenciaIndice: row.tickerReferencia,
    assetId: linha.assetId,
    cotacao: {
      preco,
      data: linha.precoData,
      variacao,
      variacaoPct: pct,
      baixaLiquidez: linha.baixaLiquidez,
    },
    indice,
    semaforo,
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
  gravarCache(chave, resposta, agora.getTime());
  return resposta;
}
