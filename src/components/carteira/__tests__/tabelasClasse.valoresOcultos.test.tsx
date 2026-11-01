// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/wrappers';
import {
  ComValoresOcultos,
  SENTINELAS,
  expectPilulas,
  expectSemValoresExpostos,
} from '@/test/valoresOcultos';
import { formatBRL, formatPct, formatUSD } from '@/utils/format';

/**
 * Esconder valores (fatia 1): as 13 tabelas de classe da Carteira com o olho fechado, no
 * computador e no celular (cartões fechados e abertos). Hooks de dados mockados com fixtures
 * SENTINELA: nenhuma forma de saldo/aplicado/quantidade/preço médio pode sobrar no texto nem em
 * title/aria. A cotação atual (12,34) fica visível (decisão 1); os % ficam.
 */

const h = vi.hoisted(() => ({ celular: false, layoutUsd: false }));

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
vi.mock('@/components/charts/pie/PieChartFiiAtivo', () => ({ default: () => <div /> }));
vi.mock('@/components/charts/pie/PieChartFiiSegmento', () => ({ default: () => <div /> }));
vi.mock('@/components/charts/pie/PieChartReitAtivo', () => ({ default: () => <div /> }));
vi.mock('@/components/charts/pie/PieChartStocksAtivo', () => ({ default: () => <div /> }));

// ── Fixtures sentinela ──────────────────────────────────────────────────────────────────────

const S = SENTINELAS;
const COTACAO = 12.34;

/** Superconjunto dos campos de linha das abas (cada tabela lê os seus). */
const linha = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  ticker: 'PETR4',
  nome: 'Petrobras PN',
  quantidade: S.quantidade,
  precoAquisicao: S.precoMedio,
  valorTotal: S.aplicado,
  valorInicialAplicado: S.aplicado,
  valorInicial: S.aplicado,
  aporte: S.aplicado,
  resgate: S.aplicado,
  melhorias: S.aplicado,
  cotacaoAtual: COTACAO,
  valorAtualizado: S.saldo,
  valorAtualizadoBRL: S.saldo,
  riscoPorAtivo: 10,
  riscoAtivo: 10,
  percentualCarteira: 100,
  objetivo: 30,
  quantoFalta: 20,
  necessidadeAporte: S.aplicado,
  proventos: S.aplicado,
  rentabilidade: 12.5,
  percentualRentabilidade: 12.5,
  setor: 'Energia',
  subsetor: 'Petróleo',
  mandato: 'Renda',
  segmento: 'logistica',
  sector: 'energy',
  industryCategory: 'Oil',
  regiao: 'brasil',
  indiceRastreado: 'ibovespa',
  compraVenda: 'compra',
  categoriaNivel1: 'Multimercado',
  subcategoriaNivel2: 'Macro',
  cotizacaoResgate: 'D+0',
  liquidacaoResgate: 'D+1',
  carencia: 0,
  cotacaoResgate: 0,
  modalidade: 'pgbl',
  subclasse: 'renda_fixa',
  cidade: 'São Paulo',
  vencimento: new Date('2030-01-10T00:00:00Z'),
  benchmark: '110% CDI',
  tipo: 'pos-fixada',
  naoMovivelMotivo: 'Indisponível',
  ...over,
});

/** Superconjunto dos campos de seção (totais) — `chave` vai nos campos de chave das abas. */
const secao = (chave: string, ativos = [linha()]) => ({
  tipo: chave,
  estrategia: chave,
  regiao: chave,
  nome: 'Seção',
  ativos,
  totalQuantidade: S.quantidade,
  totalValorAplicado: S.aplicado,
  totalAporte: S.aplicado,
  totalResgate: S.aplicado,
  totalValorAtualizado: S.saldo,
  totalNecessidadeAporte: S.aplicado,
  totalProventos: S.aplicado,
  totalRisco: 10,
  totalPercentualCarteira: 100,
  totalObjetivo: 30,
  totalQuantoFalta: 20,
  percentualTotal: 100,
  rentabilidadeMedia: 12.5,
});

const totalGeral = {
  quantidade: S.quantidade,
  valorAplicado: S.aplicado,
  aporte: S.aplicado,
  resgate: S.aplicado,
  valorAtualizado: S.saldo,
  necessidadeAporte: S.aplicado,
  proventos: S.aplicado,
  risco: 10,
  objetivo: 30,
  quantoFalta: 20,
  rentabilidade: 12.5,
};

const resumo = {
  necessidadeAporte: S.aplicado,
  necessidadeAporteTotal: S.aplicado,
  caixaParaInvestir: S.aplicado,
  saldoInicioMes: S.aplicado,
  saldoAtual: S.saldo,
  valorAtualizado: S.saldo,
  valorAplicado: S.aplicado,
  rendimento: S.aplicado,
  rentabilidade: 12.5,
  valorTotalAquisicoes: S.aplicado,
  valorTotalMelhorias: S.aplicado,
};

