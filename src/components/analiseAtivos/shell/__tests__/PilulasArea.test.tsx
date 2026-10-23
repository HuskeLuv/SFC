// @vitest-environment jsdom
/**
 * Bloco 1, fatia C: casca declarativa das pílulas (Quadro | Comparador | [Ranking reservado] |
 * Salvos) e "Criar lista" na casca. Sem o recurso de cada item, ele some; sem nenhum além do
 * Quadro, nada aparece. A classe da URL vai junto. Sem contagem na pílula. "Criar lista" só nas
 * variantes quadro/comparador/salvos, com recursos.salvos; no modo consultor, desabilitado.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const cfg = vi.hoisted(() => ({ data: undefined as unknown }));
const auth = vi.hoisted(() => ({ actingClient: null as null | { id: string; name: string } }));
const nav = vi.hoisted(() => ({ params: new URLSearchParams(), push: vi.fn() }));

vi.mock('@/hooks/useAnaliseAtivos', () => ({
  useAnaliseAtivosConfig: () => cfg,
  useAtivoTopo: () => ({ data: undefined }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/useAnaliseAtivosSalvos', () => ({
  useListas: () => ({ data: undefined }),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => nav.params,
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
  usePathname: () => '/analise-ativos',
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/analiseAtivos/busca/BuscaAtivos', () => ({
  default: () => <div data-testid="busca" />,
}));
vi.mock('@/components/analiseAtivos/shell/BannerNovidade', () => ({ default: () => null }));
vi.mock('@/components/analiseAtivos/salvos/compartilhados/ModalNomeLista', () => ({
  default: (p: { aberto: boolean }) => (p.aberto ? <div role="dialog" aria-label="Criar" /> : null),
}));

import PilulasArea, {
  ITENS_PILULAS_AREA,
  pilulasVisiveis,
} from '@/components/analiseAtivos/shell/PilulasArea';
import AnaliseAtivosShell from '@/components/analiseAtivos/shell/AnaliseAtivosShell';
import { esperarDomLimpo } from '@/test/utils/varrerDom';

const recursos = (r: Partial<Record<'comparador' | 'salvos' | 'alertas', boolean>>) => ({
  habilitada: true,
  recursos: {
    raioX: false,
    cenarios: false,
    comparador: false,
    salvos: false,
    alertas: false,
    pdfComparador: false,
    ...r,
  },
});

afterEach(() => {
  cleanup();
  cfg.data = undefined;
  auth.actingClient = null;
  nav.params = new URLSearchParams();
  nav.push.mockReset();
});

function nomesPilulas() {
  const nav = screen.getByRole('navigation', { name: 'Páginas da Análise de Ativos' });
  return within(nav)
    .getAllByRole('link')
    .map((l) => l.textContent);
}

describe('PilulasArea — lista declarativa', () => {
  it('a ordem da spec com o Ranking reservado sem rótulo e sem recurso', () => {
    expect(ITENS_PILULAS_AREA.map((i) => i.id)).toEqual([
      'quadro',
      'comparador',
      'ranking',
      'salvos',
    ]);
    const ranking = ITENS_PILULAS_AREA.find((i) => i.id === 'ranking')!;
    expect(ranking.rotulo).toBeNull();
    expect(ranking.liberado({ comparador: true, salvos: true } as never)).toBe(false);
    expect(pilulasVisiveis({ comparador: true, salvos: true } as never).map((i) => i.id)).toEqual([
      'quadro',
      'comparador',
      'salvos',
    ]);
  });

  it('sem nenhum recurso além do Quadro: nada', () => {
    for (const c of [undefined, recursos({}), { habilitada: true }]) {
      cfg.data = c;
      const { container, unmount } = render(<PilulasArea ativa="quadro" />);
      expect(container.innerHTML).toBe('');
      unmount();
    }
  });

  it('com salvos e sem comparador: Quadro | Salvos', () => {
    cfg.data = recursos({ salvos: true });
    render(<PilulasArea ativa="salvos" />);
    expect(nomesPilulas()).toEqual(['Quadro', 'Salvos']);
    expect(screen.getByRole('link', { name: 'Salvos' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Salvos' })).toHaveAttribute(
      'href',
      '/analise-ativos/salvos',
    );
  });

  it('com comparador e sem salvos: Quadro | Comparador', () => {
    cfg.data = recursos({ comparador: true });
    render(<PilulasArea ativa="quadro" />);
    expect(nomesPilulas()).toEqual(['Quadro', 'Comparador']);
  });

  it('com os dois: Quadro, Comparador, Salvos; 44px; sem contagem na pílula', () => {
    cfg.data = recursos({ comparador: true, salvos: true, alertas: true });
    const { container } = render(<PilulasArea ativa="quadro" />);
    expect(nomesPilulas()).toEqual(['Quadro', 'Comparador', 'Salvos']);
    for (const l of screen.getAllByRole('link')) {
      expect(l.className).toContain('min-h-11');
      expect(l.textContent).not.toMatch(/\d/);
    }
    esperarDomLimpo(container);
  });

  it('leva ?classe=fii para Quadro e Salvos (o Comparador deduz a classe dos tickers)', () => {
    cfg.data = recursos({ comparador: true, salvos: true });
    nav.params = new URLSearchParams('classe=fii&ordem=dy12m');
    render(<PilulasArea ativa="quadro" />);
    expect(screen.getByRole('link', { name: 'Quadro' })).toHaveAttribute(
      'href',
      '/analise-ativos?classe=fii',
    );
    expect(screen.getByRole('link', { name: 'Salvos' })).toHaveAttribute(
      'href',
      '/analise-ativos/salvos?classe=fii',
    );
    expect(screen.getByRole('link', { name: 'Comparador' })).toHaveAttribute(
      'href',
      '/analise-ativos/comparador',
    );
  });
});

describe('Casca — Criar lista', () => {
  it('sem recursos.salvos: nenhum "Criar lista" em nenhuma variante', () => {
    cfg.data = recursos({ comparador: true });
    for (const v of ['quadro', 'comparador', 'ativo'] as const) {
      const { unmount } = render(
        <AnaliseAtivosShell variante={v}>
          <p>conteúdo</p>
        </AnaliseAtivosShell>,
      );
      expect(screen.queryByRole('button', { name: 'Criar lista' })).toBeNull();
      unmount();
    }
  });

  it('com salvos: aparece no Quadro, no Comparador e em Salvos; não na página do ativo', () => {
    cfg.data = recursos({ comparador: true, salvos: true });
    for (const v of ['quadro', 'comparador', 'salvos'] as const) {
      const { unmount } = render(
        <AnaliseAtivosShell variante={v}>
          <p>conteúdo</p>
        </AnaliseAtivosShell>,
      );
      // um no celular (ao lado do título) e um no computador (ao lado da busca)
      expect(screen.getAllByRole('button', { name: 'Criar lista' }).length).toBeGreaterThan(0);
      unmount();
    }
    render(
      <AnaliseAtivosShell variante="ativo">
        <p>conteúdo</p>
      </AnaliseAtivosShell>,
    );
    expect(screen.queryByRole('button', { name: 'Criar lista' })).toBeNull();
  });

  it('variante salvos: pílula Salvos atual', () => {
    cfg.data = recursos({ salvos: true });
    render(
      <AnaliseAtivosShell variante="salvos">
        <p>conteúdo</p>
      </AnaliseAtivosShell>,
    );
    expect(screen.getByRole('link', { name: 'Salvos' })).toHaveAttribute('aria-current', 'page');
  });

  it('abre o modal de criar', () => {
    cfg.data = recursos({ salvos: true });
    render(
      <AnaliseAtivosShell variante="quadro">
        <p>conteúdo</p>
      </AnaliseAtivosShell>,
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Criar lista' })[0]);
    expect(screen.getByRole('dialog', { name: 'Criar' })).toBeInTheDocument();
  });

  it('modo consultor: desabilitado com o texto das listas pessoais', () => {
    cfg.data = recursos({ salvos: true });
    auth.actingClient = { id: 'c1', name: 'Ana' };
    render(
      <AnaliseAtivosShell variante="quadro">
        <p>conteúdo</p>
      </AnaliseAtivosShell>,
    );
    for (const b of screen.getAllByRole('button', { name: 'Criar lista' })) {
      expect(b).toBeDisabled();
      expect(b).toHaveAttribute(
        'title',
        'As listas são pessoais e não aparecem no modo consultor.',
      );
    }
  });
});
