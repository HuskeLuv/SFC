// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { QuadroResposta } from '@/types/analiseAtivosApi';

const nav = vi.hoisted(() => ({ qs: '', replace: vi.fn(), push: vi.fn() }));
const quadro = vi.hoisted(() => ({ estado: {} as Record<string, unknown> }));
const media = vi.hoisted(() => ({ celular: false }));
const cfg = vi.hoisted(() => ({ config: { data: undefined as unknown, isSuccess: true } }));
const vazio = vi.hoisted(() => ({ data: undefined }));
// dados estáveis (o efeito da coluna Na carteira depende da referência)
const abasCarteira = vi.hoisted(() => ({ data: { secoes: [] } }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push, prefetch: vi.fn() }),
  usePathname: () => '/analise-ativos',
  useSearchParams: () => new URLSearchParams(nav.qs),
}));
vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => media.celular }));
vi.mock('@/hooks/useAcoes', () => ({ useAcoes: () => abasCarteira }));
vi.mock('@/hooks/useFii', () => ({ useFii: () => abasCarteira }));
vi.mock('@/hooks/useAnaliseAtivos', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useQuadroAnalise: () => quadro.estado,
  useOverlayCarteira: () => vazio,
  useAnaliseAtivosConfig: () => cfg.config,
  prefetchAtivoTopo: vi.fn(async () => undefined),
}));
vi.mock('@/components/analiseAtivos/reporte/useMeusReportes', () => ({
  useMeusReportes: () => ({ data: undefined }),
}));

import QuadroAnalise from '../QuadroAnalise';
import {
  API_AAPL,
  API_O,
  CONFIG_EUA_LIGADA,
  QUADRO_ACOES,
} from '@/test/fixtures/analiseAtivos/respostas';
import { definicoesQuadro } from '@/services/analiseAtivos/quadro/consultaQuadro';
import { CRITERIA_PARAMS_V3 } from '@/services/analiseAtivos/params/criteriaParamsV3';
import { esperarDomLimpo } from '@/test/utils/varrerDom';
import { TEXTOS_EUA } from '@/services/analiseAtivos/textosEua';

const UNIVERSO =
  'Universo: empresas listadas na NYSE ou na Nasdaq que entregam o relatório anual 10-K à SEC, com free float a partir de US$ 2 bi na capa do último 10-K.';

function pagina(classe: 'acao' | 'stock' | 'reit'): QuadroResposta {
  if (classe === 'acao')
    return { ...QUADRO_ACOES, contagens: { acao: 4, fii: 3, stock: 9, reit: 6 } };
  return {
    ...QUADRO_ACOES,
    classe,
    contagens: { acao: 4, fii: 3, stock: 9, reit: 6 },
    itens: classe === 'stock' ? [API_AAPL] : [API_O],
    total: 1,
    totalClasse: classe === 'stock' ? 9 : 6,
    facetas: { setores: [], tipos: [] },
    frescorCotacao: { data: null, status: 'sem_dado' },
    definicoes: definicoesQuadro(classe, CRITERIA_PARAMS_V3),
    moeda: 'USD',
    universoDescricao: UNIVERSO,
  };
}

function estado(classe: 'acao' | 'stock' | 'reit') {
  quadro.estado = {
    data: { pages: [pagina(classe)], pageParams: [0] },
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  };
}

function renderQuadro() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <QuadroAnalise />
    </QueryClientProvider>,
  );
}

const cabecalhos = () =>
  within(screen.getByRole('table'))
    .getAllByRole('columnheader')
    .map((th) => th.textContent?.replace(/[▲▼]/g, '').trim());

const abas = () =>
  within(screen.getByRole('navigation', { name: 'Classe de ativo' }))
    .getAllByRole('button')
    .map((b) => b.textContent);

