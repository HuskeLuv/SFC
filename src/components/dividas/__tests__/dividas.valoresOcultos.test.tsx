// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApexOptions } from 'apexcharts';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/wrappers';
import {
  ComValoresOcultos,
  SENTINELAS,
  expectPilulas,
  expectSemValoresExpostos,
  representacoesDoSentinela,
} from '@/test/valoresOcultos';
import type { DividaDTO, DividaPagamentoDTO, ParcelaCronograma } from '@/hooks/useDividas';

/**
 * Esconder valores (Fase 4, fatia 1): Dívidas com o olho fechado. Fixtures com SENTINELAS (saldo,
 * parcela, juros, amortização, pagamentos): nenhum R$ nem sentinela no texto nem em
 * title/aria-label; CET/taxa, nº de parcelas, prazos, datas e nomes continuam. Formulários: o
 * valor do campo fica (decisão 3), o texto de apoio fora dele vira pílula. Olho aberto: DOM de hoje.
 */

const ambiente = vi.hoisted(() => ({ isBelowLg: false }));
vi.mock('next/navigation', () => ({ usePathname: () => '/dividas' }));
vi.mock('@/hooks/useMediaQuery', () => ({
  useIsBelowLg: () => ambiente.isBelowLg,
  useMediaQuery: () => ambiente.isBelowLg,
}));
vi.mock('@/hooks/useCsrf', () => ({ useCsrf: () => ({ csrfFetch: vi.fn() }) }));
vi.mock('@/context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));
vi.mock('@/icons', () => ({ ChevronDownIcon: () => <svg /> }));

const S = SENTINELAS;

const fixtures = vi.hoisted(() => ({
  detalhe: null as unknown,
  cronograma: null as unknown,
}));

vi.mock('@/hooks/useDividas', async (orig) => {
  const real = await orig<typeof import('@/hooks/useDividas')>();
  const mutacao = () => ({ mutateAsync: vi.fn(), isPending: false });
  return {
    ...real,
    useDivida: () => ({ divida: fixtures.detalhe, loading: false, error: null }),
    useDividaCronograma: () => ({ data: fixtures.cronograma, isLoading: false }),
    useDeleteDivida: mutacao,
    useDeletePagamento: mutacao,
    useUpdateDivida: mutacao,
    useCreateDivida: mutacao,
    useRegistrarPagamento: mutacao,
  };
});

const capturado = vi.hoisted(() => ({ options: null as ApexOptions | null }));
vi.mock('react-apexcharts', () => ({
  default: (props: { options: ApexOptions }) => {
    capturado.options = props.options;
    return <div data-testid="chart" />;
  },
}));
vi.mock('next/dynamic', async () => {
  const mod = await import('react-apexcharts');
  return { default: () => mod.default };
});

import DividasDashboard from '../DividasDashboard';
import DividasTable from '../DividasTable';
import DividaDetail from '../DividaDetail';
import CronogramaTable from '../CronogramaTable';
import CronogramaChart from '../CronogramaChart';
import DividaRegistrarPagamentoModal from '../DividaRegistrarPagamentoModal';
import DividaForm from '../DividaForm';

/** Cronograma de 3 parcelas com valores-sentinela (a 1ª já paga). */
const CRONOGRAMA: ParcelaCronograma[] = [
  {
    numero: 1,
    mes: '2026-09',
    parcela: S.aplicado,
    juros: S.precoMedio,
    amortizacao: S.quantidade + 0.55,
    saldoDevedor: S.saldo,
  },
  {
    numero: 2,
    mes: '2026-10',
    parcela: S.aplicado,
    juros: S.precoMedio,
    amortizacao: S.quantidade + 0.55,
    saldoDevedor: S.saldo / 2,
  },
  {
    numero: 3,
    mes: '2026-11',
    parcela: S.aplicado,
    juros: S.precoMedio,
    amortizacao: S.quantidade + 0.55,
    saldoDevedor: 0,
  },
];

const SENTINELAS_DIVIDAS = [S.saldo, S.aplicado, S.precoMedio, S.quantidade + 0.55, S.saldo / 2];

const financiamento = (over: Partial<DividaDTO> = {}): DividaDTO => ({
  id: 'd1',
  nome: 'Financiamento do apartamento',
  instituicao: 'Banco Exemplo',
  tipo: 'financiamento_imobiliario',
  modalidade: 'financiamento',
  principal: S.saldo,
  taxaAm: 0.0087,
  taxaUnidadeEntrada: 'am',
  prazoMeses: 3,
  sistema: 'SAC',
  indexador: 'PREFIXADO',
  primeiroVencimento: '2026-09',
  diaVencimento: 10,
  saldoInicial: null,
  dataSaldoInicial: null,
  status: 'ativa',
  notes: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  resumo: {
    saldoDevedor: S.saldo,
    parcelasPagas: 1,
    totalParcelas: 3,
    proximaParcela: CRONOGRAMA[1],
    prazoRestanteMeses: 2,
    categoria: 'c',
  },
  ...over,
});

const rotativa = (): DividaDTO =>
  financiamento({
    id: 'd2',
    nome: 'Cartão de crédito',
    tipo: 'cartao_credito',
    modalidade: 'rotativa',
    principal: null,
    taxaAm: 0.1199,
    prazoMeses: null,
    sistema: null,
    primeiroVencimento: null,
    saldoInicial: S.aplicado,
    dataSaldoInicial: '2026-09',
    resumo: {
      saldoDevedor: S.aplicado,
      parcelasPagas: null,
      totalParcelas: null,
      proximaParcela: null,
      prazoRestanteMeses: null,
      categoria: 'c',
    },
  });

const PAGAMENTOS: DividaPagamentoDTO[] = [
  {
    id: 'p1',
    month: '2026-09',
    valor: S.aplicado,
    parcelaNumero: 1,
    tipo: 'pagamento',
    notes: `pago com R$ ${S.precoMedio.toLocaleString('pt-BR')} de multa`,
    createdAt: '2026-09-10T00:00:00.000Z',
  },
];

const cronogramaResposta = {
  cronograma: CRONOGRAMA,
  saldo: { saldoDevedor: S.saldo, parcelasPagas: 1, proximaParcela: CRONOGRAMA[1] },
  indexador: 'PREFIXADO',
  fatorIndexacao: 1,
  saldoCorrigido: S.saldo,
};

function Arvore({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>;
}

function renderOculto(ui: React.ReactElement, ocultos = true) {
  return render(
    <Arvore>
      <ComValoresOcultos ocultos={ocultos}>{ui}</ComValoresOcultos>
    </Arvore>,
  );
}

/** Olho aberto = o mesmo HTML de hoje (sem provider); inclui o que vai em portal (modal, sheet). */
function expectIgualAHoje(ui: React.ReactElement) {
  render(<Arvore>{ui}</Arvore>);
  const htmlHoje = document.body.innerHTML;
  cleanup();
  renderOculto(ui, false);
  const corpo = document.body.cloneNode(true) as HTMLElement;
  corpo.querySelectorAll('[data-mf-anuncio-valores]').forEach((el) => el.remove());
  expect(corpo.innerHTML).toBe(htmlHoje);
  cleanup();
}

const detalheUi = () => (
  <DividaDetail
    divida={financiamento()}
    onBack={vi.fn()}
    onDeleted={vi.fn()}
    onRegistrarPagamento={vi.fn()}
  />
);

beforeEach(() => {
  ambiente.isBelowLg = false;
  fixtures.detalhe = { ...financiamento(), pagamentos: PAGAMENTOS };
  fixtures.cronograma = cronogramaResposta;
  capturado.options = null;
});

describe('Dívidas — olho fechado (desktop)', () => {
  it('dashboard: cartões de métrica e tabela sem valores; contagens e CET ficam', () => {
    const { container } = renderOculto(
      <DividasDashboard dividas={[financiamento(), rotativa()]} onSelectDivida={vi.fn()} />,
    );
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS_DIVIDAS });
    expectPilulas(container);
    expect(container.textContent).toContain('2 dívidas em aberto');
    expect(container.textContent).toContain('0,87%');
    expect(container.textContent).toContain('11,99%');
    expect(container.textContent).toContain('1/3');
  });

  it('tabela: saldo, parcela e totais viram pílula (5,5em)', () => {
    const { container } = renderOculto(
      <DividasTable dividas={[financiamento(), rotativa()]} onSelectDivida={vi.fn()} />,
    );
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS_DIVIDAS });
    // saldo ×2, parcela ×1, total do saldo e total das parcelas.
    expectPilulas(container, 5);
    expect(container.querySelectorAll('.mf-sensivel--curto')).toHaveLength(0);
    expect(container.textContent).toContain('SAC');
    expect(container.textContent).toContain('Rotativa');
  });

  it('detalhe: métricas, cronograma (pílula curta), pagamentos e notas sem valores', async () => {
    const { container } = renderOculto(detalheUi());
    await waitFor(() => expect(capturado.options).not.toBeNull());
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS_DIVIDAS });
    // 4 colunas em R$ × 3 linhas do cronograma, todas curtas.
    expect(container.querySelectorAll('tbody .mf-sensivel--curto')).toHaveLength(12);
    expect(container.textContent).toContain('nº 2 · Out/26');
    expect(container.textContent).toContain('2 meses restantes');
    expect(container.textContent).toContain('Set/26 · parcela 1');
    expect(container.textContent).toContain('de multa');
  });

  it('gráfico do cronograma: os dois eixos Y sem rótulo e tooltip com pílula', async () => {
    renderOculto(<CronogramaChart cronograma={CRONOGRAMA} parcelasPagas={1} />);
    await waitFor(() => expect(capturado.options).not.toBeNull());
    const o = capturado.options!;
    const eixos = o.yaxis as ApexYAxis[];
    const comRotulo = eixos.filter((e) => e.labels?.formatter);
    expect(comRotulo).toHaveLength(2);
    for (const e of comRotulo) {
      expect((e.labels!.formatter as (v: number) => string)(S.saldo)).toBe('');
      expect(e.labels!.minWidth).toBeGreaterThan(0);
    }
    const tip = (o.tooltip!.y as { formatter: (v: number) => string }).formatter(S.saldo);
    expect(tip).toContain('mf-pilula-grafico');
    for (const forma of representacoesDoSentinela(S.saldo)) expect(tip).not.toContain(forma);
    // Eixo X (meses) e a marcação "Pago até aqui" ficam.
    expect((o.xaxis!.labels!.formatter as (v: string) => string)('2026-09')).toBe('Set/26');
    expect(o.annotations!.xaxis![0].label!.text).toBe('Pago até aqui');
  });

  it('registrar pagamento: campo com o número; parcela esperada e diferença viram pílula', () => {
    const divida = financiamento();
    renderOculto(<DividaRegistrarPagamentoModal divida={divida} isOpen onClose={vi.fn()} />);
    const corpo = document.body;
    const campo = corpo.querySelector<HTMLInputElement>('#pg-valor')!;
    expect(campo.value).toBe(S.aplicado.toFixed(2));
    expectSemValoresExpostos(corpo, { sentinelas: [S.saldo, S.precoMedio] });
    expect(corpo.textContent).toContain('Parcela esperada:');
    expect(corpo.querySelectorAll('.mf-sensivel').length).toBeGreaterThan(0);
  });

  it('formulário de edição: campos com o número (decisão 3), nada vira pílula', () => {
    renderOculto(<DividaForm divida={financiamento()} onCancel={vi.fn()} onSaved={vi.fn()} />);
    const principal = document.querySelector<HTMLInputElement>('#divida-principal');
    expect(principal?.value).toContain('9876543');
    expect(document.body.textContent).toContain('Taxa de juros (%)');
    // Nada vira pílula num formulário sem texto calculado em R$.
    expectPilulas(document.body, 0);
  });
});

