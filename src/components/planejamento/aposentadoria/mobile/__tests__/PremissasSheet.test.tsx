// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { calc } from '@/services/planejamento/aposentadoria';
import type { PlanoUpsertPayload } from '@/hooks/useAposentadoria';
import PremissasSheet, { formatParamInput } from '../PremissasSheet';
import PremissasCard, { PREMISSAS_CARD_ORDER } from '../PremissasCard';
import { PARAM_FIELDS } from '../../LeftPanel';
import { deriveAutoValues } from '../../autoFields';

function stubMatchMedia(mobile = true) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: mobile,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

const PARAMS: PlanoUpsertPayload = {
  idade: 30,
  apos: 65,
  vida: 90,
  rentNom: 12,
  inflacao: 5,
  rentNomRetiro: null,
  patrimonio: 10000,
  aporteM: 1000,
  renda: 5000,
  trackStartMonth: 1,
  trackStartYear: 2026,
  eventos: [],
  fieldLocks: [],
};

function renderSheet(params: PlanoUpsertPayload = PARAMS, onChange = vi.fn()) {
  const utils = render(
    <PremissasSheet
      isOpen
      onClose={vi.fn()}
      params={params}
      projection={calc(params)}
      onChange={onChange}
      autoValues={deriveAutoValues(null)}
      onResync={vi.fn()}
      rentCarteiraAA={null}
      rentCarteiraLoading={false}
      onUseCarteira={vi.fn()}
    />,
  );
  return { ...utils, onChange };
}

beforeEach(() => {
  stubMatchMedia(true);
});

describe('PremissasSheet', () => {
  it("'10,5' na rentabilidade manda o NÚMERO 10.5 ao mesmo onChange do painel", () => {
    const { onChange } = renderSheet();
    const input = screen.getByLabelText(PARAM_FIELDS.rentNom.label);
    expect(input).toHaveAttribute('inputmode', 'decimal');
    fireEvent.change(input, { target: { value: '10,5' } });
    expect(onChange).toHaveBeenLastCalledWith({ rentNom: 10.5 });
  });

  it('moeda com milhar e vírgula vira número; negativo vira 0 (como o MoneyField)', () => {
    const { onChange } = renderSheet();
    const input = screen.getByLabelText(PARAM_FIELDS.patrimonio.label);
    fireEvent.change(input, { target: { value: '1.500,50' } });
    expect(onChange).toHaveBeenLastCalledWith({ patrimonio: 1500.5 });
    fireEvent.change(input, { target: { value: '-20' } });
    expect(onChange).toHaveBeenLastCalledWith({ patrimonio: 0 });
  });

  it('entrada vazia ou parcial não envia nada', () => {
    const { onChange } = renderSheet();
    fireEvent.change(screen.getByLabelText(PARAM_FIELDS.idade.label), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(PARAM_FIELDS.idade.label), { target: { value: ',' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('tem um campo para cada chave de PARAM_FIELDS (as mesmas do LeftPanel)', () => {
    renderSheet();
    for (const key of Object.keys(PARAM_FIELDS)) {
      expect(document.getElementById(`premissa-${key}`), key).not.toBeNull();
    }
    // e o cartão 3×3 mostra exatamente essas 9 chaves
    expect([...PREMISSAS_CARD_ORDER].sort()).toEqual(Object.keys(PARAM_FIELDS).sort());
  });

  it('o resumo acompanha o projection (Pr e idade em que a renda acaba)', () => {
    const { rerender } = renderSheet();
    const resumo = () => document.querySelector('[data-premissas-resumo]') as HTMLElement;
    expect(within(resumo()).getByText(/Aos 65/)).toBeInTheDocument();
    expect(resumo()).toHaveTextContent(/Renda dura até/);
    const before = resumo().textContent;

    const next = { ...PARAMS, apos: 60, renda: 40000 };
    rerender(
      <PremissasSheet
        isOpen
        onClose={vi.fn()}
        params={next}
        projection={calc(next)}
        onChange={vi.fn()}
        autoValues={deriveAutoValues(null)}
        onResync={vi.fn()}
        rentCarteiraAA={null}
        rentCarteiraLoading={false}
        onUseCarteira={vi.fn()}
      />,
    );
    expect(resumo().textContent).not.toBe(before);
    expect(resumo()).toHaveTextContent(/Aos 60/);
    // renda alta acaba antes da expectativa: idade em âmbar (selo de atenção)
    expect(resumo().querySelector('[data-mf-status="atencao"]')).not.toBeNull();
  });

  it('valor alterado por fora (atalho) atualiza o texto do campo', () => {
    const { rerender } = renderSheet();
    const input = screen.getByLabelText(PARAM_FIELDS.inflacao.label) as HTMLInputElement;
    expect(input.value).toBe('5');
    const next = { ...PARAMS, inflacao: 4.25 };
    rerender(
      <PremissasSheet
        isOpen
        onClose={vi.fn()}
        params={next}
        projection={calc(next)}
        onChange={vi.fn()}
        autoValues={deriveAutoValues(null)}
        onResync={vi.fn()}
        rentCarteiraAA={null}
        rentCarteiraLoading={false}
        onUseCarteira={vi.fn()}
      />,
    );
    expect(input.value).toBe('4,25');
  });

  it('formatParamInput: vírgula decimal', () => {
    expect(formatParamInput('currency', 1500.5)).toBe('1.500,50');
    expect(formatParamInput('percent', 10.5)).toBe('10,5');
    expect(formatParamInput('integer', 65)).toBe('65');
  });
});

describe('PremissasCard', () => {
  it('9 botões de premissa; tocar abre focado no campo', () => {
    const onOpen = vi.fn();
    render(<PremissasCard params={PARAMS} onOpen={onOpen} />);
    const buttons = document.querySelectorAll('[data-premissa]');
    expect(buttons).toHaveLength(9);
    fireEvent.click(screen.getByRole('button', { name: /Inflação: 5,0%/ }));
    expect(onOpen).toHaveBeenCalledWith('inflacao');
    fireEvent.click(screen.getByRole('button', { name: 'Editar premissas e eventos pontuais' }));
    expect(onOpen).toHaveBeenLastCalledWith();
  });
});
