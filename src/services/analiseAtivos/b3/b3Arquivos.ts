/**
 * Arquivos públicos da B3 usados pela fatia C: COTAHIST (diário/anual) e ClassifSetorial.xlsx.
 *
 * Download sempre por `fontes/download` (allowlist exata, https, limite de tamanho, timeout). O
 * `cacheDir` é só para desenvolvimento/backfill (reusa zips já baixados, como os da Fase A); o cron
 * nunca passa cacheDir e apaga o arquivo baixado no finally.
 */
import { copyFile, mkdir, rename, stat, unlink } from 'fs/promises';
import path from 'path';
import {
  baixarParaArquivo,
  type OpcoesDownload,
  type ResultadoDownload,
} from '@/services/analiseAtivos/fontes/download';
import { dataParaDdmmaaaa } from '@/services/analiseAtivos/regras/b3/cotahist';

export const URL_SERIES_HISTORICAS = 'https://bvmf.bmfbovespa.com.br/InstDados/SerHist';

/** Endpoint não documentado da B3 (payload = base64 de {"language":"pt-br"}); devolve o .xlsx cru. */
export const URL_CLASSIF_SETORIAL =
  'https://sistemaswebb3-listados.b3.com.br/listedCompaniesProxy/CompanyCall/GetDownloadIndustryClassification/' +
  Buffer.from(JSON.stringify({ language: 'pt-br' })).toString('base64');

/** Limites da spec (jobsComum.limitesDownload). */
export const LIMITES_B3 = {
  maxBytesCotahistDiario: 20_000_000,
  maxBytesCotahistAnual: 200_000_000,
  maxBytesClassifSetorial: 5_000_000,
  timeoutMs: 90_000,
  timeoutMsBackfillAnual: 600_000,
} as const;

export function nomeCotahistDiario(data: string): string {
  return `COTAHIST_D${dataParaDdmmaaaa(data)}.ZIP`;
}

export function nomeCotahistAnual(ano: number): string {
  if (!Number.isInteger(ano) || ano < 1986 || ano > 2100) throw new Error(`Ano inválido: ${ano}`);
  return `COTAHIST_A${ano}.ZIP`;
}

export function urlCotahistDiario(data: string): string {
  return `${URL_SERIES_HISTORICAS}/${nomeCotahistDiario(data)}`;
}

export function urlCotahistAnual(ano: number): string {
  return `${URL_SERIES_HISTORICAS}/${nomeCotahistAnual(ano)}`;
}

export interface ArquivoB3 extends ResultadoDownload {
  /** true = veio do cacheDir local (sem download) */
  doCache: boolean;
}

async function existe(caminho: string): Promise<number | null> {
  try {
    const s = await stat(caminho);
    return s.isFile() && s.size > 0 ? s.size : null;
  } catch {
    return null;
  }
}

/**
 * Baixa (ou pega do cacheDir) um arquivo da B3. `cacheDir` aceita várias pastas (procura em todas,
 * grava na 1ª). Com cache, o arquivo baixado fica lá com `nomeCache` e `descartar()` não o apaga; sem
 * cache, `descartar()` apaga o temporário.
 */
export async function obterArquivoB3(
  url: string,
  opts: OpcoesDownload & { cacheDir?: string | string[] | null; nomeCache?: string },
): Promise<ArquivoB3> {
  const nome = opts.nomeCache ?? path.basename(new URL(url).pathname);
  const caches = (Array.isArray(opts.cacheDir) ? opts.cacheDir : [opts.cacheDir]).filter(
    (d): d is string => typeof d === 'string' && d.length > 0,
  );
  for (const dir of caches) {
    const local = path.join(dir, nome);
    const bytes = await existe(local);
    if (bytes !== null) {
      return {
        status: 'baixado',
        caminho: local,
        bytes,
        etag: null,
        lastModified: null,
        sha256: null,
        descartar: async () => {},
        doCache: true,
      };
    }
  }

  const r = await baixarParaArquivo(url, {
    maxBytes: opts.maxBytes,
    timeoutMs: opts.timeoutMs,
    condicional: opts.condicional,
  });
  if (caches.length === 0 || r.status !== 'baixado' || !r.caminho) return { ...r, doCache: false };

  await mkdir(caches[0], { recursive: true });
  const destino = path.join(caches[0], nome);
  try {
    await rename(r.caminho, destino);
  } catch {
    // outro dispositivo (tmpfs → disco): copia e apaga
    await copyFile(r.caminho, destino);
    await unlink(r.caminho).catch(() => {});
  }
  return { ...r, caminho: destino, descartar: async () => {}, doCache: false };
}
