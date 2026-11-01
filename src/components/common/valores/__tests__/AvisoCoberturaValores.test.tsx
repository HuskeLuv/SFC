// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const navegacao = vi.hoisted(() => ({ pathname: '/fluxodecaixa' }));
vi.mock('next/navigation', () => ({ usePathname: () => navegacao.pathname }));

import { AvisoCoberturaValores } from '../AvisoCoberturaValores';
import { ValoresOcultosProvider } from '@/context/ValoresOcultosContext';

const TEXTO = 'Nesta tela os valores ainda aparecem.';

const renderAviso = (pathname: string, ocultos: boolean, habilitado = true) => {
  navegacao.pathname = pathname;
  return render(
    <ValoresOcultosProvider habilitado={habilitado} inicial={ocultos}>
      <AvisoCoberturaValores />
    </ValoresOcultosProvider>,
  );
};

describe('<AvisoCoberturaValores>', () => {
  it('aparece numa rota não coberta com o olho fechado', () => {
    renderAviso('/fluxodecaixa', true);
    const faixa = screen.getByRole('note');
    expect(faixa).toHaveTextContent(TEXTO);
    expect(faixa).toHaveClass('min-h-10', 'rounded-xl');
  });

  it.each(['/carteira', '/carteira/analise', '/ativos/abc', '/consultor', '/dashboard/consultor'])(
    'não aparece na rota coberta %s',
    (rota) => {
      renderAviso(rota, true);
      expect(screen.queryByRole('note')).toBeNull();
    },
  );

  it('não aparece com o olho aberto', () => {
    renderAviso('/fluxodecaixa', false);
    expect(screen.queryByText(TEXTO)).toBeNull();
  });

  it('não aparece com a flag desligada', () => {
    renderAviso('/fluxodecaixa', true, false);
    expect(screen.queryByText(TEXTO)).toBeNull();
  });
});
