// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';

/**
 * Esconder valores — Carteira › Resumo consolidado (fatia 2, a tela do print do Pedro): hero
 * (Carteira total, Valor aplicado, Saldo bruto), Patrimônio Líquido, Alocação e Mercado hoje, no
 * celular e no computador, com valores-sentinela. Os gráficos (react-apexcharts mockado) estão em
 * src/components/charts/__tests__/graficosCarteira.valoresOcultos.test.tsx; o Caixa para Investir
 * é da fatia 1 (aqui fica um dublê).
 */

const ambiente = vi.hoisted(() => ({ isBelowLg: true }));
vi.mock('next/navigation', () => ({ usePathname: () => '/carteira' }));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => ambiente.isBelowLg }));
vi.mock('@/context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));
vi.mock('@/icons', () => ({ DownloadIcon: () => <svg />, PlusIcon: () => <svg /> }));
vi.mock('react-apexcharts', () => ({ default: () => <div data-testid="chart" /> }));
vi.mock('@/components/carteira/shared/CaixaParaInvestirCard', () => ({
  default: () => <div data-testid="caixa-para-investir" />,
}));

const alocacao = vi.hoisted(() => ({
  configuracoes: [
    { categoria: 'reservaEmergencia', minimo: 5, maximo: 10, target: 10 },
    { categoria: 'rendaFixaFundos', minimo: 20, maximo: 60, target: 50 },
  ],
}));
vi.mock('@/hooks/useAlocacaoConfig', () => ({
  useAlocacaoConfig: () => ({
    configuracoes: alocacao.configuracoes,
    loading: false,
    error: null,
    updateConfiguracao: () => {},
    saveChanges: async () => true,
    startEditing: () => {},
    stopEditing: () => {},
    isEditing: () => false,
    totalTargets: 60,
    changedCategorias: [],
    refetch: async () => {},
  }),
}));

import CarteiraResumo from '../CarteiraResumo';
import { CarteiraResumoProvider } from '@/context/CarteiraResumoContext';
import type { CarteiraResumo as CarteiraResumoDados } from '@/hooks/useCarteira';
import { ComValoresOcultos, SENTINELAS, expectSemValoresExpostos } from '@/test/valoresOcultos';
import { createTestQueryClient } from '@/test/wrappers';
import { stubFetch } from '@/test/mocks/fetch';
import { formatBRL } from '@/utils/format';

const zero = { valor: 0, percentual: 0 };
const resumo = {
  saldoBruto: SENTINELAS.saldo,
  valorAplicado: SENTINELAS.aplicado,
  rentabilidade: 12.3,
  metaPatrimonio: 0,
  caixaParaInvestir: 0,
  totais: {
    dinheiro: SENTINELAS.saldo,
    dinheiroMaisBens: SENTINELAS.saldo + SENTINELAS.aplicado,
    dividas: SENTINELAS.precoMedio * 1000,
    patrimonioLiquido: SENTINELAS.aplicado,
  },
  historicoPatrimonio: [
    {
      data: Date.UTC(2025, 0, 1),
      valorAplicado: SENTINELAS.aplicado,
      saldoBruto: SENTINELAS.saldo,
    },
    {
      data: Date.UTC(2026, 0, 1),
      valorAplicado: SENTINELAS.aplicado,
      saldoBruto: SENTINELAS.saldo,
    },
  ],
  distribuicao: {
    reservaEmergencia: { valor: SENTINELAS.aplicado / 10, percentual: 8.88 },
    reservaOportunidade: zero,
    rendaFixaFundos: { valor: SENTINELAS.saldo, percentual: 91.12 },
    fimFia: zero,
    fiis: zero,
    acoes: zero,
    stocks: zero,
    reits: zero,
    etfs: zero,
    moedasCriptos: zero,
    previdenciaSeguros: zero,
    opcoes: zero,
    imoveisBens: { valor: SENTINELAS.aplicado, percentual: 47 },
  },
  portfolioDetalhes: {
    totalAcoes: 0,
    totalInvestimentos: 0,
    stocksTotalInvested: 0,
    stocksCurrentValue: 0,
    otherInvestmentsTotalInvested: 0,
    otherInvestmentsCurrentValue: 0,
  },
} as CarteiraResumoDados;

const indicadores = {
  indicators: {
    ibov: { price: 131234, changePercent: 0.5 },
    dolar: { price: 5.37, changePercent: -0.2 },
    bitcoin: { price: 350000, changePercent: 1.1 },
    ethereum: { price: 18000, changePercent: 0 },
  },
};

function renderResumo(ocultos: boolean) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ComValoresOcultos ocultos={ocultos}>
        <CarteiraResumoProvider
          value={{
            resumo,
            loading: false,
            error: null,
            formatCurrency: (v) => formatBRL(v ?? 0),
            formatPercentage: (v) => `${(v ?? 0).toFixed(2)}%`,
            updateMeta: async () => true,
            updateCaixaParaInvestir: async () => true,
            refetch: async () => {},
            necessidadeAporteMap: {},
            isAlocacaoLoading: false,
            invalidateAssets: () => {},
          }}
        >
          <CarteiraResumo />
        </CarteiraResumoProvider>
      </ComValoresOcultos>
    </QueryClientProvider>,
  );
}

