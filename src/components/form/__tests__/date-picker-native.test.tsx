// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * PWA fase 1 (fatia D): `nativeOnMobile` troca o flatpickr pelo `<input type="date">` abaixo de
 * lg, emitindo o MESMO formato do flatpickr (Date à meia-noite local + 'Y-m-d').
 */

const flatpickrMock = vi.hoisted(() =>
  vi.fn(() => ({ destroy: vi.fn(), setDate: vi.fn(), clear: vi.fn() })),
);
vi.mock('flatpickr', () => ({ default: flatpickrMock }));
vi.mock('flatpickr/dist/l10n/pt', () => ({ Portuguese: {} }));
// O SVG vira string no vitest; o ícone não importa aqui.
vi.mock('../../../icons', () => ({ CalenderIcon: () => null }));

import DatePicker, { dateOptionToInputValue, inputValueToLocalDate } from '../date-picker';

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
  flatpickrMock.mockClear();
});

describe('DatePicker nativeOnMobile', () => {
  it('abaixo de lg: input date nativo, emite Date local com o mesmo dia digitado e o ISO', () => {
    mockViewport(true);
    const onChange = vi.fn();
    render(
      <DatePicker
        id="data"
        label="Data"
        nativeOnMobile
        defaultDate="2026-09-10"
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText('Data') as HTMLInputElement;
    expect(input.type).toBe('date');
    expect(input.value).toBe('2026-09-10');
    expect(flatpickrMock).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '2026-09-25' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    const [dates, iso] = onChange.mock.calls[0];
    expect(iso).toBe('2026-09-25');
    const date = dates[0] as Date;
    // Meia-noite LOCAL (o que o flatpickr entrega): o dia do calendário é o digitado.
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(8);
    expect(date.getDate()).toBe(25);
    expect(date.getHours()).toBe(0);
  });

  it('maxDate "today" vira o atributo max com a data local de hoje', () => {
    mockViewport(true);
    render(<DatePicker id="data" label="Data" nativeOnMobile maxDate="today" />);
    const input = screen.getByLabelText('Data') as HTMLInputElement;
    expect(input.max).toBe(dateOptionToInputValue(new Date()));
  });

  it('limpar o campo emite lista vazia (como o flatpickr)', () => {
    mockViewport(true);
    const onChange = vi.fn();
    render(
      <DatePicker
        id="data"
        label="Data"
        nativeOnMobile
        defaultDate="2026-09-10"
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith([], '', null);
  });

  it('segue o defaultDate controlado pelo pai (ex.: ajuste de dia útil)', () => {
    mockViewport(true);
    const { rerender } = render(
      <DatePicker id="data" label="Data" nativeOnMobile defaultDate="2026-09-12" />,
    );
    rerender(<DatePicker id="data" label="Data" nativeOnMobile defaultDate="2026-09-11" />);
    expect((screen.getByLabelText('Data') as HTMLInputElement).value).toBe('2026-09-11');
  });

  it('sem a prop, continua no flatpickr mesmo abaixo de lg', () => {
    mockViewport(true);
    render(<DatePicker id="data" label="Data" defaultDate="2026-09-10" />);
    const input = screen.getByLabelText('Data') as HTMLInputElement;
    expect(input.type).not.toBe('date');
    expect(flatpickrMock).toHaveBeenCalledTimes(1);
  });

  it('a partir de lg, flatpickr mesmo com a prop', () => {
    mockViewport(false);
    render(<DatePicker id="data" label="Data" nativeOnMobile defaultDate="2026-09-10" />);
    expect((screen.getByLabelText('Data') as HTMLInputElement).type).not.toBe('date');
    expect(flatpickrMock).toHaveBeenCalledTimes(1);
  });
});

describe('conversões', () => {
  it('dateOptionToInputValue aceita ISO, Date e vazio', () => {
    expect(dateOptionToInputValue('2026-01-05')).toBe('2026-01-05');
    expect(dateOptionToInputValue('2026-01-05T00:00:00.000Z')).toBe('2026-01-05');
    expect(dateOptionToInputValue(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(dateOptionToInputValue('')).toBe('');
    expect(dateOptionToInputValue(undefined)).toBe('');
  });

  it('inputValueToLocalDate devolve a meia-noite local, ou null', () => {
    const d = inputValueToLocalDate('2026-02-28')!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 1, 28, 0]);
    expect(inputValueToLocalDate('28/02/2026')).toBeNull();
  });
});
