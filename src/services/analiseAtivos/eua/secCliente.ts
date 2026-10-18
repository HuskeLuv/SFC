/**
 * Cliente HTTP da SEC (EDGAR / data.sec.gov) — Stocks e REITs, fatia A.
 *
 * Regras de acesso justo (fair access) que este módulo garante para TODO download EUA:
 * - User-Agent fixo SEC_USER_AGENT ("MyFinance suporte@appmyfinance.com.br"), nunca por env;
 * - ≤ SEC_MAX_REQ_POR_SEGUNDO (4 req/s) por token bucket compartilhado pelo processo (o limite
 *   público é 10; folga deliberada) — vale também para as novas tentativas;
 * - gzip pedido (Accept-Encoding) e descomprimido pelo fetch;
 * - backoff exponencial em 429/503 (respeita Retry-After, teto 60 s) e em erro de rede/timeout;
 * - só https e só os hosts da SEC (www.sec.gov, data.sec.gov); teto de bytes por resposta.
 *
 * Nada aqui grava em disco nem no banco: devolve texto/JSON já em memória, uma resposta por vez —
 * o chamador processa e descarta (companyfacts de 3–9 MB descompactados; RSS < 300 MB).
 */
import { ErroFonte } from '@/services/analiseAtivos/fontes/erros';
import { SEC_MAX_REQ_POR_SEGUNDO, SEC_USER_AGENT } from '@/types/analiseAtivosEua';

export const HOSTS_SEC: readonly string[] = ['www.sec.gov', 'data.sec.gov'] as const;

/** Teto padrão por resposta descompactada (o maior companyfacts medido tem 8,9 MB). */
export const MAX_BYTES_PADRAO_SEC = 64 * 1024 * 1024;
export const TIMEOUT_PADRAO_SEC_MS = 60_000;
export const TENTATIVAS_PADRAO_SEC = 4;
const ESPERA_MAX_MS = 60_000;

export interface OpcoesSecCliente {
  /** injeção para testes */
  fetch?: typeof fetch;
  agora?: () => number;
  dormir?: (ms: number) => Promise<void>;
  maxReqPorSegundo?: number;
  timeoutMs?: number;
  tentativas?: number;
  maxBytes?: number;
}

export interface RespostaSec {
  status: number;
  texto: string | null;
  etag: string | null;
  lastModified: string | null;
}

export interface SecCliente {
  /**
   * GET; 404 → { status: 404, texto: null } (CIK sem companyfacts). `ausentes` acrescenta outros
   * status tratados como "não existe" — o Archives da SEC responde 403 (S3 AccessDenied) para o
   * índice diário de fim de semana/feriado.
   */
  obter(url: string, opts?: { etag?: string | null; ausentes?: number[] }): Promise<RespostaSec>;
  /** GET + JSON.parse; 404 → null. */
  obterJson<T>(url: string): Promise<T | null>;
  /** Requisições HTTP feitas (inclui novas tentativas). */
  requisicoes(): number;
}

export function assertUrlSec(url: string): void {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new ErroFonte('url_invalida', `URL inválida: ${url}`);
  }
  if (u.protocol !== 'https:')
    throw new ErroFonte('https_obrigatorio', `https obrigatório: ${url}`);
  if (u.username || u.password || (u.port !== '' && u.port !== '443')) {
    throw new ErroFonte('host_nao_permitido', `URL com credenciais/porta não permitida: ${url}`);
  }
  if (!HOSTS_SEC.includes(u.hostname.toLowerCase())) {
    throw new ErroFonte('host_nao_permitido', `Host fora da SEC: ${u.hostname}`);
  }
}

/**
 * Token bucket de `taxa` fichas por segundo, capacidade 1 (sem rajada): cada requisição espera
 * o intervalo mínimo de 1000/taxa ms desde a anterior. Puro (relógio e sono injetáveis).
 */
export function criarLimitadorTaxa(
  taxa: number,
  agora: () => number = Date.now,
  dormir: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): () => Promise<void> {
  if (!(taxa > 0)) throw new Error('taxa inválida');
  const intervalo = 1000 / taxa;
  let proximaLiberacao = 0;
  let fila: Promise<void> = Promise.resolve();
  return () => {
    const vez = fila.then(async () => {
      const t = agora();
      const espera = proximaLiberacao - t;
      if (espera > 0) await dormir(espera);
      proximaLiberacao = Math.max(t, proximaLiberacao) + intervalo;
    });
    fila = vez.catch(() => undefined);
    return vez;
  };
}

