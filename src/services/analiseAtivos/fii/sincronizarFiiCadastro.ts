/**
 * Job fii-cadastro (semanal): listas públicas da B3 ⇒ FiiTickerMap (ticker ↔ CNPJ com vigência).
 * Universo = listas B3 (regra 27): FII e, desde 04/11/2026, FIAGRO e FI-INFRA (tipoFundo; a Análise
 * os trata como FII de papel — revoga a decisão 14 só nesse ponto).
 *
 * 1. GetListFunds (typeFund FII ~6 páginas, FIAGRO e FI-INFRA 1 página cada, 300 ms entre páginas);
 * 2. candidatos = fundos do Informe Mensal mais recente (ano corrente, + ano−1 se mês ≤ 2) com
 *    informe nos últimos 6 meses (CNPJ, ISIN, nomes, PL, cotas) — lido "de passagem", sem mexer no
 *    ETag do job fii-mensal;
 * 3. GetDetailFund (CNPJ da própria B3) para os fundos novos, sem casamento ou cujo CNPJ sumiu do
 *    informe, mais um lote rolante dos consultados há mais tempo (cron: até `maxDetalhes`);
 *    Fiagro: candidatos também do informe mensal de Fiagro (últimos meses publicados); FI-Infra:
 *    do informe diário de fundos (fechamento do mês mais recente, só os CNPJs vindos da B3);
 * 4. casamento (manual > CNPJ B3 > ISIN completo > nome) e conferência valor de mercado/PL pela
 *    cotação do COTAHIST (repositorio.cotacoes.resumoCotacoes; sem cotação ⇒ nome fica não
 *    conferido — rodar de novo com --reconferir depois do COTAHIST);
 * 5. reconciliação de vigência: abre/fecha só quando muda; alertas de sigla nova/sumida/trocada,
 *    sem casamento e conferência divergente.
 */
