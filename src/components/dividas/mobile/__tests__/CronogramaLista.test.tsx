// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ParcelaCronograma } from '@/hooks/useDividas';
import CronogramaLista, { agruparPorAno, janelaDoCronograma } from '../CronogramaLista';

/** 48 parcelas mensais a partir de jan/2025. */
function cronograma(n = 48): ParcelaCronograma[] {
  return Array.from({ length: n }, (_, i) => {
    const y = 2025 + Math.floor(i / 12);
    const m = (i % 12) + 1;
    return {
      numero: i + 1,
      mes: `${y}-${String(m).padStart(2, '0')}`,
      parcela: 1000,
      juros: 100,
      amortizacao: 900,
      saldoDevedor: 48000 - (i + 1) * 900,
    };
  });
}

const linhas = () => Array.from(document.querySelectorAll('[data-mf-parcela]'));

describe('janelaDoCronograma / agruparPorAno', () => {
  it('14 parcelas em volta da próxima (6 antes)', () => {
    const w = janelaDoCronograma(cronograma(), 22, 21);
    expect(w).toHaveLength(14);
    expect(w[0].numero).toBe(16);
    expect(w[13].numero).toBe(29);
  });

  it('encosta no começo e no fim', () => {
    expect(janelaDoCronograma(cronograma(), 2, 1)[0].numero).toBe(1);
    const fim = janelaDoCronograma(cronograma(), 47, 46);
    expect(fim[fim.length - 1].numero).toBe(48);
    expect(fim).toHaveLength(14);
  });

  it('cronograma curto aparece inteiro', () => {
    expect(janelaDoCronograma(cronograma(12), 5, 4)).toHaveLength(12);
  });

  it('agrupa por ano na ordem', () => {
    const g = agruparPorAno(janelaDoCronograma(cronograma(), 22, 21));
    expect(g.map((x) => x.ano)).toEqual(['2026', '2027']);
    expect(g[0].linhas).toHaveLength(9);
  });
});

describe('CronogramaLista', () => {
  it('pagas com ✓ e a próxima com selo e aria-current', () => {
    render(<CronogramaLista cronograma={cronograma()} parcelasPagas={21} proximaParcela={22} />);
    expect(linhas()).toHaveLength(14);
    const proxima = document.querySelector('[data-mf-parcela="22"]')!;
    expect(proxima).toHaveAttribute('aria-current', 'true');
    expect(proxima.textContent).toContain('Próxima');
    expect(document.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
    expect(document.querySelector('[data-mf-parcela="21"]')!.textContent).toContain('✓');
    expect(document.querySelector('[data-mf-parcela="23"]')!.textContent).not.toContain('✓');
    // Faixas de ano com a contagem do ano inteiro.
    expect(screen.getByRole('button', { name: /2026/ })).toHaveTextContent('12 parcelas');
  });

  it('"Mostrar todas" abre as 48 e "Mostrar menos" volta à janela', () => {
    render(<CronogramaLista cronograma={cronograma()} parcelasPagas={21} proximaParcela={22} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar todas as 48 parcelas' }));
    expect(linhas()).toHaveLength(48);
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar menos' }));
    expect(linhas()).toHaveLength(14);
  });

  it('a faixa do ano recolhe as parcelas dele', () => {
    render(<CronogramaLista cronograma={cronograma()} parcelasPagas={21} proximaParcela={22} />);
    const faixa = screen.getByRole('button', { name: /2027/ });
    expect(faixa).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(faixa);
    expect(faixa).toHaveAttribute('aria-expanded', 'false');
    expect(linhas()).toHaveLength(9);
  });

  it('sem "Mostrar todas" quando cabe na janela; sem verde', () => {
    const { container } = render(
      <CronogramaLista cronograma={cronograma(12)} parcelasPagas={0} proximaParcela={1} />,
    );
    expect(screen.queryByRole('button', { name: /Mostrar/ })).toBeNull();
    expect(container.innerHTML).not.toMatch(/green|emerald/);
  });
});
