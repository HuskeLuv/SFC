"use client";

import Link from "next/link";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { useAuth } from "@/hooks/useAuth";

type InviteStatus = "pending" | "accepted" | "rejected";

type NotificationItem = {
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

const formatDateTime = (isoDate: string) => {
  const date = new Date(isoDate);
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getInviteStatusLabel = (status: InviteStatus) => {
  if (status === "accepted") {
    return "Convite aceito";
  }
  if (status === "rejected") {
    return "Convite recusado";
  }
  return "Convite pendente";
};

const NotificationDropdown: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const { user, isLoading: authLoading } = useAuth();

  const hasUnread = useMemo(
    () => notifications.some((notification) => !notification.readAt),
    [notifications],
  );
  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.readAt).length,
    [notifications],
  );

  const fetchNotifications = useCallback(async () => {
    if (authLoading) {
      return;
    }

    if (!user) {
      setNotifications([]);
      setError(null);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/notifications", {
        credentials: "include",
      });
      const body = (await response.json().catch(() => null)) as
        | { notifications?: NotificationItem[]; error?: string }
        | null;

      if (!response.ok) {
        console.warn("[NotificationDropdown] request failed", {
          status: response.status,
          body,
        });
        setNotifications([]);
        setError(body?.error ?? null);
        return;
      }

      setNotifications(body?.notifications ?? []);
    } catch (fetchError) {
      console.error("[NotificationDropdown] load error", fetchError);
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Não foi possível carregar as notificações.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [authLoading, user]);

  const markNotificationsAsRead = useCallback(
    async (ids: string[]) => {
      if (!user || authLoading) {
        return;
      }

      if (ids.length === 0) {
        return;
      }

      try {
        await fetch("/api/notifications", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ ids }),
        });

        const readTimestamp = new Date().toISOString();
        setNotifications((previous) =>
          previous.map((notification) =>
            ids.includes(notification.id)
              ? {
                  ...notification,
                  readAt: notification.readAt ?? readTimestamp,
                }
              : notification,
          ),
        );
      } catch (markError) {
        console.error("[NotificationDropdown] mark read error", markError);
      }
    },
    [authLoading, user],
  );

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications, user?.id]);

  useEffect(() => {
    if (authLoading || !user) {
      return;
    }
    if (!isOpen) {
      return;
    }
    const unreadIds = notifications
      .filter((notification) => !notification.readAt)
      .map((notification) => notification.id);

    if (unreadIds.length === 0) {
      return;
    }

    void markNotificationsAsRead(unreadIds);
  }, [isOpen, notifications, markNotificationsAsRead, authLoading, user]);

  const handleToggle = () => {
    const nextIsOpen = !isOpen;
    setIsOpen(nextIsOpen);
    if (nextIsOpen) {
      void fetchNotifications();
    }
  };

  const handleInviteAction = useCallback(
    async (notification: NotificationItem, action: "accept" | "reject") => {
      if (authLoading || !user) {
        return;
      }

      if (!notification.invite) {
        return;
      }

      try {
        setRespondingId(notification.id);
        setError(null);

        const response = await fetch(
          `/api/consultant/invitations/${notification.invite.id}/respond`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            credentials: "include",
            body: JSON.stringify({
              action,
              notificationId: notification.id,
            }),
          },
        );

        const body = (await response.json().catch(() => null)) as
          | {
              invitation?: { status?: InviteStatus; respondedAt?: string | null };
              error?: string;
            }
          | null;

        if (!response.ok) {
          throw new Error(
            body?.error ?? "Não foi possível registrar a resposta.",
          );
        }

        const nextStatus =
          body?.invitation?.status ??
          (action === "accept" ? "accepted" : "rejected");

        const readTimestamp = new Date().toISOString();

        setNotifications((previous) =>
          previous.map((item) =>
            item.id === notification.id
              ? {
                  ...item,
                  readAt: readTimestamp,
                  invite: item.invite
                    ? { ...item.invite, status: nextStatus }
                    : item.invite,
                }
              : item,
          ),
        );
      } catch (inviteError) {
        console.error("[NotificationDropdown] respond error", inviteError);
        setError(
          inviteError instanceof Error
            ? inviteError.message
            : "Não foi possível concluir a ação.",
        );
      } finally {
        setRespondingId(null);
      }
    },
    [authLoading, user],
  );

  const renderInviteActions = (notification: NotificationItem) => {
    if (!notification.invite || notification.invite.status !== "pending") {
      return null;
    }

    const isProcessing = respondingId === notification.id;

    return (
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void handleInviteAction(notification, "accept")}
          disabled={isProcessing}
          className="inline-flex flex-1 items-center justify-center rounded-lg border border-success-500 bg-success-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-success-600 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Aceitar convite de consultoria"
        >
          {isProcessing ? "Processando..." : "Aceitar"}
        </button>
        <button
          type="button"
          onClick={() => void handleInviteAction(notification, "reject")}
          disabled={isProcessing}
          className="inline-flex flex-1 items-center justify-center rounded-lg border border-error-500 bg-white px-3 py-1.5 text-xs font-semibold text-error-500 transition hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-error-400 dark:bg-transparent dark:text-error-300 dark:hover:bg-error-500/10"
          aria-label="Recusar convite de consultoria"
        >
          {isProcessing ? "Processando..." : "Recusar"}
        </button>
      </div>
    );
  };

  return (
    <div className="relative">
      <button
        type="button"
        className="dropdown-toggle relative flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        onClick={handleToggle}
        aria-label="Abrir notificações"
      >
        {hasUnread ? (
          <span className="absolute right-0 top-0.5 z-10 flex h-2 w-2 rounded-full bg-brand-500" />
        ) : null}
        <svg
          className="h-5 w-5 fill-current"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M10.75 2.29248C10.75 1.87827 10.4143 1.54248 10 1.54248C9.58583 1.54248 9.25004 1.87827 9.25004 2.29248V2.83613C6.08266 3.20733 3.62504 5.9004 3.62504 9.16748V14.4591H3.33337C2.91916 14.4591 2.58337 14.7949 2.58337 15.2091C2.58337 15.6234 2.91916 15.9591 3.33337 15.9591H4.37504H15.625H16.6667C17.0809 15.9591 17.4167 15.6234 17.4167 15.2091C17.4167 14.7949 17.0809 14.4591 16.6667 14.4591H16.375V9.16748C16.375 5.9004 13.9174 3.20733 10.75 2.83613V2.29248ZM14.875 14.4591V9.16748C14.875 6.47509 12.6924 4.29248 10 4.29248C7.30765 4.29248 5.12504 6.47509 5.12504 9.16748V14.4591H14.875ZM8.00004 17.7085C8.00004 18.1228 8.33583 18.4585 8.75004 18.4585H11.25C11.6643 18.4585 12 18.1228 12 17.7085C12 17.2943 11.6643 16.9585 11.25 16.9585H8.75004C8.33583 16.9585 8.00004 17.2943 8.00004 17.7085Z"
          />
        </svg>
        {hasUnread ? (
          <span className="sr-only">
            {unreadCount === 1
              ? "Você tem uma notificação não lida"
              : `Você tem ${unreadCount} notificações não lidas`}
          </span>
        ) : null}
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        className="absolute -right-[240px] mt-[17px] flex h-[480px] w-[350px] flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark sm:w-[361px] lg:right-0"
      >
        <div className="mb-3 flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-700">
          <div className="flex flex-col">
            <h5 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              Notificações
            </h5>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Atualize suas pendências rapidamente
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="dropdown-toggle text-gray-500 transition hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label="Fechar notificações"
          >
            <svg
              className="h-5 w-5 fill-current"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M6.21967 7.28131C5.92678 6.98841 5.92678 6.51354 6.21967 6.22065C6.51256 5.92775 6.98744 5.92775 7.28033 6.22065L11.999 10.9393L16.7176 6.22078C17.0105 5.92789 17.4854 5.92788 17.7782 6.22078C18.0711 6.51367 18.0711 6.98855 17.7782 7.28144L13.0597 12L17.7782 16.7186C18.0711 17.0115 18.0711 17.4863 17.7782 17.7792C17.4854 18.0721 17.0105 18.0721 16.7176 17.7792L11.999 13.0607L7.28033 17.7794C6.98744 18.0722 6.51256 18.0722 6.21967 17.7794C5.92678 17.4865 5.92678 17.0116 6.21967 16.7187L10.9384 12L6.21967 7.28131Z"
              />
            </svg>
          </button>
        </div>

        {error ? (
          <div className="mb-3 rounded-lg border border-error-400 bg-error-50 px-3 py-2 text-xs text-error-600 dark:border-error-500/40 dark:bg-error-500/10 dark:text-error-200">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-transparent dark:border-gray-600 dark:border-t-transparent" />
              <span>Carregando notificações...</span>
            </div>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-gray-200 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            Você está em dia! Nenhuma notificação no momento.
          </div>
        ) : (
          <ul className="custom-scrollbar flex flex-1 flex-col gap-2 overflow-y-auto">
            {notifications.map((notification) => (
              <li
                key={notification.id}
                className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm transition hover:border-gray-200 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-gray-700"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                      {notification.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {notification.message}
                    </p>
                  </div>
                  {!notification.readAt ? (
                    <span
                      className="mt-1 inline-flex h-2 w-2 rounded-full bg-brand-500"
                      aria-hidden="true"
                    />
                  ) : null}
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  <span>{formatDateTime(notification.createdAt)}</span>
                  {notification.invite ? (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-white/10 dark:text-gray-300">
                      {getInviteStatusLabel(notification.invite.status)}
                    </span>
                  ) : null}
                </div>
                {renderInviteActions(notification)}
              </li>
            ))}
          </ul>
        )}

        <Link
          href="/"
          className="mt-3 inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Ver todas as notificações
        </Link>
      </Dropdown>
    </div>
  );
};

export default NotificationDropdown;