import path from 'path';
import { resumoCotacoes } from '@/services/analiseAtivos/repositorio/cotacoes';
import { ErroFonte, ErroLayoutFonte } from '@/services/analiseAtivos/fontes/erros';
import {
  alertaAnoNaoPublicado,
  anoPodeNaoEstarPublicado,
} from '@/services/analiseAtivos/fontes/anoNaoPublicado';
import {
  anosDoCron,
  mesesRecentes,
  obterArquivo,
  urlInformeFii,
} from '@/services/analiseAtivos/fii/fiiArquivos';
import { aplicarPlanoMapa, lerMapa } from '@/services/analiseAtivos/fii/gravarFii';
import { AgregadorAlertas } from '@/services/analiseAtivos/fii/sincronizarFiiMensal';
import {
  baixarDetalheFundo,
  baixarListaB3Fii,
  paraItemRegra,
  type DetalheFundoB3,
  type ItemListaB3Bruto,
} from '@/services/analiseAtivos/fii/listaB3Fii';
import {
  lerInformeMensalZip,
  type GeralMensal,
} from '@/services/analiseAtivos/fii/parserInformeMensal';
import {
  candidatosFiagro,
  lerInformeFiagroZip,
  urlInformeFiagro,
  type ResultadoParserFiagro,
} from '@/services/analiseAtivos/fii/parserInformeFiagro';
import {
  candidatosDiario,
  lerInformeDiarioZip,
  urlInformeDiarioFi,
} from '@/services/analiseAtivos/fii/parserInformeDiarioFi';
import {
  historicosManuais,
  mapaManuaisVigentes,
} from '@/services/analiseAtivos/fii/tickersManuais';
import type { FiiMesBruto } from '@/services/analiseAtivos/regras/fii/saneamentoMensal';
import {
  casarTickerCnpj,
  fundosCandidatos,
  formatarCnpj,
  reconciliarMapa,
  tickerDoItem,
  tipoFundoDoItem,
  type CasamentoParaMapa,
  type FundoCvm,
  type TipoFundoMapa,
} from '@/services/analiseAtivos/regras/fii/tickerCnpj';
import type { JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';

export const JOB_FII_CADASTRO = 'fii-cadastro';
export const MAX_DETALHES_CRON = 60;

export interface OpcoesFiiCadastro {
  /** lista B3 já baixada (testes/scripts); padrão: baixa */
  listaB3?: ItemListaB3Bruto[];
  cacheDir?: string;
  anos?: number[];
  /** quantos GetDetailFund no máximo (cron 60; backfill Infinity; --reconferir 0) */
  maxDetalhes?: number;
  pausaDetalheMs?: number;
  /** backfill: validFrom = 1º mês do CNPJ no informe (senão hoje) */
  primeiroMesPorCnpj?: Map<string, string>;
  /** injeção para testes */
  baixarDetalhe?: (item: ItemListaB3Bruto) => Promise<DetalheFundoB3 | null>;
  /** candidatos de Fiagro já lidos (testes); padrão: informe mensal de Fiagro recente */
  candidatosFiagro?: FundoCvm[];
  /** candidatos de FI-Infra (testes); padrão: informe diário do mês corrente ou anterior */
  candidatosFiInfra?: (cnpjs: Set<string>) => Promise<FundoCvm[]>;
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Quantos meses do informe de Fiagro o cadastro lê (o do mês M sai em M+1/M+2). */
const MESES_FIAGRO_CADASTRO = 4;

/** Informe mensal de Fiagro dos últimos meses publicados (leitura de passagem, sem ETag). */
async function lerFiagroRecente(
  ctx: JobContexto,
  cacheDir: string | undefined,
): Promise<FundoCvm[]> {
  const lidos: ResultadoParserFiagro[] = [];
  // o mês corrente nunca está publicado: começa no anterior
  for (const ref of mesesRecentes(ctx.hoje, MESES_FIAGRO_CADASTRO + 1).slice(1)) {
    const url = urlInformeFiagro(ref);
    const arq = await obterArquivo(ctx.prisma, url, {
      cacheDir,
      condicional: false,
      registrar: false,
      naoPublicadoSe404: true,
    });
    try {
      if (!arq.caminho) continue;
      lidos.push(await lerInformeFiagroZip(arq.caminho, { arquivo: path.basename(url) }));
    } finally {
      await arq.descartar();
    }
  }
  return candidatosFiagro(lidos);
}

/** Fechamento mais recente do informe diário (mês corrente; sem linha ⇒ o anterior). */
async function lerFiInfraRecente(
  ctx: JobContexto,
  cnpjs: Set<string>,
  cacheDir: string | undefined,
): Promise<FundoCvm[]> {
  if (cnpjs.size === 0) return [];
  for (const ref of mesesRecentes(ctx.hoje, 2)) {
    const url = urlInformeDiarioFi(ref);
    const arq = await obterArquivo(ctx.prisma, url, {
      cacheDir,
      condicional: false,
      registrar: false,
      naoPublicadoSe404: true,
    });
    try {
      if (!arq.caminho) continue;
      const r = await lerInformeDiarioZip(arq.caminho, { arquivo: path.basename(url), cnpjs });
      if (r.fechamentos.size > 0) return candidatosDiario(r);
    } finally {
      await arq.descartar();
    }
  }
  return [];
}

export async function sincronizarFiiCadastro(
  ctx: JobContexto,
  opts: OpcoesFiiCadastro = {},
): Promise<ResultadoJob> {
  // 1. lista B3
  const lista = opts.listaB3 ?? (await baixarListaB3Fii());
  ctx.contar('linhasLidas', lista.length);
  const listaFii = lista.filter((i) => tipoFundoDoItem(paraItemRegra(i, null)) !== null);

  // 2. candidatos do Informe Mensal
  const anos = opts.anos ?? anosDoCron(ctx.hoje, 2);
  const geral = new Map<string, GeralMensal>();
  const meses: FiiMesBruto[] = [];
  for (const ano of anos) {
    const url = urlInformeFii('mensal', ano);
    const arq = await obterArquivo(ctx.prisma, url, {
      cacheDir: opts.cacheDir,
      condicional: false,
      registrar: false,
      naoPublicadoSe404: anoPodeNaoEstarPublicado(ano, ctx.hoje),
    });
    try {
      if (arq.status === 'nao_publicado') ctx.alertar(alertaAnoNaoPublicado(url, ano));
      if (!arq.caminho) continue;
      const r = await lerInformeMensalZip(arq.caminho, {
        arquivo: `inf_mensal_fii_${ano}.zip`,
        params: ctx.params,
        semComposicao: true,
      });
      for (const [k, v] of r.geral) geral.set(k, v);
      meses.push(...r.meses);
    } finally {
      await arq.descartar();
    }
  }
  const candidatos = fundosCandidatos(geral.values(), meses);
  const cnpjsCandidatos = new Set(candidatos.map((c) => c.cnpj));
  if (candidatos.length === 0) {
    throw new ErroLayoutFonte('inf_mensal_fii (cadastro)', ['nenhum fundo no informe recente']);
  }

  // 3. detalhes da B3
  const mapa = await lerMapa(ctx.prisma);
  const vigentes = new Map(mapa.filter((l) => l.validTo === null).map((l) => [l.ticker, l]));
  const prioridade: ItemListaB3Bruto[] = [];
  const rolante: ItemListaB3Bruto[] = [];
  for (const item of listaFii) {
    const v = vigentes.get(tickerDoItem(paraItemRegra(item, null)));
    // Fiagro/FI-Infra não estão no informe de FII: prioridade só quando novos
    const foraDoInformeFii = (item.tipoFundo ?? 'FII') !== 'FII';
    if (!v || (!foraDoInformeFii && !cnpjsCandidatos.has(v.cnpj))) prioridade.push(item);
    else if (v.origem !== 'manual') rolante.push(item);
  }
  // lote rolante: não conferidos primeiro (a B3 pode confirmar o CNPJ), depois os mais antigos
  rolante.sort((a, b) => {
    const va = vigentes.get(`${a.acronym}11`);
    const vb = vigentes.get(`${b.acronym}11`);
    const ca = va?.conferido ? 1 : 0;
    const cb = vb?.conferido ? 1 : 0;
    if (ca !== cb) return ca - cb;
    return (va?.fetchedAt.getTime() ?? 0) - (vb?.fetchedAt.getTime() ?? 0);
  });
  const maxDetalhes = opts.maxDetalhes ?? MAX_DETALHES_CRON;
  const aConsultar = [...prioridade, ...rolante].slice(0, Math.max(0, maxDetalhes));
  const baixar = opts.baixarDetalhe ?? ((i: ItemListaB3Bruto) => baixarDetalheFundo(i));
  const detalhes = new Map<string, DetalheFundoB3 | null>();
  let falhasDetalhe = 0;
  for (const item of aConsultar) {
    if (ctx.restanteMs() < 30_000) {
      ctx.alertar({
        codigo: 'fii_detalhes_interrompidos',
        nivel: 'info',
        mensagem: `prazo: ${detalhes.size} de ${aConsultar.length} detalhes consultados`,
      });
      break;
    }
    try {
      detalhes.set(item.acronym, await baixar(item));
    } catch (e: unknown) {
      if (e instanceof ErroLayoutFonte) throw e;
      if (!(e instanceof ErroFonte)) throw e;
      falhasDetalhe++;
      if (falhasDetalhe <= 5) {
        ctx.alertar({
          codigo: 'fii_detalhe_b3_falhou',
          nivel: 'aviso',
          mensagem: `${item.acronym}: ${e.message}`,
          ref: item.acronym,
        });
      }
    }
    if (opts.pausaDetalheMs) await dormir(opts.pausaDetalheMs);
  }

  // 4. casamento (itens com o tipo final, depois do detalhe)
  const itens: Array<{ bruto: ItemListaB3Bruto; item: ReturnType<typeof paraItemRegra> }> = [];
  let excluidosTipo = 0;
  for (const bruto of listaFii) {
    const item = paraItemRegra(bruto, detalhes.get(bruto.acronym) ?? null);
    if (tipoFundoDoItem(item) === null) {
      excluidosTipo++;
      continue;
    }
    if (!item.cnpjB3) {
      // evidência da B3 de rodadas anteriores (não consultada hoje)
      const v = vigentes.get(tickerDoItem(item));
      if (v?.origem === 'b3_cnpj') item.cnpjB3 = v.cnpj;
    }
    itens.push({ bruto, item });
  }
  const doTipo = (t: TipoFundoMapa) => itens.filter((i) => tipoFundoDoItem(i.item) === t);
  // Fiagro: informe de Fiagro (o recente) + o de FII (Fiagros que ainda entregam o de FII)
  const candFiagro =
    doTipo('FIAGRO').length === 0
      ? []
      : (opts.candidatosFiagro ?? (await lerFiagroRecente(ctx, opts.cacheDir)));
  const cnpjsInfra = new Set(
    doTipo('FI-INFRA')
      .map((i) => formatarCnpj(i.item.cnpjB3))
      .filter((c): c is string => Boolean(c)),
  );
  const candInfra =
    cnpjsInfra.size === 0
      ? []
      : await (opts.candidatosFiInfra ?? ((c) => lerFiInfraRecente(ctx, c, opts.cacheDir)))(
          cnpjsInfra,
        );
  const cnpjsFiagro = new Set(candFiagro.map((c) => c.cnpj));
  const candidatosPorTipo: Record<TipoFundoMapa, FundoCvm[]> = {
    FII: candidatos,
    FIAGRO: [...candFiagro, ...candidatos.filter((c) => !cnpjsFiagro.has(c.cnpj))],
    'FI-INFRA': candInfra,
  };

  const tickers = itens.map((i) => tickerDoItem(i.item));
  const cotacoes = new Map(
    (await resumoCotacoes(ctx.prisma, tickers)).map((c) => [c.symbol, c.closeRaw]),
  );
  const manuais = mapaManuaisVigentes();
  const isinPorCnpj = new Map(
    [...candidatos, ...candFiagro].filter((c) => c.isin).map((c) => [c.cnpj, c.isin]),
  );
  const casamentos: CasamentoParaMapa[] = [];
  const porTipo: Record<string, number> = {};
  for (const { bruto, item } of itens) {
    const tipoFundo = tipoFundoDoItem(item)!;
    porTipo[tipoFundo] = (porTipo[tipoFundo] ?? 0) + 1;
    const r = casarTickerCnpj(item, candidatosPorTipo[tipoFundo], manuais, ctx.params, cotacoes);
    casamentos.push({
      ...r,
      nomeB3: bruto.tradingName || null,
      razaoSocialB3: bruto.fundName || null,
      isin: r.cnpj ? (isinPorCnpj.get(r.cnpj) ?? null) : null,
      tipoFundo,
    });
  }

  // 5. vigência
  const plano = reconciliarMapa(mapa, casamentos, ctx.hoje, {
    validFromNovo: opts.primeiroMesPorCnpj
      ? (cnpj) => opts.primeiroMesPorCnpj!.get(cnpj) ?? null
      : undefined,
    historicosManuais: historicosManuais(),
  });
  const agregador = new AgregadorAlertas(ctx.alertar, 20);
  plano.alertas.forEach(agregador.add);
  agregador.fechar();
  const tocados = [...detalhes.keys()]
    .map((ac) => vigentes.get(`${ac}11`)?.id)
    .filter((id): id is string => Boolean(id));
  if (ctx.aplicar) await aplicarPlanoMapa(ctx.prisma, plano, tocados);
  ctx.contar('linhasGravadas', plano.abrir.length + plano.atualizar.length + plano.fechar.length);
  ctx.contar('rejeitadas', plano.semCasamento.length);

  const casados = casamentos.filter((c) => c.cnpj);
  const porOrigem: Record<string, number> = {};
  for (const c of casados) porOrigem[c.origem!] = (porOrigem[c.origem!] ?? 0) + 1;
  return {
    detalhes: {
      listaB3: lista.length,
      fiis: listaFii.length,
      porTipo,
      excluidosTipo,
      candidatosCvm: candidatos.length,
      candidatosFiagro: candFiagro.length,
      candidatosFiInfra: candInfra.length,
      detalhesConsultados: detalhes.size,
      falhasDetalhe,
      casados: casados.length,
      porOrigem,
      conferidos: casados.filter((c) => c.conferido).length,
      naoConferidos: casados.filter((c) => !c.conferido).map((c) => `${c.ticker}:${c.motivo}`),
      semCasamento: plano.semCasamento,
      plano: {
        abrir: plano.abrir.length,
        fechar: plano.fechar.length,
        atualizar: plano.atualizar.length,
      },
      cnpjsMapa: [...new Set(casados.map((c) => formatarCnpj(c.cnpj)))].length,
    },
  };
}
