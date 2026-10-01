/**
 * Ingestão CVM de companhias abertas (fatia A): FCA (cadastro + tickers), DFP (anual) e ITR
 * (trimestral) → CvmCompany, CvmCompanyTicker, AssetFundamentalsPeriod (con E ind + linha TTM),
 * AssetStatementLine (Raio-X, só FY) e AssetShareCount. Função única do cron
 * /api/cron/analise-ativos/cvm-cias?doc=fca|dfp|itr e do backfill (scripts/analise-ativos/
 * backfill-cvm-cias.ts, que também passa o FRE item f).
 *
 * Por arquivo (cabe em 240 s / 300 MB no Lightsail):
 *  1. AnaliseFonteArquivo: ETag/Last-Modified/sha256 iguais ao último processado ⇒ pula (0 leituras).
 *  2. Lê só o índice → documentos (cnpj, DT_REFER, maior VERSAO) do universo (CNPJs com ticker vigente
 *     no FCA) que ainda NÃO estão no banco. Nenhum pendente ⇒ não abre os demonstrativos.
 *  3. Streaming de DRE/BPA/BPP/DFC_MI (+DMPL no DFP) e composicao_capital com filtro pelo prefixo do
 *     CNPJ na linha crua; guarda só as contas usadas (e, no DFP, as linhas do Raio-X do perfil).
 *  4. Grava na ordem Raio-X → contagens → fundamentos (o fundamento é o marcador de "documento
 *     gravado") → TTM. Prazo estourado ⇒ para entre lotes, NÃO marca o arquivo como processado e
 *     devolve parcial: o próximo run continua pelos (cnpj, versão) que faltam.
 *
 * Escopo: grava con E ind sempre que existirem (a escolha ind para bancos é feita na leitura, pelo
 * repositório) e CvmCompany.layoutFinanceiro pelo DRE. Não lê AssetSetorB3 (fatia C).
 * Linhas do Raio-X fora de produção: só o subconjunto dev (40 companhias).
 */
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { copyFile, mkdir, stat } from 'fs/promises';
import path from 'path';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  baixarParaArquivo,
  type ResultadoDownload,
} from '@/services/analiseAtivos/fontes/download';
import { ErroFonte } from '@/services/analiseAtivos/fontes/erros';
import { listarEntradasZip, type EntradaZip } from '@/services/analiseAtivos/fontes/zipStream';
import { deData, paraData, paraNumero } from '@/services/analiseAtivos/repositorio/conversao';
import {
  condicionalDownload,
  marcarProcessado,
  obterFonteArquivo,
  registrarDownload,
} from '@/services/analiseAtivos/repositorio/fontesArquivo';
import { eventosCorporativosBrutos } from '@/services/analiseAtivos/repositorio/proventos';
import { listarTickersAcoes } from '@/services/analiseAtivos/repositorio/universo';
import {
  DEMONSTRATIVOS_POR_DOC,
  MAX_BYTES_ZIP_CVM,
  SUBCONJUNTO_DEV_STATEMENT_LINES,
  TIMEOUT_DOWNLOAD_BACKFILL_MS,
  TIMEOUT_DOWNLOAD_MS,
  ULTIMO_ANO_FRE_ITEM_F,
  entradaComposicao,
  entradaDemonstrativo,
  janelaArquivos,
  nomeArquivoCvm,
  urlArquivoCvm,
} from '@/services/analiseAtivos/acoes/cvmArquivos';
import {
  balancosVizinhos,
  contagensExistentes,
  dec2,
  gravarCadastroFca,
  gravarContagens,
  gravarFundamentos,
  gravarLayoutFinanceiro,
  gravarLinhasDemonstrativo,
  gravarTtm,
  periodosDosEmissores,
  type BalancoVizinho,
  type ContagemGravavel,
  type LinhaFundamentosDb,
  documentosGravados,
} from '@/services/analiseAtivos/acoes/gravarAcoes';
import { lerComposicao } from '@/services/analiseAtivos/acoes/parserComposicaoCapital';
import {
  acharEntrada,
  chaveDoc,
  lerIndice,
  lerLinhasDemonstrativo,
  type DocIndice,
  type LinhaLida,
} from '@/services/analiseAtivos/acoes/parserDemonstrativos';
import { lerFca } from '@/services/analiseAtivos/acoes/parserFca';
import { lerFreAcoes, type AcoesFre } from '@/services/analiseAtivos/acoes/parserFre';
import {
  contagemComEscalaFixa,
  deduplicarEventos,
  resolverAcoesExercicio,
  type EntradaResolucaoAcoes,
  type EventoAcoes,
  type ResolucaoAcoes,
} from '@/services/analiseAtivos/regras/acoes/acoesEmitidas';
import {
  RE_DIVIDENDOS,
  extrairFundamentos,
  type FundamentosExtraidos,
} from '@/services/analiseAtivos/regras/acoes/extrairFundamentos';
import {
  aplicarDecisaoEscala,
  decidirEscala,
  sinalLpa,
  sinalVizinho,
} from '@/services/analiseAtivos/regras/acoes/escalaDeclarada';
import { ehLayoutFinanceiro } from '@/services/analiseAtivos/regras/acoes/layoutFinanceiro';
import { aplicarFatorLpa } from '@/services/analiseAtivos/regras/acoes/lpa';
import {
  aplicarLucroIndividual,
  nivelConta,
} from '@/services/analiseAtivos/regras/acoes/lucroDoPeriodo';
import {
  fimDoMesAnterior,
  mesesDoPeriodo,
  periodoFiscal,
} from '@/services/analiseAtivos/regras/acoes/periodoFiscal';
import {
  CAMPOS_FLUXO,
  calcularTtmPeriodo,
  type PeriodoFluxo,
} from '@/services/analiseAtivos/regras/acoes/ttm';
import type {
  Escopo,
  JobContexto,
  ResultadoJob,
  TipoPeriodo,
} from '@/services/analiseAtivos/tipos';

export type DocCvmCias = 'fca' | 'dfp' | 'itr';
export type PerfilLinhas = 'dev' | 'completo';

