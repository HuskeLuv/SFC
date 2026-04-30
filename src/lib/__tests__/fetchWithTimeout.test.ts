import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchWithTimeout } from '../fetchWithTimeout';

const realFetch = global.fetch;

afterEach(() => {
  global.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('fetchWithTimeout', () => {
  it('repassa a Response quando o fetch resolve antes do timeout', async () => {
    const mockResponse = new Response('ok', { status: 200 });
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const result = await fetchWithTimeout('https://example.com', undefined, 5000);

    expect(result).toBe(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('aborta o fetch quando o timeout vence (AbortError)', async () => {
    global.fetch = vi.fn().mockImplementation(
      (_url, init) =>
        new Promise((_, reject) => {
          (init as RequestInit).signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            (err as Error & { name: string }).name = 'AbortError';
            reject(err);
          });
        }),
    );

    await expect(fetchWithTimeout('https://example.com', undefined, 20)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('preserva campos do init original (cache, headers)', async () => {
    const mockResponse = new Response('ok', { status: 200 });
    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    await fetchWithTimeout(
      'https://example.com',
      { cache: 'no-store', headers: { 'X-Test': '1' } },
      5000,
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        cache: 'no-store',
        headers: { 'X-Test': '1' },
        signal: expect.any(AbortSignal),
      }),
    );
  });
});
