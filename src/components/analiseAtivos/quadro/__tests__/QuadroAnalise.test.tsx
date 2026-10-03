// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { QuadroResposta } from '@/types/analiseAtivosApi';

const nav = vi.hoisted(() => ({
  qs: '',
  replace: vi.fn(),
  push: vi.fn(),
}));
const quadro = vi.hoisted(() => ({
  estado: {} as Record<string, unknown>,
  ultimoFiltro: null as unknown,
}));
const media = vi.hoisted(() => ({ celular: false }));
const overlayVazio = vi.hoisted(() => ({ data: undefined }));
// bloco C: link "Meus relatos" (config.reporteHabilitado) e o selo de resposta nova
const relatos = vi.hoisted(() => ({
  config: { data: undefined as unknown },
  meus: { data: undefined as unknown },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push, prefetch: vi.fn() }),
  usePathname: () => '/analise-ativos',
  useSearchParams: () => new URLSearchParams(nav.qs),
}));
vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => media.celular }));
// dados estáveis (como os do React Query): o efeito da coluna Na carteira depende da referência
const abas = vi.hoisted(() => ({
  acoes: {
    data: {
      secoes: [
        {
          ativos: [
            { ticker: 'WEGE3', quantidade: 120, percentualCarteira: 3.8, objetivo: 10 },
            { ticker: 'ITUB4', quantidade: 0, percentualCarteira: 0, objetivo: 5, planejado: true },
          ],
        },
      ],
    },
  },
  fii: { data: { secoes: [] } },
}));
vi.mock('@/hooks/useAcoes', () => ({ useAcoes: () => abas.acoes }));
vi.mock('@/hooks/useFii', () => ({ useFii: () => abas.fii }));
vi.mock('@/hooks/useAnaliseAtivos', () => ({
  useQuadroAnalise: (filtros: unknown) => {
    quadro.ultimoFiltro = filtros;
    return quadro.estado;
  },
  useOverlayCarteira: () => overlayVazio,
  useAnaliseAtivosConfig: () => relatos.config,
  prefetchAtivoTopo: vi.fn(async () => undefined),
}));
vi.mock('@/components/analiseAtivos/reporte/useMeusReportes', () => ({
  useMeusReportes: () => relatos.meus,
}));

import QuadroAnalise from '../QuadroAnalise';
import {
  API_AURE3,
  API_ITUB4,
  API_TGMA3,
  API_WEGE3,
  QUADRO_ACOES,
} from '@/test/fixtures/analiseAtivos/respostas';

function pagina(over: Partial<QuadroResposta> = {}): QuadroResposta {
  return {
    ...QUADRO_ACOES,
    itens: [API_WEGE3, API_ITUB4, API_TGMA3, API_AURE3],
    total: 4,
    ...over,
  };
}

function estadoQuadro(over: Record<string, unknown> = {}) {
  quadro.estado = {
    data: { pages: [pagina()], pageParams: [0] },
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    ...over,
  };
}

function renderQuadro() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <QuadroAnalise />
    </QueryClientProvider>,
  );
}

const cabecalhos = () =>
  within(screen.getByRole('table'))
    .getAllByRole('columnheader')
    .map((th) => th.textContent?.replace(/[▲▼]/g, '').trim());

