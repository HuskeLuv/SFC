'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import { ThemeToggleButton } from '@/components/common/ThemeToggleButton';
import InstallAppCard from '@/components/pwa/InstallAppCard';
import { useAuth } from '@/hooks/useAuth';
import {
  ABRIR_NOTIFICACOES_EVENT,
  PERFIL_NOTIFICACOES_HREF,
  pushAtivoNesteAparelho,
} from '@/lib/pwa/pushClient';
import { groupMoreItems, useMainNavItems } from '@/layout/navigation';
import { SELO_NOVO } from '@/constants/analiseAtivosVisual';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';

/**
 * Estado do painel Mais compartilhado entre a aba Mais (MobileTabBar) e o avatar do cabeçalho
 * (MobileHeader). Store mínimo em módulo para não precisar de contexto novo.
 */
type MoreSheetState = { open: boolean; section: 'conta' | null };

let state: MoreSheetState = { open: false, section: null };
const listeners = new Set<() => void>();

function setState(next: MoreSheetState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export function openMoreSheet(section: 'conta' | null = null) {
  setState({ open: true, section });
}

export function closeMoreSheet() {
  if (state.open) setState({ open: false, section: null });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => state;
const SERVER_STATE: MoreSheetState = { open: false, section: null };
const getServerSnapshot = () => SERVER_STATE;

export function useMoreSheetState(): MoreSheetState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

type AvatarUser = { name?: string | null; avatarUrl?: string | null } | null | undefined;

/** Iniciais (até 2) do nome, para o avatar sem foto. */
export function getInitials(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Avatar de 32px: foto do perfil ou iniciais sobre segurança (#314666). */
export function UserAvatar({ user }: { user: AvatarUser }) {
  if (user?.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatarUrl}
        alt=""
        width={32}
        height={32}
        referrerPolicy="no-referrer"
        className="h-8 w-8 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mf-seguranca text-sm font-semibold tracking-[0.02em] text-white"
    >
      {getInitials(user?.name)}
    </span>
  );
}

const isActivePath = (pathname: string | null, path?: string) =>
  Boolean(pathname && path && (pathname === path || pathname.startsWith(`${path}/`)));

function LogoutIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5h-15zM10 20.5a2 2 0 0 0 4 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Atalho "Notificações no celular" (só leitura do estado; a ativação em si — e o pedido de
 * permissão — continua no Perfil › Notificações, em resposta ao toque em "Ativar notificações").
 */
function NotificacoesRow({ open, className }: { open: boolean; className: string }) {
  // null = ainda não sabe (sem selo); true/false depois da leitura.
  const [ativo, setAtivo] = useState<boolean | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    void pushAtivoNesteAparelho().then((v) => {
      if (!cancelado) setAtivo(v);
    });
    return () => {
      cancelado = true;
    };
  }, [open]);

  return (
    <Link
      href={PERFIL_NOTIFICACOES_HREF}
      onClick={() => {
        closeMoreSheet();
        // Já no Perfil, a navegação não remonta a página: o evento abre o sheet.
        window.dispatchEvent(new Event(ABRIR_NOTIFICACOES_EVENT));
      }}
      data-more-notificacoes={ativo === null ? undefined : ativo ? 'ativas' : 'desligadas'}
      className={`${className} py-2 active:bg-gray-100 dark:active:bg-white/5`}
    >
      <span className="text-gray-500 dark:text-gray-400">
        <BellIcon />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block">Notificações no celular</span>
        <span className="block text-[13px] font-normal text-gray-500 dark:text-gray-400">
          Lembretes e avisos mesmo com o app fechado
        </span>
      </span>
      {ativo === false ? (
        <span className="shrink-0 rounded-full bg-mf-outside/10 px-2.5 py-1 text-xs font-semibold text-mf-patrimonio dark:bg-mf-tranquilidade/15 dark:text-mf-tranquilidade">
          Ativar
        </span>
      ) : ativo ? (
        <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">Ligadas</span>
      ) : null}
    </Link>
  );
}

/**
 * Painel Mais (bottom sheet): seções do menu que não viraram aba, agrupadas, e a seção Conta
 * (perfil, tema, notificações no celular, instalar app, sair). Mesmos itens da sidebar via
 * useMainNavItems().
 */
export default function MoreSheet() {
  const { open, section } = useMoreSheetState();
  const pathname = usePathname();
  const items = useMainNavItems();
  const { user, logout } = useAuth();
  const contaRef = useRef<HTMLHeadingElement>(null);
  const lastPathname = useRef(pathname);

  // Fecha ao navegar.
  useEffect(() => {
    if (lastPathname.current !== pathname) {
      lastPathname.current = pathname;
      closeMoreSheet();
    }
  }, [pathname]);

  // Aberto pelo avatar: rola até a seção Conta.
  useEffect(() => {
    if (!open || section !== 'conta') return;
    const id = window.setTimeout(() => {
      contaRef.current?.scrollIntoView({ block: 'start' });
    }, 40);
    return () => window.clearTimeout(id);
  }, [open, section]);

  const groups = groupMoreItems(items);
  const perfilItem = items.find((item) => item.name === 'Perfil');
  const displayName = user?.name?.trim() || 'Usuário';

  const groupTitle =
    'mx-1 mt-3.5 mb-1.5 text-xs font-semibold tracking-[0.06em] text-gray-500 uppercase dark:text-gray-400';
  const row =
    'flex min-h-12 w-full items-center gap-3 border-b border-gray-100 px-1 text-left font-medium text-gray-800 dark:border-gray-800 dark:text-white/90';

  const identity = (
    <>
      <UserAvatar user={user} />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{displayName}</span>
        {user?.email ? (
          <span className="block truncate text-[13px] font-normal text-gray-500 dark:text-gray-400">
            {user.email}
          </span>
        ) : null}
      </span>
    </>
  );

  return (
    <BottomSheet isOpen={open} onClose={closeMoreSheet} title="Mais">
      {groups.map((group) => (
        <div key={group.label}>
          <h3 className={groupTitle}>{group.label}</h3>
          <ul className="grid grid-cols-3 gap-2">
            {group.items.map((item) => {
              const active = isActivePath(pathname, item.path);
              return (
                <li key={item.name}>
                  <Link
                    href={item.path ?? '/'}
                    onClick={closeMoreSheet}
                    aria-current={active ? 'page' : undefined}
                    className={`relative flex min-h-[76px] flex-col items-center justify-center gap-1 rounded-2xl border border-gray-100 bg-gray-50 px-1 py-2 text-center text-xs leading-tight font-medium active:bg-gray-100 dark:border-gray-800 dark:bg-white/[0.03] dark:active:bg-white/5 ${
                      active
                        ? 'text-mf-patrimonio dark:text-mf-tranquilidade'
                        : 'text-gray-700 dark:text-gray-200'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-mf-outside/10 text-mf-outside dark:bg-mf-tranquilidade/15 dark:text-mf-tranquilidade [&_svg]:h-[22px] [&_svg]:w-[22px]"
                    >
                      {item.icon}
                    </span>
                    {item.name}
                    {item.novo ? (
                      <span
                        className={`absolute top-1.5 right-1.5 rounded-full px-1.5 py-px text-[10px] leading-4 font-semibold tracking-[0.04em] ${SELO_NOVO}`}
                      >
                        {TEXTOS_TELA.menu.novo}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <h3 ref={contaRef} className={`${groupTitle} scroll-mt-2`}>
        Conta
      </h3>
      <div className="mb-1">
        {perfilItem?.path ? (
          <Link
            href={perfilItem.path}
            onClick={closeMoreSheet}
            aria-current={isActivePath(pathname, perfilItem.path) ? 'page' : undefined}
            className={`${row} py-2 active:bg-gray-100 dark:active:bg-white/5`}
          >
            {identity}
          </Link>
        ) : (
          <div className={`${row} py-2`}>{identity}</div>
        )}
        <div className={row}>
          <span className="text-gray-500 dark:text-gray-400">
            <MoonIcon />
          </span>
          <span className="flex-1">Modo escuro</span>
          <ThemeToggleButton />
        </div>
        <NotificacoesRow open={open} className={row} />
        <InstallAppCard variant="row" />
        <button
          type="button"
          onClick={() => {
            closeMoreSheet();
            void logout();
          }}
          className="flex min-h-12 w-full items-center gap-3 px-1 text-left font-medium text-red-600 active:bg-gray-100 dark:text-red-400 dark:active:bg-white/5"
        >
          <LogoutIcon />
          Sair
        </button>
      </div>
    </BottomSheet>
  );
}
