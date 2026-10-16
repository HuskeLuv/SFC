// @vitest-environment jsdom
/**
 * Bloco 1 (fatia 0): props opcionais de TabelaQuadro/CartoesQuadro para a coluna de ação
 * (marcador Salvar do Quadro, "×" da tabela Salvos), colunas extras ("Adicionado em") e o
 * complemento da célula Critérios ("antes 5 de 6 · 16/10"). Sem as props, o DOM é IDÊNTICO ao de
 * antes (snapshot gravado com o código anterior à mudança).
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/wrappers';

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push, replace: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import TabelaQuadro from '../TabelaQuadro';
import CartoesQuadro from '../CartoesQuadro';
import { paraLinhaQuadroApi } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { comTipoFiiExibido } from '@/services/analiseAtivos/quadro/tipoFiiExibido';
import { LINHA_ITUB4, LINHA_WEGE3 } from '@/test/fixtures/analiseAtivos/linhasDb';
import type { InfoNaCarteira } from '../CelulaNaCarteira';

const LINHAS = [LINHA_WEGE3, LINHA_ITUB4].map((l) => comTipoFiiExibido(paraLinhaQuadroApi(l)));
const naCarteira = (): InfoNaCarteira => ({ estado: 'fora' }) as unknown as InfoNaCarteira;

function comCliente(ui: React.ReactElement) {
  return render(<QueryClientProvider client={createTestQueryClient()}>{ui}</QueryClientProvider>);
}

const baseTabela = {
  classe: 'acao' as const,
  modo: 'resumo' as const,
  ordem: 'ticker' as const,
  dir: 'asc' as const,
  linhas: LINHAS,
  onOrdenar: vi.fn(),
  naCarteira,
  legenda: 'Quadro de ações',
};

describe('TabelaQuadro/CartoesQuadro — props do bloco 1', () => {
  beforeEach(() => nav.push.mockReset());

  it('sem as props novas: DOM idêntico ao de antes (snapshot)', () => {
    const t = comCliente(<TabelaQuadro {...baseTabela} />);
    expect(t.container.innerHTML).toMatchSnapshot('tabela');
    t.unmount();
    const c = comCliente(
      <CartoesQuadro classe="acao" modo="resumo" linhas={LINHAS} naCarteira={naCarteira} />,
    );
    expect(c.container.innerHTML).toMatchSnapshot('cartoes');
  });

  it('tabela com acaoLinha: coluna de ação no fim, clique não abre o ativo', () => {
    const acao = vi.fn();
    comCliente(
      <TabelaQuadro
        {...baseTabela}
        rotuloColunaAcao="Salvar"
        acaoLinha={(l) => (
          <button type="button" onClick={() => acao(l.ticker)}>
            {`Salvar ${l.ticker}`}
          </button>
        )}
        colunasExtras={[
          { id: 'adicionadoEm', rotulo: 'Adicionado em', conteudo: () => '28/09/2026' },
        ]}
        complementoCriterios={(l) => (l.ticker === 'WEGE3' ? 'antes 5 de 6 · 16/10' : null)}
      />,
    );
    const ths = Array.from(document.querySelectorAll('thead th'));
    expect(ths.at(-1)?.getAttribute('data-coluna')).toBe('acao');
    expect(ths.at(-1)?.textContent).toBe('Salvar');
    expect(ths.at(-2)?.textContent).toBe('Adicionado em');
    expect(screen.getAllByText('28/09/2026')).toHaveLength(2);
    expect(screen.getByText('antes 5 de 6 · 16/10')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar WEGE3' }));
    expect(acao).toHaveBeenCalledWith('WEGE3');
    expect(nav.push).not.toHaveBeenCalled();
    // a linha continua abrindo o ativo fora da coluna de ação
    fireEvent.click(document.querySelector('tr[data-ticker="ITUB4"] td') as Element);
    expect(nav.push).toHaveBeenCalledWith('/analise-ativos/ITUB4');
  });

  it('cartões com acaoLinha e rodapeCartao: ação fora do link esticado', () => {
    const acao = vi.fn();
    comCliente(
      <CartoesQuadro
        classe="acao"
        modo="resumo"
        linhas={LINHAS}
        naCarteira={naCarteira}
        acaoLinha={(l) => (
          <button type="button" onClick={() => acao(l.ticker)}>
            {`Salvar ${l.ticker}`}
          </button>
        )}
        rodapeCartao={() => 'adicionado em 28/09/2026'}
        complementoCriterios={() => 'antes 5 de 6 · 16/10'}
      />,
    );
    const botao = screen.getByRole('button', { name: 'Salvar WEGE3' });
    expect(botao.closest('a')).toBeNull();
    expect(botao.closest('[data-coluna="acao"]')?.className).toMatch(/relative z-10/);
    fireEvent.click(botao);
    expect(acao).toHaveBeenCalledWith('WEGE3');
    expect(screen.getAllByText('adicionado em 28/09/2026')).toHaveLength(2);
    expect(screen.getAllByText('antes 5 de 6 · 16/10')).toHaveLength(2);
  });
});
