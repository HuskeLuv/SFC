// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const nav = vi.hoisted(() => ({ push: vi.fn() }));
const media = vi.hoisted(() => ({ celular: false }));
const dados = vi.hoisted(() => ({
  indice: { data: undefined as unknown, isPending: false },
  overlay: { data: undefined as unknown },
}));

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => media.celular }));
vi.mock('@/hooks/useAnaliseAtivos', () => ({
  useIndiceBusca: () => dados.indice,
  useOverlayCarteira: () => dados.overlay,
}));

import BuscaAtivos from '../BuscaAtivos';
import { BUSCA, OVERLAY_CARTEIRA } from '@/test/fixtures/analiseAtivos/respostas';

const campo = () => screen.getByRole('combobox', { name: 'Buscar ativo' });
const digitar = (v: string) => {
  fireEvent.focus(campo());
  fireEvent.change(campo(), { target: { value: v } });
};

describe('BuscaAtivos', () => {
  beforeEach(() => {
    nav.push.mockReset();
    media.celular = false;
    dados.indice = { data: BUSCA, isPending: false };
    dados.overlay = { data: OVERLAY_CARTEIRA };
    window.localStorage.clear();
  });

  it('combobox: lista agrupada, activedescendant, setas e Enter abrem o ativo', () => {
    render(<BuscaAtivos variante="cabecalho" />);
    digitar('weg');
    const lista = screen.getByRole('listbox');
    expect(campo()).toHaveAttribute('aria-expanded', 'true');
    const opcoes = within(lista).getAllByRole('option');
    expect(opcoes[0]).toHaveAttribute('data-ticker', 'WEGE3');
    expect(opcoes[0]).toHaveAttribute('aria-selected', 'true');
    expect(campo().getAttribute('aria-activedescendant')).toBe(opcoes[0].id);
    expect(within(opcoes[0]).getByText('Na carteira')).toBeInTheDocument();
    fireEvent.keyDown(campo(), { key: 'Enter' });
    expect(nav.push).toHaveBeenCalledWith('/analise-ativos/WEGE3');
  });

  it("'itau' acha ITUB4 pelo nome (sem acento) com selo Planejado; seta para baixo navega", () => {
    render(<BuscaAtivos variante="cabecalho" />);
    digitar('itau');
    const opcao = screen.getByRole('option', { name: /ITUB4/ });
    expect(within(opcao).getByText('Planejado')).toBeInTheDocument();
    fireEvent.keyDown(campo(), { key: 'ArrowDown' });
    fireEvent.keyDown(campo(), { key: 'Escape' });
    expect(campo()).toHaveAttribute('aria-expanded', 'false');
  });

  it('item fora do Quadro aparece com o motivo', () => {
    render(<BuscaAtivos variante="cabecalho" />);
    digitar('cedo');
    expect(
      screen.getByText('fora do Quadro · sem negociação nos últimos 30 pregões'),
    ).toBeInTheDocument();
  });

  it('sem resultado diz o que a busca cobre', () => {
    render(<BuscaAtivos variante="cabecalho" />);
    digitar('AAPL');
    expect(
      screen.getByText('A busca cobre ações e FIIs da B3, por ticker ou nome'),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('grupos Ações e FIIs; clique escolhe e chama onSelecionar', () => {
    const onSelecionar = vi.fn();
    render(<BuscaAtivos variante="compacta" onSelecionar={onSelecionar} />);
    digitar('h');
    expect(screen.getByRole('group', { name: 'FIIs' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /HGLG11/ }));
    expect(onSelecionar).toHaveBeenCalledWith('HGLG11');
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('"/" foca a busca', () => {
    render(<BuscaAtivos variante="cabecalho" />);
    fireEvent.keyDown(document.body, { key: '/' });
    expect(document.activeElement).toBe(campo());
  });

  it('celular: botão abre o sheet de tela cheia com campo de 16px e recentes', async () => {
    media.celular = true;
    window.localStorage.setItem('mf-analise-ativos-buscas-recentes', JSON.stringify(['HGLG11']));
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    render(<BuscaAtivos variante="cabecalho" />);
    fireEvent.click(screen.getByRole('button', { name: 'Buscar ativo' }));
    const dialogo = screen.getByRole('dialog', { name: 'Buscar ativo' });
    const input = within(dialogo).getByRole('combobox');
    expect(input.className).toMatch(/text-base/);
    fireEvent.click(within(dialogo).getByRole('button', { name: 'HGLG11' }));
    // desfaz a entrada da busca no histórico ANTES de navegar (senão o back desfaria a navegação)
    expect(back).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/analise-ativos/HGLG11'));
    back.mockRestore();
  });

  it('celular: "voltar" do sistema fecha a busca em tela cheia', () => {
    media.celular = true;
    const inicial = window.history.state;
    render(<BuscaAtivos variante="cabecalho" />);
    fireEvent.click(screen.getByRole('button', { name: 'Buscar ativo' }));
    expect(screen.getByRole('dialog', { name: 'Buscar ativo' })).toBeInTheDocument();
    act(() => {
      window.history.replaceState(inicial, '', window.location.href);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.queryByRole('dialog', { name: 'Buscar ativo' })).not.toBeInTheDocument();
    expect(nav.push).not.toHaveBeenCalled();
  });

  describe('Bloco D: classe e desabilitados (Comparador)', () => {
    it('outra classe some sem desabilitarOutraClasse', () => {
      render(<BuscaAtivos variante="compacta" classe="acao" onSelecionar={vi.fn()} />);
      digitar('hglg');
      expect(screen.queryByRole('option', { name: /HGLG11/ })).not.toBeInTheDocument();
    });

    it('outra classe e já incluído aparecem desabilitados com o motivo e não selecionam', () => {
      const escolher = vi.fn();
      render(
        <BuscaAtivos
          variante="compacta"
          classe="acao"
          desabilitarOutraClasse
          embutida
          indisponiveis={{ WEGE3: 'já está na comparação' }}
          onSelecionar={escolher}
        />,
      );
      digitar('hglg');
      const fii = screen.getByRole('option', { name: /HGLG11/ });
      expect(fii).toHaveAttribute('aria-disabled', 'true');
      expect(within(fii).getByText('FII: outra classe')).toBeInTheDocument();
      fireEvent.click(fii);
      fireEvent.keyDown(campo(), { key: 'Enter' });
      digitar('weg');
      const weg = screen.getByRole('option', { name: /WEGE3/ });
      expect(within(weg).getByText('já está na comparação')).toBeInTheDocument();
      fireEvent.click(weg);
      expect(escolher).not.toHaveBeenCalled();
      digitar('itub');
      fireEvent.click(screen.getByRole('option', { name: /ITUB4/ }));
      expect(escolher).toHaveBeenCalledWith('ITUB4');
    });

    it('embutida no celular: campo direto, sem o botão do sheet', () => {
      media.celular = true;
      render(<BuscaAtivos variante="compacta" embutida classe="fii" onSelecionar={vi.fn()} />);
      expect(campo()).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /buscar/i })).not.toBeInTheDocument();
    });
  });
});
