// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import Step1AssetType from '../Step1AssetType';
import { groupTiposAtivo } from '../tipoAtivoGroups';
import { TIPOS_ATIVO, TIPOS_ATIVO_PLANEJAVEIS, type WizardFormData } from '@/types/wizard';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
// O Select do desktop importa SVG (vira string no vitest): basta saber que ele é o renderizado.
vi.mock('@/components/form/Select', () => ({
  default: () => React.createElement('select', { 'data-testid': 'desktop-select' }),
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

const baseForm = (over: Partial<WizardFormData>) =>
  ({ operacao: 'compra', tipoAtivo: '', ...over }) as WizardFormData;

describe('groupTiposAtivo', () => {
  it('distribui TIPOS_ATIVO sem perder nem repetir nenhum tipo', () => {
    const grupos = groupTiposAtivo(TIPOS_ATIVO);
    const values = grupos.flatMap((g) => g.options.map((o) => o.value));
    expect(values.sort()).toEqual(TIPOS_ATIVO.map((t) => t.value).sort());
    expect(grupos.map((g) => g.label)).toEqual([
      'Reservas',
      'Renda fixa',
      'Renda variável no Brasil',
      'Exterior e cripto',
      'Outros',
    ]);
  });

  it('esconde grupos vazios e manda desconhecidos para Outros', () => {
    const grupos = groupTiposAtivo([
      { value: 'fii', label: 'FII' },
      { value: 'novo-tipo', label: 'Novo' },
    ]);
    expect(grupos.map((g) => g.id)).toEqual(['renda-variavel', 'outros']);
    expect(grupos[1].options).toEqual([{ value: 'novo-tipo', label: 'Novo' }]);
  });
});

describe('Step1AssetType abaixo de lg', () => {
  it('operação em radiogroup e tipos em cartões de rádio, com o mesmo onChange', () => {
    mockViewport(true);
    const onFormDataChange = vi.fn();
    render(
      <Step1AssetType
        formData={baseForm({ operacao: 'compra' })}
        errors={{}}
        onFormDataChange={onFormDataChange}
        onErrorsChange={vi.fn()}
      />,
    );
    const operacao = screen.getByRole('radiogroup', { name: 'Operação' });
    expect(within(operacao).getAllByRole('radio')).toHaveLength(3);
    expect(within(operacao).getByRole('radio', { name: /Adicionar investimento/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Conta Corrente' }));
    expect(onFormDataChange).toHaveBeenCalledWith(
      expect.objectContaining({ tipoAtivo: 'conta-corrente' }),
    );
    // Sem Select no celular.
    expect(screen.queryByText('Selecione o tipo de ativo que deseja adicionar')).toBeNull();
  });

  it('Planejar mostra só os tipos planejáveis, agrupados', () => {
    mockViewport(true);
    render(
      <Step1AssetType
        formData={baseForm({ operacao: 'planejar' })}
        errors={{}}
        onFormDataChange={vi.fn()}
        onErrorsChange={vi.fn()}
      />,
    );
    const tipos = screen
      .getAllByRole('radio')
      .filter(
        (r) =>
          r.getAttribute('data-value') &&
          !['compra', 'aporte', 'planejar'].includes(r.getAttribute('data-value')!),
      )
      .map((r) => r.getAttribute('data-value'));
    expect(tipos.sort()).toEqual([...TIPOS_ATIVO_PLANEJAVEIS].sort());
    expect(screen.queryByText('Reservas')).toBeNull();
  });

  it('a partir de lg continua com o Select', () => {
    mockViewport(false);
    render(
      <Step1AssetType
        formData={baseForm({ operacao: 'compra' })}
        errors={{}}
        onFormDataChange={vi.fn()}
        onErrorsChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getAllByTestId('desktop-select')).toHaveLength(2);
  });
});
