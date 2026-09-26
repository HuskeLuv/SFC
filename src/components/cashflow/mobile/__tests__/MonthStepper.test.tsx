// @vitest-environment jsdom
import React, { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import MonthStepper, { monthStatusFor, useMonthSwipe } from '../MonthStepper';

const label = () => document.querySelector('[data-mf-month-label]') as HTMLElement;

function Controlled({
  initialYear = 2026,
  initialMonth = 6,
  withYear = true,
  onYear,
}: {
  initialYear?: number;
  initialMonth?: number;
  withYear?: boolean;
  onYear?: (y: number) => void;
}) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  return (
    <MonthStepper
      year={year}
      month={month}
      onChange={setMonth}
      onYearChange={
        withYear
          ? (y) => {
              onYear?.(y);
              setYear(y);
            }
          : undefined
      }
      monthSummaries={Array.from({ length: 12 }, (_, i) => ({ saldo: i === 3 ? null : i * 100 }))}
    />
  );
}

describe('MonthStepper', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 26, 12));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('mostra o mês com data-mf-month-label e aria-live', () => {
    render(<Controlled />);
    expect(label()).toHaveTextContent('Julho de 2026');
    expect(label()).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Mês fechado')).toBeInTheDocument();
  });

  it('setas trocam o mês', () => {
    render(<Controlled />);
    fireEvent.click(screen.getByRole('button', { name: 'Próximo mês' }));
    expect(label()).toHaveTextContent('Agosto de 2026');
    fireEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(label()).toHaveTextContent('Junho de 2026');
  });

  it('estado do mês: atual, fechado e previsto', () => {
    render(<Controlled initialMonth={8} />);
    expect(screen.getByText('● Mês atual')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Próximo mês' }));
    expect(screen.getByText('Previsto')).toBeInTheDocument();
    expect(monthStatusFor(2025, 11)).toBe('fechado');
    expect(monthStatusFor(2027, 0)).toBe('previsto');
  });

  it('monthStatus explícito vence o calculado', () => {
    render(<MonthStepper year={2026} month={0} onChange={() => {}} monthStatus="previsto" />);
    expect(screen.getByText('Previsto')).toBeInTheDocument();
  });

  it('virada Dez → Jan e Jan → Dez chama onYearChange', () => {
    const onYear = vi.fn();
    render(<Controlled initialMonth={11} onYear={onYear} />);
    fireEvent.click(screen.getByRole('button', { name: 'Próximo mês' }));
    expect(onYear).toHaveBeenLastCalledWith(2027);
    expect(label()).toHaveTextContent('Janeiro de 2027');
    fireEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(onYear).toHaveBeenLastCalledWith(2026);
    expect(label()).toHaveTextContent('Dezembro de 2026');
  });

  it('sem onYearChange as setas das pontas ficam desabilitadas', () => {
    const { unmount } = render(<Controlled initialMonth={0} withYear={false} />);
    expect(screen.getByRole('button', { name: 'Mês anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Próximo mês' })).toBeEnabled();
    unmount();
    render(<Controlled initialMonth={11} withYear={false} />);
    expect(screen.getByRole('button', { name: 'Próximo mês' })).toBeDisabled();
  });

  it('tocar no nome abre "Escolher mês" com 12 meses e o saldo; escolher fecha e troca', () => {
    render(<Controlled />);
    fireEvent.click(screen.getByRole('button', { name: /Julho de 2026/ }));
    const sheet = screen.getByRole('dialog', { name: 'Escolher mês' });
    const options = sheet.querySelectorAll('[data-mf-month-option]');
    expect(options).toHaveLength(12);
    const julho = within(sheet).getByRole('button', { name: /^Julho/ });
    expect(julho).toHaveAttribute('aria-current', 'true');
    expect(within(sheet).getByRole('button', { name: /^Março, saldo/ })).toHaveTextContent('R$');
    // Sem saldo → traço.
    expect(within(sheet).getByRole('button', { name: 'Abril' })).toHaveTextContent('—');
    // Setembro é o mês atual; outubro em diante, previsto.
    expect(within(sheet).getByRole('button', { name: /^Setembro.*mês atual/ })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: /^Outubro.*previsto/ })).toHaveTextContent(
      'Previsto',
    );

    fireEvent.click(within(sheet).getByRole('button', { name: /^Fevereiro/ }));
    expect(screen.queryByRole('dialog', { name: 'Escolher mês' })).not.toBeInTheDocument();
    expect(label()).toHaveTextContent('Fevereiro de 2026');
  });

  it('trailing entra na 4ª coluna', () => {
    render(
      <MonthStepper
        year={2026}
        month={6}
        onChange={() => {}}
        trailing={<button type="button">Ano</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Ano' })).toBeInTheDocument();
  });
});

function SwipeArea({ onPrev, onNext }: { onPrev: () => void; onNext: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useMonthSwipe(ref, { onPrev, onNext });
  return <div ref={ref} data-testid="area" />;
}

function swipe(el: HTMLElement, dx: number, dy: number) {
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 200, clientY: 300, pointerType: 'touch' });
  fireEvent.pointerUp(el, {
    pointerId: 1,
    clientX: 200 + dx,
    clientY: 300 + dy,
    pointerType: 'touch',
  });
}

describe('useMonthSwipe', () => {
  it('arrastar para a esquerda = próximo; para a direita = anterior', () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(<SwipeArea onPrev={onPrev} onNext={onNext} />);
    const area = screen.getByTestId('area');
    expect(area.style.touchAction).toBe('pan-y');
    swipe(area, -80, 10);
    expect(onNext).toHaveBeenCalledTimes(1);
    swipe(area, 80, -10);
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it('ignora arrasto curto ou mais vertical que horizontal', () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(<SwipeArea onPrev={onPrev} onNext={onNext} />);
    const area = screen.getByTestId('area');
    swipe(area, -50, 0);
    swipe(area, -80, 60);
    expect(onNext).not.toHaveBeenCalled();
    expect(onPrev).not.toHaveBeenCalled();
  });
});
