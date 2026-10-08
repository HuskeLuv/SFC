// @vitest-environment jsdom
/**
 * Bloco D, fatia 0: os stubs de fronteira não mudam a tela. BlocoFundamentos = Essencial,
 * BlocoValuation = Múltiplos (mesmas props). Os demais stubs deixaram de ser stubs: o Comparador
 * é da fatia C (comparador/__tests__) e PilulasArea, BotaoComparar e BandejaComparar são da
 * fatia D (quadro/__tests__/entradasComparador.test.tsx).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

vi.mock('@/components/analiseAtivos/ativo/analise/BlocoFundamentosEssencial', () => ({
  default: (p: { ticker: string; classe: string }) => (
    <div data-testid="essencial">{`${p.ticker}:${p.classe}:${Object.keys(p).length}`}</div>
  ),
}));
vi.mock('@/components/analiseAtivos/ativo/analise/BlocoValuationMultiplos', () => ({
  default: (p: { ticker: string; classe: string }) => (
    <div data-testid="multiplos">{`${p.ticker}:${p.classe}:${Object.keys(p).length}`}</div>
  ),
}));

// fatias A e B: BlocoFundamentos lê config.recursos.raioX e BlocoValuation lê
// config.recursos.cenarios; sem os recursos, ficam iguais aos stubs
vi.mock('@/hooks/useAnaliseAtivos', async (original) => ({
  ...(await original<typeof import('@/hooks/useAnaliseAtivos')>()),
  useAnaliseAtivosConfig: () => ({
    data: { habilitada: true, recursos: { raioX: false, cenarios: false } },
  }),
}));

import BlocoFundamentos from '@/components/analiseAtivos/ativo/analise/BlocoFundamentos';
import BlocoValuation from '@/components/analiseAtivos/ativo/analise/BlocoValuation';

describe('stubs do bloco D', () => {
  afterEach(cleanup);

  it('BlocoFundamentos renderiza o Essencial com as mesmas props (só ticker e classe)', () => {
    const { getByTestId } = render(<BlocoFundamentos ticker="WEGE3" classe="acao" />);
    expect(getByTestId('essencial').textContent).toBe('WEGE3:acao:2');
  });

  it('BlocoValuation renderiza os Múltiplos com ticker e classe (nome fica para a fatia B)', () => {
    const { getByTestId } = render(<BlocoValuation ticker="HGLG11" classe="fii" nome="CSHG" />);
    expect(getByTestId('multiplos').textContent).toBe('HGLG11:fii:2');
  });
});
