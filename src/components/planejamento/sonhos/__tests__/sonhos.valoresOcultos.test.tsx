// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
import type { PlanejamentoObjetivoDTO } from '@/hooks/usePlanejamentoSonhos';
import type { PlanejamentoContexto } from '@/hooks/usePlanejamentoContexto';

/**
 * Esconder valores (Fase 3, fatia 1): Sonhos com o olho fechado. Fixtures com SENTINELAS (meta,
 * saldo, registros, sobra e reserva): nenhum R$ nem sentinela no texto nem em title/aria-label;
 * percentuais de progresso, prazos, nomes e contagens continuam. Formulários: o valor do campo
 * fica (decisão 3), o texto de apoio fora dele vira pílula. Olho aberto: DOM de hoje.
 */

const ambiente = vi.hoisted(() => ({ isBelowLg: false }));
vi.mock('next/navigation', () => ({ usePathname: () => '/planejamento-financeiro' }));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => ambiente.isBelowLg }));
vi.mock('@/hooks/useCsrf', () => ({ useCsrf: () => ({ csrfFetch: vi.fn() }) }));
vi.mock('@/icons', () => ({
  DollarLineIcon: () => <svg />,
  ChevronDownIcon: () => <svg />,
}));

const S = SENTINELAS;
const contextoFixture = vi.hoisted(() => ({ atual: null as unknown }));
vi.mock('@/hooks/usePlanejamentoContexto', () => ({
  usePlanejamentoContexto: () => ({
    contexto: contextoFixture.atual,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/usePlanejamentoSonhos', async (orig) => {
  const real = await orig<typeof import('@/hooks/usePlanejamentoSonhos')>();
  const mutacao = () => ({ mutateAsync: vi.fn(), isPending: false });
  return {
    ...real,
    useCreateObjetivo: mutacao,
    useUpdateObjetivo: mutacao,
    useDeleteObjetivo: mutacao,
    useCreateEntry: mutacao,
    useDeleteEntry: mutacao,
    usePlanejamentoDefaults: () => ({ data: { rate: 0.01, available: S.aplicado } }),
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

import SonhosDashboard from '../SonhosDashboard';
import SonhosObjetivoCard from '../SonhosObjetivoCard';
import SonhosObjetivosTable from '../SonhosObjetivosTable';
import SonhosObjetivoDetail from '../SonhosObjetivoDetail';
import SonhosObjetivoEvolutionChart from '../SonhosObjetivoEvolutionChart';
import ReservaEmergenciaWidget from '../ReservaEmergenciaWidget';
import SonhosObjetivoInlineForm from '../SonhosObjetivoInlineForm';
import SonhosRegistrarMesModal from '../SonhosRegistrarMesModal';
import SonhoCardMobile from '../mobile/SonhoCardMobile';

const objetivo = (over: Partial<PlanejamentoObjetivoDTO> = {}): PlanejamentoObjetivoDTO => ({
  id: 'g1',
  name: 'Viagem ao Japão',
  target: S.saldo,
  months: 24,
  startDate: '2026-02',
  available: S.precoMedio,
  rate: 0.008,
  priority: 'Alta',
  category: 'm',
  status: 'Iniciado',
  notes: null,
  entries: [
    { month: '2026-02', aporte: S.aplicado / 100, balance: S.aplicado / 10 },
    { month: '2026-03', aporte: S.aplicado / 100, balance: S.aplicado },
  ],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

const contexto = {
  asOf: '2026-10-31',
  patrimonio: S.saldo,
  reservaEmergenciaAtual: S.aplicado / 1000,
  aporteMensalRealizado: 0,
  aporteMensalAposentadoria: null,
  cdiAnualizado: 10.4,
  inflacao12m: 4.5,
  inflacaoFallback: 4.5,
  cashflow: {
    year: 2026,
    activeMonths: 10,
    sobraMensalMedia: S.precoMedio * 100,
    despesaMensalMedia: S.precoMedio * 50,
    despesaFixaMensal: S.precoMedio * 30,
  },
} satisfies PlanejamentoContexto;

/** Sentinelas do arquivo (inclusive derivados que aparecem formatados). */
const SENTINELAS_SONHOS = [S.saldo, S.aplicado, S.aplicado / 10, S.aplicado / 100, S.precoMedio];

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

beforeEach(() => {
  ambiente.isBelowLg = false;
  contextoFixture.atual = contexto;
  capturado.options = null;
});

describe('Sonhos — olho fechado (desktop)', () => {
  it('dashboard: cartões de métrica, capacidade de poupança, reserva e cartões sem valores', () => {
    const { container } = renderOculto(
      <SonhosDashboard
        objetivos={[objetivo(), objetivo({ id: 'g2', name: 'Trocar de carro', category: 'c' })]}
        onSelectObjetivo={vi.fn()}
      />,
    );
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS_SONHOS });
    expectPilulas(container);
    // Ficam: nomes, % de progresso, contagens.
    expect(screen.getAllByText('Viagem ao Japão').length).toBeGreaterThan(0);
    expect(container.textContent).toMatch(/\d+%/);
    expect(container.textContent).toContain('2 em andamento');
    expect(container.textContent).toContain('Reserva de Emergência');
  });

  it('tabela de objetivos: meta, atual, aporte e totais viram pílula; prazo e % ficam', () => {
    const { container } = renderOculto(
      <SonhosObjetivosTable objetivos={[objetivo()]} onSelectObjetivo={vi.fn()} />,
    );
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS_SONHOS });
    expectPilulas(container, 6);
    expect(container.textContent).toContain('24m');
    expect(container.textContent).toMatch(/\d+%/);
  });

  it('detalhe: métricas, resumo e histórico mensal (pílula curta) sem valores', async () => {
    const { container } = renderOculto(
      <SonhosObjetivoDetail
        objetivo={objetivo()}
        onBack={vi.fn()}
        onRegistrarMes={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );
    await waitFor(() => expect(capturado.options).not.toBeNull());
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS_SONHOS });
    // 6 colunas em R$ × 2 linhas no histórico, todas curtas.
    expect(container.querySelectorAll('tbody .mf-sensivel--curto')).toHaveLength(12);
    expect(container.textContent).toContain('0.80%/mês');
    expect(container.textContent).toContain('Histórico Mensal · 2 registros');
  });

  it('reserva de emergência: atual, ideal e o que falta viram pílula; meses ficam', () => {
    const { container } = renderOculto(<ReservaEmergenciaWidget contexto={contexto} />);
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS_SONHOS });
    expectPilulas(container, 3);
    expect(container.textContent).toContain('Ideal (6m)');
    expect(container.textContent).toMatch(/meses de despesa fixa/);
  });

  it('cartão do objetivo: meta, atual e aporte viram pílula; % fica', () => {
    const { container } = renderOculto(
      <SonhosObjetivoCard objetivo={objetivo()} onClick={vi.fn()} />,
    );
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS_SONHOS });
    expectPilulas(container, 3);
    expect(container.textContent).toMatch(/\d+%/);
    expect(container.textContent).toContain('/mês');
  });

  it('formulário inline: campos com o número (decisão 3); aporte mensal calculado vira pílula', () => {
    const { container } = renderOculto(
      <SonhosObjetivoInlineForm objetivo={objetivo()} onCancel={vi.fn()} onSaved={vi.fn()} />,
    );
    expect(container.querySelector<HTMLInputElement>('#inline-target')!.value).toBe(
      String(S.saldo),
    );
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS_SONHOS });
    expectPilulas(container, 1);
    expect(container.textContent).toContain('Aporte mensal:');
  });

  it('registrar mês: campos com o número; Planejado, Saldo planejado e deltas viram pílula', () => {
    renderOculto(<SonhosRegistrarMesModal objetivo={objetivo()} isOpen onClose={vi.fn()} />);
    const corpo = document.body;
    expect(corpo.querySelector<HTMLInputElement>('#entry-balance')!.value).toBe(
      S.aplicado.toFixed(2),
    );
    expectSemValoresExpostos(corpo, { sentinelas: [S.saldo, S.aplicado / 100] });
    expectPilulas(corpo, 4);
    expect(corpo.textContent).toMatch(/Progresso:\s*\d/);
  });

  it('gráfico de evolução: eixo Y sem rótulo, tooltip com pílula e meta mascarada', async () => {
    renderOculto(<SonhosObjetivoEvolutionChart objetivo={objetivo()} />);
    await waitFor(() => expect(capturado.options).not.toBeNull());
    const o = capturado.options!;
    const eixo = (Array.isArray(o.yaxis) ? o.yaxis[0] : o.yaxis)!;
    expect((eixo.labels!.formatter as (v: number) => string)(S.saldo)).toBe('');
    expect(eixo.labels!.minWidth).toBeGreaterThan(0);
    const tip = (o.tooltip!.y as { formatter: (v: number) => string }).formatter(S.saldo);
    expect(tip).toContain('mf-pilula-grafico');
    const meta = o.annotations!.yaxis![0].label!.text!;
    expect(meta).toBe('Meta · R$ •••••');
    for (const forma of representacoesDoSentinela(S.saldo)) expect(tip + meta).not.toContain(forma);
    // Eixo X (meses) fica.
    expect(o.xaxis!.categories).toContain('Fev/26');
  });
});

