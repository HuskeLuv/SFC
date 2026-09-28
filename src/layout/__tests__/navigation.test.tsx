// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  auth: {
    user: { id: 'u1', role: 'user' } as { id: string; role: string } | null,
    actingClient: null as null | { id: string; name: string; email: string },
  },
  pluggy: false,
  comunidade: false,
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/hooks/useConexoesBancarias', () => ({
  usePluggyConfig: () => ({ data: { habilitado: mocks.pluggy } }),
}));
vi.mock('@/hooks/useComunidade', () => ({
  useComunidadeConfig: () => ({ data: { habilitada: mocks.comunidade } }),
}));
vi.mock('../../icons/index', () => {
  const Icon = () => null;
  const names = [
    'CalenderIcon',
    'CreditCardIcon',
    'DollarLineIcon',
    'GridIcon',
    'PencilIcon',
    'PieChartIcon',
    'TableIcon',
    'TimeIcon',
    'UserCircleIcon',
    'DocsIcon',
    'VideoIcon',
    'LockIcon',
    'PlugInIcon',
    'GroupIcon',
  ];
  return Object.fromEntries(names.map((name) => [name, Icon]));
});

import {
  buildMainNavItems,
  getActiveTab,
  getMobilePageTitle,
  getMoreItems,
  groupMoreItems,
  isNestedRoute,
  MORE_GROUPS,
  useMainNavItems,
} from '../navigation';

const names = (items: { name: string }[]) => items.map((item) => item.name);

beforeEach(() => {
  mocks.auth.user = { id: 'u1', role: 'user' };
  mocks.auth.actingClient = null;
  mocks.pluggy = false;
  mocks.comunidade = false;
});

describe('useMainNavItems', () => {
  it('usuário comum: sem Dashboard e sem Administração', () => {
    const { result } = renderHook(() => useMainNavItems());
    expect(names(result.current)).toEqual([
      'Carteira',
      'Fluxo de Caixa',
      'Planejamento',
      'Saúde Financeira',
      'Dívidas',
      'Agenda',
      'Perfil',
      'Histórico',
      'Relatórios',
      'Educação',
    ]);
  });

  it('Pluggy ligado: Conexões bancárias logo depois de Dívidas', () => {
    mocks.pluggy = true;
    const { result } = renderHook(() => useMainNavItems());
    const list = names(result.current);
    expect(list[list.indexOf('Dívidas') + 1]).toBe('Conexões bancárias');
  });

  it('Comunidade só com a flag', () => {
    expect(names(renderHook(() => useMainNavItems()).result.current)).not.toContain('Comunidade');
    mocks.comunidade = true;
    expect(names(renderHook(() => useMainNavItems()).result.current)).toContain('Comunidade');
  });

  it('admin vê Administração', () => {
    mocks.auth.user = { id: 'a1', role: 'admin' };
    const { result } = renderHook(() => useMainNavItems());
    expect(names(result.current)).toContain('Administração');
    expect(names(result.current)).not.toContain('Dashboard');
  });

  it('consultor sem personificação: Dashboard aponta para /dashboard/consultor', () => {
    mocks.auth.user = { id: 'c1', role: 'consultant' };
    const { result } = renderHook(() => useMainNavItems());
    const dashboard = result.current.find((item) => item.name === 'Dashboard');
    expect(dashboard?.path).toBe('/dashboard/consultor');
  });

  it('personificação: só os itens permitidos, Dashboard volta para /carteira', () => {
    mocks.auth.user = { id: 'c1', role: 'consultant' };
    mocks.auth.actingClient = { id: 'x', name: 'Maria', email: 'm@x' };
    mocks.pluggy = true;
    mocks.comunidade = true;
    const { result } = renderHook(() => useMainNavItems());
    expect(names(result.current)).toEqual([
      'Dashboard',
      'Carteira',
      'Fluxo de Caixa',
      'Planejamento',
      'Saúde Financeira',
      'Dívidas',
      'Histórico',
      'Relatórios',
    ]);
    expect(result.current[0].path).toBe('/carteira');
  });
});

describe('painel Mais', () => {
  it('MORE_GROUPS cobre todos os itens que não são abas nem Conta (usuário com tudo ligado)', () => {
    const items = buildMainNavItems({
      role: 'admin',
      isActing: false,
      pluggyHabilitado: true,
      comunidadeHabilitada: true,
    });
    const grouped = new Set(MORE_GROUPS.flatMap((group) => group.names));
    for (const item of getMoreItems(items)) {
      expect(grouped.has(item.name)).toBe(true);
    }
    expect(names(getMoreItems(items))).not.toContain('Perfil');
    expect(names(getMoreItems(items))).not.toContain('Carteira');
  });

  it('itens fora dos grupos (Dashboard do consultor) caem em Outros; grupos vazios somem', () => {
    const items = buildMainNavItems({
      role: 'consultant',
      isActing: true,
      pluggyHabilitado: false,
      comunidadeHabilitada: false,
    });
    const groups = groupMoreItems(items);
    expect(groups.map((group) => group.label)).toEqual(['Finanças', 'Organização', 'Outros']);
    expect(names(groups[2].items)).toEqual(['Dashboard']);
  });
});

describe('getMobilePageTitle', () => {
  it.each([
    ['/carteira', 'Carteira'],
    ['/fluxodecaixa', 'Fluxo de Caixa'],
    ['/planejamento-financeiro', 'Planejamento'],
    ['/dividas', 'Dívidas'],
    ['/calendario', 'Agenda'],
    ['/ativos/abc', 'Ativo'],
    ['/ativos/abc/editar', 'Ativo'],
    ['/dashboard/consultor', 'Painel do consultor'],
    ['/dashboard/consultor/123', 'Painel do consultor'],
    ['/consultor/123', 'Consultor'],
    ['/comunidade/post-1', 'Comunidade'],
    ['/admin', 'Administração'],
    ['/profile', 'Perfil'],
    ['/conexoes-bancarias', 'Conexões bancárias'],
    ['/educacao/curso', 'Educação'],
    ['/nao-existe', 'My Finance'],
  ])('%s → %s', (pathname, title) => {
    expect(getMobilePageTitle(pathname)).toBe(title);
  });

  it('sem pathname → My Finance', () => {
    expect(getMobilePageTitle(null)).toBe('My Finance');
  });
});

describe('isNestedRoute', () => {
  it.each([
    ['/carteira', false],
    ['/dashboard/consultor', false],
    ['/ativos/abc', true],
    ['/comunidade/moderacao', true],
    ['/educacao/curso', true],
  ])('%s → %s', (pathname, nested) => {
    expect(isNestedRoute(pathname)).toBe(nested);
  });
});

describe('getActiveTab', () => {
  const items = buildMainNavItems({
    role: 'user',
    isActing: false,
    pluggyHabilitado: true,
    comunidadeHabilitada: false,
  });

  it.each([
    ['/carteira', 'carteira'],
    ['/ativos/abc', 'carteira'],
    ['/fluxodecaixa', 'fluxo'],
    ['/planejamento-financeiro', 'planejamento'],
    ['/dividas', 'mais'],
    ['/conexoes-bancarias', 'mais'],
    ['/profile', 'mais'],
    ['/comunidade', null],
    ['/signin', null],
  ])('%s → %s', (pathname, tab) => {
    expect(getActiveTab(pathname, items)).toBe(tab);
  });
});
