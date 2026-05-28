// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SonhosObjetivoCard from '@/components/planejamento/sonhos/SonhosObjetivoCard';
import type { PlanejamentoObjetivoDTO } from '@/hooks/usePlanejamentoSonhos';

const base: PlanejamentoObjetivoDTO = {
  id: 'g1',
  name: 'Reserva',
  target: 10000,
  months: 10,
  startDate: '2026-01',
  available: 0,
  rate: 0,
  priority: 'Alta',
  category: 'c',
  status: 'Iniciado',
  notes: null,
  entries: [],
  createdAt: '',
  updatedAt: '',
};

describe('SonhosObjetivoCard', () => {
  it('renderiza nome, meta e status badge', () => {
    render(<SonhosObjetivoCard objetivo={base} onClick={() => {}} />);
    expect(screen.getByText('Reserva')).toBeInTheDocument();
    expect(screen.getByText('Iniciado')).toBeInTheDocument();
  });

  it('chama onClick ao clicar', () => {
    const onClick = vi.fn();
    render(<SonhosObjetivoCard objetivo={base} onClick={onClick} />);
    fireEvent.click(screen.getByText('Reserva'));
    expect(onClick).toHaveBeenCalled();
  });

  it('mostra 100% quando objetivo está com saldo igual ou maior à meta', () => {
    const completed: PlanejamentoObjetivoDTO = {
      ...base,
      target: 10000,
      available: 0,
      entries: [{ month: '2026-05', aporte: 0, balance: 10000 }],
    };
    render(<SonhosObjetivoCard objetivo={completed} onClick={() => {}} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('mostra prioridade no metadata', () => {
    render(<SonhosObjetivoCard objetivo={base} onClick={() => {}} />);
    // Alta aparece como Priority badge
    expect(screen.getByText('Alta')).toBeInTheDocument();
  });
});