describe('QuadroAnalise', () => {
  beforeEach(() => {
    nav.qs = '';
    nav.replace.mockReset();
    nav.push.mockReset();
    media.celular = false;
    relatos.config = { data: undefined };
    relatos.meus = { data: undefined };
    estadoQuadro();
  });

  it('bloco C: link "Meus relatos" só com reporteHabilitado; selo quando há resposta nova', () => {
    const { unmount } = renderQuadro();
    expect(screen.queryByRole('link', { name: /Meus relatos/ })).toBeNull();
    unmount();

    relatos.config = { data: { habilitada: true, reporteHabilitado: true } };
    relatos.meus = {
      data: { pages: [{ itens: [{ id: 'r1', caso: { novo: true } }], proximoCursor: null }] },
    };
    renderQuadro();
    const link = screen.getByRole('link', { name: /Meus relatos/ });
    expect(link.getAttribute('href')).toBe('/analise-ativos/meus-relatos');
    expect(link.textContent).toContain('Resposta nova');
  });

  it('Resumo × Detalhado mudam as colunas; o clique troca o modo na URL', () => {
    renderQuadro();
    expect(cabecalhos()).toEqual([
      'Ativo',
      'Preço',
      'Lucros seguidos',
      'ROE',
      'P/L',
      'P/VP',
      'DY 12m',
      'Lucro 10 anos',
      'Índice MF',
      'Na carteira',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Detalhado' }));
    expect(nav.replace).toHaveBeenCalledWith('/analise-ativos?modo=detalhado', { scroll: false });
  });

  it('modo detalhado vindo da URL mostra as colunas extras', () => {
    nav.qs = 'modo=detalhado';
    renderQuadro();
    const c = cabecalhos();
    expect(c).toContain('Setor');
    expect(c).toContain('Margem líquida');
    expect(c).toContain('Dív.líq./EBITDA');
    expect(c).toContain('Liquidez média 21d');
    expect(screen.getByRole('button', { name: 'Detalhado' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('aria-sort: Índice MF descendente por padrão; 1º clique em P/L = crescente', () => {
    renderQuadro();
    const th = (nome: string) =>
      screen.getByRole('button', { name: `Ordenar por ${nome}` }).closest('th')!;
    expect(th('Índice MF')).toHaveAttribute('aria-sort', 'descending');
    expect(th('P/L')).toHaveAttribute('aria-sort', 'none');
    expect(screen.getByRole('columnheader', { name: 'Lucro 10 anos' })).not.toHaveAttribute(
      'aria-sort',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por P/L' }));
    expect(nav.replace).toHaveBeenCalledWith('/analise-ativos?ordem=pl&dir=asc', { scroll: false });
  });

  it('ordem vinda da URL: aria-sort ascendente e coluna destacada', () => {
    nav.qs = 'ordem=pl&dir=asc';
    renderQuadro();
    const th = screen.getByRole('button', { name: 'Ordenar por P/L' }).closest('th')!;
    expect(th).toHaveAttribute('aria-sort', 'ascending');
    expect(th).toHaveAttribute('data-ordem-ativa');
    expect(quadro.ultimoFiltro).toMatchObject({ classe: 'acao', ordem: 'pl', dir: 'asc' });
  });

  it('Mostrar mais pede a próxima página e a contagem diz quantos de quantos', () => {
    const fetchNextPage = vi.fn();
    estadoQuadro({
      hasNextPage: true,
      fetchNextPage,
      data: { pages: [pagina({ total: 331 })], pageParams: [0] },
    });
    renderQuadro();
    expect(screen.getByText(/Mostrando 4 de 331/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar mais 25' }));
    expect(fetchNextPage).toHaveBeenCalled();
  });

  it('abas com contador e Na carteira com os números da aba da Carteira', () => {
    renderQuadro();
    expect(screen.getByRole('button', { name: /Ações \d+/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const linha = screen.getByRole('row', { name: /WEGE3/ });
    expect(within(linha).getByText('120 ações · 3,80%')).toBeInTheDocument();
    const itub = screen.getByRole('row', { name: /ITUB4/ });
    expect(within(itub).getByText('Planejado · 5,00%')).toBeInTheDocument();
  });

  it('chip liga filtro na URL e Limpar filtros aparece', () => {
    nav.qs = 'f=dyMinAcao';
    renderQuadro();
    expect(screen.getByRole('button', { name: /DY 12m ≥ 4%/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(quadro.ultimoFiltro).toMatchObject({ dyMin: 4 });
    fireEvent.click(screen.getByRole('button', { name: /Lucro 5\+ anos/ }));
    expect(nav.replace).toHaveBeenCalledWith('/analise-ativos?f=dyMinAcao%2ClucroConsistente', {
      scroll: false,
    });
    expect(screen.getAllByRole('button', { name: 'Limpar filtros' }).length).toBeGreaterThan(0);
  });

  it('vazio por filtro oferece Limpar; Na minha carteira sem posição convida a registrar', () => {
    nav.qs = 'f=dyMinAcao';
    estadoQuadro({ data: { pages: [pagina({ itens: [], total: 0 })], pageParams: [0] } });
    const { unmount } = renderQuadro();
    expect(screen.getByText('Nenhum ativo com esses filtros')).toBeInTheDocument();
    unmount();
    nav.qs = 'f=naCarteira';
    renderQuadro();
    expect(screen.getByText('Você ainda não tem ações na Carteira')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar operação' })).toHaveAttribute(
      'href',
      '/carteira',
    );
  });

  it('erro mantém os filtros e oferece Tentar de novo', () => {
    const refetch = vi.fn();
    nav.qs = 'f=dyMinAcao';
    estadoQuadro({ data: undefined, isError: true, isPending: false, refetch });
    renderQuadro();
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar o Quadro agora');
    expect(screen.getByRole('button', { name: /DY 12m ≥ 4%/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('carregando: cabeçalho real com esqueleto', () => {
    estadoQuadro({ data: undefined, isPending: true });
    renderQuadro();
    expect(cabecalhos()).toContain('Índice MF');
    expect(screen.getByRole('table').closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');
  });

  it('celular: cartões, trilho de chips e botão de Ordem', () => {
    media.celular = true;
    renderQuadro();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('link', { name: /WEGE3/ })).toHaveAttribute(
      'href',
      '/analise-ativos/WEGE3',
    );
    expect(screen.getByRole('button', { name: /Ordem: Índice MF/ })).toBeInTheDocument();
  });

  it('celular: sheet de Ordem fecha no "voltar" do sistema e aplica a ordem só depois do back', () => {
    media.celular = true;
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const estadoAntes = window.history.state;
    renderQuadro();
    const abrir = () => fireEvent.click(screen.getByRole('button', { name: /Ordem: Índice MF/ }));
    const sheet = () => screen.queryByRole('dialog', { name: /Ordenar/ });
    const voltar = () =>
      act(() => {
        window.history.replaceState(estadoAntes, '', window.location.href);
        window.dispatchEvent(new PopStateEvent('popstate'));
      });

    // voltar do sistema: fecha sem aplicar nada nem chamar back de novo
    abrir();
    expect(sheet()).toBeInTheDocument();
    voltar();
    expect(sheet()).toBeNull();
    expect(back).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();

    // Ver resultado: back da entrada do sheet primeiro; a URL nova só depois do popstate
    abrir();
    fireEvent.click(within(sheet()!).getByRole('radio', { name: /P\/L/ }));
    fireEvent.click(within(sheet()!).getByRole('button', { name: 'Ver resultado' }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(nav.replace).not.toHaveBeenCalled();
    voltar();
    expect(nav.replace).toHaveBeenCalledWith('/analise-ativos?ordem=pl&dir=asc', { scroll: false });
    back.mockRestore();
  });
});