describe('Sonhos — olho fechado (celular)', () => {
  beforeEach(() => {
    ambiente.isBelowLg = true;
  });

  it('dashboard: grade 2×2 e cartões do celular sem valores', () => {
    const { container } = renderOculto(
      <SonhosDashboard objetivos={[objetivo()]} onSelectObjetivo={vi.fn()} />,
    );
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS_SONHOS });
    expect(container.textContent).toContain('1 em andamento');
    expect(container.textContent).toContain('ponderado por meta');
  });

  it('cartão do celular: pílulas curtas; % e meses ficam (aria-label só com %)', () => {
    const { container } = renderOculto(<SonhoCardMobile objetivo={objetivo()} onClick={vi.fn()} />);
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS_SONHOS });
    expect(container.querySelectorAll('.mf-sensivel--curto')).toHaveLength(3);
    expect(container.textContent).toMatch(/em 22 meses/);
  });

  it('detalhe do celular: grade, resumo, gráfico e registros sem valores', async () => {
    const { container } = renderOculto(
      <SonhosObjetivoDetail
        objetivo={objetivo()}
        onBack={vi.fn()}
        onRegistrarMes={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );
    await waitFor(() => expect(capturado.options).not.toBeNull());
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS_SONHOS });
    expect(container.querySelectorAll('[data-mf-card] .mf-sensivel--curto')).toHaveLength(6);
    const meta = capturado.options!.annotations!.yaxis![0].label!.text!;
    expect(meta).toBe('Meta · R$ •••••');
  });

  it('registrar mês no celular: dica do campo vira pílula', () => {
    renderOculto(<SonhosRegistrarMesModal objetivo={objetivo()} isOpen onClose={vi.fn()} />);
    expectSemValoresExpostos(document.body, { sentinelas: [S.saldo, S.aplicado / 100] });
    expect(document.body.textContent).toContain('Saldo planejado:');
  });

  it('formulário em sheet: aporte necessário vira pílula', () => {
    renderOculto(
      <SonhosObjetivoInlineForm
        presentation="sheet"
        objetivo={objetivo()}
        onCancel={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    const aporte = document.querySelector('[data-sonho-aporte-necessario]') as HTMLElement;
    expectSemValoresExpostos(aporte, { sentinelas: SENTINELAS_SONHOS });
    expect(aporte.textContent).toContain('/mês');
    expectPilulas(aporte, 1);
  });
});

