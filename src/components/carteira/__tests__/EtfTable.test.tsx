// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/wrappers';
import { ComValoresOcultos } from '@/test/valoresOcultos';
import { formatBRL, formatPct, formatUSD } from '@/utils/format';

/**
 * Aba ETF's com ETF americano em US$ (nov/2026, ticket 86e3fq1yh): a moeda é da LINHA
 * (moedaRegistro), nunca da seção. VOO mostra US$ com o R$ embaixo; IVVB11 na seção EUA é da
 * B3 e fica só em R$. Com o olho fechado só a Cotação (congelada) fica visível.
 */

const h = vi.hoisted(() => ({ data: null as unknown, celular: false }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/carteira',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/hooks/useMediaQuery', () => ({
  useIsBelowLg: () => h.celular,
  useMediaQuery: () => h.celular,
}));
vi.mock('@/icons', () => {
  const Icone = () => <svg />;
  return {
    ChevronDownIcon: Icone,
    ChevronUpIcon: Icone,
    DollarLineIcon: Icone,
    DownloadIcon: Icone,
    PlusIcon: Icone,
    CloseIcon: Icone,
  };
});
vi.mock('@/components/common/LoadingSpinner', () => ({ default: () => <div /> }));
vi.mock('@/context/CarteiraResumoContext', () => ({
  useCarteiraResumoContext: () => ({ necessidadeAporteMap: {} }),
  useCarteiraResumoContextOptional: () => null,
}));
vi.mock('@/hooks/useMoverInvestimento', () => ({
  useMoverInvestimento: () => ({
    mover: vi.fn(),
    restaurar: vi.fn(),
    isPending: false,
    pendingId: undefined,
  }),
}));
vi.mock('@/hooks/useMoverOpcoes', () => ({
  useMoverOpcoes: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('@/components/carteira/mover/MoverInvestimento', () => ({ MoverInvestimento: () => null }));
vi.mock('@/components/charts/pie/PieChartEtfAtivo', () => ({ default: () => <div /> }));
vi.mock('@/hooks/useEtf', () => ({
  useEtf: () => ({
    data: h.data,
    loading: false,
    error: null,
    formatCurrency: (v: number) => formatBRL(v),
    formatPercentage: (v: number) => formatPct(v),
    formatNumber: (v: number) => (v ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 }),
    updateObjetivo: vi.fn().mockResolvedValue(true),
    updateCaixaParaInvestir: vi.fn().mockResolvedValue(true),
  }),
}));

import EtfTable from '@/components/carteira/EtfTable';

const base = {
  regiao: 'estados_unidos',
  indiceRastreado: 'outros',
  riscoPorAtivo: 50,
  percentualCarteira: 50,
  objetivo: 10,
  quantoFalta: 0,
  necessidadeAporte: 0,
};

const ivvb11 = {
  ...base,
  id: 'p-ivvb',
  ticker: 'IVVB11',
  nome: 'iShares S&P 500',
  quantidade: 10,
  precoAquisicao: 300,
  valorTotal: 3000,
  cotacaoAtual: 330,
  valorAtualizado: 3300,
  proventos: 0,
  rentabilidade: 10,
};

// Valores improváveis para o olho fechado não esbarrar em coincidência.
const voo = {
  ...base,
  id: 'p-voo',
  ticker: 'VOO',
  symbol: 'VOO-1730000000000-ab3cd11',
  nome: 'VOO - US$ 1.234,56 - 03/11/2026',
  moedaRegistro: 'USD',
  quantidade: 2,
  precoAquisicao: 3456.78,
  valorTotal: 6913.56,
  cotacaoAtual: 2750,
  valorAtualizado: 5500,
  proventos: 57.75,
  rentabilidade: -19.6,
  precoAquisicaoUSD: 617.28,
  valorTotalUSD: 1234.56,
  cotacaoAtualUSD: 500,
  valorAtualizadoUSD: 1000,
  proventosUSD: 10.5,
  semCambio: false,
};

const dados = (ativos: unknown[], extra: Record<string, unknown> = {}) => ({
  resumo: {
    necessidadeAporteTotal: 0,
    caixaParaInvestir: 0,
    saldoInicioMes: 9913.56,
    valorAtualizado: 8800,
    rendimento: -1055.81,
    rentabilidade: -10.65,
  },
  secoes: [
    {
      regiao: 'brasil',
      nome: 'Brasil',
      ativos: [],
      totalQuantidade: 0,
      totalValorAplicado: 0,
      totalValorAtualizado: 0,
      totalPercentualCarteira: 0,
      totalRisco: 0,
      totalObjetivo: 0,
      totalQuantoFalta: 0,
      totalNecessidadeAporte: 0,
      rentabilidadeMedia: 0,
      totalProventos: 0,
    },
    {
      regiao: 'estados_unidos',
      nome: 'EUA',
      ativos,
      totalQuantidade: 12,
      totalValorAplicado: 9913.56,
      totalValorAtualizado: 8800,
      totalPercentualCarteira: 100,
      totalRisco: 100,
      totalObjetivo: 20,
      totalQuantoFalta: 0,
      totalNecessidadeAporte: 0,
      rentabilidadeMedia: -10.65,
      totalProventos: 57.75,
    },
  ],
  totalGeral: {
    quantidade: 12,
    valorAplicado: 9913.56,
    valorAtualizado: 8800,
    percentualCarteira: 100,
    risco: 100,
    objetivo: 20,
    quantoFalta: 0,
    necessidadeAporte: 0,
    rentabilidade: -10.65,
    proventos: 57.75,
  },
  alocacaoAtivo: [],
  tabelaAuxiliar: [],
  ...extra,
});

const renderAba = (ocultos?: boolean) => {
  const ui = (
    <QueryClientProvider client={createTestQueryClient()}>
      <EtfTable totalCarteira={8800} />
    </QueryClientProvider>
  );
  return ocultos === undefined
    ? render(ui)
    : render(<ComValoresOcultos ocultos={ocultos}>{ui}</ComValoresOcultos>);
};

const linhaDe = (ticker: string) => screen.getByText(ticker).closest('tr') as HTMLElement;

describe('EtfTable — ETF americano em US$ (computador)', () => {
  beforeEach(() => {
    h.celular = false;
  });

  it('linha USD mostra US$ com o R$ embaixo, selo US$ e a cotação congelada', () => {
    h.data = dados([ivvb11, voo], { cotacaoDolar: 5.5, taxaData: '2026-11-03' });
    renderAba();
    const tr = linhaDe('VOO');
    expect(within(tr).getByTitle('ETF em dólar')).toHaveTextContent('US$');
    const texto = tr.textContent ?? '';
    for (const usd of [617.28, 1234.56, 1000, 10.5, 500]) expect(texto).toContain(formatUSD(usd));
    for (const brl of [3456.78, 6913.56, 5500, 57.75, 2750])
      expect(texto).toContain(formatBRL(brl));
    expect(texto).toContain('congelada');
  });

  it('linha BRL na seção EUA (IVVB11) mostra só R$, sem selo nem câmbio', () => {
    h.data = dados([ivvb11, voo], { cotacaoDolar: 5.5, taxaData: '2026-11-03' });
    renderAba();
    const tr = linhaDe('IVVB11');
    expect(tr.textContent).not.toContain('US$');
    expect(tr.textContent).not.toContain('congelada');
    expect(tr.textContent).toContain(formatBRL(300));
    expect(tr.textContent).toContain(formatBRL(3300));
  });

  it('faixa do câmbio só aparece quando há linha USD', () => {
    h.data = dados([ivvb11, voo], { cotacaoDolar: 5.5, taxaData: '2026-11-03' });
    const { unmount } = renderAba();
    expect(screen.getByText('US$ 1 = R$ 5,5000 em 03/11')).toBeInTheDocument();
    unmount();
    h.data = dados([ivvb11]);
    renderAba();
    expect(screen.queryByText(/US\$ 1 = R\$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/selo US\$/)).not.toBeInTheDocument();
  });

  it('sem câmbio: a linha USD mostra só o US$ e avisa', () => {
    h.data = dados(
      [
        ivvb11,
        {
          ...voo,
          semCambio: true,
          precoAquisicao: 0,
          valorTotal: 0,
          cotacaoAtual: 0,
          valorAtualizado: 0,
          proventos: 0,
        },
      ],
      { cotacaoDolar: null, taxaData: null, posicoesSemCambio: 1 },
    );
    renderAba();
    const linha = within(linhaDe('VOO'));
    expect(linhaDe('VOO').textContent).toContain(formatUSD(1234.56));
    // Preço médio, valor total, valor atualizado e proventos: só US$ + "sem câmbio".
    expect(linha.getAllByText('sem câmbio')).toHaveLength(4);
    expect(linhaDe('VOO').textContent).not.toContain(formatBRL(2750));
    expect(screen.getByText(/1 ETF em dólar ficou fora do total/)).toBeInTheDocument();
  });

  it('olho fechado: preço médio, valor total, valor atualizado e proventos (US$ e R$) somem; a Cotação fica', () => {
    h.data = dados([ivvb11, voo], { cotacaoDolar: 5.5, taxaData: '2026-11-03' });
    renderAba(true);
    const tr = linhaDe('VOO');
    const visivel = (el: Element) =>
      !el.closest('.mf-sensivel__valor') || !!el.closest('[data-mf-valor-visivel]');
    const textos: string[] = [];
    const walker = document.createTreeWalker(tr, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.parentElement && visivel(n.parentElement) && n.textContent) textos.push(n.textContent);
    }
    const exposto = textos.join(' | ');
    for (const v of [
      formatUSD(617.28),
      formatUSD(1234.56),
      formatUSD(1000),
      formatUSD(10.5),
      formatBRL(3456.78),
      formatBRL(6913.56),
      formatBRL(5500),
      formatBRL(57.75),
    ]) {
      expect(exposto).not.toContain(v);
    }
    // Cotação (dado de mercado, congelada no preço médio): visível nas duas moedas.
    const visiveis = Array.from(tr.querySelectorAll('[data-mf-valor-visivel]')).map(
      (el) => el.textContent,
    );
    expect(visiveis).toContain(formatUSD(500));
    expect(visiveis).toContain(formatBRL(2750));
    // Faixa do câmbio continua legível.
    expect(screen.getByText('US$ 1 = R$ 5,5000 em 03/11')).toBeInTheDocument();
  });
});

describe('EtfTable — ETF americano em US$ (celular)', () => {
  beforeEach(() => {
    h.celular = true;
  });

  it('cartão do VOO mostra o valor em US$ com o R$ embaixo; IVVB11 só em R$', () => {
    h.data = dados([ivvb11, voo], { cotacaoDolar: 5.5, taxaData: '2026-11-03' });
    const { container } = renderAba();
    const texto = container.textContent ?? '';
    expect(texto).toContain(formatUSD(1000));
    expect(texto).toContain(formatBRL(5500));
    expect(texto).toContain(formatBRL(3300));
    expect(screen.getByText('US$ 1 = R$ 5,5000 em 03/11')).toBeInTheDocument();
  });
});
