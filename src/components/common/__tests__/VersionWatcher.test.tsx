// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { mockFetchSequence } from '@/test/mocks/fetch';

vi.mock('next/navigation', () => ({ usePathname: () => '/carteira' }));

import VersionWatcher from '../VersionWatcher';

const focar = () => {
  window.dispatchEvent(new Event('focus'));
};

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('VersionWatcher', () => {
  it('sem mudança de build: não renderiza nada', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchSequence([{ data: { buildId: 'abc' } }, { data: { buildId: 'abc' } }]),
    );
    render(<VersionWatcher />);
    await act(async () => {
      focar();
    });
    expect(screen.queryByText(/nova versão/i)).toBeNull();
  });

  it('build mudou entre checagens: mostra o banner de atualização', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchSequence([{ data: { buildId: 'abc' } }, { data: { buildId: 'def' } }]),
    );
    render(<VersionWatcher />);
    // 1ª checagem (mount) registra 'abc'; 2ª (foco) vê 'def' → stale.
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1));
    await act(async () => {
      focar();
    });
    await waitFor(() => expect(screen.getByText(/nova versão/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /atualizar/i })).toBeInTheDocument();
  });

  it("buildId 'dev' nunca acusa stale", async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchSequence([{ data: { buildId: 'dev' } }, { data: { buildId: 'dev' } }]),
    );
    render(<VersionWatcher />);
    await act(async () => {
      focar();
    });
    expect(screen.queryByText(/nova versão/i)).toBeNull();
  });
});
