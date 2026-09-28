// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AcompanhamentoCards, {
  acompanhamentoSituacao,
  type AcompanhamentoRow,
} from '../AcompanhamentoCards';

const ROWS: AcompanhamentoRow[] = [
  { off: 1, label: 'Jan/26', aporteReal: 1000, patFinal: 12000, rent: 0.8, reqPat: 11000 },
  { off: 2, label: 'Fev/26', aporteReal: 500, patFinal: 11500, rent: -0.3, reqPat: 12000 },
  { off: 3, label: 'Mar/26', aporteReal: null, patFinal: null, rent: null, reqPat: 13000 },
];

describe('acompanhamentoSituacao (mesma comparação do Δ% da tabela)', () => {
  it('Patrim. ≥ Nec. = Na meta; abaixo = Abaixo; sem registro = null', () => {
    expect(acompanhamentoSituacao(ROWS[0])).toBe('na-meta');
    expect(acompanhamentoSituacao(ROWS[1])).toBe('abaixo');
    expect(acompanhamentoSituacao(ROWS[2])).toBeNull();
    // igual ao necessário conta como na meta (Δ% = 0 → '+0,0%' na tabela)
    expect(acompanhamentoSituacao({ ...ROWS[0], patFinal: 11000 })).toBe('na-meta');
    // sem patrimônio necessário a tabela mostra '—'
    expect(acompanhamentoSituacao({ ...ROWS[0], reqPat: 0 })).toBeNull();
  });
});

describe('AcompanhamentoCards', () => {
  it('um cartão por mês com selo Na meta/Abaixo e — sem registro', () => {
    render(<AcompanhamentoCards rows={ROWS} onSelect={vi.fn()} />);
    const cards = document.querySelectorAll('[data-mf-card]');
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveTextContent('Jan/26');
    expect(cards[0]).toHaveTextContent('M1');
    expect(cards[0].querySelector('[data-mf-status="ok"]')).toHaveTextContent('Na meta');
    expect(cards[1].querySelector('[data-mf-status="atencao"]')).toHaveTextContent('Abaixo');
    expect(cards[2].querySelector('[data-mf-status]')).toBeNull();
    expect(cards[2]).toHaveTextContent('—');
  });

  it('tocar no cartão devolve o offset do mês', () => {
    const onSelect = vi.fn();
    render(<AcompanhamentoCards rows={ROWS} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Fev/26'));
    expect(onSelect).toHaveBeenCalledWith(2);
  });
});
