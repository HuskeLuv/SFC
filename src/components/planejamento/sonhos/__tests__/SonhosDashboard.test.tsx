// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/wrappers';

vi.mock('@/icons', () => ({
  DollarLineIcon: () => <svg data-testid="dollar-icon" />,
  ChevronDownIcon: () => <svg data-testid="chev-down" />,
}));

import SonhosDashboard from '@/components/planejamento/sonhos/SonhosDashboard';
import type { PlanejamentoObjetivoDTO } from '@/hooks/usePlanejamentoSonhos';

const buildObjetivo = (
  overrides: Partial<PlanejamentoObjetivoDTO> = {},
): PlanejamentoObjetivoDTO => ({
  id: overrides.id ?? 'g1',
  name: overrides.name ?? 'Reserva',
  target: overrides.target ?? 25000,
  months: overrides.months ?? 12,
  startDate: overrides.startDate ?? '2026-01',
  available: overrides.available ?? 5000,
  rate: overrides.rate ?? 0.01,
  priority: overrides.priority ?? 'Alta',
  category: overrides.category ?? 'c',
  status: overrides.status ?? 'Iniciado',
  notes: overrides.notes ?? null,
  entries: overrides.entries ?? [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

function renderDashboard(objetivos: PlanejamentoObjetivoDTO[] = []) {
  const queryClient = createTestQueryClient();
  const onSelect = vi.fn();
  const onNew = vi.fn();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <SonhosDashboard objetivos={objetivos} onSelectObjetivo={onSelect} onNew={onNew} />
    </QueryClientProvider>,
  );
  return { ...utils, onSelect, onNew };
}

describe('SonhosDashboard', () => {
  it('renders empty state when there are no objetivos', () => {
    renderDashboard([]);
    expect(screen.getByText(/Nenhum objetivo cadastrado/i)).toBeInTheDocument();
  });

  it('renders one card per objetivo', () => {
    renderDashboard([
      buildObjetivo({ id: 'a', name: 'Reserva' }),
      buildObjetivo({ id: 'b', name: 'Carro', category: 'm' }),
    ]);
    expect(screen.getByText('Reserva')).toBeInTheDocument();
    expect(screen.getByText('Carro')).toBeInTheDocument();
  });

  it('"+ Novo Objetivo" button invokes onNew', () => {
    const { onNew } = renderDashboard([buildObjetivo()]);
    // dois botões "Novo Objetivo" (header + possível CTA do empty state). Pegamos o primeiro.
    const buttons = screen.getAllByRole('button', { name: /Novo Objetivo/i });
    fireEvent.click(buttons[0]);
    expect(onNew).toHaveBeenCalled();
  });

  it('click no card invoca onSelect com id correto', () => {
    const { onSelect } = renderDashboard([buildObjetivo({ id: 'xyz', name: 'Foo' })]);
    fireEvent.click(screen.getByText('Foo'));
    expect(onSelect).toHaveBeenCalledWith('xyz');
  });

  it('tabs filtram por categoria', () => {
    renderDashboard([
      buildObjetivo({ id: 'a', name: 'Curto', category: 'c' }),
      buildObjetivo({ id: 'b', name: 'Longo', category: 'l' }),
    ]);
    expect(screen.getByText('Curto')).toBeInTheDocument();
    expect(screen.getByText('Longo')).toBeInTheDocument();

    // Click no tab "Longo Prazo" (contagem 1)
    fireEvent.click(screen.getByText(/Longo Prazo \(1\)/));
    expect(screen.getByText('Longo')).toBeInTheDocument();
    expect(screen.queryByText('Curto')).not.toBeInTheDocument();
  });
});