describe('Dívidas — olho fechado (celular)', () => {
  beforeEach(() => {
    ambiente.isBelowLg = true;
  });

  it('dashboard: grade 2×2, cartões e total sem valores; CET e parcelas pagas ficam', () => {
    const { container } = renderOculto(
      <DividasDashboard dividas={[financiamento(), rotativa()]} onSelectDivida={vi.fn()} />,
    );
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS_DIVIDAS });
    expect(container.textContent).toContain('1 de 3 parcelas pagas');
    expect(container.textContent).toContain('CET 0,87% a.m.');
    expect(container.textContent).toContain('Próxima: Out/26');
    // Próxima parcela e "parcelas:" do total são pílulas curtas.
    expect(container.querySelectorAll('.mf-sensivel--curto')).toHaveLength(2);
  });

  it('detalhe: grade, lista do cronograma (curtas) e pagamentos sem valores', async () => {
    const { container } = renderOculto(detalheUi());
    await waitFor(() => expect(capturado.options).not.toBeNull());
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS_DIVIDAS });
    // Lista: juros, amort., parcela e saldo × 3 parcelas.
    expect(container.querySelectorAll('li[data-mf-parcela] .mf-sensivel--curto')).toHaveLength(12);
    expect(container.textContent).toContain('3 parcelas');
  });

  it('cronograma (lista): totais em pílula curta', () => {
    const { container } = renderOculto(
      <CronogramaTable cronograma={CRONOGRAMA} parcelasPagas={1} proximaParcela={2} />,
    );
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS_DIVIDAS });
    expect(container.textContent).toContain('Total de juros:');
  });
});