export interface OpcoesCvmCias {
  doc: DocCvmCias;
  /** padrão: janela do cron (janelaArquivos) */
  anos?: number[];
  /** backfill: usa os zips desta pasta (e guarda os que baixar) */
  cacheDir?: string;
  /** padrão: 'completo' em produção, 'dev' fora (AssetStatementLine só do subconjunto) */
  perfil?: PerfilLinhas;
  /** backfill: FRE item f por exercício (cnpj → ações) */
  freAcoes?: Map<number, Map<string, AcoesFre>>;
  /** universo (cnpj → symbols) quando o FCA ainda não foi gravado (dry-run do backfill) */
  universo?: Map<string, string[]>;
  /** ignora AnaliseFonteArquivo (arquivo inalterado é relido; os (cnpj, versão) gravados continuam pulados) */
  reprocessar?: boolean;
  /** processa também documentos já gravados (regrava só contagens de ações que mudaram) */
  revisitar?: boolean;
  /** injeção para testes */
  baixar?: typeof baixarParaArquivo;
}

export interface DetalheArquivo {
  url: string;
  doc: DocCvmCias;
  ano: number;
  status: 'inalterado' | 'processado' | 'parcial' | 'sem_pendentes';
  bytes?: number;
  docsUniverso?: number;
  pendentes?: number;
  fundamentos?: number;
  linhasRaioX?: number;
  contagens?: number;
  ttm?: number;
  cadastro?: Record<string, number>;
}

export function perfilPadrao(): PerfilLinhas {
  return process.env.NODE_ENV === 'production' ? 'completo' : 'dev';
}

// ---------------------------------------------------------------- arquivo (download ou cache)

type ArquivoObtido =
  | { status: 'inalterado' }
  | (Omit<ResultadoDownload, 'status' | 'caminho'> & { status: 'baixado'; caminho: string });

async function sha256Arquivo(caminho: string): Promise<string> {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(caminho)) h.update(chunk as Buffer);
  return h.digest('hex');
}

async function existe(caminho: string): Promise<boolean> {
  try {
    await stat(caminho);
    return true;
  } catch {
    return false;
  }
}

async function obterArquivo(
  ctx: JobContexto,
  url: string,
  nome: string,
  opts: OpcoesCvmCias,
): Promise<ArquivoObtido> {
  const baixar = opts.baixar ?? baixarParaArquivo;
  const fonte = await obterFonteArquivo(ctx.prisma, url);
  if (opts.cacheDir) {
    const local = path.join(opts.cacheDir, nome);
    if (!(await existe(local))) {
      const r = await baixar(url, {
        maxBytes: MAX_BYTES_ZIP_CVM,
        timeoutMs: TIMEOUT_DOWNLOAD_BACKFILL_MS,
      });
      if (!r.caminho) throw new ErroFonte('http_erro', `download sem arquivo: ${url}`);
      await mkdir(opts.cacheDir, { recursive: true });
      await copyFile(r.caminho, local);
      await r.descartar();
    }
    const sha256 = await sha256Arquivo(local);
    if (!opts.reprocessar && fonte?.processadoEm && fonte.sha256 === sha256) {
      return { status: 'inalterado' };
    }
    return {
      status: 'baixado',
      caminho: local,
      bytes: (await stat(local)).size,
      etag: null,
      lastModified: null,
      sha256,
      descartar: async () => {},
    };
  }
  const r = await baixar(url, {
    maxBytes: MAX_BYTES_ZIP_CVM,
    timeoutMs: TIMEOUT_DOWNLOAD_MS,
    condicional: opts.reprocessar ? undefined : condicionalDownload(fonte),
  });
  if (r.status === 'nao_modificado' || !r.caminho) return { status: 'inalterado' };
  return { ...r, status: 'baixado', caminho: r.caminho };
}

// ---------------------------------------------------------------- orquestração

export async function sincronizarCvmCias(
  ctx: JobContexto,
  opts: OpcoesCvmCias,
): Promise<ResultadoJob & { universoFca?: Map<string, string[]> }> {
  const anos = opts.anos ?? janelaArquivos(opts.doc, ctx.hoje);
  const perfil = opts.perfil ?? perfilPadrao();
  const arquivos: DetalheArquivo[] = [];
  let parcial = false;

  if (opts.doc === 'fca') {
    let universoFca: Map<string, string[]> | undefined;
    for (const ano of anos) {
      const r = await processarFca(ctx, ano, opts);
      arquivos.push(r.detalhe);
      universoFca = r.universo ?? universoFca;
    }
    return { detalhes: { doc: 'fca', anos, perfil, arquivos }, universoFca };
  }

  const universo = opts.universo ?? (await carregarUniverso(ctx.prisma));
  if (universo.size === 0) {
    ctx.alertar({
      codigo: 'universo_vazio',
      nivel: 'erro',
      mensagem: 'Nenhum ticker vigente em cvm_company_tickers: rode cvm-cias?doc=fca antes',
    });
    return { detalhes: { doc: opts.doc, anos, perfil, arquivos, universo: 0 } };
  }
  const apoio = { ...(await carregarApoio(ctx.prisma, universo, perfil, ctx)), fre: opts.freAcoes };
  for (const ano of anos) {
    const r = await processarDemonstrativos(ctx, opts.doc, ano, universo, apoio, opts);
    arquivos.push(r);
    if (r.status === 'parcial') {
      parcial = true;
      break;
    }
  }
  return {
    parcial,
    detalhes: { doc: opts.doc, anos, perfil, universo: universo.size, arquivos },
  };
}

async function carregarUniverso(prisma: PrismaClient): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (const t of await listarTickersAcoes(prisma)) {
    out.set(t.cnpj, [...(out.get(t.cnpj) ?? []), t.symbol]);
  }
  return out;
}

interface Apoio {
  mesFim: Map<string, number | null>;
  /** backfill: FRE item f por exercício (o cron não lê FRE) */
  fre?: Map<number, Map<string, AcoesFre>>;
  eventos: Map<string, EventoAcoes[]>;
  cnpjsRaioX: Set<string>;
}

