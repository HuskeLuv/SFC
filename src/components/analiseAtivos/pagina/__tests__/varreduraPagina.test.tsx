// @vitest-environment jsdom
/**
 * Caso 32 (spec v2.4 §4.5) na PÁGINA DO ATIVO — fatia C2. Renderiza a PaginaAtivo inteira com os
 * dados das fixtures (topo sem Índice/semáforo, com os critérios nas 3 janelas; Essencial, Valuation
 * e pares) e varre o DOM com varrerDom (linguagemV2 + classes de placar + literais registrados):
 *  - nada de "Índice MF", "No Índice", semáforo, destaque, ★ nem data-destaque;
 *  - o card "Critérios de fundamentos" vem logo depois do cabeçalho e o bloco do Índice não existe;
 *  - o "Por quê?" de uma conferência não tem a linha do Índice.
 * Os blocos da Carteira (C1: Na sua carteira, ações do cabeçalho) e a tese entram como stubs: têm
 * dono, testes e varredura próprios (C1) e a varredura global é da F.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const dados = vi.hoisted(() => ({
  topo: undefined as unknown,
  topoTicker: '',
  fundamentos: undefined as unknown,
  valuation: undefined as unknown,
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
        recursos: { raioX: false, cenarios: false, comparador: false },
      }),
    useFundamentosAtivo: () => consulta(dados.fundamentos),
    useValuationAtivo: () => consulta(dados.valuation),
  };
});
// Card do curso: sem a lista de cursos (fallback do CardEducacao), sem fetch
vi.mock('@/hooks/useEducacao', () => ({
  useCursos: () => ({ cursos: [], accessLevel: 0, loading: true, error: null }),
}));
// Carteira e tese (C1 / Fase 1): stubs com texto neutro
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
import { esperarDomLimpo, varrerDom } from '@/test/utils/varrerDom';
import {
  ATIVO_WEGE3,
  ATIVO_WEGE3_V2,
  FUNDAMENTOS_WEGE3,
  VALUATION_WEGE3,
} from '@/test/fixtures/analiseAtivos/respostas';
import {
  CRITERIOS_ATIVO_HGLG11,
  CRITERIOS_ATIVO_ITUB4,
  CRITERIOS_ATIVO_WEGE3,
} from '@/test/fixtures/analiseAtivos/criterios';
import type { AtivoTopoResposta } from '@/types/analiseAtivosApi';
import type { CriteriosAtivo } from '@/types/analiseAtivosCriterios';

/** Topo v2.4 com os critérios da janela (montarTopoAtivo). */
function topoV24(base: AtivoTopoResposta, criterios: CriteriosAtivo | null): AtivoTopoResposta {
  return { ...base, criterios };
}

function comProvider(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  dados.topo = undefined;
});

describe('caso 32 · página do ativo sem Índice, semáforo ou destaque', () => {
  it.each([
    ['WEGE3', ATIVO_WEGE3, CRITERIOS_ATIVO_WEGE3],
    ['ITUB4 (financeira, n de 3)', ATIVO_WEGE3, CRITERIOS_ATIVO_ITUB4],
    [
      'HGLG11 (FII, D3)',
      { ...ATIVO_WEGE3, ticker: 'HGLG11', classe: 'fii' },
      CRITERIOS_ATIVO_HGLG11,
    ],
    ['sem avaliação de critérios', ATIVO_WEGE3, null],
  ] as const)('%s: varrerDom limpo nas 3 janelas', (_nome, topo, criterios) => {
    dados.topo = topoV24(topo as AtivoTopoResposta, criterios);
    dados.topoTicker = (topo as AtivoTopoResposta).ticker;
    dados.fundamentos = FUNDAMENTOS_WEGE3;
    dados.valuation = VALUATION_WEGE3;
    const { container } = comProvider(<PaginaAtivo ticker={(topo as AtivoTopoResposta).ticker} />);
    const varrer = () => {
      const r = esperarDomLimpo(container);
      expect(r.texto).not.toMatch(/Índice MF|No Índice|semáforo/i);
      expect(container.querySelector('[data-destaque]')).toBeNull();
      expect(container.querySelector('[data-bloco="indice"]')).toBeNull();
    };
    // os blocos preguiçosos montaram (sem IntersectionObserver no jsdom): a varredura cobre tudo
    expect(container.querySelector('[data-rolagem-card="fundamentos"]')).not.toBeNull();
    expect(container.querySelector('[data-grupo]')).not.toBeNull();
    expect(
      container.querySelector('section[aria-labelledby="pares-' + dados.topoTicker + '"]'),
    ).not.toBeNull();
    varrer();
    if (criterios) {
      for (const anos of [3, 10]) {
        fireEvent.click(screen.getByRole('radio', { name: `${anos} anos` }));
        varrer();
      }
    }
  });

  it('ordem do HTML do Pedro: cabeçalho → critérios → carteira/KPIs; sem o bloco do Índice', () => {
    dados.topo = topoV24(ATIVO_WEGE3, CRITERIOS_ATIVO_WEGE3);
    dados.fundamentos = FUNDAMENTOS_WEGE3;
    dados.valuation = VALUATION_WEGE3;
    const { container } = comProvider(<PaginaAtivo ticker="WEGE3" />);
    const pagina = container.querySelector('[data-pagina-ativo="WEGE3"]')!;
    const filhos = [...pagina.children];
    const iCab = filhos.findIndex((el) => el.tagName === 'HEADER' || el.querySelector('h1'));
    const iCrit = filhos.findIndex((el) => el.hasAttribute('data-card-criterios'));
    const iCarteira = filhos.findIndex((el) => el.querySelector('[data-stub="na-carteira"]'));
    expect(iCab).toBe(0);
    expect(iCrit).toBe(1);
    expect(iCarteira).toBe(2);
    expect(within(filhos[iCrit] as HTMLElement).getByText('Critérios de fundamentos')).toBeTruthy();
  });

  it('o "Por quê?" de uma conferência não tem a linha do Índice', () => {
    dados.topo = topoV24(ATIVO_WEGE3_V2, CRITERIOS_ATIVO_WEGE3);
    dados.fundamentos = FUNDAMENTOS_WEGE3;
    dados.valuation = VALUATION_WEGE3;
    const { container } = comProvider(<PaginaAtivo ticker="WEGE3" />);
    const chips = screen.queryAllByRole('button', { name: /em conferência: por quê/ });
    expect(chips.length).toBeGreaterThan(0);
    fireEvent.click(chips[0]);
    const d = screen.getByRole('dialog');
    expect(within(d).queryByText(/Índice/)).toBeNull();
    expect(varrerDom(container).achados.filter((a) => a.detalhe === 'Índice')).toEqual([]);
  });
});
