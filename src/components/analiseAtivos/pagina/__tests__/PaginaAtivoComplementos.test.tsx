// @vitest-environment jsdom
/**
 * A6 (fundamentei-trazer, fatia 0): slots dos blocos novos na página do ativo.
 *  - chaves desligadas (recursos sem as chaves novas, topo sem `retornos`): NADA novo monta;
 *  - ligadas: 'Variação da cotação' (só com topo.retornos) entre Gráfico/Dividendos e Fundamentos;
 *    'Imóveis e composição do fundo' só no FII, entre Fundamentos e Valuation; 'Dados societários'
 *    só na ação, depois de Múltiplos + Pares e antes da Tese;
 *  - os stubs reais da fatia 0 não renderizam nada.
 * Os blocos novos entram como marcadores (os corpos são das fatias A, C e D).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const dados = vi.hoisted(() => ({
  topo: undefined as unknown,
  recursos: {} as Record<string, boolean>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/analise-ativos/WEGE3',
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
        recursos: { raioX: false, cenarios: false, comparador: false, ...dados.recursos },
      }),
    useFundamentosAtivo: () => consulta(undefined),
    useValuationAtivo: () => consulta(undefined),
  };
});
vi.mock('@/hooks/useEducacao', () => ({
  useCursos: () => ({ cursos: [], accessLevel: 0, loading: true, error: null }),
}));
// blocos com dono e testes próprios: stubs leves
for (const caminho of [
  '@/components/analiseAtivos/ativo/usuario/BlocoNaCarteira',
  '@/components/analiseAtivos/ativo/usuario/AcoesCarteiraAtivo',
  '@/components/analiseAtivos/ativo/usuario/BlocoTese',
  '@/components/analiseAtivos/ativo/analise/BlocoFundamentos',
  '@/components/analiseAtivos/ativo/analise/BlocoValuation',
  '@/components/analiseAtivos/ativo/analise/BlocoMultiplosHistoricos',
  '@/components/analiseAtivos/ativo/analise/BlocoPares',
]) {
  vi.doMock(caminho, () => ({ default: () => <div data-stub={caminho.split('/').pop()} /> }));
}
const marcador = (nome: string) => ({
  default: (props: Record<string, unknown>) => (
    <div data-bloco-novo={nome} data-props={JSON.stringify(props)} />
  ),
});
vi.mock('@/components/analiseAtivos/ativo/topo/BlocoRetornosCotacao', () => marcador('retornos'));
vi.mock('@/components/analiseAtivos/ativo/fii/BlocoImoveisFii', () => marcador('imoveisFii'));
vi.mock('@/components/analiseAtivos/ativo/societario/BlocoSocietario', () =>
  marcador('societario'),
);

import { ATIVO_WEGE3 } from '@/test/fixtures/analiseAtivos/respostas';
import type { AtivoTopoResposta } from '@/types/analiseAtivosApi';
import type { RetornosCotacaoApi } from '@/types/analiseAtivosComplementos';

const RETORNOS: RetornosCotacaoApi = {
  classe: 'acao',
  ateData: '2026-10-17',
  janelas: [],
  distanciaMaxima: { estado: 'ok', valor: -14.2 },
  maxima: null,
  inicioSerie: null,
  flags: [],
};
const LIGADOS = { imoveisFii: true, retornos: true, societario: true, alavAtivo: true };
const FII: AtivoTopoResposta = {
  ...ATIVO_WEGE3,
  ticker: 'HGLG11',
  classe: 'fii',
  fiiTipoCvm: 'tijolo',
};

async function renderPagina(topo: AtivoTopoResposta) {
  dados.topo = topo;
  const { default: PaginaAtivo } = await import('@/components/analiseAtivos/pagina/PaginaAtivo');
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactNode = <PaginaAtivo ticker={topo.ticker} />;
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const blocos = (c: HTMLElement) =>
  [...c.querySelectorAll('[data-bloco-novo]')].map((e) => e.getAttribute('data-bloco-novo'));
/** ordem dos marcadores no DOM (stubs + blocos novos) */
const ordem = (c: HTMLElement) =>
  [...c.querySelectorAll('[data-stub],[data-bloco-novo]')].map(
    (e) => e.getAttribute('data-bloco-novo') ?? e.getAttribute('data-stub'),
  );

