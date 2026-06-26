// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SonhosObjetivosTable from '@/components/planejamento/sonhos/SonhosObjetivosTable';
import { pmt } from '@/services/planejamento/planejamentoSonhos';
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

describe('SonhosObjetivosTable', () => {
  it('renders a row per objetivo with the expected columns', () => {
    render(
      <SonhosObjetivosTable
        objetivos={[
          buildObjetivo({ id: 'a', name: 'Comprar Corolla', months: 24 }),
          buildObjetivo({ id: 'b', name: 'Viagem Japão', months: 12 }),
        ]}
        onSelectObjetivo={vi.fn()}
      />,
    );
    expect(screen.getByText('Comprar Corolla')).toBeInTheDocument();
    expect(screen.getByText('Viagem Japão')).toBeInTheDocument();
    expect(screen.getByText('Objetivo')).toBeInTheDocument();
    expect(screen.getByText('Aporte/mês')).toBeInTheDocument();
  });

  it('selects the objetivo when a row is clicked', () => {
    const onSelect = vi.fn();
    render(
      <SonhosObjetivosTable
        objetivos={[buildObjetivo({ id: 'xyz', name: 'Entrada Imóvel' })]}
        onSelectObjetivo={onSelect}
      />,
    );
    fireEvent.click(screen.getByText('Entrada Imóvel'));
    expect(onSelect).toHaveBeenCalledWith('xyz');
  });

  it('sums the monthly contribution only for "Iniciado" objetivos in the footer', () => {
    const iniciado = buildObjetivo({ id: 'a', status: 'Iniciado' });
    const emEspera = buildObjetivo({ id: 'b', status: 'Em espera' });
    render(<SonhosObjetivosTable objetivos={[iniciado, emEspera]} onSelectObjetivo={vi.fn()} />);
    // Só o "Iniciado" entra na soma — o "Em espera" fica de fora.
    const aporteAtivo = pmt(iniciado);
    expect(aporteAtivo).toBeGreaterThan(0);

    const footerLabel = screen.getByText('TOTAL MENSAL ATIVO');
    const footerRow = footerLabel.closest('tr');
    expect(footerRow).not.toBeNull();
    // O total exibido deve refletir só 1 objetivo (não o dobro).
    const expectedK = `R$ ${(aporteAtivo / 1000).toFixed(0).replace('.', ',')} K`;
    expect(within(footerRow as HTMLElement).getByText(expectedK)).toBeInTheDocument();
  });
});