/** Mercado hoje carregado (o dólar é a última cotação a chegar). */
const esperarMercado = () =>
  waitFor(() => expect(document.body.textContent).toContain(formatBRL(5.37)));

beforeEach(() => {
  stubFetch(indicadores);
  // O BroadcastChannel do Node atravessa os workers do vitest: o clique no olho em outro arquivo de
  // teste mudaria o estado do provider aqui. Sem canal, cada teste fica com o estado que pediu.
  vi.stubGlobal('BroadcastChannel', undefined);
  window.history.replaceState(null, '', '/carteira');
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each([
  { nome: 'celular', isBelowLg: true },
  { nome: 'computador', isBelowLg: false },
])('CarteiraResumo com o olho fechado ($nome)', ({ isBelowLg }) => {
  beforeEach(() => {
    ambiente.isBelowLg = isBelowLg;
  });

  it('nenhum valor em dinheiro exposto; Mercado hoje e % visíveis', async () => {
    const { container } = renderResumo(true);
    await esperarMercado();
    expectSemValoresExpostos(container);
    // Mercado hoje: as cotações ficam (exceção explícita).
    expect(container.querySelectorAll('[data-mf-valor-visivel]').length).toBeGreaterThanOrEqual(3);
    // % da Alocação continuam.
    expect(container).toHaveTextContent('91.12%');
    expect(container.querySelectorAll('.mf-sensivel').length).toBeGreaterThan(0);
  });

  it('olho aberto: os valores aparecem como hoje, sem pílula', async () => {
    const { container } = renderResumo(false);
    await esperarMercado();
    expect(container.querySelectorAll('.mf-sensivel, [data-mf-valor-visivel]')).toHaveLength(0);
    expect(container.textContent).toContain(formatBRL(SENTINELAS.saldo));
  });
});

describe('hero da Carteira consolidada (celular)', () => {
  beforeEach(() => {
    ambiente.isBelowLg = true;
  });

  it('Carteira total, Valor aplicado e Saldo bruto viram pílula', async () => {
    const { container } = renderResumo(true);
    await esperarMercado();
    const hero = screen.getByRole('region', { name: 'Carteira total' });
    expect(hero.querySelectorAll('[data-mf-sensivel]')).toHaveLength(3);
    expect(hero).toHaveTextContent('Valor aplicado');
    expect(hero).toHaveTextContent('Saldo bruto');
    expectSemValoresExpostos(hero);
    // Patrimônio Líquido (MetricCard): valor e "em dívidas" em pílula.
    expect(container).toHaveTextContent('em dívidas');
  });
});
