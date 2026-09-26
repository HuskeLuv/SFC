// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Step4RedeemInfo, { quickRedeemQuantity } from '../Step4RedeemInfo';
import type { RedeemWizardFormData } from '@/types/redeemWizard';

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

const form = (over: Partial<RedeemWizardFormData>): RedeemWizardFormData => ({
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
  availableQuantity: 1200,
  availableTotal: 13824,
  ...over,
});

describe('quickRedeemQuantity', () => {
  it('floor da fração nas casas da posição; Tudo = posição inteira', () => {
    expect(quickRedeemQuantity(1200, 0.25)).toBe(300);
    expect(quickRedeemQuantity(1201, 0.5)).toBe(600);
    expect(quickRedeemQuantity(0.12345678, 0.5)).toBe(0.06172839);
    expect(quickRedeemQuantity(1200, 1)).toBe(1200);
    expect(quickRedeemQuantity(0, 0.5)).toBe(0);
  });
});

describe('Step4RedeemInfo abaixo de lg', () => {
  it('atalhos só preenchem a quantidade', () => {
    mockViewport(true);
    const onFormDataChange = vi.fn();
    render(
      <Step4RedeemInfo
        formData={form({})}
        errors={{}}
        onFormDataChange={onFormDataChange}
        onErrorsChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Posição disponível')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '50%' }));
    expect(onFormDataChange).toHaveBeenLastCalledWith({ quantidade: 600 });
    fireEvent.click(screen.getByRole('button', { name: 'Tudo (1.200)' }));
    expect(onFormDataChange).toHaveBeenLastCalledWith({ quantidade: 1200 });
  });

  it('acima da posição: mensagem com o limite ligada ao campo', () => {
    mockViewport(true);
    render(
      <Step4RedeemInfo
        formData={form({
          quantidade: 1500,
          ativo: 'ITSA4 - ITAUSA S.A. (1200 und | R$ 13.824,00)',
        })}
        errors={{ quantidade: 'Quantidade maior que a disponível (1.200).' }}
        onFormDataChange={vi.fn()}
        onErrorsChange={vi.fn()}
      />,
    );
    const input = screen.getByLabelText(/Quantidade a resgatar/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const describedBy = input.getAttribute('aria-describedby')!;
    expect(document.getElementById(describedBy)?.textContent).toBe(
      'Você tem 1.200 ações de ITSA4. Use até 1.200.',
    );
  });

  it('a partir de lg: mensagem e caixa de sempre, sem atalhos', () => {
    mockViewport(false);
    render(
      <Step4RedeemInfo
        formData={form({ quantidade: 1500 })}
        errors={{ quantidade: 'Quantidade maior que a disponível (1.200).' }}
        onFormDataChange={vi.fn()}
        onErrorsChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Quantidade maior que a disponível (1.200).')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '50%' })).toBeNull();
    expect(screen.getByText(/Quantidade disponível: 1200/)).toBeInTheDocument();
  });
});
