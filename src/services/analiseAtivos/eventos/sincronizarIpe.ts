/**
 * Job cvm-ipe (diário 09:25 UTC) e backfill-ipe: assembleias do IPE + datas de resultado.
 *
 * 1. Para cada ano pedido (cron: só o corrente), baixa ipe_cia_aberta_AAAA.zip (condicional por
 *    ETag/sha256 — arquivo inalterado é pulado) ou usa o zip do --cache-dir; lê o CSV em streaming
 *    filtrando cedo as linhas de Assembleia; consolida 1 evento por (cnpj, subtipo, data) e grava só
 *    os emissores do universo (CvmCompanyTicker vigente, fatia A).
 * 2. A partir das entregas de DFP/ITR (repositorio.acoes.entregasDocumentos), grava 'resultado' na
 *    data real e 'resultado_estimado' para os próximos documentos esperados (mesma entrega do ano
 *    anterior + 1 ano, no próximo pregão); o estimado ganha substituidoEm quando o real chega.
 *
 * Universo vazio (fatia A ainda não rodou) ⇒ alerta e o arquivo NÃO é marcado processado (o próximo
 * run lê de novo em vez de pular por ETag).
 */
import { stat } from 'fs/promises';
import path from 'path';
import type { PrismaClient } from '@prisma/client';
import { lerCsv } from '@/services/analiseAtivos/fontes/csvStream';
import { baixarParaArquivo } from '@/services/analiseAtivos/fontes/download';
import { ErroFonte } from '@/services/analiseAtivos/fontes/erros';
import { linhasDaEntrada, listarEntradasZip } from '@/services/analiseAtivos/fontes/zipStream';
import {
  gravarAssembleias,
  gravarResultados,
  type ContagemGravacao,
  type EventoDesejado,
} from '@/services/analiseAtivos/eventos/gravarEventos';
import {
  MAX_BYTES_ZIP_CVM,
  TIMEOUT_MS_BACKFILL,
  TIMEOUT_MS_CRON,
  especCsvIpe,
  nomeArquivoIpe,
  nomeEntradaIpe,
  urlIpe,
} from '@/services/analiseAtivos/eventos/ipeArquivos';
import {
  chaveAssembleia,
  classificarLinhaIpe,
  consolidarAssembleias,
  type EventoIpe,
} from '@/services/analiseAtivos/regras/eventos/ipe';
import {
  estimarDataResultado,
  periodoRef,
  proximoPeriodoEsperado,
  subtipoResultado,
  trimestreDaEntrega,
} from '@/services/analiseAtivos/regras/eventos/estimativaResultado';
import { entregasDocumentos } from '@/services/analiseAtivos/repositorio/acoes';
import {
  condicionalDownload,
  marcarProcessado,
  obterFonteArquivo,
  registrarDownload,
} from '@/services/analiseAtivos/repositorio/fontesArquivo';
import { listarTickersAcoes } from '@/services/analiseAtivos/repositorio/universo';
import type { EntregaDocumento, JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';

export interface OpcoesSincronizarIpe {
  /** padrão: [ano corrente] */
  anos?: number[];
  /** diretório com ipe_cia_aberta_AAAA.zip já baixados (dev/backfill); ausente ⇒ baixa */
  cacheDir?: string;
  /** ignora ETag/sha256 e reprocessa */
  forcar?: boolean;
  timeoutMs?: number;
  /** padrão true; false = só assembleias */
  resultados?: boolean;
  /** injeção para testes */
  agora?: Date;
}

interface ArquivoLocal {
  caminho: string;
  origem: 'cache' | 'download';
  bytes: number;
  meta: { etag: string | null; lastModified: string | null; sha256: string | null } | null;
  descartar(): Promise<void>;
}

const semDescarte = async () => {};

async function obterArquivo(
  ctx: JobContexto,
  ano: number,
  opts: OpcoesSincronizarIpe,
): Promise<ArquivoLocal | { naoModificado: true }> {
  if (opts.cacheDir) {
    const caminho = path.join(opts.cacheDir, nomeArquivoIpe(ano));
    try {
      const s = await stat(caminho);
      return { caminho, origem: 'cache', bytes: s.size, meta: null, descartar: semDescarte };
    } catch {
      // sem cache para o ano: baixa
    }
  }
  const url = urlIpe(ano);
  const anterior = await obterFonteArquivo(ctx.prisma, url);
  const r = await baixarParaArquivo(url, {
    maxBytes: MAX_BYTES_ZIP_CVM,
    timeoutMs: opts.timeoutMs ?? (ctx.origem === 'script' ? TIMEOUT_MS_BACKFILL : TIMEOUT_MS_CRON),
    condicional: opts.forcar ? undefined : condicionalDownload(anterior),
  });
  if (r.status === 'nao_modificado' || !r.caminho) return { naoModificado: true };
  return {
    caminho: r.caminho,
    origem: 'download',
    bytes: r.bytes,
    meta: { etag: r.etag, lastModified: r.lastModified, sha256: r.sha256 },
    descartar: r.descartar,
  };
}

export interface LeituraIpe {
  eventos: EventoIpe[];
  protocolos: Set<string>;
  linhasAssembleia: number;
  ignoradas: number;
  rejeitadas: Record<string, number>;
}

/** Lê o CSV do zip em streaming e devolve as assembleias consolidadas (todos os emissores). */
export async function lerAssembleiasDoZip(caminho: string, ano: number): Promise<LeituraIpe> {
  const entradas = await listarEntradasZip(caminho);
  const nome = nomeEntradaIpe(ano);
  const entrada =
    entradas.find((e) => e.nome === nome) ?? (entradas.length === 1 ? entradas[0] : null);
  if (!entrada) {
    throw new ErroFonte(
      'zip_invalido',
      `${nome} não encontrado no zip (${entradas.map((e) => e.nome)})`,
    );
  }
  const brutos: EventoIpe[] = [];
  const protocolos = new Set<string>();
  const rejeitadas: Record<string, number> = {};
  let linhasAssembleia = 0;
  let ignoradas = 0;
  for await (const l of lerCsv(linhasDaEntrada(caminho, entrada), especCsvIpe(ano))) {
    linhasAssembleia++;
    const c = classificarLinhaIpe(l);
    if (c.tipo === 'evento') {
      brutos.push(c.evento);
      protocolos.add(c.evento.protocolo);
    } else if (c.tipo === 'ignorada') {
      ignoradas++;
    } else {
      rejeitadas[c.motivo] = (rejeitadas[c.motivo] ?? 0) + 1;
    }
  }
  return {
    eventos: consolidarAssembleias(brutos),
    protocolos,
    linhasAssembleia,
    ignoradas,
    rejeitadas,
  };
}

export function assembleiaParaDesejado(e: EventoIpe): EventoDesejado {
  return {
    cnpj: e.cnpj,
    tipo: 'assembleia',
    subtipo: e.subtipo,
    periodoRef: null,
    chave: chaveAssembleia(e),
    data: e.data,
    estimado: false,
    assunto: e.assunto,
    sourceUrl: e.linkDownload,
    sourceDocId: e.protocolo,
    versao: e.versao,
  };
}

/** Eventos de resultado (reais + estimados) a partir das entregas de DFP/ITR do universo. */
export function planejarResultados(
  entregas: EntregaDocumento[],
  cnpjs: string[],
  hoje: string,
): { reais: EventoDesejado[]; estimados: EventoDesejado[]; emissoresComEstimativa: number } {
  const reais: EventoDesejado[] = [];
  const estimados: EventoDesejado[] = [];
  const porCnpj = new Map<string, EntregaDocumento[]>();
  for (const e of entregas) {
    const lista = porCnpj.get(e.cnpj);
    if (lista) lista.push(e);
    else porCnpj.set(e.cnpj, [e]);
  }
  let emissoresComEstimativa = 0;
  for (const cnpj of cnpjs) {
    const doEmissor = porCnpj.get(cnpj) ?? [];
    for (const e of doEmissor) {
      const t = trimestreDaEntrega(e);
      if (e.docTipo === 'ITR' && (t === null || t > 3)) continue;
      const alvo = { docTipo: e.docTipo, anoFiscal: e.anoFiscal, trimestreFiscal: t };
      const ref = periodoRef(alvo);
      reais.push({
        cnpj,
        tipo: 'resultado',
        subtipo: subtipoResultado(alvo),
        periodoRef: ref,
        chave: ref,
        data: e.dtEntregaOriginal,
        estimado: false,
        assunto: null,
        sourceUrl: null,
        sourceDocId: null,
        versao: null,
      });
    }
    let algum = false;
    for (const alvo of proximoPeriodoEsperado(doEmissor, cnpj, hoje)) {
      const est = estimarDataResultado(doEmissor, { cnpj, ...alvo }, hoje);
      if (!est) continue;
      algum = true;
      const ref = periodoRef(alvo);
      estimados.push({
        cnpj,
        tipo: 'resultado_estimado',
        subtipo: subtipoResultado(alvo),
        periodoRef: ref,
        chave: ref,
        data: est.data,
        estimado: true,
        assunto: `base: ${est.base}`,
        sourceUrl: null,
        sourceDocId: null,
        versao: null,
      });
    }
    if (algum) emissoresComEstimativa++;
  }
  return { reais, estimados, emissoresComEstimativa };
}

function somar(a: ContagemGravacao | null, b: ContagemGravacao): ContagemGravacao {
  if (!a) return { ...b };
  return {
    criados: a.criados + b.criados,
    atualizados: a.atualizados + b.atualizados,
    removidos: a.removidos + b.removidos,
    substituidos: a.substituidos + b.substituidos,
    inalterados: a.inalterados + b.inalterados,
  };
}

function subtrairAnos(data: string, anos: number): string {
  return `${Number(data.slice(0, 4)) - anos}${data.slice(4)}`;
}

async function cnpjsDoUniverso(prisma: PrismaClient): Promise<string[]> {
  const tickers = await listarTickersAcoes(prisma);
  return [...new Set(tickers.map((t) => t.cnpj))].sort();
}

export async function sincronizarIpe(
  ctx: JobContexto,
  opts: OpcoesSincronizarIpe = {},
): Promise<ResultadoJob> {
  const agora = opts.agora ?? new Date();
  const hoje = agora.toISOString().slice(0, 10);
  const anos = opts.anos ?? [Number(hoje.slice(0, 4))];
  const cnpjs = await cnpjsDoUniverso(ctx.prisma);
  const universo = new Set(cnpjs);
  if (cnpjs.length === 0) {
    ctx.alertar({
      codigo: 'universo_vazio',
      nivel: 'aviso',
      mensagem: 'CvmCompanyTicker vazio (fatia A ainda não rodou): nenhum evento gravado',
    });
  }

  const arquivos: Array<Record<string, unknown>> = [];
  let assembleias: ContagemGravacao | null = null;
  let parcial = false;

  for (const ano of anos) {
    if (ctx.estourouPrazo()) {
      parcial = true;
      break;
    }
    const url = urlIpe(ano);
    const inicio = Date.now();
    const arq = await obterArquivo(ctx, ano, opts);
    if ('naoModificado' in arq) {
      arquivos.push({ ano, url, status: 'nao_modificado' });
      continue;
    }
    try {
      if (arq.meta && ctx.aplicar)
        await registrarDownload(ctx.prisma, url, { ...arq.meta, bytes: arq.bytes });
      const leitura = await lerAssembleiasDoZip(arq.caminho, ano);
      const rejeitadas = Object.values(leitura.rejeitadas).reduce((s, n) => s + n, 0);
      ctx.contar('linhasLidas', leitura.linhasAssembleia);
      ctx.contar('rejeitadas', rejeitadas);
      const doUniverso = leitura.eventos.filter((e) => universo.has(e.cnpj));
      const g = await gravarAssembleias(ctx.prisma, {
        desejados: doUniverso.map(assembleiaParaDesejado),
        cnpjsUniverso: cnpjs,
        protocolosDoArquivo: leitura.protocolos,
        agora,
        aplicar: ctx.aplicar,
      });
      if (ctx.aplicar) ctx.contar('linhasGravadas', g.criados + g.atualizados + g.removidos);
      assembleias = somar(assembleias, g);
      if (arq.meta && ctx.aplicar && cnpjs.length > 0) {
        await marcarProcessado(ctx.prisma, url, 'cvm-ipe');
      }
      arquivos.push({
        ano,
        url,
        origem: arq.origem,
        bytes: arq.bytes,
        ms: Date.now() - inicio,
        linhasAssembleia: leitura.linhasAssembleia,
        ignoradas: leitura.ignoradas,
        rejeitadas: leitura.rejeitadas,
        protocolos: leitura.protocolos.size,
        assembleiasNoArquivo: leitura.eventos.length,
        emissoresNoArquivo: new Set(leitura.eventos.map((e) => e.cnpj)).size,
        assembleiasUniverso: doUniverso.length,
        emissoresUniverso: new Set(doUniverso.map((e) => e.cnpj)).size,
        gravacao: g,
      });
    } finally {
      await arq.descartar();
    }
  }

  let resultados: (ContagemGravacao & { emissoresComEstimativa: number; entregas: number }) | null =
    null;
  if (opts.resultados !== false && cnpjs.length > 0 && !ctx.estourouPrazo()) {
    const entregas = await entregasDocumentos(ctx.prisma, {
      desde: subtrairAnos(hoje, 2),
      cnpjs,
    });
    const plano = planejarResultados(entregas, cnpjs, hoje);
    const g = await gravarResultados(ctx.prisma, {
      reais: plano.reais,
      estimados: plano.estimados,
      cnpjsUniverso: cnpjs,
      agora,
      aplicar: ctx.aplicar,
    });
    if (ctx.aplicar) ctx.contar('linhasGravadas', g.criados + g.atualizados + g.substituidos);
    resultados = {
      ...g,
      emissoresComEstimativa: plano.emissoresComEstimativa,
      entregas: entregas.length,
    };
    if (entregas.length === 0) {
      ctx.alertar({
        codigo: 'sem_entregas',
        nivel: 'aviso',
        mensagem: 'nenhuma entrega de DFP/ITR no banco (fatia A): sem datas de resultado',
      });
    }
  } else if (opts.resultados !== false && cnpjs.length > 0) {
    parcial = true;
  }

  return {
    parcial,
    detalhes: {
      aplicar: ctx.aplicar,
      emissoresUniverso: cnpjs.length,
      arquivos,
      assembleias,
      resultados,
    },
  };
}
