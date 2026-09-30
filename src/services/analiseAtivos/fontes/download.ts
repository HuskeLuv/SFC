/**
 * Download de arquivo de fonte para disco, em streaming (nunca o arquivo inteiro em memória).
 *
 * - Só hosts da allowlist, https; `redirect: 'manual'` com revalidação do host de cada Location
 *   (máx. 3 saltos).
 * - Grava em os.tmpdir()/analise-ativos/<sha1(url)>.part calculando sha256 no caminho; ao passar de
 *   `maxBytes` aborta e apaga o .part. Timeout cobre conexão + corpo.
 * - Condicional: If-None-Match/If-Modified-Since; 304 ou sha256 igual ao anterior ⇒ 'nao_modificado'
 *   (o arquivo é descartado — o job pula o processamento).
 * - O chamador apaga o arquivo com `descartar()` no finally.
 */
import { createHash } from 'crypto';
import { once } from 'events';
import { createWriteStream } from 'fs';
import { mkdir, rename, unlink } from 'fs/promises';
import os from 'os';
import path from 'path';
import { assertUrlPermitida } from '@/services/analiseAtivos/fontes/allowlist';
import { ErroFonte } from '@/services/analiseAtivos/fontes/erros';

const MAX_REDIRECTS = 3;

export interface ResultadoDownload {
  status: 'baixado' | 'nao_modificado';
  caminho: string | null;
  bytes: number;
  etag: string | null;
  lastModified: string | null;
  sha256: string | null;
  descartar(): Promise<void>;
}

export interface OpcoesDownload {
  maxBytes: number;
  timeoutMs: number;
  condicional?: { etag?: string | null; lastModified?: string | null; sha256?: string | null };
}

export function diretorioDownloads(): string {
  return path.join(os.tmpdir(), 'analise-ativos');
}

export function caminhoParcial(url: string): string {
  const h = createHash('sha1').update(url).digest('hex');
  return path.join(diretorioDownloads(), `${h}.part`);
}

async function apagar(caminho: string): Promise<void> {
  try {
    await unlink(caminho);
  } catch {
    // já não existe
  }
}

const semArquivo = async () => {};

export async function baixarParaArquivo(
  url: string,
  opts: OpcoesDownload,
): Promise<ResultadoDownload> {
  assertUrlPermitida(url);

  const controle = new AbortController();
  let expirou = false;
  const timer = setTimeout(() => {
    expirou = true;
    controle.abort();
  }, opts.timeoutMs);
  const parcial = caminhoParcial(url);

  try {
    const headers: Record<string, string> = {};
    if (opts.condicional?.etag) headers['If-None-Match'] = opts.condicional.etag;
    if (opts.condicional?.lastModified) {
      headers['If-Modified-Since'] = opts.condicional.lastModified;
    }

    let atual = url;
    let res: Response | null = null;
    for (let salto = 0; ; salto++) {
      res = await fetch(atual, { redirect: 'manual', signal: controle.signal, headers });
      if (res.status < 300 || res.status >= 400 || res.status === 304) break;
      const location = res.headers.get('location');
      await res.body?.cancel();
      if (!location)
        throw new ErroFonte('redirect_sem_location', `Redirect sem Location: ${atual}`);
      if (salto >= MAX_REDIRECTS) throw new ErroFonte('redirect_excessivo', `>3 redirects: ${url}`);
      atual = new URL(location, atual).toString();
      assertUrlPermitida(atual);
    }

    const etag = res.headers.get('etag');
    const lastModified = res.headers.get('last-modified');

    if (res.status === 304) {
      await res.body?.cancel();
      return {
        status: 'nao_modificado',
        caminho: null,
        bytes: 0,
        etag: etag ?? opts.condicional?.etag ?? null,
        lastModified: lastModified ?? opts.condicional?.lastModified ?? null,
        sha256: opts.condicional?.sha256 ?? null,
        descartar: semArquivo,
      };
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new ErroFonte('http_erro', `HTTP ${res.status} em ${atual}`, res.status);
    }

    const declarado = Number(res.headers.get('content-length'));
    if (Number.isFinite(declarado) && declarado > opts.maxBytes) {
      await res.body?.cancel();
      throw new ErroFonte('tamanho_excedido', `${declarado} bytes > limite ${opts.maxBytes}`);
    }

    await mkdir(diretorioDownloads(), { recursive: true });
    const hash = createHash('sha256');
    let bytes = 0;
    const ws = createWriteStream(parcial);
    try {
      if (res.body) {
        for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
          bytes += chunk.byteLength;
          if (bytes > opts.maxBytes) {
            controle.abort();
            throw new ErroFonte('tamanho_excedido', `mais de ${opts.maxBytes} bytes em ${url}`);
          }
          hash.update(chunk);
          if (!ws.write(chunk)) await once(ws, 'drain');
        }
      }
      ws.end();
      await once(ws, 'finish');
    } catch (err) {
      // espera o fd fechar antes do unlink do catch externo (senão o .part reaparece)
      await new Promise<void>((resolve) => {
        if (ws.closed) return resolve();
        ws.once('close', () => resolve());
        ws.destroy();
      });
      throw err;
    }

    const sha256 = hash.digest('hex');
    if (opts.condicional?.sha256 && opts.condicional.sha256 === sha256) {
      await apagar(parcial);
      return {
        status: 'nao_modificado',
        caminho: null,
        bytes,
        etag,
        lastModified,
        sha256,
        descartar: semArquivo,
      };
    }

    const final = parcial.replace(/\.part$/, '.dat');
    await rename(parcial, final);
    return {
      status: 'baixado',
      caminho: final,
      bytes,
      etag,
      lastModified,
      sha256,
      descartar: () => apagar(final),
    };
  } catch (err: unknown) {
    await apagar(parcial);
    if (err instanceof ErroFonte) throw err;
    if (expirou) throw new ErroFonte('timeout', `timeout de ${opts.timeoutMs} ms em ${url}`);
    const msg = err instanceof Error ? err.message : String(err);
    throw new ErroFonte('rede', `falha de rede em ${url}: ${msg}`);
  } finally {
    clearTimeout(timer);
  }
}
