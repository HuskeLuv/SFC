'use client';

import React, { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePluggyConfig } from '@/hooks/useConexoesBancarias';
import { useComunidadeConfig } from '@/hooks/useComunidade';
import {
  CalenderIcon,
  CreditCardIcon,
  DollarLineIcon,
  GridIcon,
  PencilIcon,
  PieChartIcon,
  TableIcon,
  TimeIcon,
  UserCircleIcon,
  DocsIcon,
  VideoIcon,
  LockIcon,
  PlugInIcon,
  GroupIcon,
} from '../icons/index';

/**
 * Navegação principal compartilhada (PWA fase 0): a AppSidebar (desktop), a barra de abas, o
 * painel Mais e o cabeçalho mobile leem a MESMA lista, para os filtros por perfil/flag nunca
 * divergirem entre as telas.
 */
export type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  subItems?: { name: string; path: string; pro?: boolean; new?: boolean }[];
};

export const MAIN_NAV_ITEMS: NavItem[] = [
  {
    icon: <GridIcon />,
    name: 'Dashboard',
    path: '/carteira',
  },
  {
    icon: <DollarLineIcon />,
    name: 'Carteira',
    path: '/carteira',
  },
  {
    name: 'Fluxo de Caixa',
    icon: <TableIcon />,
    path: '/fluxodecaixa',
  },
  {
    name: 'Planejamento',
    icon: <PencilIcon />,
    path: '/planejamento-financeiro',
  },
  {
    name: 'Saúde Financeira',
    icon: <PieChartIcon />,
    path: '/saude-financeira',
  },
  {
    name: 'Dívidas',
    icon: <CreditCardIcon />,
    path: '/dividas',
  },
  {
    icon: <CalenderIcon />,
    name: 'Agenda',
    path: '/calendario',
  },
  {
    icon: <UserCircleIcon />,
    name: 'Perfil',
    path: '/profile',
  },
  {
    icon: <TimeIcon />,
    name: 'Histórico',
    path: '/historico-alteracoes',
  },
  {
    icon: <DocsIcon />,
    name: 'Relatórios',
    path: '/relatorios',
  },
  {
    icon: <VideoIcon />,
    name: 'Educação',
    path: '/educacao',
  },
];

const PLUGGY_ITEM: NavItem = {
  icon: <PlugInIcon />,
  name: 'Conexões bancárias',
  path: '/conexoes-bancarias',
};
const COMUNIDADE_ITEM: NavItem = { icon: <GroupIcon />, name: 'Comunidade', path: '/comunidade' };
const ADMIN_ITEM: NavItem = { icon: <LockIcon />, name: 'Administração', path: '/admin' };

/** Itens que o consultor vê quando está personificando um cliente. */
export const ACTING_ALLOWED_ITEMS = [
  'Dashboard',
  'Fluxo de Caixa',
  'Carteira',
  'Relatórios',
  'Planejamento',
  // Dívidas são parte central do trabalho do consultor no cliente
  'Dívidas',
  // Diagnóstico de saúde financeira é o caso de uso original do consultor
  'Saúde Financeira',
  // Consultor vê o histórico do cliente (inclui a própria trilha "via consultor")
  'Histórico',
];

export interface BuildNavOptions {
  role?: 'user' | 'consultant' | 'admin' | null;
  isActing: boolean;
  pluggyHabilitado: boolean;
  comunidadeHabilitada: boolean;
}

/** Versão pura do filtro do menu (a lógica que antes vivia no useMemo da AppSidebar). */
export function buildMainNavItems({
  role,
  isActing,
  pluggyHabilitado,
  comunidadeHabilitada,
}: BuildNavOptions): NavItem[] {
  const dashboardPath = role === 'consultant' && !isActing ? '/dashboard/consultor' : '/carteira';

  let items = MAIN_NAV_ITEMS.map((item) =>
    item.name === 'Dashboard'
      ? {
          ...item,
          path: dashboardPath,
        }
      : item,
  );

  if (role !== 'consultant') {
    items = items.filter((item) => item.name !== 'Dashboard');
  }

  // Integração bancária (14/09/2026): entra logo após Dívidas; fora da lista
  // do consultor personificado de propósito (extrato só do próprio cliente).
  if (pluggyHabilitado) {
    const idx = items.findIndex((item) => item.name === 'Dívidas');
    items =
      idx >= 0
        ? [...items.slice(0, idx + 1), PLUGGY_ITEM, ...items.slice(idx + 1)]
        : [...items, PLUGGY_ITEM];
  }

  // Comunidade (23/09/2026): atrás de COMUNIDADE_HABILITADA até liberar em prod.
  if (comunidadeHabilitada) {
    items = [...items, COMUNIDADE_ITEM];
  }

  // Painel administrativo (11/09/2026): só role admin vê o item.
  if (role === 'admin') {
    items = [...items, ADMIN_ITEM];
  }

  // Se estiver personificado, mostrar apenas os itens permitidos ao consultor.
  if (isActing) {
    items = items.filter((item) => ACTING_ALLOWED_ITEMS.includes(item.name));
  }

  return items;
}

