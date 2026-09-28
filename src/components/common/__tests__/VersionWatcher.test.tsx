// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { mockFetchSequence } from '@/test/mocks/fetch';

vi.mock('next/navigation', () => ({ usePathname: () => '/carteira' }));

const swClient = vi.hoisted(() => ({
  prepareReloadForNewVersion: vi.fn(() => Promise.resolve()),
  clearAppCaches: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/pwa/swClient', () => swClient);

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

  it('Atualizar prepara o service worker antes de recarregar', async () => {
    const reload = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, reload },
      configurable: true,
    });
    vi.stubGlobal(
      'fetch',
      mockFetchSequence([{ data: { buildId: 'abc' } }, { data: { buildId: 'def' } }]),
    );
    render(<VersionWatcher />);
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1));
    await act(async () => {
      focar();
    });
    const botao = await screen.findByRole('button', { name: /atualizar/i });

    await act(async () => {
      fireEvent.click(botao);
    });

    expect(swClient.prepareReloadForNewVersion).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    Object.defineProperty(window, 'location', { value: originalLocation, configurable: true });
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
