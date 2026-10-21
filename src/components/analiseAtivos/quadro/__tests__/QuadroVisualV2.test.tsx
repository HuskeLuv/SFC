// @vitest-environment jsdom
/**
 * fundamentei-regras (F4): Quadro com o visual v2 LIGADO (itens C3–C6, C16) e os sinais da resposta
 * (A4.d rótulos EN; A2.d REIT com caixa ajustado). Com a chave desligada o DOM é o de hoje
 * (shell/__tests__/visualV2Desligado.test.tsx).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LinhaQuadroApi, QuadroResposta } from '@/types/analiseAtivosApi';

const nav = vi.hoisted(() => ({ qs: '', replace: vi.fn(), push: vi.fn() }));
const quadro = vi.hoisted(() => ({ estado: {} as Record<string, unknown> }));
const media = vi.hoisted(() => ({ celular: false }));
const cfg = vi.hoisted(() => ({ config: { data: undefined as unknown, isSuccess: true } }));
const vazio = vi.hoisted(() => ({ data: undefined }));
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
import { VisualV2Provider } from '@/components/analiseAtivos/shell/VisualV2';
import {
  API_ITUB4,
  API_O,
  API_WEGE3,
  CONFIG_EUA_LIGADA,
  QUADRO_ACOES,
} from '@/test/fixtures/analiseAtivos/respostas';
import { definicoesQuadro } from '@/services/analiseAtivos/quadro/consultaQuadro';
import { CRITERIA_PARAMS_V3 } from '@/services/analiseAtivos/params/criteriaParamsV3';
import { TEXTOS_EUA } from '@/services/analiseAtivos/textosEua';
import { ROTULOS_EUA_EN } from '@/services/analiseAtivos/textosEuaEn';
import { esperarDomLimpo } from '@/test/utils/varrerDom';

function estado(p: QuadroResposta) {
  quadro.estado = {
    data: { pages: [p], pageParams: [0] },
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  };
}

const ACOES: QuadroResposta = {
  ...QUADRO_ACOES,
  itens: [API_WEGE3, API_ITUB4],
  total: 2,
  contagens: { acao: 312, fii: 418, stock: 9, reit: 6 },
};

function reit(over: Partial<QuadroResposta> = {}, linha: Partial<LinhaQuadroApi> = {}) {
  return {
    ...QUADRO_ACOES,
    classe: 'reit',
    contagens: { acao: 4, fii: 3, stock: 9, reit: 6 },
    itens: [{ ...API_O, ...linha }],
    total: 1,
    totalClasse: 6,
    facetas: { setores: [], tipos: [] },
    frescorCotacao: { data: null, status: 'sem_dado' },
    definicoes: definicoesQuadro('reit', CRITERIA_PARAMS_V3),
    moeda: 'USD',
    ...over,
  } as QuadroResposta;
}

function renderQuadro(v2 = true) {
  const ui = <QuadroAnalise />;
  return render(
    <QueryClientProvider client={new QueryClient()}>
      {v2 ? <VisualV2Provider valor>{ui}</VisualV2Provider> : ui}
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  nav.qs = '';
  media.celular = false;
  cfg.config = { data: CONFIG_EUA_LIGADA, isSuccess: true };
});

describe('Quadro · visual v2 ligado', () => {
  it('abas com a contagem em pílula; nome acessível "Ações 312"', () => {
    estado(ACOES);
    renderQuadro();
    const nav = screen.getByRole('navigation', { name: 'Classe de ativo' });
    const acoes = within(nav).getByRole('button', { name: 'Ações 312' });
    expect(acoes.querySelector('[data-tab-badge]')?.textContent).toBe('312');
    expect(within(nav).getByRole('button', { name: 'FIIs 418' })).toBeTruthy();
  });

  it('chips em pílula com ✓ SVG sempre visível, aria-pressed, sem caixinha', () => {
    estado(ACOES);
    renderQuadro();
    const barra = document.querySelector('[data-barra-filtros="acao"]')!;
    expect(barra.hasAttribute('data-visual-v2')).toBe(true);
    const chips = barra.querySelectorAll('[data-criterio-chip]');
    expect(chips.length).toBeGreaterThan(3);
    for (const c of chips) {
      expect(c.getAttribute('aria-pressed')).toBe('false');
      expect(c.querySelector('[data-chip-marca]')).not.toBeNull();
      expect(c.querySelector('span')!.className).toContain('rounded-full');
    }
    fireEvent.click(chips[0]);
    expect(nav.replace).toHaveBeenCalled();
  });

  it('meta, A–Z e Resumo | Detalhado à direita da faixa (computador), sem a linha de ordem', () => {
    estado(ACOES);
    renderQuadro();
    const direita = document.querySelector('[data-barra-direita]')!;
    expect(direita.querySelector('[data-quadro-contador]')).not.toBeNull();
    expect(within(direita as HTMLElement).getByRole('button', { name: 'A–Z' })).toBeTruthy();
    expect(direita.querySelector('[data-quadro-modos]')).not.toBeNull();
    expect(document.querySelector('[data-quadro-ordem-linha]')).toBeNull();
    // alvo de 44 px nos controles
    for (const b of direita.querySelectorAll('button')) expect(b.className).toContain('min-h-11');
  });

  it('cabeçalho sem caixa alta e seta só na coluna ordenada', () => {
    nav.qs = 'ordem=pl&dir=asc';
    estado(ACOES);
    renderQuadro();
    const tabela = screen.getByRole('table');
    const tr = tabela.querySelector('thead tr')!;
    expect(tr.className).not.toMatch(/\buppercase\b/);
    const comSeta = [...tabela.querySelectorAll('thead th')].filter((th) =>
      /[▲▼]/.test(th.textContent ?? ''),
    );
    expect(comSeta).toHaveLength(1);
    expect(comSeta[0].getAttribute('data-coluna')).toBe('pl');
  });

  it('ícone do ticker 32 px no acento; varredura de linguagem limpa', () => {
    estado(ACOES);
    const { container } = renderQuadro();
    const linha = container.querySelector('tr[data-ticker="WEGE3"]')!;
    const icone = linha.querySelector('span[aria-hidden="true"]') as HTMLElement;
    expect(icone.style.width).toBe('32px');
    expect(icone.className).toContain('rounded-lg');
    esperarDomLimpo(container);
  });

  it('celular: chips quebram linha e a linha de ordem segue embaixo', () => {
    media.celular = true;
    estado(ACOES);
    renderQuadro();
    expect(document.querySelector('[data-chips-quebram]')).not.toBeNull();
    expect(document.querySelector('[data-quadro-ordem-linha]')).not.toBeNull();
  });
});

describe('Quadro · sinais da resposta (A4.d, A2.d)', () => {
  it('rotulosEn: colunas do REIT em inglês; sem o sinal, em português', () => {
    nav.qs = 'classe=reit';
    estado(reit({ rotulosEn: true }));
    const { unmount } = renderQuadro(false);
    const ths = [...screen.getByRole('table').querySelectorAll('thead th')].map(
      (th) => th.textContent,
    );
    expect(ths.some((t) => t?.includes(ROTULOS_EUA_EN.ocfPerShare))).toBe(true);
    expect(ths.some((t) => t?.includes(ROTULOS_EUA_EN.dividendPerShare))).toBe(true);
    unmount();
    estado(reit());
    renderQuadro(false);
    const pt = [...screen.getByRole('table').querySelectorAll('thead th')].map(
      (th) => th.textContent,
    );
    expect(pt.some((t) => t?.includes(ROTULOS_EUA_EN.ocfPerShare))).toBe(false);
  });

  it('reitFcoAjustado: faixa sem FFO/ocupação, célula com o caixa ajustado e nota sem SBC', () => {
    nav.qs = 'classe=reit';
    estado(
      reit(
        { reitFcoAjustado: true, rotulosEn: true },
        { fcoAjustadoPorAcao: 2.5, dividendosFcoAjustadoPct: 80, sbcIndisponivel: false },
      ),
    );
    const { container, unmount } = renderQuadro(false);
    expect(container.querySelector('[data-faixa-reit]')!.textContent).toBe(
      TEXTOS_EUA.reitAjustado.faixa,
    );
    const linha = container.querySelector('tr[data-ticker="O"]')!;
    expect(linha.querySelector('[data-coluna="fcoAcao"]')!.textContent).toContain('2,50');
    expect(linha.querySelector('[data-coluna="divFco"]')!.textContent).toContain('80');
    const ths = [...container.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(ths.some((t) => t?.includes(ROTULOS_EUA_EN.ocfAdjustedPerShare))).toBe(true);
    unmount();

    estado(
      reit(
        { reitFcoAjustado: true },
        { fcoAjustadoPorAcao: null, dividendosFcoAjustadoPct: null, sbcIndisponivel: true },
      ),
    );
    const r = renderQuadro(false);
    const cel = r.container.querySelector('tr[data-ticker="O"] [data-coluna="fcoAcao"]')!;
    expect(cel.querySelector('[data-sbc-indisponivel]')!.getAttribute('title')).toBe(
      TEXTOS_EUA.reitAjustado.sbcIndisponivel,
    );
  });
});