/** Itens do menu principal para o usuário atual (perfil, personificação e flags). */
export function useMainNavItems(): NavItem[] {
  const { user, actingClient } = useAuth();
  // Conexões bancárias (Pluggy): item só aparece com a integração ligada no servidor.
  const pluggyHabilitado = usePluggyConfig().data?.habilitado === true;
  const comunidadeHabilitada = useComunidadeConfig().data?.habilitada === true;
  const role = user?.role ?? null;
  const isActing = Boolean(actingClient);

  return useMemo(
    () => buildMainNavItems({ role, isActing, pluggyHabilitado, comunidadeHabilitada }),
    [role, isActing, pluggyHabilitado, comunidadeHabilitada],
  );
}

/** Itens que viram abas na barra mobile (os demais vão para o painel Mais). */
export const TAB_ITEM_NAMES = {
  carteira: 'Carteira',
  fluxo: 'Fluxo de Caixa',
  planejamento: 'Planejamento',
} as const;

/** Itens que moram na seção Conta do painel Mais, e não na grade. */
export const ACCOUNT_ITEM_NAMES = ['Perfil'];

export type MoreGroupLabel = 'Finanças' | 'Organização' | 'Aprender e conversar';

export const MORE_GROUPS: { label: MoreGroupLabel; names: string[] }[] = [
  { label: 'Finanças', names: ['Saúde Financeira', 'Dívidas', 'Conexões bancárias'] },
  { label: 'Organização', names: ['Agenda', 'Relatórios', 'Histórico'] },
  { label: 'Aprender e conversar', names: ['Educação', 'Comunidade', 'Administração'] },
];

const TAB_NAMES: string[] = Object.values(TAB_ITEM_NAMES);

/** Itens do menu que aparecem na grade do painel Mais (nem aba, nem Conta). */
export function getMoreItems(items: NavItem[]): NavItem[] {
  return items.filter(
    (item) => !TAB_NAMES.includes(item.name) && !ACCOUNT_ITEM_NAMES.includes(item.name),
  );
}

/**
 * Agrupa os itens do Mais conforme MORE_GROUPS. O que não estiver em nenhum grupo (ex.: o
 * Dashboard do consultor) cai em "Outros", no fim. Grupos vazios não aparecem.
 */
export function groupMoreItems(items: NavItem[]): { label: string; items: NavItem[] }[] {
  const moreItems = getMoreItems(items);
  const grouped = MORE_GROUPS.map((group) => ({
    label: group.label as string,
    items: group.names
      .map((name) => moreItems.find((item) => item.name === name))
      .filter((item): item is NavItem => Boolean(item)),
  }));
  const known = new Set(MORE_GROUPS.flatMap((group) => group.names));
  const outros = moreItems.filter((item) => !known.has(item.name));
  return [...grouped, { label: 'Outros', items: outros }].filter((group) => group.items.length > 0);
}

const EXTRA_TITLES: { prefix: string; title: string }[] = [
  { prefix: '/ativos', title: 'Ativo' },
  { prefix: '/dashboard/consultor', title: 'Painel do consultor' },
  { prefix: '/consultor', title: 'Consultor' },
  { prefix: '/comunidade', title: 'Comunidade' },
  { prefix: '/admin', title: 'Administração' },
  { prefix: '/profile', title: 'Perfil' },
];

const matchesPrefix = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

/** Título curto da página para o cabeçalho mobile (maior prefixo casado). */
export function getMobilePageTitle(pathname: string | null | undefined): string {
  if (!pathname) return 'My Finance';
  const candidates: { prefix: string; title: string }[] = [
    ...[...MAIN_NAV_ITEMS, PLUGGY_ITEM, COMUNIDADE_ITEM, ADMIN_ITEM]
      .filter((item) => item.name !== 'Dashboard' && item.path)
      .map((item) => ({ prefix: item.path as string, title: item.name })),
    ...EXTRA_TITLES,
  ];
  let best: { prefix: string; title: string } | null = null;
  for (const candidate of candidates) {
    if (!matchesPrefix(pathname, candidate.prefix)) continue;
    if (!best || candidate.prefix.length > best.prefix.length) best = candidate;
  }
  return best?.title ?? 'My Finance';
}

/** Rota de detalhe (mostra "voltar" no cabeçalho em vez do logo). */
export function isNestedRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2) return false;
  return pathname !== '/dashboard/consultor';
}

export type MobileTab = 'carteira' | 'fluxo' | 'planejamento' | 'mais';

/** Aba ativa da barra mobile para a rota atual. */
export function getActiveTab(
  pathname: string | null | undefined,
  items: NavItem[],
): MobileTab | null {
  if (!pathname) return null;
  if (matchesPrefix(pathname, '/carteira') || matchesPrefix(pathname, '/ativos')) {
    return 'carteira';
  }
  if (matchesPrefix(pathname, '/fluxodecaixa')) return 'fluxo';
  if (matchesPrefix(pathname, '/planejamento-financeiro')) return 'planejamento';
  const inMore = items.some(
    (item) =>
      item.path &&
      !TAB_NAMES.includes(item.name) &&
      item.path !== '/carteira' &&
      matchesPrefix(pathname, item.path),
  );
  if (inMore) return 'mais';
  return null;
}