describe('Quadro — Stocks e REITs', () => {
  beforeEach(() => {
    nav.qs = '';
    nav.replace.mockReset();
    media.celular = false;
    cfg.config = { data: CONFIG_EUA_LIGADA, isSuccess: true };
  });

  it('sem a chave EUA: só Ações e FIIs; ?classe=stock volta para Ações', () => {
    cfg.config = { data: { ...CONFIG_EUA_LIGADA, recursos: { eua: false } }, isSuccess: true };
    estado('acao');
    renderQuadro();
    expect(abas()).toEqual(['Ações 4', 'FIIs 3']);
    nav.qs = 'classe=stock';
    renderQuadro();
    expect(nav.replace).toHaveBeenCalledWith('/analise-ativos', { scroll: false });
  });

  it('com a chave: 4 abas com o contador real', () => {
    estado('acao');
    renderQuadro();
    expect(abas()).toEqual(['Ações 4', 'FIIs 3', 'Stocks 9', 'REITs 6']);
  });

  it('Stocks sem cotação: colunas sem Preço/P/L/DY, faixa, rodapé EUA com a regra do universo', () => {
    nav.qs = 'classe=stock';
    estado('stock');
    const { container } = renderQuadro();
    expect(cabecalhos()).toEqual([
      'Stock',
      'Lucros seguidos',
      'ROE',
      'Margem líquida',
      'Div./ação (US$)',
      'Critérios',
      'Na carteira',
    ]);
    expect(container.querySelector('[data-faixa-sem-cotacao]')).not.toBeNull();
    expect(container.querySelector('[data-texto-legal="rodape-quadro-eua"]')).not.toBeNull();
    expect(screen.getByText(UNIVERSO)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/S&P|MSCI/);
    expect(container.textContent).not.toContain('R$');
    esperarDomLimpo(container);
  });

  it('REITs: Caixa op./ação, Div./caixa op. e Div./ação; nada de FFO/AFFO/Ocupação nas colunas', () => {
    nav.qs = 'classe=reit';
    estado('reit');
    const { container } = renderQuadro();
    const c = cabecalhos();
    expect(c).toEqual([
      'REIT',
      'Tipo',
      'Caixa op./ação',
      'Div./caixa op.',
      'Div./ação (US$)',
      'Critérios',
      'Na carteira',
    ]);
    for (const x of ['FFO', 'AFFO', 'Ocupação']) expect(c.join(' ')).not.toContain(x);
    expect(screen.getByText(TEXTOS_EUA.reit.faixa)).toBeInTheDocument();
    // a Ocupação é um chip desabilitado (sem dado), não um filtro
    expect(
      container.querySelector('[data-criterio-chip="ocup"]')?.getAttribute('aria-disabled'),
    ).toBe('true');
    esperarDomLimpo(container);
  });

  it('com a chave de preço: Preço, P/L e DY nas colunas e sem a faixa', () => {
    cfg.config = {
      data: { ...CONFIG_EUA_LIGADA, recursos: { ...CONFIG_EUA_LIGADA.recursos, euaPreco: true } },
      isSuccess: true,
    };
    nav.qs = 'classe=stock';
    estado('stock');
    const { container } = renderQuadro();
    expect(cabecalhos()).toEqual([
      'Stock',
      'Preço (US$)',
      'Lucros seguidos',
      'ROE',
      'Margem líquida',
      'Div./ação (US$)',
      'P/L',
      'DY 12m',
      'Critérios',
      'Na carteira',
    ]);
    expect(container.querySelector('[data-faixa-sem-cotacao]')).toBeNull();
  });

  it('celular: abas em grade 2×2 e chips que quebram linha', () => {
    media.celular = true;
    nav.qs = 'classe=stock';
    estado('stock');
    const { container } = renderQuadro();
    const navAbas = screen.getByRole('navigation', { name: 'Classe de ativo' });
    expect(navAbas.className).toMatch(/grid-cols-2/);
    const chips = container.querySelector('[data-quadro-chips]');
    expect(chips?.hasAttribute('data-chips-quebram')).toBe(true);
    expect(chips?.className).toMatch(/flex-wrap/);
  });
});
