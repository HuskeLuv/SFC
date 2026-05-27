// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import BusinessDayDatePicker, { __testing__ } from '../BusinessDayDatePicker';

/**
 * F1.5 — bloqueio/redirecionamento de lançamentos em feriado/fim de semana.
 *
 * Caso reportado (memória): usuário cadastrou aporte em 01/05/2019 (feriado
 * Dia do Trabalho) e o sistema aceitou silenciosamente. Cobertura:
 *
 *   - `computeAdjustment` (helper puro): detecta weekend/feriado e retorna
 *     o próximo dia útil corretamente.
 *   - Componente: dispara onChange com a data corrigida na montagem se o
 *     `value` inicial cair em dia não-útil; renderiza aviso em amarelo.
 */

const flatpickrHookRef = { current: null as ((dates: Date[]) => void) | null };

// Mock do DatePicker pra capturar o onChange e simular seleções sem precisar
// orquestrar o flatpickr real (que monta widget no DOM).
vi.mock('@/components/form/date-picker', () => {
  return {
    __esModule: true,
    default: (props: {
      id: string;
      label?: string;
      onChange?: (dates: Date[]) => void;
      defaultDate?: string;
    }) => {
      flatpickrHookRef.current = props.onChange ?? null;
      return (
        <div>
          <label htmlFor={props.id}>{props.label}</label>
          <input
            id={props.id}
            data-testid={`mock-picker-${props.id}`}
            data-default={props.defaultDate ?? ''}
            readOnly
          />
        </div>
      );
    },
  };
});

const fireSelection = (iso: string) => {
  act(() => {
    flatpickrHookRef.current?.([new Date(iso)]);
  });
};

describe('computeAdjustment', () => {
  const { computeAdjustment } = __testing__;

  it('retorna null para dia útil regular (terça 15/07/2025)', () => {
    expect(computeAdjustment('2025-07-15')).toBeNull();
  });

  it('detecta 01/05/2019 (Dia do Trabalho - quarta) → 02/05/2019', () => {
    // Caso reportado no bug F1.5
    const adj = computeAdjustment('2019-05-01');
    expect(adj).not.toBeNull();
    expect(adj?.reason).toBe('feriado B3');
    expect(adj?.originalIso).toBe('2019-05-01');
    expect(adj?.adjustedIso).toBe('2019-05-02');
  });

  it('detecta sábado (04/01/2025) → segunda (06/01/2025)', () => {
    const adj = computeAdjustment('2025-01-04');
    expect(adj).not.toBeNull();
    expect(adj?.reason).toBe('fim de semana');
    expect(adj?.adjustedIso).toBe('2025-01-06');
  });

  it('detecta domingo (05/01/2025) → segunda (06/01/2025)', () => {
    const adj = computeAdjustment('2025-01-05');
    expect(adj).not.toBeNull();
    expect(adj?.reason).toBe('fim de semana');
    expect(adj?.adjustedIso).toBe('2025-01-06');
  });

  it('detecta cadeia weekend + feriado (sex 18/04 Sexta Santa → sábado → domingo → seg 21/04 Tiradentes → terça 22/04)', () => {
    // Sexta-feira Santa 18/04/2025
    const adj = computeAdjustment('2025-04-18');
    expect(adj).not.toBeNull();
    expect(adj?.reason).toBe('feriado B3');
    expect(adj?.adjustedIso).toBe('2025-04-22');
  });

  it('retorna null para string vazia ou inválida', () => {
    expect(computeAdjustment('')).toBeNull();
    expect(computeAdjustment('foo')).toBeNull();
    expect(computeAdjustment('2025-13-99')).toBeNull();
  });

  it('detecta Carnaval 2025 (segunda 03/03) → quarta-feira de cinzas 05/03', () => {
    const adj = computeAdjustment('2025-03-03');
    expect(adj).not.toBeNull();
    expect(adj?.reason).toBe('feriado B3');
    expect(adj?.adjustedIso).toBe('2025-03-05');
  });
});

describe('isoToBrDate', () => {
  const { isoToBrDate } = __testing__;
  it('formata ISO em DD/MM/YYYY', () => {
    expect(isoToBrDate('2019-05-01')).toBe('01/05/2019');
    expect(isoToBrDate('2025-12-31')).toBe('31/12/2025');
  });
  it('passa-through quando inválido', () => {
    expect(isoToBrDate('xx')).toBe('xx');
  });
});

describe('<BusinessDayDatePicker /> integração', () => {
  beforeEach(() => {
    flatpickrHookRef.current = null;
  });

  it('renderiza sem aviso quando o valor inicial é dia útil', () => {
    const onChange = vi.fn();
    render(
      <BusinessDayDatePicker
        id="dataCompra"
        label="Data de Compra"
        value="2025-07-15"
        onChange={onChange}
      />,
    );
    expect(screen.queryByTestId('dataCompra-business-day-warning')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('na montagem, se o valor inicial é feriado, dispara onChange com a data corrigida e mostra aviso amarelo', () => {
    const onChange = vi.fn();
    render(
      <BusinessDayDatePicker
        id="dataAporte"
        label="Data do Aporte"
        value="2019-05-01" // Dia do Trabalho — quarta-feira
        onChange={onChange}
      />,
    );
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('2019-05-02');
    const warning = screen.getByTestId('dataAporte-business-day-warning');
    expect(warning.textContent).toContain('01/05/2019');
    expect(warning.textContent).toContain('02/05/2019');
    expect(warning.textContent).toContain('feriado B3');
  });

  it('seleção manual em fim de semana auto-corrige e exibe aviso', () => {
    const onChange = vi.fn();
    render(
      <BusinessDayDatePicker
        id="dataCompra"
        label="Data"
        value="2025-07-15" // BD inicial
        onChange={onChange}
      />,
    );
    // Usuário escolhe sábado 04/01/2025 via flatpickr mock
    fireSelection('2025-01-04T00:00:00.000Z');
    expect(onChange).toHaveBeenCalledWith('2025-01-06');
    const warning = screen.getByTestId('dataCompra-business-day-warning');
    expect(warning.textContent).toContain('fim de semana');
    expect(warning.textContent).toContain('06/01/2025');
  });

  it('seleção em dia útil limpa qualquer aviso anterior', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <BusinessDayDatePicker
        id="dataCompra"
        label="Data"
        value="2025-01-04" // Sábado — força aviso na montagem
        onChange={onChange}
      />,
    );
    expect(screen.getByTestId('dataCompra-business-day-warning')).toBeTruthy();
    // Usuário escolhe quarta-feira regular
    fireSelection('2025-07-16T00:00:00.000Z');
    rerender(
      <BusinessDayDatePicker id="dataCompra" label="Data" value="2025-07-16" onChange={onChange} />,
    );
    expect(screen.queryByTestId('dataCompra-business-day-warning')).toBeNull();
  });

  it('aviso é suprimido quando há erro de validação (precedência: erro > aviso)', () => {
    const onChange = vi.fn();
    render(
      <BusinessDayDatePicker
        id="dataCompra"
        label="Data"
        value="2019-05-01" // Feriado — geraria aviso
        onChange={onChange}
        error="Data obrigatória"
      />,
    );
    expect(screen.getByText('Data obrigatória')).toBeTruthy();
    expect(screen.queryByTestId('dataCompra-business-day-warning')).toBeNull();
  });
});