async function carregarApoio(
  prisma: PrismaClient,
  universo: Map<string, string[]>,
  perfil: PerfilLinhas,
  ctx: JobContexto,
): Promise<Apoio> {
  const cias = await prisma.cvmCompany.findMany({
    select: { cnpj: true, mesFimExercicio: true },
  });
  const cnpjPorSymbol = new Map<string, string>();
  for (const [cnpj, symbols] of universo) for (const s of symbols) cnpjPorSymbol.set(s, cnpj);
  const brutos = await eventosCorporativosBrutos(prisma, [...cnpjPorSymbol.keys()]);
  const porCnpj = new Map<string, typeof brutos>();
  for (const e of brutos) {
    const cnpj = cnpjPorSymbol.get(e.symbol);
    if (cnpj) porCnpj.set(cnpj, [...(porCnpj.get(cnpj) ?? []), e]);
  }
  const eventos = new Map<string, EventoAcoes[]>();
  for (const [cnpj, evs] of porCnpj) eventos.set(cnpj, deduplicarEventos(evs, ctx.params));
  const cnpjsRaioX =
    perfil === 'completo'
      ? new Set(universo.keys())
      : new Set(
          SUBCONJUNTO_DEV_STATEMENT_LINES.map((s) => cnpjPorSymbol.get(s)).filter(
            (c): c is string => c !== undefined,
          ),
        );
  return {
    mesFim: new Map(cias.map((c) => [c.cnpj, c.mesFimExercicio])),
    eventos,
    cnpjsRaioX,
  };
}

// ---------------------------------------------------------------- FCA

async function processarFca(
  ctx: JobContexto,
  ano: number,
  opts: OpcoesCvmCias,
): Promise<{ detalhe: DetalheArquivo; universo: Map<string, string[]> | null }> {
  const url = urlArquivoCvm('fca', ano);
  const arq = await obterArquivo(ctx, url, nomeArquivoCvm('fca', ano), opts);
  if (arq.status === 'inalterado') {
    return { detalhe: { url, doc: 'fca', ano, status: 'inalterado' }, universo: null };
  }
  try {
    if (ctx.aplicar) await registrarDownload(ctx.prisma, url, arq);
    const entradas = await listarEntradasZip(arq.caminho);
    const fca = await lerFca(arq.caminho, entradas, ano);
    ctx.contar('linhasLidas', fca.linhasLidas);
    for (const a of fca.alertas) ctx.alertar(a);
    const r = await gravarCadastroFca(ctx.prisma, fca, {
      sourceUrl: url,
      hoje: ctx.hoje,
      aplicar: ctx.aplicar,
    });
    for (const a of r.alertas) ctx.alertar(a);
    const escritas =
      r.ciasNovas + r.ciasAtualizadas + r.tickersNovos + r.tickersFechados + r.tickersAtualizados;
    if (ctx.aplicar) {
      ctx.contar('linhasGravadas', escritas);
      await marcarProcessado(ctx.prisma, url, 'cvm-cias:fca');
    }
    const universo = new Map<string, string[]>();
    for (const t of fca.titulos) {
      if (!t.dataFim) universo.set(t.cnpj, [...(universo.get(t.cnpj) ?? []), t.symbol]);
    }
    return {
      detalhe: {
        url,
        doc: 'fca',
        ano,
        status: 'processado',
        bytes: arq.bytes,
        cadastro: {
          companhias: fca.cias.size,
          tickers: fca.titulos.length,
          ciasNovas: r.ciasNovas,
          ciasAtualizadas: r.ciasAtualizadas,
          tickersNovos: r.tickersNovos,
          tickersFechados: r.tickersFechados,
          tickersAtualizados: r.tickersAtualizados,
        },
      },
      universo,
    };
  } finally {
    await arq.descartar();
  }
}

// ---------------------------------------------------------------- DFP / ITR

interface Acumulador {
  doc: DocIndice;
  fund: Record<Escopo, LinhaLida[]>;
  presentes: Record<Escopo, Set<string>>;
  raioX: Record<Escopo, LinhaLida[]> | null;
}

const ESCOPOS: Escopo[] = ['con', 'ind'];

/** Só as contas que extrairFundamentos usa (memória: ~80 linhas por documento e escopo). */
export function relevanteFundamentos(l: {
  demonstrativo: string;
  cdConta: string;
  dsConta: string;
}) {
  const n = nivelConta(l.cdConta);
  switch (l.demonstrativo) {
    case 'DRE':
      return n <= 3 || l.cdConta.startsWith('3.99.');
    case 'BPA':
    case 'BPP':
      return n <= 3;
    case 'DFC_MI':
      return n <= 3 || (n === 4 && l.cdConta.startsWith('6.01.01.'));
    case 'DMPL':
      return /^5\.0[456]\.\d+$/.test(l.cdConta) && RE_DIVIDENDOS.test(l.dsConta);
    default:
      return false;
  }
}

interface PeriodoDoc {
  tipoPeriodo: TipoPeriodo;
  dtIni: string;
}

/** Períodos de um documento pelo DT_INI_EXERC do DRE: DFP ⇒ FY; ITR ⇒ 3M e/ou YTD (Q1 = ambos). */
export function periodosDoDocumento(
  doc: 'dfp' | 'itr',
  linhas: LinhaLida[],
  dtRefer: string,
  mesFim: number | null,
): PeriodoDoc[] {
  const inicios = [
    ...new Set(
      linhas
        .filter((l) => l.demonstrativo === 'DRE' && l.dtFim === dtRefer && l.dtIni)
        .map((l) => l.dtIni as string),
    ),
  ].sort();
  if (doc === 'dfp') {
    return [{ tipoPeriodo: 'FY', dtIni: inicios[0] ?? proximoDia(fimDoMesAnterior(dtRefer, 12)) }];
  }
  const trimestre = periodoFiscal(dtRefer, mesFim).trimestreFiscal;
  const out: PeriodoDoc[] = [];
  for (const dtIni of inicios) {
    const meses = mesesDoPeriodo(dtIni, dtRefer);
    if (meses <= 3) {
      out.push({ tipoPeriodo: '3M', dtIni });
      if (trimestre === 1) out.push({ tipoPeriodo: 'YTD', dtIni });
    } else {
      out.push({ tipoPeriodo: 'YTD', dtIni });
    }
  }
  return out;
}

