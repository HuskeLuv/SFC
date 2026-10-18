/**
 * Cliente da SEC: User-Agent fixo, gzip, ≤ 4 req/s (token bucket, também nas novas tentativas),
 * backoff em 429/503 com Retry-After, 404/403 como "não existe", só hosts da SEC.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  criarLimitadorTaxa,
  criarSecCliente,
  esperaBackoffMs,
  urlSec,
} from '@/services/analiseAtivos/eua/secCliente';
import { SEC_URLS, SEC_USER_AGENT } from '@/types/analiseAtivosEua';

/** Relógio falso: dormir avança o tempo. */
function relogio() {
  let t = 0;
  const esperas: number[] = [];
  return {
    agora: () => t,
    dormir: async (ms: number) => {
      esperas.push(ms);
      t += ms;
    },
    esperas,
    tempo: () => t,
  };
}

const resposta = (status: number, corpo = '{}', headers: Record<string, string> = {}) =>
  new Response(status === 204 ? null : corpo, { status, headers });

describe('secCliente', () => {
  it('User-Agent "MyFinance suporte@appmyfinance.com.br" e gzip em toda requisição', async () => {
    const r = relogio();
    const f = vi.fn(async () => resposta(200, '{"ok":1}'));
    const cli = criarSecCliente({ fetch: f as unknown as typeof fetch, ...r });
    expect(await cli.obterJson(SEC_URLS.tickersBolsa)).toEqual({ ok: 1 });
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    const h = init.headers as Record<string, string>;
    expect(h['User-Agent']).toBe(SEC_USER_AGENT);
    expect(SEC_USER_AGENT).toBe('MyFinance suporte@appmyfinance.com.br');
    expect(h['Accept-Encoding']).toContain('gzip');
  });

  it('≤ 4 req/s: 9 requisições levam ≥ 2 s no relógio', async () => {
    const r = relogio();
    const instantes: number[] = [];
    const f = vi.fn(async () => {
      instantes.push(r.tempo());
      return resposta(200);
    });
    const cli = criarSecCliente({ fetch: f as unknown as typeof fetch, ...r });
    await Promise.all(Array.from({ length: 9 }, () => cli.obter(SEC_URLS.tickersBolsa)));
    expect(f).toHaveBeenCalledTimes(9);
    for (let i = 1; i < instantes.length; i++) {
      expect(instantes[i] - instantes[i - 1]).toBeGreaterThanOrEqual(250);
    }
    expect(r.tempo()).toBeGreaterThanOrEqual(2000);
    // pedir mais que 4 req/s não tem efeito (teto)
    const r2 = relogio();
    const cli2 = criarSecCliente({
      fetch: f as unknown as typeof fetch,
      ...r2,
      maxReqPorSegundo: 50,
    });
    await cli2.obter(SEC_URLS.tickersBolsa);
    await cli2.obter(SEC_URLS.tickersBolsa);
    expect(r2.tempo()).toBe(250);
  });

  it('429 com Retry-After: espera e tenta de novo (contando para a taxa)', async () => {
    const r = relogio();
    const f = vi
      .fn()
      .mockResolvedValueOnce(resposta(429, '', { 'retry-after': '3' }))
      .mockResolvedValueOnce(resposta(503))
      .mockResolvedValueOnce(resposta(200, '{"a":2}'));
    const cli = criarSecCliente({ fetch: f as unknown as typeof fetch, ...r });
    expect(await cli.obterJson(SEC_URLS.tickersBolsa)).toEqual({ a: 2 });
    expect(f).toHaveBeenCalledTimes(3);
    expect(r.esperas).toContain(3000);
    expect(r.esperas).toContain(2000); // 2ª tentativa sem Retry-After: 1 s × 2
    expect(cli.requisicoes()).toBe(3);
  });

  it('429 persistente esgota as tentativas e falha com http_erro', async () => {
    const r = relogio();
    const f = vi.fn(async () => resposta(429));
    const cli = criarSecCliente({ fetch: f as unknown as typeof fetch, ...r, tentativas: 3 });
    await expect(cli.obter(SEC_URLS.tickersBolsa)).rejects.toMatchObject({
      codigo: 'http_erro',
      httpStatus: 429,
    });
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('404 = não existe; 403 só quando pedido (índice diário de fim de semana)', async () => {
    const r = relogio();
    const f = vi.fn().mockResolvedValueOnce(resposta(404)).mockResolvedValue(resposta(403));
    const cli = criarSecCliente({ fetch: f as unknown as typeof fetch, ...r });
    expect(await cli.obterJson(SEC_URLS.tickersBolsa)).toBeNull();
    const url = urlSec(SEC_URLS.indiceDiario, { ano: 2026, trimestre: 4, data: '20261017' });
    expect((await cli.obter(url, { ausentes: [403] })).status).toBe(404);
    await expect(cli.obter(url)).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('só https e só hosts da SEC', async () => {
    const cli = criarSecCliente({ fetch: vi.fn() as unknown as typeof fetch });
    await expect(cli.obter('https://example.com/x.json')).rejects.toMatchObject({
      codigo: 'host_nao_permitido',
    });
    await expect(cli.obter('http://data.sec.gov/x.json')).rejects.toMatchObject({
      codigo: 'https_obrigatorio',
    });
  });

  it('limitador puro e backoff', async () => {
    const r = relogio();
    const vez = criarLimitadorTaxa(4, r.agora, r.dormir);
    await vez();
    await vez();
    await vez();
    expect(r.tempo()).toBe(500);
    expect(esperaBackoffMs(1, null)).toBe(1000);
    expect(esperaBackoffMs(3, null)).toBe(4000);
    expect(esperaBackoffMs(1, '120')).toBe(60_000);
    expect(urlSec(SEC_URLS.companyfacts, { cik: '0000320193' })).toBe(
      'https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json',
    );
  });
});