afterEach(() => {
  cleanup();
  dados.recursos = {};
});

describe('PaginaAtivo × A6 (fatia 0)', () => {
  it('chaves desligadas: nenhum bloco novo na ação nem no FII', async () => {
    for (const topo of [ATIVO_WEGE3, FII]) {
      const { container } = await renderPagina(topo);
      expect(blocos(container)).toEqual([]);
      cleanup();
    }
  });

  it('retornos do topo sem a chave do cliente ainda aparecem só se o topo trouxer o campo', async () => {
    const { container } = await renderPagina({ ...ATIVO_WEGE3, retornos: RETORNOS });
    expect(blocos(container)).toEqual(['retornos']);
  });

  it('ação com as chaves: retornos antes de Fundamentos; societário entre Pares e Tese', async () => {
    dados.recursos = LIGADOS;
    const { container } = await renderPagina({ ...ATIVO_WEGE3, retornos: RETORNOS });
    expect(blocos(container)).toEqual(['retornos', 'societario']);
    const o = ordem(container);
    expect(o.indexOf('retornos')).toBeLessThan(o.indexOf('BlocoFundamentos'));
    expect(o.indexOf('societario')).toBeGreaterThan(o.indexOf('BlocoPares'));
    expect(o.indexOf('societario')).toBeLessThan(o.indexOf('BlocoTese'));
    const props = JSON.parse(
      container.querySelector('[data-bloco-novo="retornos"]')!.getAttribute('data-props')!,
    );
    expect(props).toEqual({ ticker: 'WEGE3', retornos: RETORNOS });
  });

  it('FII com as chaves: imóveis entre Fundamentos e Valuation, com o tipo CVM; sem societário', async () => {
    dados.recursos = LIGADOS;
    const { container } = await renderPagina(FII);
    expect(blocos(container)).toEqual(['imoveisFii']);
    const o = ordem(container);
    expect(o.indexOf('imoveisFii')).toBeGreaterThan(o.indexOf('BlocoFundamentos'));
    expect(o.indexOf('imoveisFii')).toBeLessThan(o.indexOf('BlocoValuation'));
    const props = JSON.parse(
      container.querySelector('[data-bloco-novo="imoveisFii"]')!.getAttribute('data-props')!,
    );
    expect(props).toEqual({ ticker: 'HGLG11', fiiTipo: 'tijolo' });
  });

  it('os stubs reais da fatia 0 não renderizam nada', async () => {
    const real = await Promise.all([
      vi.importActual<typeof import('@/components/analiseAtivos/ativo/fii/BlocoImoveisFii')>(
        '@/components/analiseAtivos/ativo/fii/BlocoImoveisFii',
      ),
      vi.importActual<typeof import('@/components/analiseAtivos/ativo/topo/BlocoRetornosCotacao')>(
        '@/components/analiseAtivos/ativo/topo/BlocoRetornosCotacao',
      ),
      vi.importActual<typeof import('@/components/analiseAtivos/ativo/societario/BlocoSocietario')>(
        '@/components/analiseAtivos/ativo/societario/BlocoSocietario',
      ),
    ]);
    const [Imoveis, Retornos, Societario] = real.map((m) => m.default);
    const { container } = render(
      <div>
        <Imoveis ticker="HGLG11" fiiTipo="tijolo" />
        <Retornos ticker="WEGE3" retornos={RETORNOS} />
        <Societario ticker="WEGE3" />
      </div>,
    );
    expect(container.innerHTML).toBe('<div></div>');
  });
});