function proximoDia(data: string): string {
  return new Date(Date.parse(`${data}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

async function processarDemonstrativos(
  ctx: JobContexto,
  doc: 'dfp' | 'itr',
  ano: number,
  universo: Map<string, string[]>,
  apoio: Apoio,
  opts: OpcoesCvmCias,
): Promise<DetalheArquivo> {
  const url = urlArquivoCvm(doc, ano);
  const job = `cvm-cias:${doc}`;
  const arq = await obterArquivo(ctx, url, nomeArquivoCvm(doc, ano), opts);
  if (arq.status === 'inalterado') return { url, doc, ano, status: 'inalterado' };
  const detalhe: DetalheArquivo = { url, doc, ano, status: 'processado', bytes: arq.bytes };
  try {
    if (ctx.aplicar) await registrarDownload(ctx.prisma, url, arq);
    const entradas = await listarEntradasZip(arq.caminho);
    const indice = await lerIndice(arq.caminho, entradas, doc, ano, {
      cnpjs: new Set(universo.keys()),
    });
    const docs = [...indice.values()];
    const docTipo = doc === 'dfp' ? 'DFP' : 'ITR';
    const cnpjsArquivo = [...new Set(docs.map((d) => d.cnpj))];
    // revisitar: processa também os documentos já gravados — fundamentos e Raio-X são createMany
    // idempotentes (não duplicam) e as contagens de ações são regravadas só se mudaram
    const gravados = opts.revisitar
      ? new Set<string>()
      : await documentosGravados(ctx.prisma, docTipo, cnpjsArquivo, [
          ...new Set(docs.map((d) => d.dtRefer)),
        ]);
    const pendentes = docs
      .filter((d) => !gravados.has(`${d.cnpj}|${d.dtRefer}|${d.versao}`))
      .sort((a, b) => a.cnpj.localeCompare(b.cnpj) || a.dtRefer.localeCompare(b.dtRefer));
    detalhe.docsUniverso = docs.length;
    detalhe.pendentes = pendentes.length;

    if (pendentes.length > 0) {
      const r = await processarPendentes(
        ctx,
        doc,
        url,
        arq.caminho,
        entradas,
        ano,
        pendentes,
        apoio,
      );
      Object.assign(detalhe, r.contagens);
      if (r.parcial) {
        detalhe.status = 'parcial';
        return detalhe;
      }
    } else {
      detalhe.status = 'sem_pendentes';
    }

    if (ctx.aplicar) {
      const ttm = await atualizarTtm(ctx, cnpjsArquivo, ano, apoio);
      detalhe.ttm = ttm.gravadas;
      if (ttm.interrompido) {
        detalhe.status = 'parcial';
        return detalhe;
      }
      await marcarProcessado(ctx.prisma, url, job);
    }
    return detalhe;
  } finally {
    await arq.descartar();
  }
}

async function processarPendentes(
  ctx: JobContexto,
  doc: 'dfp' | 'itr',
  url: string,
  caminho: string,
  entradas: EntradaZip[],
  ano: number,
  pendentes: DocIndice[],
  apoio: Apoio,
): Promise<{ parcial: boolean; contagens: Partial<DetalheArquivo> }> {
  const docsAceitos = new Map(pendentes.map((d) => [chaveDoc(d.cnpj, d.dtRefer), d.versao]));
  const porDoc = new Map(pendentes.map((d) => [chaveDoc(d.cnpj, d.dtRefer), d]));
  const acumuladores = new Map<string, Acumulador>();
  const acumulador = (k: string): Acumulador => {
    let a = acumuladores.get(k);
    if (!a) {
      const d = porDoc.get(k)!;
      a = {
        doc: d,
        fund: { con: [], ind: [] },
        presentes: { con: new Set(), ind: new Set() },
        raioX: doc === 'dfp' && apoio.cnpjsRaioX.has(d.cnpj) ? { con: [], ind: [] } : null,
      };
      acumuladores.set(k, a);
    }
    return a;
  };

  // 1. streaming dos demonstrativos
  const contadores = {
    lidas: (n: number) => ctx.contar('linhasLidas', n),
    rejeitada: () => ctx.contar('rejeitadas', 1),
  };
  for (const dem of DEMONSTRATIVOS_POR_DOC[doc]) {
    for (const escopo of ESCOPOS) {
      const nome = entradaDemonstrativo(doc, dem, escopo, ano);
      const entrada = acharEntrada(entradas, nome);
      if (!entrada) {
        if (dem === 'DRE' || dem === 'BPA' || dem === 'BPP') {
          throw new ErroFonte('layout_mudou', `entrada ${nome} ausente em ${url}`);
        }
        continue;
      }
      for await (const l of lerLinhasDemonstrativo(caminho, entrada, {
        dem,
        escopo,
        docs: docsAceitos,
        contadores,
      })) {
        const a = acumulador(chaveDoc(l.cnpj, l.dtRefer));
        a.presentes[escopo].add(dem);
        if (relevanteFundamentos(l)) a.fund[escopo].push(l);
        if (a.raioX && dem !== 'DMPL') a.raioX[escopo].push(l);
      }
      if (ctx.estourouPrazo()) return { parcial: true, contagens: {} };
    }
  }
  const entradaComp = acharEntrada(entradas, entradaComposicao(doc, ano));
  const composicoes = entradaComp
    ? await lerComposicao(caminho, entradaComp, docsAceitos)
    : new Map();

  // 2. montagem das linhas
  const fetchedAt = new Date();
  const cnpjsPendentes = [...new Set(pendentes.map((d) => d.cnpj))];
  const existentesContagem = await contagensExistentes(ctx.prisma, cnpjsPendentes);
  const vizinhos = await balancosVizinhos(ctx.prisma, cnpjsPendentes, `${ano - 3}-01-01`);
  const contagensRun: ContagemGravavel[] = [];
  const linhasFund: Prisma.AssetFundamentalsPeriodCreateManyInput[] = [];
  const linhasRaioX: Prisma.AssetStatementLineCreateManyInput[] = [];
  const layout = new Map<string, boolean>();

  for (const d of pendentes) {
    const a = acumuladores.get(chaveDoc(d.cnpj, d.dtRefer));
    if (!a) continue; // documento sem linhas (reentrega vazia): fica pendente e é revisto se o arquivo mudar
    const mesFim = doc === 'dfp' ? Number(d.dtRefer.slice(5, 7)) : (apoio.mesFim.get(d.cnpj) ?? 12);
    const temCon = a.fund.con.some((l) => l.demonstrativo === 'DRE');
    const dreRef = (temCon ? a.fund.con : a.fund.ind).filter((l) => l.demonstrativo === 'DRE');
    const layoutFin = ehLayoutFinanceiro(dreRef);
    layout.set(d.cnpj, layoutFin);

    const extraidos: Array<{ f: FundamentosExtraidos; escala: string }> = [];
    for (const escopo of ESCOPOS) {
      const linhas = a.fund[escopo];
      if (linhas.length === 0) continue;
      const escala = linhas.some((l) => l.escala === 'MIL') ? 'MIL' : 'UNIDADE';
      for (const p of periodosDoDocumento(doc, linhas, d.dtRefer, mesFim)) {
        const doPeriodo = linhas.filter(
          (l) => l.dtFim === d.dtRefer && (l.dtIni === null || l.dtIni === p.dtIni),
        );
        const f = extrairFundamentos(doPeriodo, {
          demonstrativos: a.presentes[escopo],
          ehFinanceira: layoutFin,
          tipoPeriodo: p.tipoPeriodo,
          escopo,
          dtIni: p.dtIni,
          dtFim: d.dtRefer,
          mesFimExercicio: mesFim,
        });
        extraidos.push({ f, escala });
        if (f.flags.includes('controladora_zero') && escopo === 'con') {
          ctx.alertar({
            codigo: 'controladora_zero',
            nivel: 'info',
            mensagem: `${d.cnpj} ${d.dtRefer} ${p.tipoPeriodo}: atribuído à controladora = 0 com lucro ≠ 0`,
            ref: d.cnpj,
          });
        }
      }
    }
    if (extraidos.length === 0) continue;
    // escala declarada errada (PDTC3 DFP 2024/2025: UNIDADE com valores em milhares)
    const fatoresEscala = conferirEscala(ctx, d, extraidos, vizinhos, [
      ...existentesContagem,
      ...contagensRun,
    ]);
    // regra 12: controladora e não controladores zerados ⇒ lucro do individual do mesmo documento
    const comLucroInd = aplicarLucroIndividual(extraidos.map((x) => x.f));
    comLucroInd.forEach((f, i) => {
      extraidos[i] = { ...extraidos[i], f };
    });

    // nº de ações (regra 10) e escala do LPA (regra 11)
    const base = baseDoDocumento(extraidos);
    const resol = resolverContagem(
      ctx,
      doc,
      d,
      base.f,
      composicoes.get(chaveDoc(d.cnpj, d.dtRefer)),
      apoio,
      [...existentesContagem, ...contagensRun],
    );
    if (resol?.acoes) {
      contagensRun.push({
        cnpj: d.cnpj,
        data: d.dtRefer,
        on: resol.on,
        pn: resol.pn,
        tesouraria: resol.tesouraria,
        total: resol.acoes,
        fonte: resol.fonte ?? 'sem_verificacao',
        razaoLpa: resol.razaoLpa,
        status: resol.status,
        versaoDoc: d.versao,
        flags: resol.flags,
      });
      if (resol.status === 'alerta') {
        ctx.alertar({
          codigo: 'razao_lpa_fora',
          nivel: 'aviso',
          mensagem: `${d.cnpj} ${d.dtRefer}: Σ(LPA×ações)/lucro = ${resol.razaoLpa?.toFixed(3)} (${resol.fonte})`,
          ref: d.cnpj,
        });
      }
    }
    const fator = resol?.fatorEscalaLpa ?? 1;
    for (const { f, escala } of extraidos) {
      const on = f.lpaOn === null ? null : aplicarFatorLpa(f.lpaOn, fator, ctx.params);
      const pn = f.lpaPn === null ? null : aplicarFatorLpa(f.lpaPn, fator, ctx.params);
      const corrigido = Boolean(on?.corrigido || pn?.corrigido);
      if (corrigido && f.escopo === 'con') {
        ctx.alertar({
          codigo: 'lpa_escala_corrigida',
          nivel: 'info',
          mensagem: `${d.cnpj} ${d.dtRefer}: LPA publicado × ${fator}`,
          ref: d.cnpj,
        });
      }
      linhasFund.push(
        linhaFundamentos(f, {
          cnpj: d.cnpj,
          docTipo: doc === 'dfp' ? 'DFP' : 'ITR',
          doc: d,
          url,
          escala,
          lpaOn: on?.lpa.estado === 'ok' ? on.lpa.valor : null,
          lpaPn: pn?.lpa.estado === 'ok' ? pn.lpa.valor : null,
          lpaEscalaCorrigida: corrigido,
          fetchedAt,
        }),
      );
    }

    // Raio-X (só FY): con; ind também quando layout financeiro ou sem con
    if (a.raioX) {
      const escopos: Escopo[] = temCon ? (layoutFin ? ['con', 'ind'] : ['con']) : ['ind'];
      for (const escopo of escopos) {
        const fatorEscala = fatoresEscala.get(escopo) ?? 1;
        for (const l of a.raioX[escopo]) {
          if (l.dtFim !== d.dtRefer) continue;
          const v = dec2(l.cdConta.startsWith('3.99') ? l.valor : l.valor * fatorEscala);
          if (v === null) continue;
          linhasRaioX.push({
            emissorId: d.cnpj,
            dtFim: deData(d.dtRefer),
            tipoPeriodo: 'FY',
            escopo,
            demonstrativo: l.demonstrativo,
            cdConta: l.cdConta,
            versao: d.versao,
            dsConta: l.dsConta,
            nivel: nivelConta(l.cdConta),
            valor: v,
            contaFixa: l.contaFixa ?? false,
            source: 'CVM',
          });
        }
      }
    }
  }
  acumuladores.clear();

  const contagens: Partial<DetalheArquivo> = {
    fundamentos: linhasFund.length,
    linhasRaioX: linhasRaioX.length,
    contagens: contagensRun.length,
  };
  if (!ctx.aplicar) return { parcial: false, contagens };

  // 3. gravação (o fundamento é o marcador de "documento gravado": vai por último)
  await gravarLayoutFinanceiro(ctx.prisma, layout);
  const rx = await gravarLinhasDemonstrativo(ctx.prisma, ctx, linhasRaioX);
  ctx.contar('linhasGravadas', rx.gravadas);
  if (rx.interrompido) return { parcial: true, contagens };
  const cg = await gravarContagens(ctx.prisma, ctx, contagensRun, existentesContagem);
  ctx.contar('linhasGravadas', cg.gravadas);
  if (cg.interrompido) return { parcial: true, contagens };
  const fu = await gravarFundamentos(ctx.prisma, ctx, linhasFund);
  ctx.contar('linhasGravadas', fu.gravadas);
  return { parcial: fu.interrompido, contagens };
}

/**
 * Período-base do documento para o nº de ações e o LPA: consolidado (FY/YTD); se o consolidado não
 * publica LPA e o individual publica (VIVT3: 3.99 só no individual), o individual do mesmo período —
 * lucro e LPA do mesmo escopo, e no BR GAAP o lucro individual é o da controladora.
 */
function baseDoDocumento<T extends { f: FundamentosExtraidos }>(extraidos: T[]): T {
  const naoTrimestral = extraidos.filter((x) => x.f.tipoPeriodo !== '3M');
  const con = naoTrimestral.find((x) => x.f.escopo === 'con');
  const temLpa = (x: T | undefined) => Boolean(x && (x.f.lpaOn || x.f.lpaPn));
  if (con && !temLpa(con)) {
    const ind = naoTrimestral.find(
      (x) => x.f.escopo === 'ind' && x.f.dtIni === con.f.dtIni && temLpa(x),
    );
    if (ind) return ind;
  }
  return con ?? naoTrimestral[0] ?? extraidos[0];
}

/**
 * Confere a escala declarada de cada escopo do documento contra o balanço vizinho já gravado e o LPA
 * publicado (regras/acoes/escalaDeclarada.ts); corrige `extraidos` no lugar e devolve o fator
 * aplicado por escopo (para o Raio-X). Registra o balanço do documento como vizinho dos próximos.
 */
function conferirEscala(
  ctx: JobContexto,
  d: DocIndice,
  extraidos: Array<{ f: FundamentosExtraidos; escala: string }>,
  vizinhos: Map<string, BalancoVizinho[]>,
  contagens: ContagemGravavel[],
): Map<Escopo, number> {
  const fatores = new Map<Escopo, number>();
  const base = baseDoDocumento(extraidos);
  const acoes =
    contagens
      .filter(
        (c) =>
          c.cnpj === d.cnpj &&
          c.status === 'ok' &&
          c.total !== null &&
          c.total > 0 &&
          c.data <= d.dtRefer,
      )
      .sort((a, b) => b.data.localeCompare(a.data))[0]?.total ?? null;
  const lpa = base.f.lpaOn || base.f.lpaPn || null;
  const sLpa = sinalLpa(base.f.lucroAtribuivel ?? base.f.lucroLiquido, lpa, acoes, ctx.params);
  for (const escopo of ESCOPOS) {
    const doEscopo = extraidos.filter((x) => x.f.escopo === escopo);
    const balanco = doEscopo.find((x) => x.f.tipoPeriodo !== '3M')?.f ?? doEscopo[0]?.f;
    if (!balanco) continue;
    const k = `${d.cnpj}|${escopo}`;
    const lista = vizinhos.get(k) ?? [];
    const vizinho =
      [...lista].reverse().find((v) => v.dtFim < d.dtRefer) ??
      lista.find((v) => v.dtFim > d.dtRefer) ??
      null;
    const declarada = doEscopo[0]?.escala ?? 'UNIDADE';
    const decisao = decidirEscala(sinalVizinho(balanco, vizinho), sLpa, declarada);
    fatores.set(escopo, decisao.fator);
    if (decisao.flag !== null) {
      for (let i = 0; i < extraidos.length; i++) {
        if (extraidos[i].f.escopo !== escopo) continue;
        extraidos[i] = { ...extraidos[i], f: aplicarDecisaoEscala(extraidos[i].f, decisao) };
      }
      if (escopo === 'con' || !extraidos.some((x) => x.f.escopo === 'con')) {
        ctx.alertar({
          codigo: decisao.flag,
          nivel: decisao.flag === 'escala_ambigua' ? 'aviso' : 'info',
          mensagem: `${d.cnpj} ${d.dtRefer}: escala declarada ${doEscopo[0].escala}${
            decisao.fator !== 1 ? ` corrigida ×${decisao.fator}` : ' ambígua (não corrigida)'
          }`,
          ref: d.cnpj,
        });
      }
    }
    if (decisao.flag !== 'escala_ambigua') {
      const corrigido = extraidos.find((x) => x.f.escopo === escopo && x.f.tipoPeriodo !== '3M');
      const novo = {
        dtFim: d.dtRefer,
        ativoTotal: corrigido?.f.ativoTotal ?? null,
        pl: corrigido?.f.pl ?? null,
      };
      vizinhos.set(
        k,
        [...lista.filter((v) => v.dtFim !== d.dtRefer), novo].sort((a, b) =>
          a.dtFim.localeCompare(b.dtFim),
        ),
      );
    }
  }
  return fatores;
}

/** Regra 10 no DFP; no ITR a escala unidade/×1000 do DFP mais recente da empresa. */
function resolverContagem(
  ctx: JobContexto,
  doc: 'dfp' | 'itr',
  d: DocIndice,
  f: FundamentosExtraidos,
  composicao: EntradaResolucaoAcoes['composicao'] | undefined,
  apoio: Apoio,
  conhecidas: ContagemGravavel[],
): ResolucaoAcoes | null {
  const doEmissor = conhecidas.filter((c) => c.cnpj === d.cnpj);
  const ehDfp = (c: ContagemGravavel) => !c.fonte.startsWith('itr');
  const entrada: EntradaResolucaoAcoes = {
    ano: Number(d.dtRefer.slice(0, 4)),
    lucroAtribuivel: f.lucroAtribuivel,
    lucroTotal: f.lucroLiquido,
    lpaOn: f.lpaOn,
    lpaPn: f.lpaPn,
    pl: f.plControladora ?? f.pl,
    composicao: composicao ?? null,
    freAcoes: null,
    eventos: apoio.eventos.get(d.cnpj) ?? [],
    documento: doc,
  };
  if (doc === 'dfp') {
    const fre = apoio.fre?.get(f.anoFiscal)?.get(d.cnpj)?.acoes ?? null;
    const vizinhos = doEmissor
      .filter((c) => ehDfp(c) && c.status !== 'nao_verificavel' && c.total !== null)
      .map((c) => ({ ano: Number(c.data.slice(0, 4)), acoes: c.total as number }));
    return resolverAcoesExercicio({ ...entrada, freAcoes: fre, vizinhos }, ctx.params);
  }
  if (!composicao) return null;
  const dfpAnterior = doEmissor
    .filter((c) => ehDfp(c) && c.data < d.dtRefer)
    .sort((a, b) => b.data.localeCompare(a.data))[0];
  if (dfpAnterior) {
    const ref =
      dfpAnterior.total !== null &&
      dfpAnterior.total > 0 &&
      dfpAnterior.status !== 'nao_verificavel'
        ? { data: dfpAnterior.data, acoes: dfpAnterior.total, dataDoc: d.dtRefer }
        : undefined;
    return contagemComEscalaFixa(
      entrada,
      dfpAnterior.flags.includes('escala_x1000'),
      ctx.params,
      ref,
    );
  }
  return resolverAcoesExercicio(entrada, ctx.params);
}

function linhaFundamentos(
  f: FundamentosExtraidos,
  m: {
    cnpj: string;
    docTipo: 'DFP' | 'ITR';
    doc: DocIndice;
    url: string;
    escala: string;
    lpaOn: number | null;
    lpaPn: number | null;
    lpaEscalaCorrigida: boolean;
    fetchedAt: Date;
  },
): Prisma.AssetFundamentalsPeriodCreateManyInput {
  return {
    emissorId: m.cnpj,
    source: 'CVM',
    docTipo: m.docTipo,
    docId: m.doc.idDoc,
    sourceUrl: m.url,
    tipoPeriodo: f.tipoPeriodo,
    escopo: f.escopo,
    padraoContabil: f.padraoContabil,
    dtIni: deData(f.dtIni),
    dtFim: deData(f.dtFim),
    anoFiscal: f.anoFiscal,
    trimestreFiscal: f.trimestreFiscal,
    versao: m.doc.versao,
    dtEntrega: deData(m.doc.dtReceb),
    dtEntregaOriginal: deData(m.doc.dtEntregaOriginal),
    moeda: 'BRL',
    escalaOriginal: m.escala,
    receita: dec2(f.receita),
    lucroBruto: dec2(f.lucroBruto),
    ebit: dec2(f.ebit),
    depreciacaoAmortizacao: dec2(f.depreciacaoAmortizacao),
    lucroLiquido: dec2(f.lucroLiquido),
    lucroAtribuivel: dec2(f.lucroAtribuivel),
    codContaLucro: f.codContaLucro,
    ativoTotal: dec2(f.ativoTotal),
    ativoCirculante: dec2(f.ativoCirculante),
    passivoCirculante: dec2(f.passivoCirculante),
    caixa: dec2(f.caixa),
    aplicacoesFinanceiras: dec2(f.aplicacoesFinanceiras),
    dividaBrutaCp: dec2(f.dividaBrutaCp),
    dividaBrutaLp: dec2(f.dividaBrutaLp),
    pl: dec2(f.pl),
    plControladora: dec2(f.plControladora),
    fco: dec2(f.fco),
    fci: dec2(f.fci),
    fcf: dec2(f.fcf),
    capex: dec2(f.capex),
    dividendosJcpPagos: dec2(f.dividendosJcpPagos),
    dmplDeclarado: dec2(f.dmplDeclarado),
    lpaOn: m.lpaOn,
    lpaPn: m.lpaPn,
    lpaEscalaCorrigida: m.lpaEscalaCorrigida,
    naoSeAplica: f.naoSeAplica,
    flags: f.flags,
    fetchedAt: m.fetchedAt,
  };
}

// ---------------------------------------------------------------- TTM

/** Maior versão por (dtFim, tipoPeriodo) de um emissor/escopo. */
function vigentes(linhas: LinhaFundamentosDb[]): LinhaFundamentosDb[] {
  const m = new Map<string, LinhaFundamentosDb>();
  for (const l of linhas) {
    const k = `${paraData(l.dtFim)}|${l.tipoPeriodo}`;
    const a = m.get(k);
    if (!a || l.versao > a.versao) m.set(k, l);
  }
  return [...m.values()];
}

/** Linhas TTM (uma por emissor e escopo) na data do documento mais recente (FY ou YTD). */
export function montarLinhasTtm(
  periodos: LinhaFundamentosDb[],
  mesFim: Map<string, number | null>,
  ctx: Pick<JobContexto, 'params'>,
  fetchedAt: Date,
): Prisma.AssetFundamentalsPeriodCreateManyInput[] {
  const grupos = new Map<string, LinhaFundamentosDb[]>();
  for (const l of periodos) {
    if (l.tipoPeriodo === 'TTM') continue;
    const k = `${l.emissorId}|${l.escopo}`;
    grupos.set(k, [...(grupos.get(k) ?? []), l]);
  }
  const out: Prisma.AssetFundamentalsPeriodCreateManyInput[] = [];
  for (const linhas of grupos.values()) {
    const vs = vigentes(linhas);
    const bases = vs
      .filter((l) => l.tipoPeriodo === 'FY' || l.tipoPeriodo === 'YTD')
      .sort((a, b) => paraData(b.dtFim).localeCompare(paraData(a.dtFim)));
    const base = bases[0];
    if (!base) continue;
    const doMesFim =
      base.tipoPeriodo === 'FY'
        ? base.dtFim.getUTCMonth() + 1
        : (mesFim.get(base.emissorId) ?? inferirMesFim(vs));
    const periodosFluxo: PeriodoFluxo[] = vs
      .filter((l) => l.tipoPeriodo !== 'TTM')
      .map((l) => ({
        tipoPeriodo: l.tipoPeriodo as PeriodoFluxo['tipoPeriodo'],
        dtFim: paraData(l.dtFim),
        valores: Object.fromEntries(CAMPOS_FLUXO.map((c) => [c, paraNumero(l[c])])),
      }));
    const r = calcularTtmPeriodo(
      periodosFluxo,
      { tipoPeriodo: base.tipoPeriodo as 'FY' | 'YTD', dtFim: paraData(base.dtFim) },
      doMesFim,
      ctx.params,
    );
    const dtFim = paraData(base.dtFim);
    // período com escala declarada ambígua na janela do TTM ⇒ o TTM herda a flag (Índice incompleto)
    const limiteEscala = fimDoMesAnterior(dtFim, 15);
    const escalaAmbigua = vs.some(
      (l) => paraData(l.dtFim) > limiteEscala && l.flags.includes('escala_ambigua'),
    );
    const {
      id: _id,
      fetchedAt: _f,
      tipoPeriodo: _t,
      dtIni: _i,
      flags: _fl,
      lpaOn: _lo,
      lpaPn: _lp,
      dmplDeclarado: _dm,
      sourceConcept: _sc,
      ...resto
    } = base;
    out.push({
      ...resto,
      sourceConcept: undefined,
      tipoPeriodo: 'TTM',
      dtIni: deData(proximoDia(fimDoMesAnterior(dtFim, 12))),
      ...Object.fromEntries(CAMPOS_FLUXO.map((c) => [c, dec2(r.valores[c])])),
      lpaOn: null,
      lpaPn: null,
      lpaEscalaCorrigida: false,
      dmplDeclarado: null,
      codContaLucro: base.codContaLucro,
      flags: escalaAmbigua ? [...r.flags, 'escala_ambigua'].sort() : r.flags,
      fetchedAt,
    } as Prisma.AssetFundamentalsPeriodCreateManyInput);
  }
  return out;
}

function inferirMesFim(linhas: LinhaFundamentosDb[]): number {
  const fy = linhas.find((l) => l.tipoPeriodo === 'FY');
  return fy ? fy.dtFim.getUTCMonth() + 1 : 12;
}

/** Emissores por consulta no recálculo do TTM (memória: ~2,5 mil linhas com Decimal por vez). */
const TTM_EMISSORES_POR_LOTE = 50;

async function atualizarTtm(
  ctx: JobContexto,
  cnpjs: string[],
  ano: number,
  apoio: Apoio,
): Promise<{ gravadas: number; interrompido: boolean }> {
  let gravadas = 0;
  for (let i = 0; i < cnpjs.length; i += TTM_EMISSORES_POR_LOTE) {
    if (ctx.estourouPrazo()) return { gravadas, interrompido: true };
    const lote = cnpjs.slice(i, i + TTM_EMISSORES_POR_LOTE);
    const periodos = await periodosDosEmissores(ctx.prisma, lote, `${ano - 2}-01-01`);
    const linhas = montarLinhasTtm(periodos, apoio.mesFim, ctx, new Date());
    const r = await gravarTtm(ctx.prisma, ctx, linhas, periodos);
    gravadas += r.gravadas;
    ctx.contar('linhasGravadas', r.gravadas);
    // alerta só o que mudou neste run (a linha TTM inalterada não realerta todo dia)
    for (const l of r.escritas) {
      if ((l.flags as string[]).includes('reapresentacao')) {
        ctx.alertar({
          codigo: 'reapresentacao',
          nivel: 'aviso',
          mensagem: `${l.emissorId} ${paraData(l.dtFim as Date)} ${l.escopo}: TTM por YTD e Σ4 trimestres divergem > ${ctx.params.sanidade.acoes.ttmDivergenciaMaxPct}%`,
          ref: l.emissorId,
        });
      }
    }
    if (r.interrompido) return { gravadas, interrompido: true };
  }
  return { gravadas, interrompido: false };
}

// ---------------------------------------------------------------- FRE (só backfill)

/**
 * FRE 3.1 item f dos exercícios pedidos (FRE entregue no ano seguinte ao exercício; a seção existe
 * até o FRE de 2022). Só o backfill chama: o cron não lê FRE. Não registra AnaliseFonteArquivo.
 */
export async function carregarFreAcoes(
  ctx: JobContexto,
  anosFiscais: number[],
  opts: Pick<OpcoesCvmCias, 'cacheDir' | 'baixar'>,
  cnpjs?: Set<string>,
): Promise<Map<number, Map<string, AcoesFre>>> {
  const out = new Map<number, Map<string, AcoesFre>>();
  for (const fy of anosFiscais) {
    const anoFre = fy + 1;
    if (anoFre > ULTIMO_ANO_FRE_ITEM_F) continue;
    const url = urlArquivoCvm('fre', anoFre);
    const arq = await obterArquivo(ctx, url, nomeArquivoCvm('fre', anoFre), {
      ...opts,
      doc: 'dfp',
      reprocessar: true,
    });
    if (arq.status === 'inalterado') continue;
    try {
      const entradas = await listarEntradasZip(arq.caminho);
      const m = await lerFreAcoes(arq.caminho, entradas, anoFre, { cnpjs });
      ctx.contar('linhasLidas', m.size);
      out.set(fy, m);
    } finally {
      await arq.descartar();
    }
  }
  return out;
}