describe('Sonhos — olho aberto: DOM idêntico ao de hoje', () => {
  it.each([
    ['desktop', false],
    ['celular', true],
  ])('%s', (_nome, celular) => {
    ambiente.isBelowLg = celular;
    expectIgualAHoje(
      <SonhosDashboard
        objetivos={[objetivo(), objetivo({ id: 'g2', name: 'Trocar de carro' })]}
        onSelectObjetivo={vi.fn()}
      />,
    );
    expectIgualAHoje(<SonhosObjetivosTable objetivos={[objetivo()]} onSelectObjetivo={vi.fn()} />);
    expectIgualAHoje(
      <SonhosObjetivoDetail
        objetivo={objetivo()}
        onBack={vi.fn()}
        onRegistrarMes={vi.fn()}
        onDeleted={vi.fn()}
      />,
    );
    expectIgualAHoje(<SonhosRegistrarMesModal objetivo={objetivo()} isOpen onClose={vi.fn()} />);
    expectIgualAHoje(
      <SonhosObjetivoInlineForm objetivo={objetivo()} onCancel={vi.fn()} onSaved={vi.fn()} />,
    );
  });

  it('gráfico: opções sem máscara (meta e eixo com R$)', async () => {
    renderOculto(<SonhosObjetivoEvolutionChart objetivo={objetivo()} />, false);
    await waitFor(() => expect(capturado.options).not.toBeNull());
    const o = capturado.options!;
    expect(o.annotations!.yaxis![0].label!.text).toMatch(/^Meta · R\$ 9\.876\.543,21$/);
    const eixo = (Array.isArray(o.yaxis) ? o.yaxis[0] : o.yaxis)!;
    expect((eixo.labels!.formatter as (v: number) => string)(S.saldo)).toContain('R$');
    expect(eixo.labels!.minWidth).toBeUndefined();
  });
});
