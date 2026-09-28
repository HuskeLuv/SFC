// @vitest-environment jsdom
import { act, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHookWithClient } from '@/test/wrappers';
import { stubFetch } from '@/test/mocks/fetch';
import { useAlocacaoConfig } from '../useAlocacaoConfig';

vi.mock('@/hooks/useCsrf', () => ({ useCsrf: () => ({ csrfFetch: vi.fn() }) }));

const server = [
  { categoria: 'acoes', minimo: 20, maximo: 40, target: 30 },
  { categoria: 'fiis', minimo: 10, maximo: 30, target: 25 },
];

describe('useAlocacaoConfig — changedCategorias', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lista só as categorias editadas e diferentes do gravado; refetch limpa', async () => {
    stubFetch({ configuracoes: server });
    const { result } = renderHookWithClient(() => useAlocacaoConfig());
    await waitFor(() => expect(result.current.configuracoes).toHaveLength(2));
    expect(result.current.changedCategorias).toEqual([]);

    act(() => result.current.updateConfiguracao('acoes', 'target', 35));
    expect(result.current.changedCategorias).toEqual(['acoes']);

    // Voltar ao valor gravado não conta como alteração.
    act(() => result.current.updateConfiguracao('acoes', 'target', 30));
    expect(result.current.changedCategorias).toEqual([]);

    act(() => result.current.updateConfiguracao('fiis', 'maximo', 35));
    expect(result.current.changedCategorias).toEqual(['fiis']);

    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.changedCategorias).toEqual([]);
  });
});
