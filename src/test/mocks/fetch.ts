import { vi } from 'vitest';

/**
 * Helpers for mocking global.fetch in service tests.
 */
export function mockFetchResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as Response;
}

export function mockFetchSequence(responses: Array<{ data: unknown; status?: number }>) {
  const fn = vi.fn();
  responses.forEach(({ data, status }) => {
    fn.mockResolvedValueOnce(mockFetchResponse(data, status));
  });
  return fn;
}

export function stubFetch(data: unknown, status = 200) {
  const mock = vi.fn().mockResolvedValue(mockFetchResponse(data, status));
  vi.stubGlobal('fetch', mock);
  return mock;
}
