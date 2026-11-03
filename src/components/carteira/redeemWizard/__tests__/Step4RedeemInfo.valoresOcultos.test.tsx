// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import Step4RedeemInfo from '../Step4RedeemInfo';
import type { RedeemWizardFormData } from '@/types/redeemWizard';
import {
  ComValoresOcultos,
  SENTINELAS,
  expectPilulas,
  expectSemValoresExpostos,
} from '@/test/valoresOcultos';

/**
 * Esconder valores (follow-up de 03/11): o resgate mostra a posição do usuário (quantidade e valor
 * investido) num bloco de apoio fora dos campos. Com o olho fechado, esses números viram pílula; o
 * que o usuário digita continua visível.
 */
vi.mock('@/components/form/Select', () => ({
  default: () => React.createElement('select', { 'data-testid': 'select' }),
}));
vi.mock('@/components/form/date-picker', () => ({
  default: (props: { id: string; label?: string }) =>
    React.createElement('input', { id: props.id, 'aria-label': props.label }),
}));

function mockViewport(belowLg: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: belowLg,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const form = (): RedeemWizardFormData => ({
  tipoAtivo: 'acao',
  instituicao: 'XP',
  instituicaoId: 'inst',
  ativo: 'ITSA4',
  portfolioId: 'p1',
  assetId: 'a1',
  stockId: '',
  moeda: '',
  dataResgate: '2026-09-24',
  metodoResgate: 'quantidade',
  quantidade: 0,
  cotacaoUnitaria: 0,
  valorResgate: 0,
  observacoes: '',
  availableQuantity: SENTINELAS.quantidade,
  availableTotal: SENTINELAS.aplicado,
});

const renderizar = (ocultos: boolean) =>
  render(
    <ComValoresOcultos ocultos={ocultos}>
      <Step4RedeemInfo
        formData={form()}
        errors={{}}
        onFormDataChange={vi.fn()}
        onErrorsChange={vi.fn()}
      />
    </ComValoresOcultos>,
  );

describe('Step4RedeemInfo com o olho fechado', () => {
  it('desktop: quantidade disponível e valor investido viram pílula', () => {
    mockViewport(false);
    const { container } = renderizar(true);
    expectSemValoresExpostos(container);
    expectPilulas(container, 2);
  });

  it('celular: posição, valor investido e o atalho "Tudo" viram pílula (o botão continua)', () => {
    mockViewport(true);
    const { container, getByRole } = renderizar(true);
    expectSemValoresExpostos(container);
    expectPilulas(container, 3);
    expect(getByRole('button', { name: /Tudo/ })).toBeInTheDocument();
  });

  it('olho aberto: números como antes', () => {
    mockViewport(false);
    const { container } = renderizar(false);
    const tudo = (container.textContent ?? '').replace(/\s/g, ' ');
    expect(tudo).toContain('Quantidade disponível: 7777');
    expect(tudo).toContain('R$ 8.765.432,10');
    expectPilulas(container, 0);
  });
});
