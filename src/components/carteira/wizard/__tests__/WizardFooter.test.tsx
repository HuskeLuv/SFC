// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WizardFooter from '../WizardFooter';
import WizardProgress from '../WizardProgress';

describe('WizardFooter', () => {
  it('Cancelar/Voltar e Avançar chamam as funções recebidas', () => {
    const onBack = vi.fn();
    const onNext = vi.fn();
    render(
      <WizardFooter onBack={onBack} backLabel="Cancelar" onNext={onNext} nextLabel="Avançar" />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Avançar' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('nextDisabled trava só o primário', () => {
    const onNext = vi.fn();
    render(<WizardFooter onBack={vi.fn()} onNext={onNext} nextLabel="Avançar" nextDisabled />);
    const next = screen.getByRole('button', { name: 'Avançar' });
    expect(next).toBeDisabled();
    fireEvent.click(next);
    expect(onNext).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeEnabled();
  });

  it('loading trava os dois botões e marca o primário como ocupado', () => {
    render(<WizardFooter onBack={vi.fn()} onNext={vi.fn()} nextLabel="Salvando..." loading />);
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeDisabled();
    const next = screen.getByRole('button', { name: 'Salvando...' });
    expect(next).toBeDisabled();
    expect(next).toHaveAttribute('aria-busy', 'true');
  });

  it('botões com 48px (h-12)', () => {
    render(<WizardFooter onBack={vi.fn()} onNext={vi.fn()} nextLabel="Avançar" />);
    for (const btn of screen.getAllByRole('button')) expect(btn.className).toContain('h-12');
  });
});

describe('WizardProgress', () => {
  it.each([
    [['Tipo de Ativo', 'Informações', 'Confirmação'], 1],
    [['Tipo de Ativo', 'Instituição', 'Informações', 'Confirmação'], 2],
    [['Tipo de Ativo', 'Instituição', 'Ativo', 'Informações', 'Confirmação'], 3],
  ])('um segmento por etapa real (%#)', (steps, current) => {
    const { container } = render(<WizardProgress steps={steps} current={current} />);
    const bar = screen.getByRole('progressbar');
    const n = steps.length;
    expect(bar).toHaveAttribute('aria-valuemax', String(n));
    expect(bar).toHaveAttribute('aria-valuenow', String(current + 1));
    expect(bar).toHaveAttribute(
      'aria-valuetext',
      `Etapa ${current + 1} de ${n}: ${steps[current]}`,
    );
    expect(container.querySelectorAll('[data-mf-progress-segment]')).toHaveLength(n);
    expect(container.querySelectorAll('[data-mf-progress-segment="done"]')).toHaveLength(
      current + 1,
    );
    expect(container.textContent).toContain(`Etapa ${current + 1} de ${n} · ${steps[current]}`);
  });
});
