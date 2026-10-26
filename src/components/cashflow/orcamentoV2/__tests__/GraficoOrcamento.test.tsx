// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import GraficoOrcamento, { GraficoOrcamentoCelular } from '../GraficoOrcamento';
import { montarPayload } from './payloadAnexoB';

const barras = (container: HTMLElement) =>
  container.querySelectorAll('[data-mf-grafico-categoria]');

describe('GraficoOrcamento (desktop)', () => {
  it('um par de barras por categoria, com o rótulo curto e a cor do status', () => {
    const data = montarPayload();
    const { container } = render(<GraficoOrcamento data={data} onAlternar={() => {}} />);
    expect(barras(container)).toHaveLength(data.categorias.length);
    expect(screen.getByText('Outubro 2026')).toBeInTheDocument();
    const comEstouro = data.categorias.find((c) => c.status === 'bad');
    if (comEstouro) {
      const g = container.querySelector(`[data-mf-grafico-categoria="${comEstouro.id}"]`)!;
      expect(g.querySelectorAll('rect')[1].getAttribute('class')).toContain('#D92D20');
    }
    const pets = data.categorias.find((c) => /animais/i.test(c.nome));
    if (pets) expect(screen.getByText('Pets')).toBeInTheDocument();
  });

  it('recolher esconde as barras e grava graficoVisivel=false', () => {
    const onAlternar = vi.fn();
    const { container } = render(
      <GraficoOrcamento data={montarPayload()} onAlternar={onAlternar} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar gráfico' }));
    expect(onAlternar).toHaveBeenCalledWith(false);
    expect(barras(container)).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Mostrar gráfico' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('começa fechado quando a preferência diz graficoVisivel=false', () => {
    const base = montarPayload();
    const data = { ...base, prefs: { ...base.prefs, graficoVisivel: false } };
    const { container } = render(<GraficoOrcamento data={data} onAlternar={() => {}} />);
    expect(barras(container)).toHaveLength(0);
  });
});

describe('GraficoOrcamentoCelular', () => {
  it('começa recolhido e, aberto, mostra só categorias com orçado ou real', () => {
    const data = montarPayload();
    const { container } = render(<GraficoOrcamentoCelular data={data} />);
    expect(barras(container)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /Orçado × Real por categoria/ }));
    const comValor = data.categorias.filter((c) => c.orcado || c.realizado);
    expect(barras(container)).toHaveLength(comValor.length);
  });
});
