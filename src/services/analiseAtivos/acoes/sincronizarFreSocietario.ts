/**
 * Job 'cvm-fre-societario' (A6, item 6; fatia D): posição acionária, distribuição do capital e
 * direitos por espécie do Formulário de Referência (CVM dados abertos), gravados em
 * cia_fre_posicao_acionaria, cia_fre_societario e cia_fre_direito_acao.
 *
 *  - Download condicional (AnaliseFonteArquivo: ETag/Last-Modified/sha256) só de dados.cvm.gov.br
 *    (rad.cvm.gov.br fica FORA da allowlist; o LINK_DOC é guardado como texto, nunca baixado):
 *    fre_cia_aberta_{ano−1, ano}.zip e o do 2022 (ANO_FRE_DIREITOS), que, sem mudança na CVM, sai
 *    'inalterado' sem reler — na prática é lido uma vez.
 *  - Streaming (parserFreSocietario), só emissores do universo (CNPJs com ticker vigente em
 *    cvm_company_tickers); gravação em transação por cnpj+anoFre (repositorio/societario).
 *  - Só acionistas DIRETOS + sintéticas IDS_ACIONISTA_SINTETICO; NUNCA grava CPF/CNPJ do acionista;
 *    classePn vazio = ''.
 *  - 404 do zip do ano corrente = 'nao_publicado' (alerta aviso; a CVM só cria o arquivo do ano no 1º
 *    documento). Prazo estourado ⇒ para entre companhias, não marca o arquivo e devolve parcial.
 *  - Universo filtrado (opts.cnpjs, conferência no dev) não registra AnaliseFonteArquivo: um run
 *    parcial nunca marca o arquivo como processado para o universo inteiro.
 *
 * Cron proposto: JOBS_COMPLEMENTOS['cvm-fre-societario'] (domingo 06:10 UTC, myfinance-job.sh, meta
 * < 120 MB; os detalhes trazem rssPicoMb). O job NÃO depende de ANALISE_ATIVOS_SOCIETARIO_HABILITADO.
 */
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { copyFile, mkdir, stat } from 'fs/promises';
import path from 'path';
import type { OpcoesExecucaoJob } from '@/services/analiseAtivos/jobs/catalogoJobs';
import type { JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';
import { baixarParaArquivo } from '@/services/analiseAtivos/fontes/download';
import { ErroFonte, ErroLayoutFonte } from '@/services/analiseAtivos/fontes/erros';
import {
  alertaAnoNaoPublicado,
  ehAnoNaoPublicado,
} from '@/services/analiseAtivos/fontes/anoNaoPublicado';
import { listarEntradasZip, type EntradaZip } from '@/services/analiseAtivos/fontes/zipStream';
import {
  condicionalDownload,
  marcarProcessado,
  obterFonteArquivo,
  registrarDownload,
} from '@/services/analiseAtivos/repositorio/fontesArquivo';
import { listarTickersAcoes } from '@/services/analiseAtivos/repositorio/universo';
import { gravarDireitos, gravarSocietario } from '@/services/analiseAtivos/repositorio/societario';
import {
  MAX_BYTES_ZIP_FRE,
  TIMEOUT_DOWNLOAD_FRE_MS,
  entradaFre,
  janelaFre,
  nomeArquivoFre,
  urlArquivoFre,
  type EntradaFre,
} from '@/services/analiseAtivos/acoes/freArquivos';
import {
  documentoDaVersao,
  lerDireitoAcao,
  lerDistribuicaoCapital,
  lerIndiceFre,
  lerPosicaoAcionaria,
  linhasEntradaFre,
  type DocumentoFre,
} from '@/services/analiseAtivos/acoes/parserFreSocietario';

const JOB = 'cvm-fre-societario';

export interface OpcoesFreSocietario {
  /** padrão: janelaFre(ctx.hoje) */
  anosSocietario?: number[];
  /** padrão: ANO_FRE_DIREITOS; null = não lê os direitos */
  anoDireitos?: number | null;
  /** conferência no dev: só estes CNPJs (14 dígitos); não registra AnaliseFonteArquivo */
  cnpjs?: string[];
  /** usa (e guarda) os zips desta pasta em vez do download condicional */
  cacheDir?: string;
  /** ignora o condicional (relê arquivo inalterado) */
  reprocessar?: boolean;
  /** injeção para testes */
  baixar?: typeof baixarParaArquivo;
}

export type StatusArquivoFre = 'inalterado' | 'processado' | 'parcial' | 'nao_publicado';

export interface DetalheArquivoFre {
  url: string;
  ano: number;
  parte: 'societario' | 'direitos';
  status: StatusArquivoFre;
  bytes?: number;
  cias?: number;
  acionistasDiretos?: number;
  linhasIndiretasDescartadas?: number;
  direitos?: number;
}

interface Arquivo {
  caminho: string;
  bytes: number;
  etag: string | null;
  lastModified: string | null;
  sha256: string | null;
  descartar(): Promise<void>;
}

const rssMb = () => Math.round(process.memoryUsage().rss / 1e6);

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

/** Zip do ano (cache local ou download condicional); 'inalterado' quando nada mudou. */
async function obterZip(
  ctx: JobContexto,
  ano: number,
  opts: OpcoesFreSocietario,
  registrar: boolean,
): Promise<Arquivo | 'inalterado' | 'nao_publicado'> {
  const url = urlArquivoFre(ano);
  const baixar = opts.baixar ?? baixarParaArquivo;
  const fonte = registrar ? await obterFonteArquivo(ctx.prisma, url) : null;
  try {
    if (opts.cacheDir) {
      const local = path.join(opts.cacheDir, nomeArquivoFre(ano));
      if (!(await existe(local))) {
        const r = await baixar(url, {
          maxBytes: MAX_BYTES_ZIP_FRE,
          timeoutMs: TIMEOUT_DOWNLOAD_FRE_MS,
        });
        if (!r.caminho) throw new ErroFonte('http_erro', `download sem arquivo: ${url}`);
        await mkdir(opts.cacheDir, { recursive: true });
        await copyFile(r.caminho, local);
        await r.descartar();
      }
      const sha256 = await sha256Arquivo(local);
      if (!opts.reprocessar && fonte?.processadoEm && fonte.sha256 === sha256) return 'inalterado';
      return {
        caminho: local,
        bytes: (await stat(local)).size,
        etag: null,
        lastModified: null,
        sha256,
        descartar: async () => {},
      };
    }
    const r = await baixar(url, {
      maxBytes: MAX_BYTES_ZIP_FRE,
      timeoutMs: TIMEOUT_DOWNLOAD_FRE_MS,
      condicional: opts.reprocessar ? undefined : condicionalDownload(fonte),
    });
    if (r.status === 'nao_modificado' || !r.caminho) return 'inalterado';
    return { ...r, caminho: r.caminho };
  } catch (e: unknown) {
    if (!ehAnoNaoPublicado(e, ano, ctx.hoje)) throw e;
    ctx.alertar(alertaAnoNaoPublicado(url, ano));
    return 'nao_publicado';
  }
}

function exigirEntrada(caminho: string, entradas: EntradaZip[], parte: EntradaFre, ano: number) {
  const e = linhasEntradaFre(caminho, entradas, parte, ano);
  if (!e) throw new ErroLayoutFonte(nomeArquivoFre(ano), [entradaFre(parte, ano)]);
  return e;
}

async function processarSocietario(
  ctx: JobContexto,
  ano: number,
  arq: Arquivo,
  cnpjs: Set<string>,
  detalhe: DetalheArquivoFre,
): Promise<boolean> {
  const entradas = await listarEntradasZip(arq.caminho);
  const idx = exigirEntrada(arq.caminho, entradas, 'indice', ano);
  const indice = await lerIndiceFre(idx.linhas, idx.nome, { cnpjs });
  const pos = exigirEntrada(arq.caminho, entradas, 'posicao_acionaria', ano);
  const posicoes = await lerPosicaoAcionaria(pos.linhas, pos.nome, { cnpjs });
  const dist = exigirEntrada(arq.caminho, entradas, 'distribuicao_capital', ano);
  const distribuicoes = await lerDistribuicaoCapital(dist.linhas, dist.nome, { cnpjs });

  const cias = [...new Set([...posicoes.keys(), ...distribuicoes.keys()])].sort();
  detalhe.cias = cias.length;
  detalhe.acionistasDiretos = 0;
  detalhe.linhasIndiretasDescartadas = 0;
  for (const cnpj of cias) {
    if (ctx.estourouPrazo()) return false;
    const p = posicoes.get(cnpj) ?? null;
    const d = distribuicoes.get(cnpj) ?? null;
    const versao = Math.max(p?.versao ?? 0, d?.versao ?? 0);
    const documento: DocumentoFre | null = documentoDaVersao(indice.get(cnpj), versao);
    ctx.contar('linhasLidas', (p?.acionistas.length ?? 0) + (d ? 1 : 0));
    detalhe.acionistasDiretos += p?.acionistas.length ?? 0;
    detalhe.linhasIndiretasDescartadas += p?.indiretas ?? 0;
    if (!ctx.aplicar) continue;
    const n = await gravarSocietario(ctx.prisma, {
      cnpj,
      anoFre: ano,
      versao,
      documento,
      // posição de versão mais velha que a distribuição: não mistura documentos
      distribuicao: d && d.versao === versao ? d : null,
      acionistas: p && p.versao === versao ? p.acionistas : p ? null : [],
      dataReferenciaPosicao: p?.dataReferencia ?? null,
    });
    ctx.contar('linhasGravadas', n);
  }
  return true;
}

async function processarDireitos(
  ctx: JobContexto,
  ano: number,
  arq: Arquivo,
  cnpjs: Set<string>,
  detalhe: DetalheArquivoFre,
): Promise<boolean> {
  const entradas = await listarEntradasZip(arq.caminho);
  const dir = exigirEntrada(arq.caminho, entradas, 'direito_acao', ano);
  const direitos = await lerDireitoAcao(dir.linhas, dir.nome, { cnpjs });
  detalhe.cias = direitos.size;
  detalhe.direitos = 0;
  for (const [cnpj, d] of [...direitos.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (ctx.estourouPrazo()) return false;
    ctx.contar('linhasLidas', d.direitos.length);
    detalhe.direitos += d.direitos.length;
    if (!ctx.aplicar) continue;
    ctx.contar('linhasGravadas', await gravarDireitos(ctx.prisma, cnpj, ano, d.direitos));
  }
  return true;
}

export async function executarFreSocietario(
  ctx: JobContexto,
  opts: OpcoesFreSocietario = {},
): Promise<ResultadoJob> {
  const janela = janelaFre(ctx.hoje);
  const anosSocietario = opts.anosSocietario ?? janela.societario;
  const anoDireitos = opts.anoDireitos === undefined ? janela.direitos : opts.anoDireitos;
  const filtrado = opts.cnpjs !== undefined;
  const cnpjs = new Set(
    filtrado ? opts.cnpjs : (await listarTickersAcoes(ctx.prisma)).map((t) => t.cnpj),
  );
  const arquivos: DetalheArquivoFre[] = [];
  let rssPicoMb = rssMb();
  if (cnpjs.size === 0) {
    ctx.alertar({
      codigo: 'universo_vazio',
      nivel: 'erro',
      mensagem: 'Nenhum ticker vigente em cvm_company_tickers: rode cvm-cias?doc=fca antes',
    });
    return { detalhes: { universo: 0, arquivos, rssPicoMb } };
  }
  const registrar = !filtrado;
  const tarefas: { ano: number; parte: 'societario' | 'direitos' }[] = [
    ...anosSocietario.map((ano) => ({ ano, parte: 'societario' as const })),
    ...(anoDireitos === null ? [] : [{ ano: anoDireitos, parte: 'direitos' as const }]),
  ];
  let parcial = false;
  for (const t of tarefas) {
    const url = urlArquivoFre(t.ano);
    const arq = await obterZip(ctx, t.ano, opts, registrar);
    if (arq === 'inalterado' || arq === 'nao_publicado') {
      arquivos.push({ url, ano: t.ano, parte: t.parte, status: arq });
      continue;
    }
    const detalhe: DetalheArquivoFre = {
      url,
      ano: t.ano,
      parte: t.parte,
      status: 'processado',
      bytes: arq.bytes,
    };
    arquivos.push(detalhe);
    try {
      if (registrar && ctx.aplicar) await registrarDownload(ctx.prisma, url, arq);
      const completo =
        t.parte === 'societario'
          ? await processarSocietario(ctx, t.ano, arq, cnpjs, detalhe)
          : await processarDireitos(ctx, t.ano, arq, cnpjs, detalhe);
      rssPicoMb = Math.max(rssPicoMb, rssMb());
      if (!completo) {
        detalhe.status = 'parcial';
        parcial = true;
        break;
      }
      if (registrar && ctx.aplicar) await marcarProcessado(ctx.prisma, url, JOB);
    } finally {
      await arq.descartar();
    }
  }
  return {
    parcial,
    detalhes: { universo: cnpjs.size, filtrado, arquivos, rssPicoMb },
  };
}

/** Entrada do catálogo (cron/rodar-job): janela padrão e o universo inteiro. */
export async function sincronizarFreSocietario(
  ctx: JobContexto,
  _opcoes?: OpcoesExecucaoJob,
): Promise<ResultadoJob> {
  return executarFreSocietario(ctx);
}
