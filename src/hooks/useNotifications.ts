'use client';

import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { logger } from '@/lib/logger';
import { useAuth } from '@/hooks/useAuth';
import { useCsrf } from '@/hooks/useCsrf';

export type InviteStatus = 'pending' | 'accepted' | 'rejected';

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  type: string;
  metadata?: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
  invite?: {
    id: string;
    status: InviteStatus;
    consultant?: {
      id: string;
      userId: string;
      name: string | null;
      email: string | null;
    } | null;
  } | null;
};

type NotificationsData = {
  notifications: NotificationItem[];
  /** Mensagem de erro devolvida pela API (resposta não-ok), sem derrubar a query. */
  error: string | null;
};

/** Prefixo da query. A chave completa inclui o id do usuário (troca de conta não reaproveita). */
export const NOTIFICATIONS_QUERY_KEY = ['notifications'] as const;

const EMPTY: NotificationItem[] = [];

async function fetchNotifications(): Promise<NotificationsData> {
  let response: Response;
  try {
    response = await fetch('/api/notifications', {
      credentials: 'include',
    });
  } catch (fetchError) {
    logger.error('[NotificationDropdown] load error', fetchError);
    throw fetchError;
  }
  const body = (await response.json().catch(() => null)) as {
    notifications?: NotificationItem[];
    error?: string;
  } | null;

  if (!response.ok) {
    logger.warn('[NotificationDropdown] request failed', {
      status: response.status,
      body,
    });
    return { notifications: [], error: body?.error ?? null };
  }

  return { notifications: body?.notifications ?? [], error: null };
}

/**
 * Notificações do usuário em React Query: o sino do rodapé da sidebar (desktop) e o do cabeçalho
 * mobile compartilham UMA busca de /api/notifications e o mesmo estado de "lido".
 */
export function useNotifications() {
  const { user, isLoading: authLoading } = useAuth();
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;
  const queryKey = useMemo(() => [...NOTIFICATIONS_QUERY_KEY, userId] as const, [userId]);
  const enabled = !authLoading && Boolean(userId);

  const query = useQuery({
    queryKey,
    queryFn: fetchNotifications,
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const notifications = enabled ? (query.data?.notifications ?? EMPTY) : EMPTY;

  let error: string | null = null;
  if (enabled) {
    if (query.error) {
      error =
        query.error instanceof Error
          ? query.error.message
          : 'Não foi possível carregar as notificações.';
    } else {
      error = query.data?.error ?? null;
    }
  }

  const updateItems = useCallback(
    (updater: (items: NotificationItem[]) => NotificationItem[]) => {
      queryClient.setQueryData<NotificationsData>(queryKey, (previous) =>
        previous ? { ...previous, notifications: updater(previous.notifications) } : previous,
      );
    },
    [queryClient, queryKey],
  );

  const markAsRead = useCallback(
    async (ids: string[]) => {
      if (!user || authLoading || ids.length === 0) return;
      try {
        await csrfFetch('/api/notifications', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ids }),
        });
        const readTimestamp = new Date().toISOString();
        updateItems((items) =>
          items.map((notification) =>
            ids.includes(notification.id)
              ? { ...notification, readAt: notification.readAt ?? readTimestamp }
              : notification,
          ),
        );
      } catch (markError) {
        logger.error('[NotificationDropdown] mark read error', markError);
      }
    },
    [user, authLoading, csrfFetch, updateItems],
  );

  /** Aceita/recusa convite de consultoria. Lança Error com a mensagem da API em caso de falha. */
  const respondInvite = useCallback(
    async (notification: NotificationItem, action: 'accept' | 'reject') => {
      if (authLoading || !user || !notification.invite) return;

      const response = await csrfFetch(
        `/api/consultant/invitations/${notification.invite.id}/respond`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action,
            notificationId: notification.id,
          }),
        },
      );

      const body = (await response.json().catch(() => null)) as {
        invitation?: { status?: InviteStatus; respondedAt?: string | null };
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(body?.error ?? 'Não foi possível registrar a resposta.');
      }

      const nextStatus =
        body?.invitation?.status ?? (action === 'accept' ? 'accepted' : 'rejected');
      const readTimestamp = new Date().toISOString();

      updateItems((items) =>
        items.map((item) =>
          item.id === notification.id
            ? {
                ...item,
                readAt: readTimestamp,
                invite: item.invite ? { ...item.invite, status: nextStatus } : item.invite,
              }
            : item,
        ),
      );
    },
    [authLoading, user, csrfFetch, updateItems],
  );

  const { refetch: queryRefetch } = query;
  const refetch = useCallback(async () => {
    if (!enabled) return;
    await queryRefetch();
  }, [enabled, queryRefetch]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.readAt).length,
    [notifications],
  );

  return {
    notifications,
    isLoading: enabled && query.isFetching,
    error,
    unreadCount,
    hasUnread: unreadCount > 0,
    refetch,
    markAsRead,
    respondInvite,
  };
}
