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

// Mock o inline form pra não fazer fetch real de defaults no render.
vi.mock('@/components/planejamento/sonhos/SonhosObjetivoInlineForm', () => ({
  default: ({ onCancel }: { onCancel: () => void }) => (
    <div data-testid="inline-form">
      <button onClick={onCancel}>Cancelar inline</button>
    </div>
  ),
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
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <SonhosDashboard objetivos={objetivos} onSelectObjetivo={onSelect} />
    </QueryClientProvider>,
  );
  return { ...utils, onSelect };
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

  it('"+ Adicionar objetivo" mostra o inline form e oculta o CTA', () => {
    renderDashboard([buildObjetivo()]);
    const buttons = screen.getAllByRole('button', { name: /Adicionar objetivo/i });
    fireEvent.click(buttons[0]);
    expect(screen.getByTestId('inline-form')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Adicionar objetivo/i })).not.toBeInTheDocument();
  });

  it('Cancelar no inline form volta o CTA', () => {
    renderDashboard([buildObjetivo()]);
    fireEvent.click(screen.getAllByRole('button', { name: /Adicionar objetivo/i })[0]);
    fireEvent.click(screen.getByText('Cancelar inline'));
    expect(screen.queryByTestId('inline-form')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Adicionar objetivo/i }).length).toBeGreaterThan(
      0,
    );
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

    fireEvent.click(screen.getByText(/Longo Prazo \(1\)/));
    expect(screen.getByText('Longo')).toBeInTheDocument();
    expect(screen.queryByText('Curto')).not.toBeInTheDocument();
  });
});
