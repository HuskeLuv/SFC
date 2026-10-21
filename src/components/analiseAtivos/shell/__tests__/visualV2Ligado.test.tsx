// @vitest-environment jsdom
/**
 * fundamentei-regras (F4, item C): com ANALISE_ATIVOS_VISUAL_V2_HABILITADO LIGADA (provedor com
 * visualV2=true) as telas seguem o HTML do Pedro — página do ativo (C1, C2, C9, C13–C16), Raio-X
 * (C10), Comparador (C7, C8) e Meus cenários (C12). Mesmas fixtures e mocks do teste da chave
 * desligada (visualV2Desligado.test.tsx).
 *
 * Original: com ANALISE_ATIVOS_VISUAL_V2_HABILITADO DESLIGADA o DOM das
 * telas da Análise é IDÊNTICO ao de antes da entrega. O snapshot foi gravado com o código de antes
 * (commit de base da F4) e cada tela é renderizada de novo dentro do provedor com visualV2=false:
 * qualquer diferença de classe, atributo ou texto reprova.
 *
 * Telas: Quadro (computador e celular, ações), página do ativo (WEGE3, blocos preguiçosos montados),
 * Comparador (computador), Raio-X (tabela) e Meus cenários. Os ids do React (useId) são
 * normalizados (dependem da ordem de montagem).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const est = vi.hoisted(() => ({
  qs: '',
  celular: false,
  quadro: {} as Record<string, unknown>,
  topo: undefined as unknown,
  fundamentos: undefined as unknown,
  valuation: undefined as unknown,
  comparador: undefined as unknown,
  cenarios: undefined as unknown,
  config: undefined as unknown,
  raioX: undefined as unknown,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/analise-ativos',
  useSearchParams: () => new URLSearchParams(est.qs),
}));
vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));
vi.mock('@/hooks/useMediaQuery', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useMediaQuery')>()),
  useIsBelowLg: () => est.celular,
}));
vi.mock('@/hooks/useAcoes', () => ({ useAcoes: () => ({ data: { secoes: [] } }) }));
vi.mock('@/hooks/useFii', () => ({ useFii: () => ({ data: { secoes: [] } }) }));
vi.mock('@/hooks/useAnaliseAtivos', async (orig) => {
  const real = await orig<typeof import('@/hooks/useAnaliseAtivos')>();
  const consulta = (data: unknown) => ({
    data,
    isPending: false,
    isError: false,
    isSuccess: data !== undefined,
    error: null,
    refetch: vi.fn(),
  });
  return {
    ...real,
    useQuadroAnalise: () => est.quadro,
    useAtivoTopo: () => consulta(est.topo),
    useOverlayCarteira: () => consulta({ posicoes: {}, planejados: {} }),
    useAnaliseAtivosConfig: () => consulta(est.config),
    useFundamentosAtivo: () => consulta(est.fundamentos),
    useValuationAtivo: () => consulta(est.valuation),
    useIndiceBusca: () => ({ data: undefined }),
    prefetchAtivoTopo: vi.fn(async () => undefined),
  };
});
vi.mock('@/hooks/useAnaliseAtivosBlocoD', async (orig) => ({
  ...(await orig<object>()),
  useComparador: () => ({
    data: est.comparador,
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
    refetch: vi.fn(),
  }),
  useCenarios: () => ({ data: est.cenarios, isPending: false, isError: false, refetch: vi.fn() }),
  useSalvarCenario: () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
  useApagarCenario: () => ({ mutate: vi.fn(), isPending: false }),
  useRaioX: () => ({ data: est.raioX, isPending: false, isError: false, refetch: vi.fn() }),
}));
vi.mock('@/hooks/useEducacao', () => ({
  useCursos: () => ({ cursos: [], accessLevel: 0, loading: true, error: null }),
}));
vi.mock('@/components/analiseAtivos/reporte/useMeusReportes', () => ({
  useMeusReportes: () => ({ data: undefined }),
}));
vi.mock('@/components/analiseAtivos/ativo/usuario/useNaCarteiraAtivo', () => ({
  useNaCarteiraAtivo: () => ({ status: 'sem_posicao', linha: null, quantidade: 0 }),
}));
vi.mock('@/components/analiseAtivos/quadro/CelulaNaCarteira', async (orig) => ({
  ...(await orig<object>()),
  useNaCarteira: () => ({
    fonte: null,
    info: (t: string) =>
      t === 'WEGE3' ? { tipo: 'posicao', quantidade: 100, percentual: 4.7 } : { tipo: 'nenhum' },
    conjunto: new Set<string>(),
  }),
}));
// carteira e tese (dono e testes próprios): stubs
vi.mock('@/components/analiseAtivos/ativo/usuario/BlocoNaCarteira', () => ({
  default: () => <section data-stub="na-carteira" />,
}));
vi.mock('@/components/analiseAtivos/ativo/usuario/AcoesCarteiraAtivo', () => ({
  default: () => <div data-stub="acoes-carteira" />,
}));
vi.mock('@/components/analiseAtivos/ativo/usuario/BlocoTese', () => ({
  default: () => <section data-stub="tese" />,
}));

import PaginaAtivo from '@/components/analiseAtivos/pagina/PaginaAtivo';
import Comparador from '@/components/analiseAtivos/comparador/Comparador';
import TabelaRaioX from '@/components/analiseAtivos/ativo/analise/TabelaRaioX';
import MeusCenarios from '@/components/analiseAtivos/ativo/cenarios/MeusCenarios';
import AnaliseAtivosShell from '@/components/analiseAtivos/shell/AnaliseAtivosShell';
import { VisualV2Provider } from '@/components/analiseAtivos/shell/VisualV2';
import {
  API_ITUB4,
  API_TGMA3,
  API_WEGE3,
  ATIVO_WEGE3,
  FUNDAMENTOS_WEGE3,
  VALUATION_WEGE3,
} from '@/test/fixtures/analiseAtivos/respostas';
import {
  CRITERIOS_ATIVO_WEGE3,
  CRITERIOS_LINHA_ITUB4,
  CRITERIOS_LINHA_WEGE3,
} from '@/test/fixtures/analiseAtivos/criterios';
import { HOJE_DEV, dadosAcaoDev, linhaDev } from '@/test/fixtures/analiseAtivos/raioXDev';
import { montarAcao } from '@/services/analiseAtivos/leitura/ativo/raioX';
import { LIMITES_CENARIO } from '@/services/analiseAtivos/cenarios/contrato';
import { CRITERIA_PARAMS_V1 } from '@/services/analiseAtivos/params/criteriaParamsV1';
import { LEITURA_DOS_DADOS } from '@/services/analiseAtivos/textosLiterais';
import { TEXTOS_RAIO_X } from '@/services/analiseAtivos/textosRaioX';
import { TEXTOS_VISUAL } from '@/services/analiseAtivos/textosVisual';
import { DOURADO_ANALISE, VISUAL_V2 } from '@/constants/analiseAtivosVisual';
import { esperarDomLimpo } from '@/test/utils/varrerDom';
import type { ComparadorResposta, RaioXResposta } from '@/types/analiseAtivosBlocoD';

const CONFIG = {
  habilitada: true,
  estado: 'liberada',
  acesso: 'beta',
  novoAte: '2026-12-31',
  reporteHabilitado: false,
  recursos: { raioX: true, cenarios: true, comparador: true },
};

const okE = (valor: number) => ({ estado: 'ok' as const, valor });

function comparadorAcoes(): ComparadorResposta {
  const ativo = (
    ticker: string,
    nome: string,
    criterios: ComparadorResposta['ativos'][number]['criterios'],
  ): ComparadorResposta['ativos'][number] => ({
    ticker,
    nome,
    preco: okE(40),
    precoData: '2026-10-10',
    fiiTipo: null,
    tipoComparacao: 'acao',
    criterios,
    noQuadro: true,
    foraDoQuadroMotivo: null,
    conferencias: [],
    pares: [],
  });
  return {
    classe: 'acao',
    janela: 5,
    tickers: ['WEGE3', 'ITUB4'],
    ignorados: [],
    misto: false,
    ativos: [
      ativo('WEGE3', 'WEG', CRITERIOS_LINHA_WEGE3),
      ativo('ITUB4', 'Itaú Unibanco', CRITERIOS_LINHA_ITUB4),
    ],
    criterios: {
      rotulos: Object.fromEntries(CRITERIA_PARAMS_V1.perfis.acao.map((c) => [c.id, c.rotulo])),
      equivalencias: {},
    },
    grupos: [
      {
        codigo: 'qualidade',
        rotulo: 'Qualidade',
        aplicavelA: ['acao'],
        linhas: [
          {
            codigo: 'roe',
            rotulo: 'ROE',
            sub: '12 meses',
            formato: 'pct',
            fonteCvmAviso: false,
            valores: { WEGE3: okE(29.4), ITUB4: okE(21.1) },
            conferencia: { WEGE3: null, ITUB4: null },
          },
        ],
      },
    ],
    graficos: {
      tipo: 'lucro',
      titulo: 'Lucro líquido em 10 anos',
      anos: [2021, 2022, 2023, 2024, 2025],
      escala: { min: 90, max: 250 },
      series: ['WEGE3', 'ITUB4'].map((t, i) => ({
        ticker: t,
        pontos: [100, 120 + i * 10, 150, 180, 200 + i * 20],
        emConferencia: [false, false, false, false, false],
        insuficiente: false,
      })),
    },
    leitura: {
      janela: 5,
      contagens: [
        { ticker: 'WEGE3', n: 5, de: 6 },
        { ticker: 'ITUB4', n: 2, de: 3 },
      ],
      texto: LEITURA_DOS_DADOS.texto,
    },
    versao: 'c2:x',
  } as ComparadorResposta;
}

function respostaRaioX(): RaioXResposta {
  const { raioX } = montarAcao(HOJE_DEV, dadosAcaoDev('WEGE3'));
  return { ...raioX, ticker: 'WEGE3', classe: 'acao', nome: linhaDev('WEGE3').nome, versao: 'v' };
}

function respostaCenarios() {
  return {
    ticker: 'WEGE3',
    nome: 'WEG',
    classe: 'acao',
    cotacao: { valor: okE(52.3), data: '2026-09-29', conferencia: null },
    base: {
      lpa: okE(1.64),
      vpa: okE(5.59),
      dpa: okE(0.84),
      plAlvoPadrao: okE(22.3),
      conferencias: [],
    },
    premissasIniciais: { yieldPct: 6, gPct: 3, kPct: 10, margemPct: 0, plAlvo: 22.3 },
    limites: LIMITES_CENARIO,
    salvo: null,
    podeSalvar: true,
    motivoSemSalvar: null,
    versao: 'v1',
  };
}

function montar(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <VisualV2Provider valor>{ui}</VisualV2Provider>
    </QueryClientProvider>,
  );
}

function paginaWege() {
  est.celular = false;
  est.topo = { ...ATIVO_WEGE3, criterios: CRITERIOS_ATIVO_WEGE3 };
  est.fundamentos = FUNDAMENTOS_WEGE3;
  est.valuation = {
    ...VALUATION_WEGE3,
    pares: { ...VALUATION_WEGE3.pares, itens: [API_WEGE3, API_ITUB4, API_TGMA3] },
    // 3 anos para o mini-gráfico desenhar (com 2 é 'histórico insuficiente')
    historicos: VALUATION_WEGE3.historicos.map((h) => ({
      ...h,
      pontos: [{ ano: 2023, valor: 31.5 }, ...h.pontos],
    })),
  };
  return montar(<PaginaAtivo ticker="WEGE3" />);
}

afterEach(() => {
  cleanup();
  est.qs = '';
});

describe('VISUAL_V2 ligada: página do ativo', () => {
  it('KPIs sem card em blocos tingidos 4×2 e cards com o cabeçalho .hd', () => {
    est.config = CONFIG;
    const { container } = paginaWege();
    const kpis = container.querySelector('[data-bloco="kpis"]')!;
    expect(kpis.hasAttribute('data-visual-v2')).toBe(true);
    expect(kpis.className).not.toMatch(/\bborder\b/);
    const itens = kpis.querySelectorAll('[data-kpi]');
    expect(itens.length).toBe(ATIVO_WEGE3.kpis.length);
    expect(itens[0].className).toContain(VISUAL_V2.tintasKpi[0].split(' ')[0]);
    expect(container.querySelectorAll('[data-cartao-hd]').length).toBeGreaterThanOrEqual(5);
    // cabeçalho do ativo sem card
    const cab = container.querySelector('[data-bloco="cabecalho"]')!;
    expect(cab.className).not.toMatch(/rounded-2xl/);
    esperarDomLimpo(container);
  });

  it('gráfico Lucro × Cotação: base 100 tracejada, área 10% e cotação em dourado', () => {
    est.config = CONFIG;
    const { container } = paginaWege();
    const g = container.querySelector('[data-bloco="grafico"]')!;
    expect(g.querySelector('[data-base-100]')).not.toBeNull();
    expect(g.querySelector('[data-area-serie]')).not.toBeNull();
    const dourados = [...g.querySelectorAll('path')].filter(
      (p) => p.getAttribute('stroke') === DOURADO_ANALISE,
    );
    expect(dourados.length).toBeGreaterThan(0);
    // períodos em pílulas compactas, alvo de 44 px
    for (const b of g.querySelectorAll('[role="group"] button'))
      expect(b.className).toContain('min-h-11');
  });

  it('múltiplos históricos: média em dourado e valor atual no título', () => {
    est.config = CONFIG;
    const { container } = paginaWege();
    expect(container.querySelectorAll('[data-media-dourada]').length).toBeGreaterThan(0);
    const fig = container.querySelector('[data-historico]')!;
    expect(fig.className).toContain('border');
  });

  it('pares: título do HTML, o próprio ativo na 1ª linha destacada e a coluna Marg. líq.', () => {
    est.config = CONFIG;
    const { container } = paginaWege();
    const tabela = container.querySelector('[data-pares-v2]')!;
    expect(container.textContent).toContain(TEXTOS_VISUAL.pares.titulo);
    const linhas = tabela.querySelectorAll('tbody tr');
    expect(linhas[0].getAttribute('data-par')).toBe('WEGE3');
    expect(linhas[0].hasAttribute('data-par-proprio')).toBe(true);
    expect(linhas[0].className).toContain(VISUAL_V2.linhaDestaque.split(' ')[0]);
    expect([...tabela.querySelectorAll('thead th')].map((t) => t.textContent)).toContain(
      'Marg. líq.',
    );
  });

  it('Essencial: linha de unidade acima da tabela e uma nota só', () => {
    est.config = CONFIG;
    const { container } = paginaWege();
    const unidade = container.querySelector('[data-linha-unidade]')!;
    expect(unidade.textContent).toContain(FUNDAMENTOS_WEGE3.unidade);
    expect(container.querySelectorAll('[data-nota-essencial]')).toHaveLength(1);
    const ultimo = container.querySelector('tr[data-ultimo-ano]');
    if (ultimo) expect(ultimo.className).toContain(VISUAL_V2.linhaDestaque.split(' ')[0]);
  });

  it('eventos com o hint "vai para a sua Agenda" no cabeçalho', () => {
    est.config = CONFIG;
    const { container } = paginaWege();
    const ev = container.querySelector('[data-bloco="eventos"]')!;
    expect(ev.querySelector('[data-cartao-hd]')!.textContent).toContain(TEXTOS_VISUAL.eventos.hint);
  });
});

describe('VISUAL_V2 ligada: Raio-X, Comparador e Meus cenários', () => {
  it('Raio-X: um h4 por grupo com a sua tabela; sem chips no computador', () => {
    est.celular = false;
    est.raioX = respostaRaioX();
    const { container } = montar(<TabelaRaioX ticker="WEGE3" classe="acao" />);
    const grupos = container.querySelectorAll('[data-rolagem-card="raio-x"] section[data-bloco]');
    expect(grupos.length).toBe((est.raioX as RaioXResposta).blocos.length);
    for (const g of grupos) {
      expect(g.querySelector('h4')).not.toBeNull();
      expect(g.querySelector('table thead tr')!.className).not.toMatch(/\buppercase\b/);
    }
    expect(
      container.querySelector('[aria-label="' + TEXTOS_RAIO_X.blocos.rotuloChips + '"]'),
    ).toBeNull();
  });

  it('Raio-X no celular: chips de grupo e um grupo por vez', () => {
    est.celular = true;
    est.raioX = respostaRaioX();
    const { container } = montar(<TabelaRaioX ticker="WEGE3" classe="acao" />);
    expect(
      container.querySelector('[aria-label="' + TEXTOS_RAIO_X.blocos.rotuloChips + '"]'),
    ).not.toBeNull();
    expect(
      container.querySelectorAll('[data-rolagem-card="raio-x"] section[data-bloco]'),
    ).toHaveLength(1);
  });

  it('Comparador: faixa de grupo cinza em caixa alta, cabeçalho sem caixa alta, mini-cartões', () => {
    est.celular = false;
    est.qs = 't=WEGE3,ITUB4';
    est.comparador = comparadorAcoes();
    const { container } = montar(<Comparador />);
    const tabela = container.querySelector('[data-tabela-comparador]')!;
    expect(tabela.querySelector('thead tr')!.className).not.toMatch(/\buppercase\b/);
    const faixas = tabela.querySelectorAll('[data-faixa-v2]');
    expect(faixas.length).toBeGreaterThan(0);
    expect(faixas[0].querySelector('th')!.className).toContain('uppercase');
    expect(faixas[0].querySelector('th')!.getAttribute('style')).toBeNull();
    expect(container.querySelectorAll('[data-mini-cartao]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-area-serie]').length).toBeGreaterThan(0);
    esperarDomLimpo(container);
  });

  it('Meus cenários: resultados em caixa e "Salvar cenário" junto da Sua posição', () => {
    est.celular = false;
    est.cenarios = respostaCenarios();
    const { container } = montar(<MeusCenarios ticker="WEGE3" classe="acao" />);
    const barras = container.querySelector('[data-cenarios-barras]')!;
    expect(barras.hasAttribute('data-visual-v2')).toBe(true);
    const posicao = container.querySelector('[data-sua-posicao]')!;
    const coluna = posicao.parentElement!;
    expect(coluna.querySelector('[data-cenario-salvar]')).not.toBeNull();
  });
});

describe('VISUAL_V2: casca da área', () => {
  it.each(['quadro', 'comparador'] as const)(
    '%s: pílulas da área antes do título (ordem do HTML); sem a prop, a casca de hoje',
    (variante) => {
      est.config = CONFIG;
      const { container, unmount } = render(
        <QueryClientProvider client={new QueryClient()}>
          <AnaliseAtivosShell variante={variante} visualV2>
            <div />
          </AnaliseAtivosShell>
        </QueryClientProvider>,
      );
      const casca = container.querySelector('[data-casca-v2]')!;
      expect(casca).not.toBeNull();
      const nav = casca.querySelector('nav[data-pilulas-area]')!;
      const h1 = casca.querySelector('h1')!;
      expect(nav.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      unmount();
      const hoje = render(
        <QueryClientProvider client={new QueryClient()}>
          <AnaliseAtivosShell variante={variante}>
            <div />
          </AnaliseAtivosShell>
        </QueryClientProvider>,
      );
      expect(hoje.container.querySelector('[data-casca-v2]')).toBeNull();
    },
  );
});