const tabelaAuxiliar = [
  {
    ticker: 'PETR4',
    nome: 'Petrobras PN',
    cotacaoAtual: COTACAO,
    necessidadeAporte: S.aplicado,
    loteAproximado: S.quantidade,
    dataCompra: '2026-01-10',
  },
];

const dadosAba = (chave: string) => ({
  secoes: [secao(chave)],
  totalGeral,
  resumo,
  tabelaAuxiliar,
  alocacaoAtivo: [],
  alocacaoSegmento: [],
  cotacaoDolar: 5.4,
  taxaData: '2026-10-30',
  layoutUsd: h.layoutUsd,
  totalUSD: {
    valorAplicado: S.aplicado,
    valorAtualizado: S.saldo,
    rendimento: S.aplicado,
    rentabilidade: 12.5,
  },
  totalBRL: {
    valorAplicado: S.aplicado,
    valorAtualizado: S.saldo,
    rendimento: S.aplicado,
    proventos: S.aplicado,
    rentabilidade: 12.5,
  },
  caixaParaInvestirBRL: S.aplicado,
  posicoesSemCambio: 0,
});

const hookAba = (chave: string, moeda: 'BRL' | 'USD' = 'BRL') => ({
  data: dadosAba(chave),
  loading: false,
  error: null,
  formatCurrency: (v: number, c?: 'BRL' | 'USD') =>
    (c ?? moeda) === 'USD' ? formatUSD(v) : formatBRL(v),
  formatPercentage: (v: number) => formatPct(v),
  formatNumber: (v: number) => (v ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 }),
  updateObjetivo: vi.fn().mockResolvedValue(true),
  updateCaixaParaInvestir: vi.fn().mockResolvedValue(true),
  updateValorAtualizado: vi.fn().mockResolvedValue(true),
  updateCampo: vi.fn().mockResolvedValue(true),
  updateRendaFixaCampo: vi.fn().mockResolvedValue(true),
});

vi.mock('@/hooks/useAcoes', () => ({ useAcoes: () => hookAba('value') }));
vi.mock('@/hooks/useFii', () => ({ useFii: () => hookAba('tijolo') }));
vi.mock('@/hooks/useEtf', () => ({ useEtf: () => hookAba('brasil') }));
vi.mock('@/hooks/useStocks', () => ({ useCarteiraStocks: () => hookAba('value', 'USD') }));
vi.mock('@/hooks/useReit', () => ({ useReit: () => hookAba('value', 'USD') }));
vi.mock('@/hooks/useFimFia', () => ({ useFimFia: () => hookAba('fim') }));
vi.mock('@/hooks/useMoedasCriptos', () => ({ useMoedasCriptos: () => hookAba('moedas') }));
vi.mock('@/hooks/useOpcoes', () => ({ useOpcoes: () => hookAba('call') }));
vi.mock('@/hooks/usePrevidenciaSeguros', () => ({
  usePrevidenciaSeguros: () => hookAba('previdencia'),
}));
vi.mock('@/hooks/useRendaFixa', () => ({ useRendaFixa: () => hookAba('pos-fixada') }));
vi.mock('@/hooks/useImoveisBens', () => ({
  useImoveisBens: () => ({
    ...hookAba('imoveis'),
    data: { resumo, ativos: [linha()], totalGeral },
  }),
}));
vi.mock('@/hooks/useReservaOportunidade', () => ({
  useReservaOportunidade: () => ({
    data: {
      ativos: [linha({ nome: 'CDB Liquidez' })],
      saldoInicioMes: S.aplicado,
      rendimento: S.aplicado,
      rentabilidade: 12.5,
    },
    loading: false,
    error: null,
  }),
}));

import AcoesTable from '@/components/carteira/AcoesTable';
import FiiTable from '@/components/carteira/FiiTable';
import EtfTable from '@/components/carteira/EtfTable';
import StocksTable from '@/components/carteira/StocksTable';
import ReitTable from '@/components/carteira/ReitTable';
import FimFiaTable from '@/components/carteira/FimFiaTable';
import MoedasCriptosTable from '@/components/carteira/MoedasCriptosTable';
import OpcoesTable from '@/components/carteira/OpcoesTable';
import PrevidenciaSegurosTable from '@/components/carteira/PrevidenciaSegurosTable';
import RendaFixaTable from '@/components/carteira/RendaFixaTable';
import ImoveisBensTable from '@/components/carteira/ImoveisBensTable';
import ReservaEmergenciaTable from '@/components/carteira/ReservaEmergenciaTable';
import ReservaOportunidadeTable from '@/components/carteira/ReservaOportunidadeTable';
import type { ReservaEmergenciaAtivo } from '@/hooks/useReservaEmergencia';

