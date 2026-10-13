// @vitest-environment jsdom
/**
 * Bloco D, fatia D: entradas do Comparador — pílulas Quadro | Comparador e bandeja do Quadro. Sem
 * config.recursos.comparador, nada aparece (decisão 15). O "Comparar" do cabeçalho do ativo é o da
 * BarraAcoesAtivo (v2.4, fatia C1). Textos passam pela varredura do Bloco D.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const cfg = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock('@/hooks/useAnaliseAtivos', () => ({
  useAnaliseAtivosConfig: () => cfg,
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ actingClient: null }) }));

import PilulasArea from '@/components/analiseAtivos/shell/PilulasArea';
import BandejaComparar from '@/components/analiseAtivos/quadro/BandejaComparar';
import { TEXTOS_ENTRADAS_COMPARADOR } from '@/services/analiseAtivos/textosEntradasComparador';
import {
  encontrarPalavrasProibidasBlocoD,
  folhasTexto,
} from '@/services/analiseAtivos/regras/comum/varreduraTextos';

const ligado = {
  data: { habilitada: true, recursos: { comparador: true, raioX: false, cenarios: false } },
};
const desligado = {
  data: { habilitada: true, recursos: { comparador: false, raioX: true, cenarios: true } },
};

afterEach(() => {
  cleanup();
  cfg.data = undefined;
});

describe('PilulasArea', () => {
  it('sem o recurso (ou config ausente) não renderiza nada', () => {
    for (const c of [{ data: undefined }, desligado, { data: { habilitada: true } }]) {
      cfg.data = c.data;
      const { container, unmount } = render(<PilulasArea ativa="quadro" />);
      expect(container.innerHTML).toBe('');
      unmount();
    }
  });

  it('com o recurso: nav com Quadro e Comparador, aria-current na atual, 44px', () => {
    cfg.data = ligado.data;
    render(<PilulasArea ativa="comparador" />);
    const nav = screen.getByRole('navigation', { name: 'Páginas da Análise de Ativos' });
    const quadro = screen.getByRole('link', { name: 'Quadro' });
    const comp = screen.getByRole('link', { name: 'Comparador' });
    expect(nav).toContainElement(quadro);
    expect(quadro).toHaveAttribute('href', '/analise-ativos');
    expect(quadro).not.toHaveAttribute('aria-current');
    expect(comp).toHaveAttribute('href', '/analise-ativos/comparador');
    expect(comp).toHaveAttribute('aria-current', 'page');
    for (const l of [quadro, comp]) expect(l.className).toContain('min-h-11');
  });
});

describe('BandejaComparar', () => {
  it('0: instrução da classe e "Comparar" desabilitado', () => {
    render(<BandejaComparar classe="fii" tickers={[]} onLimpar={() => {}} />);
    const r = screen.getByRole('region', { name: 'Seleção para comparar' });
    expect(r).toHaveTextContent('0 de 4 selecionados');
    expect(r).toHaveTextContent('marque de 1 a 4 FIIs');
    expect(screen.getByRole('button', { name: /Comparar/ })).toBeDisabled();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('1: já abre o Comparador (decisão 13)', () => {
    render(<BandejaComparar classe="acao" tickers={['WEGE3']} onLimpar={() => {}} />);
    const link = screen.getByRole('link', { name: 'Comparar WEGE3' });
    expect(link).toHaveAttribute('href', '/analise-ativos/comparador?t=WEGE3');
    expect(link).toHaveTextContent('Comparar 1');
  });

  it('4: "limite atingido" e o motivo na região anunciada (aria-live)', () => {
    const onLimpar = vi.fn();
    render(
      <BandejaComparar
        classe="acao"
        tickers={['WEGE3', 'ITUB4', 'PETR4', 'VALE3']}
        onLimpar={onLimpar}
      />,
    );
    const viva = document.querySelector('[aria-live="polite"]')!;
    expect(viva).toHaveTextContent('4 de 4 selecionados');
    expect(viva).toHaveTextContent('WEGE3, ITUB4, PETR4, VALE3 · limite atingido');
    expect(viva).toHaveTextContent('Limite de 4 ativos: desmarque um para incluir outro.');
    expect(screen.getByRole('link', { name: /Comparar/ })).toHaveAttribute(
      'href',
      '/analise-ativos/comparador?t=WEGE3,ITUB4,PETR4,VALE3',
    );
    screen.getByRole('button', { name: 'Limpar' }).click();
    expect(onLimpar).toHaveBeenCalled();
  });
});

describe('textos das entradas', () => {
  it('nenhuma palavra proibida do Bloco D', () => {
    for (const [caminho, texto] of folhasTexto(TEXTOS_ENTRADAS_COMPARADOR)) {
      expect(encontrarPalavrasProibidasBlocoD(texto), caminho).toEqual([]);
    }
  });
});
