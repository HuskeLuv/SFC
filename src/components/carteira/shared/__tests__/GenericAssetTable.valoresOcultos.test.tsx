// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import GenericAssetTable, {
  type ColumnDef,
  type GenericAssetTableProps,
  type MetricCardConfig,
} from '@/components/carteira/shared/GenericAssetTable';
import { createTestQueryClient } from '@/test/wrappers';
import {
  ComValoresOcultos,
  SENTINELAS,
  expectPilulas,
  expectSemValoresExpostos,
} from '@/test/valoresOcultos';
import { formatBRL, formatPct } from '@/utils/format';

/**
 * Esconder valores (fatia 1): a tabela genérica das abas da Carteira com o olho fechado.
 * Fixture com SENTINELAS — nenhuma representação delas pode sobrar no texto, nem em title/aria.
 * Cotação atual (12,34) e os % continuam visíveis; quantidade vira pílula curta.
 */

const tela = vi.hoisted(() => ({ celular: false }));

vi.mock('next/navigation', () => ({ usePathname: () => '/carteira' }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => tela.celular }));
vi.mock('@/components/common/LoadingSpinner', () => ({ default: () => <div /> }));
vi.mock('@/components/common/ComponentCard', () => ({
  default: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));
vi.mock('@/icons', () => ({
  ChevronDownIcon: () => <svg />,
  ChevronUpIcon: () => <svg />,
  DollarLineIcon: () => <svg />,
}));
vi.mock('@/context/CarteiraResumoContext', () => ({
  useCarteiraResumoContext: () => ({ necessidadeAporteMap: {} }),
  useCarteiraResumoContextOptional: () => null,
}));

interface Ativo {
  id: string;
  ticker: string;
  nome: string;
  quantidade: number;
  precoAquisicao: number;
  valorTotal: number;
  cotacaoAtual: number;
  valorAtualizado: number;
  rentabilidade: number;
  objetivo: number;
  percentualCarteira: number;
  quantoFalta: number;
  necessidadeAporte: number;
}
interface Secao {
  tipo: string;
  nome: string;
  ativos: Ativo[];
  totalQuantidade: number;
  totalValorAplicado: number;
  totalValorAtualizado: number;
  totalNecessidadeAporte: number;
}

const COTACAO = 12.34;
const ATIVO: Ativo = {
  id: 'p1',
  ticker: 'PETR4',
  nome: 'Petrobras PN',
  quantidade: SENTINELAS.quantidade,
  precoAquisicao: SENTINELAS.precoMedio,
  valorTotal: SENTINELAS.aplicado,
  cotacaoAtual: COTACAO,
  valorAtualizado: SENTINELAS.saldo,
  rentabilidade: 12.5,
  objetivo: 30,
  percentualCarteira: 100,
  quantoFalta: -70,
  necessidadeAporte: SENTINELAS.aplicado,
};
const SECAO: Secao = {
  tipo: 'valor',
  nome: 'Valor',
  ativos: [ATIVO],
  totalQuantidade: SENTINELAS.quantidade,
  totalValorAplicado: SENTINELAS.aplicado,
  totalValorAtualizado: SENTINELAS.saldo,
  totalNecessidadeAporte: SENTINELAS.aplicado,
};
const DATA = {
  secoes: [SECAO],
  totalGeral: {
    quantidade: SENTINELAS.quantidade,
    valorAplicado: SENTINELAS.aplicado,
    valorAtualizado: SENTINELAS.saldo,
    rentabilidade: 12.5,
  },
  resumo: {
    caixaParaInvestir: SENTINELAS.saldo,
    saldoInicioMes: SENTINELAS.aplicado,
    valorAtualizado: SENTINELAS.saldo,
    rendimento: SENTINELAS.aplicado,
    rentabilidade: 12.5,
  },
};

const formatNumber = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

const COLUNAS: ColumnDef<Ativo, Secao>[] = [
  { key: 'nome', header: 'Nome do Ativo', render: (a) => a.ticker },
  {
    key: 'quantidade',
    valor: 'sensivel-curto',
    header: 'Quantidade',
    align: 'right',
    render: (a, f) => f.formatNumber(a.quantidade),
    renderSectionTotal: (s, f) => f.formatNumber(s.totalQuantidade),
    renderGrandTotal: (t, f) => f.formatNumber(t.quantidade as number),
  },
  {
    key: 'precoAquisicao',
    valor: 'sensivel',
    header: 'Preço Médio',
    align: 'right',
    render: (a, f) => f.formatCurrency(a.precoAquisicao),
    renderSectionTotal: () => '-',
    renderGrandTotal: () => '-',
  },
  {
    key: 'valorTotal',
    header: 'Valor Total',
    align: 'right',
    render: (a, f) => f.formatCurrency(a.valorTotal),
    renderSectionTotal: (s, f) => f.formatCurrency(s.totalValorAplicado),
    renderGrandTotal: (t, f) => f.formatCurrency(t.valorAplicado as number),
  },
  {
    key: 'cotacaoAtual',
    valor: 'visivel',
    header: 'Cotação Atual',
    align: 'right',
    render: (a, f) => f.formatCurrency(a.cotacaoAtual),
    renderSectionTotal: () => '-',
    renderGrandTotal: () => '-',
  },
  {
    key: 'valorAtualizado',
    header: 'Valor Atualizado',
    align: 'right',
    render: (a, f) => f.formatCurrency(a.valorAtualizado),
    renderSectionTotal: (s, f) => f.formatCurrency(s.totalValorAtualizado),
    renderGrandTotal: (t, f) => f.formatCurrency(t.valorAtualizado as number),
  },
  {
    key: 'percentualCarteira',
    header: '% da Aba',
    align: 'right',
    render: (a, f) => f.formatPercentage(a.percentualCarteira),
  },
  {
    key: 'objetivo',
    header: 'Objetivo',
    align: 'right',
    render: (a, f) => f.formatPercentage(a.objetivo),
  },
  {
    key: 'quantoFalta',
    header: 'Quanto Falta',
    align: 'right',
    render: (a, f) => f.formatPercentage(a.quantoFalta),
  },
  {
    key: 'necessidadeAporte',
    header: 'Nec. Aporte R$',
    align: 'right',
    render: (a, f) => f.formatCurrency(a.necessidadeAporte),
    renderSectionTotal: (s, f) => f.formatCurrency(s.totalNecessidadeAporte),
  },
  {
    key: 'rentabilidade',
    header: 'Rentabilidade',
    align: 'right',
    render: (a, f) => f.formatPercentage(a.rentabilidade),
    renderGrandTotal: (t, f) => f.formatPercentage(t.rentabilidade as number),
  },
];

const CARDS: MetricCardConfig[] = [
  { title: 'Necessidade de Aporte Total', getValue: (_r, n) => formatBRL(n ?? 0) },
  { title: '__CAIXA_PARA_INVESTIR__', getValue: () => '' },
  { title: 'Saldo Início do Mês', getValue: (r) => formatBRL(r.saldoInicioMes as number) },
  { title: 'Valor Atualizado', getValue: (r) => formatBRL(r.valorAtualizado as number) },
  { title: 'Rendimento', getValue: (r) => formatBRL(r.rendimento as number) },
  { title: 'Rentabilidade', getValue: (r) => formatPct(r.rentabilidade as number) },
];

const props: GenericAssetTableProps<Ativo, Secao> = {
  data: DATA as unknown as Record<string, unknown>,
  loading: false,
  error: null,
  columns: COLUNAS,
  getSecoes: (d) => d.secoes as Secao[],
  getSectionAtivos: (s) => s.ativos,
  getSectionKey: (s) => s.tipo,
  getSectionName: (s) => s.nome,
  getTotalGeral: (d) => d.totalGeral as Record<string, unknown>,
  getResumo: (d) => d.resumo as Record<string, unknown>,
  metricCards: CARDS,
  onUpdateCaixaParaInvestir: vi.fn().mockResolvedValue(true),
  sectionOrder: ['valor'],
  sectionNames: { valor: 'Valor' },
  tableTitle: 'Ações - Detalhamento',
  formatCurrency: (v) => formatBRL(v),
  formatPercentage: (v) => formatPct(v),
  formatNumber,
  totalCarteira: SENTINELAS.saldo,
  mobileQuantityUnit: 'ações',
};

function renderTabela(ocultos?: boolean) {
  const client = createTestQueryClient();
  const ui = (
    <QueryClientProvider client={client}>
      <GenericAssetTable<Ativo, Secao> {...props} />
    </QueryClientProvider>
  );
  return ocultos === undefined
    ? render(ui)
    : render(<ComValoresOcultos ocultos={ocultos}>{ui}</ComValoresOcultos>);
}

describe.each([
  ['computador', false],
  ['celular', true],
])('GenericAssetTable com o olho fechado (%s)', (_nome, celular) => {
  beforeEach(() => {
    tela.celular = celular;
  });

  it('nenhum valor, quantidade nem preço médio exposto; cotação e % visíveis', () => {
    const { container } = renderTabela(true);
    expectSemValoresExpostos(container);
    expectPilulas(container);
    expect(container).toHaveTextContent('PETR4');
    expect(container).toHaveTextContent(formatPct(12.5));
    if (!celular) {
      // Cotação atual é dado de mercado (decisão 1); no celular ela fica no cartão fechado.
      expect(container.querySelector('[data-mf-valor-visivel]')).toHaveTextContent('12,34');
    }
  });

  it('quantidade vira pílula CURTA', () => {
    const { container } = renderTabela(true);
    const curtas = container.querySelectorAll('.mf-sensivel--curto');
    expect(curtas.length).toBeGreaterThan(0);
    expect(curtas[0]).toHaveTextContent('7.777');
  });

  it('olho aberto: DOM idêntico ao de sem provider', () => {
    // Os ids do useId mudam de um render para o outro; o resto tem de ser igual.
    const html = (c: HTMLElement) => c.innerHTML.replace(/_r_[a-z0-9]+_/g, '_r_');
    const semProvider = html(renderTabela().container);
    const aberto = html(renderTabela(false).container);
    expect(aberto).toBe(semProvider);
    expect(aberto).not.toContain('mf-sensivel');
    expect(aberto).not.toContain('data-mf-valor-visivel');
  });
});

describe('GenericAssetTable — celular, cartão aberto', () => {
  beforeEach(() => {
    tela.celular = true;
  });

  it('o cartão aberto também não expõe valores e o botão do cartão fala "valor oculto"', () => {
    const { container } = renderTabela(true);
    const botao = container.querySelector<HTMLButtonElement>('[data-mf-card-toggle]');
    expect(botao).not.toBeNull();
    botao!.click();
    expectSemValoresExpostos(container);
    expect(screen.getAllByText('valor oculto').length).toBeGreaterThan(0);
  });
});
