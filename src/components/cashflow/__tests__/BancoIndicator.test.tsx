// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BancoIndicator } from '../BancoIndicator';

describe('BancoIndicator (célula em edição com parte do banco)', () => {
  it('mostra a parte do banco no rótulo/tooltip', () => {
    render(<BancoIndicator valorBanco={30} />);
    expect(
      // formatBRL usa espaço inseparável depois do "R$".
      screen.getByRole('img', { name: /^Inclui R\$\s30,00 lançados pelo banco/ }),
    ).toHaveAttribute('title');
  });

  it('sem parte do banco não renderiza nada', () => {
    const { container } = render(<BancoIndicator valorBanco={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});
