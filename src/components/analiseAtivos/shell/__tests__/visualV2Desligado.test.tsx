// @vitest-environment jsdom
/**
 * fundamentei-regras (F4, item C): com ANALISE_ATIVOS_VISUAL_V2_HABILITADO DESLIGADA o DOM das
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

import QuadroAnalise from '@/components/analiseAtivos/quadro/QuadroAnalise';
import PaginaAtivo from '@/components/analiseAtivos/pagina/PaginaAtivo';
import Comparador from '@/components/analiseAtivos/comparador/Comparador';
import TabelaRaioX from '@/components/analiseAtivos/ativo/analise/TabelaRaioX';
import MeusCenarios from '@/components/analiseAtivos/ativo/cenarios/MeusCenarios';
import { VisualV2Provider } from '@/components/analiseAtivos/shell/VisualV2';
import {
  API_AURE3,
  API_ITUB4,
  API_TGMA3,
  API_WEGE3,
  ATIVO_WEGE3,
  FUNDAMENTOS_WEGE3,
  QUADRO_ACOES,
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

function quadroComDados() {
  est.quadro = {
    data: {
      pages: [{ ...QUADRO_ACOES, itens: [API_WEGE3, API_ITUB4, API_TGMA3, API_AURE3], total: 4 }],
      pageParams: [0],
    },
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  };
}

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

/** HTML com os ids do React normalizados. */
function html(ui: ReactNode, envolver: boolean): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const arvore = envolver ? <VisualV2Provider valor={false}>{ui}</VisualV2Provider> : ui;
  const { container, unmount } = render(
    <QueryClientProvider client={qc}>{arvore}</QueryClientProvider>,
  );
  const saida = container.innerHTML.replace(/«r[0-9a-z]+»|:r[0-9a-z]+:|_r_[0-9a-z]+_/g, ':id:');
  unmount();
  return saida;
}

const TELAS: Array<[string, () => ReactNode]> = [
  [
    'quadro-computador',
    () => {
      est.celular = false;
      quadroComDados();
      return <QuadroAnalise />;
    },
  ],
  [
    'quadro-celular',
    () => {
      est.celular = true;
      quadroComDados();
      return <QuadroAnalise />;
    },
  ],
  [
    'pagina-wege3',
    () => {
      est.celular = false;
      est.topo = { ...ATIVO_WEGE3, criterios: CRITERIOS_ATIVO_WEGE3 };
      est.fundamentos = FUNDAMENTOS_WEGE3;
      est.valuation = VALUATION_WEGE3;
      return <PaginaAtivo ticker="WEGE3" />;
    },
  ],
  [
    'comparador',
    () => {
      est.celular = false;
      est.qs = 't=WEGE3,ITUB4';
      est.comparador = comparadorAcoes();
      return <Comparador />;
    },
  ],
  [
    'raio-x',
    () => {
      est.raioX = respostaRaioX();
      return <TabelaRaioX ticker="WEGE3" classe="acao" />;
    },
  ],
  [
    'meus-cenarios',
    () => {
      est.cenarios = respostaCenarios();
      return <MeusCenarios ticker="WEGE3" classe="acao" />;
    },
  ],
];

afterEach(() => {
  cleanup();
  est.qs = '';
});

describe('VISUAL_V2 desligada: DOM idêntico ao de antes da F4', () => {
  est.config = CONFIG;
  it.each(TELAS)('%s', (_nome, montar) => {
    est.config = CONFIG;
    const antes = html(montar(), false);
    expect(antes).toMatchSnapshot();
    const comProvedor = html(montar(), true);
    expect(comProvedor).toBe(antes);
  });
});
