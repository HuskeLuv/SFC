// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PriceDeviationConfirmModal from '../PriceDeviationConfirmModal';

const baseProps = {
  isOpen: true,
  enteredPrice: 2.8,
  referencePrice: 28.3,
  effectiveDate: '2022-05-10',
  ratio: 0.901,
  direction: 'abaixo' as const,
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe('PriceDeviationConfirmModal', () => {
  it('mostra o preço informado e o fechamento da data selecionada', () => {
    render(<PriceDeviationConfirmModal {...baseProps} />);

    // Fechamento daquele dia (DD/MM/YYYY) e os dois valores
    expect(screen.getByText(/Fechamento em 10\/05\/2022/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*2,80/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*28,30/)).toBeInTheDocument();
    // Percentual + direção
    expect(screen.getByText(/90,1% abaixo/)).toBeInTheDocument();
  });

  it('não renderiza quando isOpen é false', () => {
    render(<PriceDeviationConfirmModal {...baseProps} isOpen={false} />);
    expect(screen.queryByText(/Confirme o preço informado/)).not.toBeInTheDocument();
  });

  it('dispara onConfirm e onCancel nos botões', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<PriceDeviationConfirmModal {...baseProps} onConfirm={onConfirm} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar mesmo assim' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Voltar e corrigir' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
