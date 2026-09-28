// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/wrappers';
import { mockFetchResponse } from '@/test/mocks/fetch';

const mocks = vi.hoisted(() => ({
  csrfFetch: vi.fn(),
  auth: { user: { id: 'u1', role: 'user' } as { id: string } | null, isLoading: false },
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/hooks/useCsrf', () => ({ useCsrf: () => ({ csrfFetch: mocks.csrfFetch }) }));

import { useNotifications } from '../useNotifications';

const NOTIFICATIONS = [
  {
    id: 'n1',
    title: 'Olá',
    message: 'm',
    type: 'info',
    readAt: null,
    createdAt: '2026-09-23T10:00:00Z',
  },
  {
    id: 'n2',
    title: 'Convite',
    message: 'm',
    type: 'invite',
    readAt: null,
    createdAt: '2026-09-23T11:00:00Z',
    invite: { id: 'i1', status: 'pending' as const },
  },
];

function renderTwoInstances() {
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => ({ a: useNotifications(), b: useNotifications() }), { wrapper });
}

beforeEach(() => {
  mocks.auth = { user: { id: 'u1', role: 'user' } as { id: string }, isLoading: false };
  mocks.csrfFetch.mockReset();
  vi.unstubAllGlobals();
});

describe('useNotifications', () => {
  it('duas instâncias fazem um único GET /api/notifications', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockFetchResponse({ notifications: NOTIFICATIONS }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderTwoInstances();
    await waitFor(() => expect(result.current.a.notifications).toHaveLength(2));
    expect(result.current.b.notifications).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/notifications', { credentials: 'include' });
    expect(result.current.a.unreadCount).toBe(2);
  });

  it('markAsRead numa instância reflete na outra', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockFetchResponse({ notifications: NOTIFICATIONS })),
    );
    mocks.csrfFetch.mockResolvedValue(mockFetchResponse({ ok: true }));

    const { result } = renderTwoInstances();
    await waitFor(() => expect(result.current.a.notifications).toHaveLength(2));

    await act(async () => {
      await result.current.a.markAsRead(['n1']);
    });

    expect(mocks.csrfFetch).toHaveBeenCalledWith(
      '/api/notifications',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ ids: ['n1'] }) }),
    );
    await waitFor(() =>
      expect(result.current.b.notifications.find((n) => n.id === 'n1')?.readAt).not.toBeNull(),
    );
    expect(result.current.b.unreadCount).toBe(1);
    expect(result.current.a.hasUnread).toBe(true);
  });

  it('respondInvite atualiza o status do convite e marca como lido', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockFetchResponse({ notifications: NOTIFICATIONS })),
    );
    mocks.csrfFetch.mockResolvedValue(mockFetchResponse({ invitation: { status: 'accepted' } }));

    const { result } = renderTwoInstances();
    await waitFor(() => expect(result.current.a.notifications).toHaveLength(2));

    await act(async () => {
      await result.current.a.respondInvite(result.current.a.notifications[1], 'accept');
    });

    await waitFor(() =>
      expect(result.current.b.notifications.find((n) => n.id === 'n2')?.invite?.status).toBe(
        'accepted',
      ),
    );
    const convite = result.current.b.notifications.find((n) => n.id === 'n2');
    expect(convite?.readAt).not.toBeNull();
  });

  it('respondInvite lança a mensagem da API quando falha', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockFetchResponse({ notifications: NOTIFICATIONS })),
    );
    mocks.csrfFetch.mockResolvedValue(mockFetchResponse({ error: 'Convite expirado' }, 409));

    const { result } = renderTwoInstances();
    await waitFor(() => expect(result.current.a.notifications).toHaveLength(2));

    await expect(
      result.current.a.respondInvite(result.current.a.notifications[1], 'accept'),
    ).rejects.toThrow('Convite expirado');
  });

  it('resposta não-ok vira lista vazia com a mensagem de erro', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockFetchResponse({ error: 'Não autorizado' }, 401)),
    );
    const { result } = renderTwoInstances();
    await waitFor(() => expect(result.current.a.error).toBe('Não autorizado'));
    expect(result.current.a.notifications).toEqual([]);
  });

  it('sem usuário não busca', async () => {
    mocks.auth = { user: null, isLoading: false };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderTwoInstances();
    expect(result.current.a.notifications).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
