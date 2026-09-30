import { existsSync, readFileSync } from 'fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baixarParaArquivo, caminhoParcial } from '@/services/analiseAtivos/fontes/download';
import { ErroFonte } from '@/services/analiseAtivos/fontes/erros';
import { createHash } from 'crypto';

const URL_OK = 'https://dados.cvm.gov.br/dados/FII/DOC/INF_MENSAL/DADOS/teste.zip';

function corpo(partes: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      for (const p of partes) c.enqueue(p);
      c.close();
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('baixarParaArquivo', () => {
  it('baixa em streaming para disco com sha256, etag e last-modified', async () => {
    const dados = Buffer.from('conteudo;1\n'.repeat(1000));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(corpo([dados.subarray(0, 5000), dados.subarray(5000)]), {
          status: 200,
          headers: { etag: '"abc"', 'last-modified': 'Tue, 29 Sep 2026 10:00:00 GMT' },
        }),
      ),
    );
    const r = await baixarParaArquivo(URL_OK, { maxBytes: 1_000_000, timeoutMs: 5000 });
    try {
      expect(r.status).toBe('baixado');
      expect(r.bytes).toBe(dados.length);
      expect(r.etag).toBe('"abc"');
      expect(r.lastModified).toBe('Tue, 29 Sep 2026 10:00:00 GMT');
      expect(r.sha256).toBe(createHash('sha256').update(dados).digest('hex'));
      expect(readFileSync(r.caminho!).equals(dados)).toBe(true);
      expect(existsSync(caminhoParcial(URL_OK))).toBe(false);
    } finally {
      await r.descartar();
    }
    expect(existsSync(r.caminho!)).toBe(false);
  });

  it('maxBytes estourado no corpo aborta e apaga o .part', async () => {
    const pedaco = new Uint8Array(4096);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(corpo([pedaco, pedaco, pedaco]), { status: 200 })),
    );
    const erro = await baixarParaArquivo(URL_OK, { maxBytes: 5000, timeoutMs: 5000 }).catch(
      (e: unknown) => e,
    );
    expect(erro).toBeInstanceOf(ErroFonte);
    expect((erro as ErroFonte).codigo).toBe('tamanho_excedido');
    expect(existsSync(caminhoParcial(URL_OK))).toBe(false);
  });

  it('content-length acima do limite nem começa a gravar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(corpo([new Uint8Array(10)]), {
          status: 200,
          headers: { 'content-length': '999999999' },
        }),
      ),
    );
    await expect(
      baixarParaArquivo(URL_OK, { maxBytes: 5000, timeoutMs: 5000 }),
    ).rejects.toMatchObject({ codigo: 'tamanho_excedido' });
  });

  it('timeout ⇒ ErroFonte timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_res, rej) => {
            init.signal?.addEventListener('abort', () => rej(new Error('aborted')));
          }),
      ),
    );
    await expect(
      baixarParaArquivo(URL_OK, { maxBytes: 5000, timeoutMs: 30 }),
    ).rejects.toMatchObject({ codigo: 'timeout' });
  });

  it('304 ⇒ nao_modificado e envia If-None-Match/If-Modified-Since', async () => {
    const f = vi.fn().mockResolvedValue(new Response(null, { status: 304 }));
    vi.stubGlobal('fetch', f);
    const r = await baixarParaArquivo(URL_OK, {
      maxBytes: 5000,
      timeoutMs: 5000,
      condicional: { etag: '"v1"', lastModified: 'Mon, 28 Sep 2026 10:00:00 GMT', sha256: 'h' },
    });
    expect(r.status).toBe('nao_modificado');
    expect(r.caminho).toBeNull();
    expect(r.etag).toBe('"v1"');
    const headers = f.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['If-None-Match']).toBe('"v1"');
    expect(headers['If-Modified-Since']).toBe('Mon, 28 Sep 2026 10:00:00 GMT');
  });

  it('sha256 igual ao anterior ⇒ nao_modificado e arquivo descartado', async () => {
    const dados = Buffer.from('igual');
    const sha = createHash('sha256').update(dados).digest('hex');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(corpo([dados]), { status: 200 })),
    );
    const r = await baixarParaArquivo(URL_OK, {
      maxBytes: 5000,
      timeoutMs: 5000,
      condicional: { sha256: sha },
    });
    expect(r.status).toBe('nao_modificado');
    expect(r.caminho).toBeNull();
    expect(existsSync(caminhoParcial(URL_OK))).toBe(false);
  });

  it('host fora da allowlist nem tenta', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await expect(
      baixarParaArquivo('https://brapi.dev/api/x', { maxBytes: 5000, timeoutMs: 5000 }),
    ).rejects.toMatchObject({ codigo: 'host_nao_permitido' });
    expect(f).not.toHaveBeenCalled();
  });

  it('redirect para host fora da lista ⇒ ErroFonte; redirect interno é seguido', async () => {
    const fora = vi
      .fn()
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { location: 'https://evil.b3.com.br/x.zip' } }),
      );
    vi.stubGlobal('fetch', fora);
    await expect(
      baixarParaArquivo(URL_OK, { maxBytes: 5000, timeoutMs: 5000 }),
    ).rejects.toMatchObject({ codigo: 'host_nao_permitido' });
    expect(fora).toHaveBeenCalledTimes(1);

    const dentro = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 301, headers: { location: '/dados/outro.zip' } }),
      )
      .mockResolvedValueOnce(new Response(corpo([Buffer.from('ok')]), { status: 200 }));
    vi.stubGlobal('fetch', dentro);
    const r = await baixarParaArquivo(URL_OK, { maxBytes: 5000, timeoutMs: 5000 });
    expect(dentro.mock.calls[1][0]).toBe('https://dados.cvm.gov.br/dados/outro.zip');
    expect(r.status).toBe('baixado');
    await r.descartar();
  });

  it('mais de 3 redirects ⇒ redirect_excessivo', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(
          async () => new Response(null, { status: 302, headers: { location: '/de-novo' } }),
        ),
    );
    await expect(
      baixarParaArquivo(URL_OK, { maxBytes: 5000, timeoutMs: 5000 }),
    ).rejects.toMatchObject({ codigo: 'redirect_excessivo' });
  });

  it('HTTP 404 ⇒ http_erro com httpStatus', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x', { status: 404 })));
    await expect(
      baixarParaArquivo(URL_OK, { maxBytes: 5000, timeoutMs: 5000 }),
    ).rejects.toMatchObject({ codigo: 'http_erro', httpStatus: 404 });
  });
});
