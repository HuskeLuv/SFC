/**
 * Arquivos de FII da CVM (Informe Mensal e Trimestral, zips anuais de 1–3 MB) e obtenção com
 * condicional (ETag/Last-Modified/sha256 via AnaliseFonteArquivo) ou de um cache local (scripts de
 * backfill com --cache-dir). Nunca carrega o zip em memória: devolve o caminho em disco para o
 * leitor em streaming.
 */
import { existsSync, statSync } from 'fs';
import path from 'path';
import type { PrismaClient } from '@prisma/client';
import { baixarParaArquivo } from '@/services/analiseAtivos/fontes/download';
import { ErroLayoutFonte } from '@/services/analiseAtivos/fontes/erros';
import { listarEntradasZip, type EntradaZip } from '@/services/analiseAtivos/fontes/zipStream';
import {
  condicionalDownload,
  marcarProcessado,
  obterFonteArquivo,
  registrarDownload,
} from '@/services/analiseAtivos/repositorio/fontesArquivo';

const BASE_CVM_FII = 'https://dados.cvm.gov.br/dados/FII/DOC';

/** Limites de download (spec jobsComum.limitesDownload). */
export const LIMITES_FII = {
  maxBytes: 150_000_000,
  timeoutMs: 90_000,
} as const;

export type TipoInformeFii = 'mensal' | 'trimestral';

export function urlInformeFii(tipo: TipoInformeFii, ano: number): string {
  if (!Number.isInteger(ano) || ano < 2016 || ano > 2100) throw new Error(`ano inválido: ${ano}`);
  return tipo === 'mensal'
    ? `${BASE_CVM_FII}/INF_MENSAL/DADOS/inf_mensal_fii_${ano}.zip`
    : `${BASE_CVM_FII}/INF_TRIMESTRAL/DADOS/inf_trimestral_fii_${ano}.zip`;
}

/** Anos a processar no cron: o corrente e, nos primeiros `mesesAnoAnterior` meses, o anterior. */
export function anosDoCron(hoje: string, mesesAnoAnterior: number): number[] {
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  return mes <= mesesAnoAnterior ? [ano - 1, ano] : [ano];
}

export interface ArquivoObtido {
  url: string;
  status: 'baixado' | 'nao_modificado' | 'cache';
  caminho: string | null;
  bytes: number;
  sha256: string | null;
  /** registra processadoEm (só downloads) */
  concluir(job: string): Promise<void>;
  descartar(): Promise<void>;
}

export interface OpcoesObter {
  /** diretório com os zips já baixados (nome = basename da URL) — só scripts/dev */
  cacheDir?: string;
  /** false ⇒ baixa sem condicional (backfill/--forcar) */
  condicional?: boolean;
  timeoutMs?: number;
  maxBytes?: number;
  /**
   * false ⇒ não registra em AnaliseFonteArquivo (leitura "de passagem", ex.: fii-cadastro lendo o
   * informe mensal — não pode zerar o processadoEm do job fii-mensal)
   */
  registrar?: boolean;
  /**
   * false ⇒ dry-run: lê o condicional (ETag) mas NÃO grava em AnaliseFonteArquivo — senão o
   * próximo cron perde o condicional e reprocessa o arquivo inteiro (achado qa-operacao 30/09).
   * Os jobs passam `ctx.aplicar`.
   */
  aplicar?: boolean;
}

const nada = async () => {};

export async function obterArquivo(
  prisma: PrismaClient,
  url: string,
  opts: OpcoesObter = {},
): Promise<ArquivoObtido> {
  if (opts.cacheDir) {
    const local = path.join(opts.cacheDir, path.basename(new URL(url).pathname));
    if (existsSync(local)) {
      return {
        url,
        status: 'cache',
        caminho: local,
        bytes: statSync(local).size,
        sha256: null,
        concluir: nada,
        descartar: nada,
      };
    }
  }
  const registrar = opts.registrar ?? true;
  const gravar = registrar && (opts.aplicar ?? true);
  const anterior =
    opts.condicional === false || !registrar ? null : await obterFonteArquivo(prisma, url);
  const r = await baixarParaArquivo(url, {
    maxBytes: opts.maxBytes ?? LIMITES_FII.maxBytes,
    timeoutMs: opts.timeoutMs ?? LIMITES_FII.timeoutMs,
    condicional: condicionalDownload(anterior),
  });
  if (r.status === 'baixado' && gravar) {
    await registrarDownload(prisma, url, {
      etag: r.etag,
      lastModified: r.lastModified,
      bytes: r.bytes,
      sha256: r.sha256,
    });
  }
  return {
    url,
    status: r.status,
    caminho: r.caminho,
    bytes: r.bytes,
    sha256: r.sha256,
    concluir: r.status === 'baixado' && gravar ? (job) => marcarProcessado(prisma, url, job) : nada,
    descartar: r.descartar,
  };
}

/**
 * Localiza as entradas pedidas no zip por nome exato (ex.: 'inf_mensal_fii_geral_' + ano). Falta
 * alguma ⇒ ErroLayoutFonte (o pacote mudou de formato: falha alto).
 */
export async function entradasObrigatorias<K extends string>(
  caminho: string,
  arquivo: string,
  padroes: Record<K, RegExp>,
): Promise<Record<K, EntradaZip>> {
  const entradas = await listarEntradasZip(caminho);
  const out = {} as Record<K, EntradaZip>;
  const faltando: string[] = [];
  for (const [k, re] of Object.entries(padroes) as Array<[K, RegExp]>) {
    const e = entradas.find((x) => re.test(path.basename(x.nome)));
    if (e) out[k] = e;
    else faltando.push(`entrada ${re.source}`);
  }
  if (faltando.length > 0) throw new ErroLayoutFonte(arquivo, faltando);
  return out;
}

/** 'AAAA-MM-DD' → 'AAAA-MM-01'. */
export function inicioDoMes(data: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(data)) throw new Error(`Data_Referencia inválida: ${data}`);
  return `${data.slice(0, 7)}-01`;
}

/** 'AAAA-MM-DD' → último dia do trimestre ('2026-03-30' ⇒ '2026-03-31'). */
export function fimDoTrimestre(data: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(data)) throw new Error(`Data_Referencia inválida: ${data}`);
  const ano = Number(data.slice(0, 4));
  const mes = Number(data.slice(5, 7));
  const mesFim = Math.ceil(mes / 3) * 3;
  const ultimo = new Date(Date.UTC(ano, mesFim, 0));
  return ultimo.toISOString().slice(0, 10);
}

/** Número de CSV da CVM ('.' decimal); vazio/inválido ⇒ null. */
export function numeroCvm(v: string | undefined | null): number | null {
  if (v === undefined || v === null) return null;
  const s = v.trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Fração da CVM → p.p. (×100), preservando null. */
export function fracaoParaPct(v: number | null): number | null {
  return v === null ? null : v * 100;
}

const RE_CNPJ = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/;

/** preFiltro barato na linha crua: 1º CNPJ da linha (com ou sem máscara) precisa estar no conjunto
 * (14 dígitos, regras/comum/cnpj.ts). */
export function preFiltroCnpj(
  cnpjs: Set<string> | undefined,
): ((bruta: string) => boolean) | undefined {
  if (!cnpjs) return undefined;
  return (bruta) => {
    const m = RE_CNPJ.exec(bruta.slice(0, 64));
    return m !== null && cnpjs.has(m[0].replace(/\D/g, ''));
  };
}
