// @vitest-environment jsdom
/**
 * Bloco D, fatia 0: os stubs de fronteira não mudam a tela. BlocoFundamentos = Essencial,
 * BlocoValuation = Múltiplos (mesmas props); PilulasArea, BotaoComparar e BandejaComparar ainda
 * não renderizam nada (o Comparador é da fatia C, já implementado).
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
import PilulasArea from '@/components/analiseAtivos/shell/PilulasArea';
import BotaoComparar from '@/components/analiseAtivos/ativo/topo/BotaoComparar';
import BandejaComparar from '@/components/analiseAtivos/quadro/BandejaComparar';

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

  // o Comparador (fatia C) deixou de ser stub: tem testes e e2e próprios
  it('stubs da fatia D não renderizam nada', () => {
    const { container } = render(
      <>
        <PilulasArea ativa="quadro" />
        <BotaoComparar ticker="WEGE3" classe="acao" />
        <BandejaComparar classe="acao" tickers={['WEGE3']} onLimpar={() => {}} />
      </>,
    );
    expect(container.innerHTML).toBe('');
  });
});
