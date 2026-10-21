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
vi.mock('@/hooks/useAnaliseAtivos', async (importOriginal) => ({
  // bloco 1: os hooks dos Salvos usam ErroAnalise/retryAnalise do módulo real
  ...(await importOriginal<object>()),
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
  QUADRO_FIIS,
} from '@/test/fixtures/analiseAtivos/respostas';
import {
  CRITERIOS_LINHA_ITUB4,
  CRITERIOS_LINHA_WEGE3,
  definicoesChips,
} from '@/test/fixtures/analiseAtivos/criterios';
import { esperarDomLimpo } from '@/test/utils/varrerDom';
import { TEXTOS_QUADRO } from '@/services/analiseAtivos/textosQuadro';
import { definicoesQuadro } from '@/services/analiseAtivos/quadro/consultaQuadro';
import { CRITERIA_PARAMS_V2 } from '@/services/analiseAtivos/params/criteriaParamsV2';

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

  it('Resumo: colunas novas da v2.4 (Critérios no lugar do indicador antigo); Detalhado na URL', () => {
    renderQuadro();
    expect(cabecalhos()).toEqual([
      'Ativo',
      'Preço',
      'Lucros seguidos',
      'ROE',
      'P/L',
      'P/VP',
      'DY 12m',
      'Critérios',
      'Na carteira',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Detalhado' }));
    expect(nav.replace).toHaveBeenCalledWith('/analise-ativos?modo=detalhado', { scroll: false });
  });

  it('modo detalhado vindo da URL mostra as colunas extras (Lucro 10 anos ordenável)', () => {
    nav.qs = 'modo=detalhado';
    renderQuadro();
    const c = cabecalhos();
    expect(c).toContain('Setor');
    expect(c).toContain('Lucro 10 anos');
    expect(c).toContain('Margem líquida');
    expect(c).toContain('Dív.líq./EBITDA');
    expect(screen.getByRole('button', { name: 'Ordenar por Lucro 10 anos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Detalhado' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('ordem padrão A–Z (Ativo ascendente); 1º clique em P/L = crescente; pílula volta a A–Z', () => {
    renderQuadro();
    const th = (nome: string) =>
      screen.getByRole('button', { name: `Ordenar por ${nome}` }).closest('th')!;
    expect(th('Ativo')).toHaveAttribute('aria-sort', 'ascending');
    expect(th('P/L')).toHaveAttribute('aria-sort', 'none');
    expect(screen.getByRole('columnheader', { name: 'Na carteira' })).not.toHaveAttribute(
      'aria-sort',
    );
    expect(screen.getByRole('button', { name: 'A–Z' })).toHaveAttribute('aria-pressed', 'true');
    expect(quadro.ultimoFiltro).toMatchObject({ ordem: 'ticker', dir: 'asc', janela: 5 });
    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por P/L' }));
    expect(nav.replace).toHaveBeenCalledWith('/analise-ativos?ordem=pl&dir=asc', { scroll: false });
  });

  it('ordem vinda da URL: aria-sort, coluna destacada e pílula que volta para A–Z', () => {
    nav.qs = 'ordem=pl&dir=asc';
    renderQuadro();
    const th = screen.getByRole('button', { name: 'Ordenar por P/L' }).closest('th')!;
    expect(th).toHaveAttribute('aria-sort', 'ascending');
    expect(th).toHaveAttribute('data-ordem-ativa');
    expect(quadro.ultimoFiltro).toMatchObject({ classe: 'acao', ordem: 'pl', dir: 'asc' });
    fireEvent.click(screen.getByRole('button', { name: /Voltar à ordem alfabética/ }));
    expect(nav.replace).toHaveBeenCalledWith('/analise-ativos', { scroll: false });
  });

  it('Mostrar mais pede a próxima página e a contagem diz quantos de quantos', () => {
    const fetchNextPage = vi.fn();
    estadoQuadro({
      hasNextPage: true,
      fetchNextPage,
      data: { pages: [pagina({ total: 331, totalClasse: 331 })], pageParams: [0] },
    });
    renderQuadro();
    expect(screen.getByText(/Mostrando 4 de 331/)).toBeInTheDocument();
    expect(document.querySelector('[data-quadro-contador]')?.textContent).toBe('331 de 331');
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

  it('critério ligado na URL vai para a API (E lógico); contador "X de N atendem a k…"', () => {
    nav.qs = 'c=rec&j=3';
    estadoQuadro({
      data: {
        pages: [pagina({ itens: [API_WEGE3], total: 1, totalClasse: 4, janela: 3 })],
        pageParams: [0],
      },
    });
    renderQuadro();
    expect(screen.getByRole('button', { name: /Receita crescente/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(quadro.ultimoFiltro).toMatchObject({ criterios: 'rec', janela: 3 });
    expect(document.querySelector('[data-quadro-contador]')?.textContent).toBe(
      '1 de 4 atendem a 1 critério em 3 anos',
    );
    fireEvent.click(screen.getByRole('button', { name: /Lucro crescente/ }));
    expect(nav.replace).toHaveBeenCalledWith('/analise-ativos?j=3&c=rec%2Cluc', {
      scroll: false,
    });
    expect(screen.getAllByRole('button', { name: 'Limpar filtros' }).length).toBeGreaterThan(0);
  });

  it('célula Critérios: "n de 6" (e n de 3 em financeira), 44 px, sem abrir a linha', () => {
    const wege = { ...API_WEGE3, criterios: CRITERIOS_LINHA_WEGE3 };
    const itub = { ...API_ITUB4, criterios: CRITERIOS_LINHA_ITUB4 };
    estadoQuadro({ data: { pages: [pagina({ itens: [wege, itub] })], pageParams: [0] } });
    renderQuadro();
    const celula = within(screen.getByRole('row', { name: /WEGE3/ })).getByRole('button', {
      name: /Critérios em 5 anos: 5 de 6/,
    });
    expect(celula.className).toContain('min-h-11');
    fireEvent.click(celula);
    expect(nav.push).not.toHaveBeenCalled();
    expect(
      within(screen.getByRole('row', { name: /ITUB4/ })).getByRole('button', {
        name: /2 de 3/,
      }),
    ).toBeInTheDocument();
  });

  it('caso 31: vazio com critérios e janela 10 em FIIs oferece "limpe os filtros"; vac desabilitado', () => {
    nav.qs = 'classe=fii&j=10&c=rend,alav';
    estadoQuadro({
      data: {
        pages: [
          pagina({
            ...QUADRO_FIIS,
            itens: [],
            total: 0,
            totalClasse: 3,
            janela: 10,
            definicoes: definicoesChips('fii'),
          }),
        ],
        pageParams: [0],
      },
    });
    renderQuadro();
    expect(
      screen.getByText(/Nenhum ativo atende a todos os critérios selecionados em 10 anos/),
    ).toBeInTheDocument();
    // v2.5: sem a nota dos informes de FII de 2016
    expect(document.querySelector('[data-nota-janela-fii]')).toBeNull();
    expect(screen.getByRole('button', { name: /Vacância ≤ 10%/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'limpe os filtros' }));
    expect(nav.replace).toHaveBeenCalledWith('/analise-ativos?classe=fii&j=10', { scroll: false });
  });

  it('v2.5 (caso 31 com a v2): chips de FII todos ativos; ?c=vac fica; explicação sem "sem fonte"', () => {
    nav.qs = 'classe=fii&c=vac';
    estadoQuadro({
      data: {
        pages: [
          pagina({
            ...QUADRO_FIIS,
            itens: [],
            total: 0,
            totalClasse: 3,
            janela: 5,
            definicoes: definicoesQuadro('fii', CRITERIA_PARAMS_V2),
          }),
        ],
        pageParams: [0],
      },
    });
    const { container } = renderQuadro();
    expect(quadro.ultimoFiltro).toMatchObject({ classe: 'fii', criterios: 'vac' });
    const vac = screen.getByRole('button', { name: /Vacância ≤ 10%/ });
    expect(vac).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('[data-chip-desabilitado]')).toBeNull();
    const det = container.querySelector('details[data-explicacao-criterios]')!;
    expect(det.textContent).toContain('Inadimplência ≤ 3%');
    expect(det.textContent).not.toMatch(/fica fora do critério|conferência dos fundos|n de 3/);
    expect(det.querySelector('[data-explicacao-financeira]')).toBeNull();
    expect(screen.getByText(/Nenhum ativo atende a todos os critérios selecionados/)).toBeVisible();
    esperarDomLimpo(container);
    fireEvent.click(screen.getByRole('button', { name: 'limpe os filtros' }));
    expect(nav.replace).toHaveBeenCalledWith('/analise-ativos?classe=fii', { scroll: false });
  });

  it('caso 31: trocar de classe zera critérios, carteira e setor (janela e modo ficam)', () => {
    nav.qs = 'c=rec,mg&carteira=1&s=Financeiro&j=3&modo=detalhado&ordem=pl&dir=asc';
    renderQuadro();
    fireEvent.click(screen.getByRole('button', { name: /FIIs/ }));
    expect(nav.replace).toHaveBeenCalledWith('/analise-ativos?classe=fii&modo=detalhado&j=3', {
      scroll: false,
    });
  });

  it('Na minha carteira sem posição convida a registrar; vazio só por setor oferece Limpar', () => {
    nav.qs = 'carteira=1';
    estadoQuadro({ data: { pages: [pagina({ itens: [], total: 0 })], pageParams: [0] } });
    const { unmount } = renderQuadro();
    expect(screen.getByText('Você ainda não tem ações na Carteira')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar operação' })).toHaveAttribute(
      'href',
      '/carteira',
    );
    unmount();
    nav.qs = 's=Financeiro';
    renderQuadro();
    expect(screen.getByText('Nenhum ativo com esses filtros')).toBeInTheDocument();
  });

  it('erro mantém os filtros e oferece Tentar de novo', () => {
    const refetch = vi.fn();
    nav.qs = 'c=mg';
    estadoQuadro({ data: undefined, isError: true, isPending: false, refetch });
    renderQuadro();
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar o Quadro agora');
    expect(screen.getByRole('button', { name: /Margem líquida positiva/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('carregando: cabeçalho real com esqueleto; chips já aparecem', () => {
    estadoQuadro({ data: undefined, isPending: true });
    renderQuadro();
    expect(cabecalhos()).toContain('Critérios');
    expect(screen.getByRole('table').closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');
    // chips antes da resposta = params do código (v6)
    expect(
      screen.getByRole('button', { name: /Receita com crescimento anual > 0/ }),
    ).toBeInTheDocument();
  });

  it('"O que cada critério verifica" e rodapé literal; caso 32: DOM sem linguagem proibida', () => {
    const wege = { ...API_WEGE3, criterios: CRITERIOS_LINHA_WEGE3 };
    estadoQuadro({ data: { pages: [pagina({ itens: [wege, API_ITUB4] })], pageParams: [0] } });
    const { container } = renderQuadro();
    const det = container.querySelector('details[data-explicacao-criterios]')!;
    expect(det.textContent).toContain('O que cada critério verifica');
    // v6: EBITDA, dívida e FCL não se aplicam à financeira; a nota "mesmos 6 critérios" sai
    expect(det.textContent).not.toContain(TEXTOS_QUADRO.explicacao.financeira);
    expect(det.textContent).not.toMatch(/n de 3/);
    expect(container.textContent).not.toMatch(/Índice/);
    const r = esperarDomLimpo(container);
    expect(r.literais).toContain('rodape-quadro');
    // nomes vindos do banco ficam fora da varredura
    expect(container.querySelector('[data-nome-ativo]')?.textContent).toBe(API_WEGE3.nome);
  });

  it('celular: cartões com link do ticker, célula Critérios fora do link e botão de Ordem', () => {
    media.celular = true;
    const wege = { ...API_WEGE3, criterios: CRITERIOS_LINHA_WEGE3 };
    estadoQuadro({ data: { pages: [pagina({ itens: [wege, API_ITUB4] })], pageParams: [0] } });
    renderQuadro();
    expect(screen.queryByRole('table')).toBeNull();
    const link = screen.getByRole('link', { name: 'WEGE3' });
    expect(link).toHaveAttribute('href', '/analise-ativos/WEGE3');
    expect(link.className).toContain('min-h-11');
    const celula = screen.getByRole('button', { name: /Critérios em 5 anos: 5 de 6/ });
    expect(celula.closest('a')).toBeNull();
    expect(screen.getByRole('button', { name: /Ordem: A–Z/ })).toBeInTheDocument();
  });

  it('celular: sheet de Ordem fecha no "voltar" do sistema e aplica a ordem só depois do back', () => {
    media.celular = true;
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const estadoAntes = window.history.state;
    renderQuadro();
    const abrir = () => fireEvent.click(screen.getByRole('button', { name: /Ordem: A–Z/ }));
    const sheet = () => screen.queryByRole('dialog', { name: /Ordenar/ });
    const voltar = () =>
      act(() => {
        window.history.replaceState(estadoAntes, '', window.location.href);
        window.dispatchEvent(new PopStateEvent('popstate'));
      });

    // voltar do sistema: fecha sem aplicar nada nem chamar back de novo
    abrir();
    expect(sheet()).toBeInTheDocument();
    expect(within(sheet()!).getByRole('radio', { name: /A–Z/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
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

describe('QuadroAnalise — Bloco D: modo Comparar', () => {
  beforeEach(() => {
    nav.qs = '';
    nav.replace.mockReset();
    nav.push.mockReset();
    media.celular = false;
    relatos.config = { data: { habilitada: true, recursos: { comparador: true } } };
    relatos.meus = { data: undefined };
    window.sessionStorage.clear();
    estadoQuadro();
  });

  it('recurso desligado: sem botão, sem coluna e sem bandeja (Quadro de sempre)', () => {
    relatos.config = {
      data: { habilitada: true, recursos: { comparador: false, raioX: true, cenarios: true } },
    };
    renderQuadro();
    expect(screen.queryByRole('button', { name: 'Comparar' })).toBeNull();
    expect(cabecalhos()[0]).toBe('Ativo');
    expect(screen.queryByRole('region', { name: 'Seleção para comparar' })).toBeNull();
  });

  it('liga o modo (aria-pressed), marca sem abrir o ativo e a bandeja leva ao Comparador', () => {
    renderQuadro();
    const botao = screen.getByRole('button', { name: 'Comparar' });
    expect(botao).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(botao);
    expect(screen.getByRole('button', { name: 'Sair do modo comparar' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(cabecalhos()[0]).toBe('Comparar');
    const bandeja = screen.getByRole('region', { name: 'Seleção para comparar' });
    expect(bandeja.textContent).toContain('0 de 4 selecionados');
    expect(within(bandeja).getByRole('button', { name: /Comparar/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Comparar WEGE3' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Comparar ITUB4' }));
    expect(nav.push).not.toHaveBeenCalled();
    expect(bandeja.textContent).toContain('2 de 4 selecionados');
    expect(bandeja.textContent).toContain('WEGE3, ITUB4');
    expect(within(bandeja).getByRole('link', { name: 'Comparar WEGE3, ITUB4' })).toHaveAttribute(
      'href',
      '/analise-ativos/comparador?t=WEGE3,ITUB4',
    );

    fireEvent.click(within(bandeja).getByRole('button', { name: 'Limpar' }));
    expect(bandeja.textContent).toContain('0 de 4 selecionados');
  });

  it('bandeja abre o Comparador a partir de 1 ativo (decisão 13)', () => {
    renderQuadro();
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Comparar AURE3' }));
    const bandeja = screen.getByRole('region', { name: 'Seleção para comparar' });
    expect(within(bandeja).getByRole('link', { name: 'Comparar AURE3' })).toHaveAttribute(
      'href',
      '/analise-ativos/comparador?t=AURE3',
    );
  });

  it('celular: caixa de 44px fora do link do cartão', () => {
    media.celular = true;
    renderQuadro();
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    const caixa = screen.getByRole('checkbox', { name: 'Comparar WEGE3' });
    expect(caixa.closest('a')).toBeNull();
    expect(caixa.closest('label')?.className).toContain('min-h-11');
    fireEvent.click(caixa);
    expect(screen.getByRole('region', { name: 'Seleção para comparar' }).textContent).toContain(
      '1 de 4 selecionados',
    );
  });
});