/** Espera antes da tentativa n (1, 2, …): Retry-After (s) quando veio, senão 1 s × 2^(n−1). */
export function esperaBackoffMs(tentativa: number, retryAfter: string | null): number {
  const ra = retryAfter !== null ? Number(retryAfter) : NaN;
  if (Number.isFinite(ra) && ra >= 0) return Math.min(ra * 1000, ESPERA_MAX_MS);
  return Math.min(1000 * 2 ** (tentativa - 1), ESPERA_MAX_MS);
}

const REPETIVEL = new Set([429, 500, 502, 503, 504]);

export function criarSecCliente(opts: OpcoesSecCliente = {}): SecCliente {
  const f = opts.fetch ?? fetch;
  const dormir = opts.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const taxa = Math.min(opts.maxReqPorSegundo ?? SEC_MAX_REQ_POR_SEGUNDO, SEC_MAX_REQ_POR_SEGUNDO);
  const aguardarVez = criarLimitadorTaxa(taxa, opts.agora ?? Date.now, dormir);
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_PADRAO_SEC_MS;
  const tentativas = Math.max(1, opts.tentativas ?? TENTATIVAS_PADRAO_SEC);
  const maxBytes = opts.maxBytes ?? MAX_BYTES_PADRAO_SEC;
  let total = 0;

  async function umaVez(
    url: string,
    etag?: string | null,
  ): Promise<RespostaSec & { retryAfter: string | null }> {
    await aguardarVez();
    total++;
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = {
        'User-Agent': SEC_USER_AGENT,
        'Accept-Encoding': 'gzip, deflate',
        Accept: 'application/json, text/plain, */*',
      };
      if (etag) headers['If-None-Match'] = etag;
      const res = await f(url, { headers, signal: controle.signal, redirect: 'error' });
      const base = {
        status: res.status,
        etag: res.headers.get('etag'),
        lastModified: res.headers.get('last-modified'),
        retryAfter: res.headers.get('retry-after'),
      };
      if (!res.ok) {
        await res.body?.cancel();
        return { ...base, texto: null };
      }
      const declarado = Number(res.headers.get('content-length'));
      if (Number.isFinite(declarado) && declarado > maxBytes) {
        await res.body?.cancel();
        throw new ErroFonte('tamanho_excedido', `${declarado} bytes > limite ${maxBytes}: ${url}`);
      }
      const texto = await res.text();
      if (texto.length > maxBytes) {
        throw new ErroFonte('tamanho_excedido', `mais de ${maxBytes} bytes em ${url}`);
      }
      return { ...base, texto };
    } catch (e: unknown) {
      if (e instanceof ErroFonte) throw e;
      if (controle.signal.aborted)
        throw new ErroFonte('timeout', `timeout de ${timeoutMs} ms em ${url}`);
      throw new ErroFonte(
        'rede',
        `falha de rede em ${url}: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async function obter(
    url: string,
    o?: { etag?: string | null; ausentes?: number[] },
  ): Promise<RespostaSec> {
    assertUrlSec(url);
    for (let n = 1; ; n++) {
      let r: Awaited<ReturnType<typeof umaVez>>;
      try {
        r = await umaVez(url, o?.etag);
      } catch (e: unknown) {
        const repetivel = e instanceof ErroFonte && (e.codigo === 'rede' || e.codigo === 'timeout');
        if (!repetivel || n >= tentativas) throw e;
        await dormir(esperaBackoffMs(n, null));
        continue;
      }
      if (REPETIVEL.has(r.status) && n < tentativas) {
        await dormir(esperaBackoffMs(n, r.retryAfter));
        continue;
      }
      if (r.status === 404) {
        return { status: 404, texto: null, etag: r.etag, lastModified: r.lastModified };
      }
      if (o?.ausentes?.includes(r.status)) {
        return { status: 404, texto: null, etag: null, lastModified: null };
      }
      if (r.status === 304 || (r.status >= 200 && r.status < 300)) {
        return { status: r.status, texto: r.texto, etag: r.etag, lastModified: r.lastModified };
      }
      throw new ErroFonte('http_erro', `HTTP ${r.status} em ${url}`, r.status);
    }
  }

  return {
    obter,
    async obterJson<T>(url: string): Promise<T | null> {
      const r = await obter(url);
      if (r.status === 404 || r.texto === null) return null;
      try {
        return JSON.parse(r.texto) as T;
      } catch {
        throw new ErroFonte('layout_mudou', `JSON inválido em ${url}`);
      }
    },
    requisicoes: () => total,
  };
}

/** URL com {placeholders} preenchidos (SEC_URLS). */
export function urlSec(modelo: string, valores: Record<string, string | number>): string {
  return modelo.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = valores[k];
    if (v === undefined) throw new Error(`placeholder sem valor: ${k}`);
    return String(v);
  });
}