describe('Dívidas — olho aberto: DOM idêntico ao de hoje', () => {
  it.each([
    ['desktop', false],
    ['celular', true],
  ])('%s', async (_nome, celular) => {
    ambiente.isBelowLg = celular;
    expectIgualAHoje(
      <DividasDashboard dividas={[financiamento(), rotativa()]} onSelectDivida={vi.fn()} />,
    );
    expectIgualAHoje(
      <DividasTable dividas={[financiamento(), rotativa()]} onSelectDivida={vi.fn()} />,
    );
    expectIgualAHoje(detalheUi());
    expectIgualAHoje(
      <CronogramaTable cronograma={CRONOGRAMA} parcelasPagas={1} proximaParcela={2} />,
    );
    expectIgualAHoje(
      <DividaRegistrarPagamentoModal divida={financiamento()} isOpen onClose={vi.fn()} />,
    );
  });

  it('gráfico: opções sem máscara (eixos e tooltip com R$)', async () => {
    renderOculto(<CronogramaChart cronograma={CRONOGRAMA} parcelasPagas={1} />, false);
    await waitFor(() => expect(capturado.options).not.toBeNull());
    const o = capturado.options!;
    const eixo = (o.yaxis as ApexYAxis[])[0];
    expect((eixo.labels!.formatter as (v: number) => string)(S.saldo)).toContain('R$');
    expect(eixo.labels!.minWidth).toBeUndefined();
    const tip = (o.tooltip!.y as { formatter: (v: number) => string }).formatter(S.saldo);
    expect(tip).toBe('R$ 9.876.543,21');
  });
});