const ABAS: Array<[string, () => React.ReactElement]> = [
  [
    'Reserva de Emergência',
    () => (
      <ReservaEmergenciaTable
        ativos={[linha({ nome: 'Conta Nubank' }) as unknown as ReservaEmergenciaAtivo]}
        saldoInicioMes={S.aplicado}
        rendimento={S.aplicado}
        rentabilidade={12.5}
        totalCarteira={S.saldo}
      />
    ),
  ],
  ['Reserva de Oportunidade', () => <ReservaOportunidadeTable totalCarteira={S.saldo} />],
  ['Renda Fixa', () => <RendaFixaTable totalCarteira={S.saldo} />],
  ['Fundos', () => <FimFiaTable totalCarteira={S.saldo} />],
  ["FII's", () => <FiiTable totalCarteira={S.saldo} />],
  ['Ações', () => <AcoesTable totalCarteira={S.saldo} />],
  ['Stocks', () => <StocksTable totalCarteira={S.saldo} />],
  ["REIT's", () => <ReitTable totalCarteira={S.saldo} />],
  ["ETF's", () => <EtfTable totalCarteira={S.saldo} />],
  ['Moedas e Criptos', () => <MoedasCriptosTable totalCarteira={S.saldo} />],
  ['Previdência e Seguros', () => <PrevidenciaSegurosTable totalCarteira={S.saldo} />],
  ['Opções', () => <OpcoesTable totalCarteira={S.saldo} />],
  ['Imóveis e Bens', () => <ImoveisBensTable totalCarteira={S.saldo} />],
];

function renderAba(aba: () => React.ReactElement, ocultos?: boolean) {
  const ui = <QueryClientProvider client={createTestQueryClient()}>{aba()}</QueryClientProvider>;
  return ocultos === undefined
    ? render(ui)
    : render(<ComValoresOcultos ocultos={ocultos}>{ui}</ComValoresOcultos>);
}

/** Abre todos os cartões do celular (os detalhes também têm de esconder). */
function abrirCartoes(container: HTMLElement) {
  container
    .querySelectorAll<HTMLButtonElement>('[data-mf-card-toggle][aria-expanded="false"]')
    .forEach((b) => fireEvent.click(b));
}

/** HTML sem os ids gerados a cada render (useId do React e as regiões do dnd-kit). */
const htmlEstavel = (c: HTMLElement) =>
  c.innerHTML.replace(/_r_[a-z0-9]+_/g, '_r_').replace(/(Dnd[A-Za-z]+)-\d+/g, '$1');

describe.each([
  ['computador', false, false],
  ['celular', true, false],
  ['computador, abas EUA em US$', false, true],
  ['celular, abas EUA em US$', true, true],
])('13 tabelas de classe com o olho fechado (%s)', (_nome, celular, layoutUsd) => {
  beforeEach(() => {
    h.celular = celular;
    h.layoutUsd = layoutUsd;
  });

  it.each(ABAS)('%s: nenhum valor, quantidade ou preço médio exposto', (_aba, aba) => {
    const { container } = renderAba(aba, true);
    abrirCartoes(container);
    expectSemValoresExpostos(container);
    expectPilulas(container);
    // Os % ficam (decisão 2) — algumas abas ainda formatam com ponto ("12.50%").
    expect(container).toHaveTextContent(/12[.,]50%/);
  });

  it.each(ABAS)('%s: olho aberto = DOM de sempre', (_aba, aba) => {
    const hoje = renderAba(aba);
    abrirCartoes(hoje.container);
    const html = htmlEstavel(hoje.container);
    hoje.unmount();
    const aberto = renderAba(aba, false);
    abrirCartoes(aberto.container);
    expect(htmlEstavel(aberto.container)).toBe(html);
  });
});

describe('quantidade em pílula curta e cotação visível (computador)', () => {
  beforeEach(() => {
    h.celular = false;
    h.layoutUsd = false;
  });

  it.each(
    ABAS.filter(([n]) => ["FII's", 'Ações', 'Stocks', 'Opções', 'Imóveis e Bens'].includes(n)),
  )('%s', (_aba, aba) => {
    const { container } = renderAba(aba, true);
    expect(container.querySelectorAll('.mf-sensivel--curto').length).toBeGreaterThan(0);
    if (_aba !== 'Imóveis e Bens') {
      const visiveis = Array.from(container.querySelectorAll('[data-mf-valor-visivel]'));
      expect(visiveis.some((el) => el.textContent?.includes('12,34'))).toBe(true);
    }
  });
});
