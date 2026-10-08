// @vitest-environment jsdom
/**
 * Bloco D, fatia B: o card Valuation com e sem o recurso de cenários. Sem o recurso = os Múltiplos
 * de hoje, sem seletor (regressão). Com o recurso = seletor 'Múltiplos | Meus cenários' e a
 * calculadora só quando o usuário escolhe.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { ReactNode } from 'react';

const cfg = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock('@/hooks/useAnaliseAtivos', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useAnaliseAtivos')>()),
  useAnaliseAtivosConfig: () => ({ data: cfg.data }),
}));
vi.mock('@/components/analiseAtivos/ativo/analise/BlocoValuationMultiplos', () => ({
  default: (p: { ticker: string; cabecalhoExtra?: ReactNode }) => (
    <div data-testid="multiplos">
      {p.ticker}
      {p.cabecalhoExtra}
    </div>
  ),
}));
vi.mock('@/components/analiseAtivos/ativo/cenarios/MeusCenarios', () => ({
  default: (p: { ticker: string; cabecalhoExtra?: ReactNode }) => (
    <div data-testid="cenarios">
      {p.ticker}
      {p.cabecalhoExtra}
    </div>
  ),
}));

import BlocoValuation from '@/components/analiseAtivos/ativo/analise/BlocoValuation';

describe('BlocoValuation (fatia B)', () => {
  afterEach(() => {
    cleanup();
    cfg.data = undefined;
  });

  it('sem o recurso: só os Múltiplos, sem seletor', () => {
    cfg.data = { habilitada: true, recursos: { raioX: true, cenarios: false, comparador: true } };
    const { getByTestId, queryByRole } = render(
      <BlocoValuation ticker="WEGE3" classe="acao" nome="WEG" />,
    );
    expect(getByTestId('multiplos').textContent).toBe('WEGE3');
    expect(queryByRole('group')).toBeNull();
  });

  it('com o recurso: seletor e troca para Meus cenários', () => {
    cfg.data = { habilitada: true, recursos: { raioX: false, cenarios: true, comparador: false } };
    const { getByRole, getByTestId, queryByTestId } = render(
      <BlocoValuation ticker="WEGE3" classe="acao" nome="WEG" />,
    );
    expect(getByRole('group', { name: 'Tipo de valuation' })).toBeTruthy();
    expect(queryByTestId('cenarios')).toBeNull();
    fireEvent.click(getByRole('button', { name: 'Meus cenários' }));
    expect(getByTestId('cenarios')).toBeTruthy();
    expect(getByRole('button', { name: 'Meus cenários' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });
});
