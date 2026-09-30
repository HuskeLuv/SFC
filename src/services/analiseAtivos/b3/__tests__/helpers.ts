/**
 * Utilitários dos testes da fatia C: zips COTAHIST montados a partir das linhas REAIS da fixture
 * (regras/b3/__tests__/fixtures) e fetch falso por URL.
 */
import AdmZip from 'adm-zip';
import { readFileSync } from 'fs';
import path from 'path';
import { vi } from 'vitest';

const FIX = path.join(__dirname, '..', '..', 'regras', 'b3', '__tests__', 'fixtures');

export const LINHAS_AMOSTRA = readFileSync(path.join(FIX, 'cotahist_amostra.txt'), 'latin1')
  .split('\r\n')
  .filter((l) => l.length > 0);

export const LINHAS_AGO_2026 = readFileSync(
  path.join(FIX, 'cotahist_m082026_hglg11_nvho11.txt'),
  'latin1',
)
  .split('\r\n')
  .filter((l) => l.length > 0);

export const CLASSIF_TRECHOS = JSON.parse(
  readFileSync(path.join(FIX, 'classif_setorial_trechos.json'), 'utf8'),
) as unknown[][];

export const HEADER_2016 = LINHAS_AMOSTRA[0];

export function dados(linhas: string[]): string[] {
  return linhas.filter((l) => l.startsWith('01'));
}

export function linhaDe(symbol: string, aaaammdd: string, fonte = LINHAS_AMOSTRA): string {
  const l = fonte.find(
    (x) => x.startsWith('01') && x.slice(2, 10) === aaaammdd && x.slice(12, 24).trim() === symbol,
  );
  if (!l) throw new Error(`fixture sem ${symbol} ${aaaammdd}`);
  return l;
}

/** Troca o DATPRE de uma linha real (usado para simular o arquivo diário de outra data). */
export function comData(linha: string, aaaammdd: string): string {
  return linha.slice(0, 2) + aaaammdd + linha.slice(10);
}

function trailer(header: string, total: number): string {
  const base = '99' + header.slice(2, 31) + String(total).padStart(11, '0');
  return base.padEnd(245, ' ');
}

/** Zip COTAHIST com header (real), linhas e trailer com a contagem correta (ou `totalTrailer`). */
export function zipCotahist(
  linhas: string[],
  opts: {
    header?: string;
    nomeTxt?: string;
    totalTrailer?: number | null;
    entradasExtras?: string[];
  } = {},
): Buffer {
  const header = opts.header ?? HEADER_2016;
  const corpo = [header, ...linhas];
  if (opts.totalTrailer !== null) {
    corpo.push(trailer(header, opts.totalTrailer ?? linhas.length + 2));
  }
  const zip = new AdmZip();
  zip.addFile(
    opts.nomeTxt ?? 'COTAHIST_TESTE.TXT',
    Buffer.from(corpo.join('\r\n') + '\r\n', 'latin1'),
  );
  for (const e of opts.entradasExtras ?? []) zip.addFile(e, Buffer.from('x'));
  return zip.toBuffer();
}

/** fetch falso: URL → corpo (Buffer) ou status HTTP. Guarda as URLs pedidas. */
export function stubFetch(rotas: Record<string, Buffer | number>) {
  const pedidas: string[] = [];
  const fn = vi.fn(async (url: string | URL) => {
    const u = String(url);
    pedidas.push(u);
    const r = rotas[u];
    if (r === undefined || typeof r === 'number') {
      return new Response('não encontrado', { status: typeof r === 'number' ? r : 404 });
    }
    return new Response(new Uint8Array(r), { status: 200, headers: { etag: `"${r.length}"` } });
  });
  vi.stubGlobal('fetch', fn);
  return { fn, pedidas };
}
