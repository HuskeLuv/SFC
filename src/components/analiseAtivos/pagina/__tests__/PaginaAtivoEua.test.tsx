// @vitest-environment jsdom
/**
 * Página do stock (AAPL) e do REIT (O) — fatia C de Stocks e REITs. Variante SEM cotação (decisão
 * do Wellington de 17/10): texto neutro no lugar do preço, nenhum P/L/DY/P/FFO, Valuation só com a
 * nota, Essencial EUA sem colunas sem fonte (FFO/AFFO/Ocupação/Imóveis), nenhum nome de índice e
 * a varredura de linguagem v2 limpa.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const dados = vi.hoisted(() => ({ topo: undefined as unknown, fundamentos: undefined as unknown }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/analise-ativos/AAPL',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/hooks/useMediaQuery', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useMediaQuery')>()),
  useIsBelowLg: () => false,
}));
vi.mock('@/hooks/useAnaliseAtivos', async (orig) => {
  const real = await orig<typeof import('@/hooks/useAnaliseAtivos')>();
  const consulta = (data: unknown) => ({
    data,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
  return {
    ...real,
    useAtivoTopo: () => consulta(dados.topo),
    useOverlayCarteira: () => consulta({ posicoes: {}, planejados: {} }),
    useAnaliseAtivosConfig: () =>
      consulta({
        habilitada: true,
        estado: 'liberada',
        acesso: 'beta',
        novoAte: '2026-12-31',
        reporteHabilitado: false,
        recursos: { raioX: true, cenarios: true, comparador: false, eua: true, euaPreco: false },
      }),
    useFundamentosAtivo: () => consulta(dados.fundamentos),
  };
});
vi.mock('@/hooks/useEducacao', () => ({
  useCursos: () => ({ cursos: [], accessLevel: 0, loading: true, error: null }),
}));
// Carteira (fatia D): stubs
vi.mock('@/components/analiseAtivos/ativo/usuario/BlocoNaCarteira', () => ({
  default: () => <section data-stub="na-carteira" />,
}));
vi.mock('@/components/analiseAtivos/ativo/usuario/AcoesCarteiraAtivo', () => ({
  default: () => <div data-stub="acoes-carteira" />,
}));

import PaginaAtivo from '@/components/analiseAtivos/pagina/PaginaAtivo';
import { esperarDomLimpo } from '@/test/utils/varrerDom';
import {
  ATIVO_AAPL_EUA,
  ATIVO_O_EUA,
  FUNDAMENTOS_AAPL_EUA,
  FUNDAMENTOS_O_EUA,
} from '@/test/fixtures/analiseAtivos/eua';
import { TEXTOS_EUA } from '@/services/analiseAtivos/textosEua';

function renderPagina(ticker: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <PaginaAtivo ticker={ticker} />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe('página do ativo EUA', () => {
  it('AAPL: sem cotação (texto neutro), tags sem índice, LPA por ano, sem Valuation', () => {
    dados.topo = ATIVO_AAPL_EUA;
    dados.fundamentos = FUNDAMENTOS_AAPL_EUA;
    const { container } = renderPagina('AAPL');
    const preco = container.querySelector('[data-sem-cotacao]');
    expect(preco?.textContent).toContain(TEXTOS_EUA.cotacao.indisponivel);
    expect(preco?.textContent).not.toMatch(/US\$\s?\d|R\$/);
    const tags = container.querySelector('[data-tags]')?.textContent ?? '';
    expect(tags).toContain('Nasdaq');
    expect(tags).toContain('FY termina em set');
    expect(screen.getByRole('heading', { name: 'LPA por ano' })).toBeInTheDocument();
    expect(container.querySelector('[data-valuation-oculto]')).not.toBeNull();
    const kpis = [...container.querySelectorAll('[data-kpi]')].map((k) =>
      k.getAttribute('data-kpi'),
    );
    for (const c of ['pl', 'pvp', 'dy12m']) expect(kpis).not.toContain(c);
    expect(container.textContent).not.toMatch(/S&P|MSCI|P\/FFO/);
    esperarDomLimpo(container);
  });

  it('O (REIT): Essencial sem FFO/AFFO/Ocupação/Imóveis, KPIs de caixa operacional', () => {
    dados.topo = ATIVO_O_EUA;
    dados.fundamentos = FUNDAMENTOS_O_EUA;
    const { container } = renderPagina('O');
    const tabela = container.querySelector('[data-essencial-eua="reit"] table') as HTMLElement;
    const cab = within(tabela)
      .getAllByRole('columnheader')
      .map((th) => th.textContent ?? '');
    expect(cab.join('|')).toContain('Caixa op./ação');
    for (const x of ['FFO', 'AFFO', 'Ocupação', 'Imóveis']) {
      expect(cab.some((c) => c.includes(x))).toBe(false);
    }
    expect(
      screen.getByRole('heading', { name: 'Caixa operacional por ação por ano' }),
    ).toBeInTheDocument();
    expect(container.querySelector('[data-kpi="fcoAcao"]')).not.toBeNull();
    expect(container.querySelector('[data-link-sec]')).toBeNull(); // sem critérios: sem card de fonte
    esperarDomLimpo(container);
  });
});
