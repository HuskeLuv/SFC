// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { TipoEvento } from '@/hooks/useAgenda';
import AgendaFiltrosSheet from '../AgendaFiltrosSheet';
import { TIPOS_DISPONIVEIS, TIPOS_META } from '../../agendaTipos';

// "Mercado" como tipo ainda sem fonte, para exercitar o "em breve" (hoje todos têm fonte).
vi.mock('../../agendaTipos', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../agendaTipos')>();
  return {
    ...orig,
    TIPOS_DISPONIVEIS: orig.TIPOS_DISPONIVEIS.filter((t) => t !== 'mercado'),
  };
});

vi.mock('@/hooks/useKeyboardInset', () => ({
  useKeyboardInset: () => ({ inset: 0, height: null }),
}));

function renderSheet(tipos: Set<TipoEvento>, onAlternar = vi.fn()) {
  render(
    <AgendaFiltrosSheet
      isOpen={true}
      onClose={() => {}}
      tipos={tipos}
      contagem={new Map<TipoEvento, number>([['divida', 3]])}
      theme="light"
      onAlternar={onAlternar}
      totalVisiveis={3}
    />,
  );
  return onAlternar;
}

describe('AgendaFiltrosSheet', () => {
  it('uma linha role=checkbox por tipo, com aria-checked do filtro', () => {
    renderSheet(new Set<TipoEvento>(['divida']));
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(TIPOS_META.length);
    expect(screen.getByRole('checkbox', { name: /Parcelas de dívidas/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('checkbox', { name: /Proventos/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByRole('checkbox', { name: /Parcelas de dívidas/ })).toHaveTextContent('(3)');
    expect(screen.getByRole('button', { name: 'Ver 3 eventos' })).toBeInTheDocument();
  });

  it('tocar alterna o tipo (o mesmo alternarTipo do desktop)', () => {
    const onAlternar = renderSheet(new Set<TipoEvento>());
    fireEvent.click(screen.getByRole('checkbox', { name: /Proventos/ }));
    expect(onAlternar).toHaveBeenCalledWith('provento');
  });

  it('tipo ainda não disponível: "em breve", aria-disabled e não alterna', () => {
    const indisponivel = TIPOS_META.find((m) => !TIPOS_DISPONIVEIS.includes(m.tipo))!;
    expect(indisponivel.tipo).toBe('mercado');
    const onAlternar = renderSheet(new Set<TipoEvento>());
    const box = screen.getByRole('checkbox', { name: new RegExp(indisponivel.label) });
    expect(box).toHaveAttribute('aria-disabled', 'true');
    expect(box).toHaveTextContent('em breve');
    fireEvent.click(box);
    expect(onAlternar).not.toHaveBeenCalled();
  });
});
