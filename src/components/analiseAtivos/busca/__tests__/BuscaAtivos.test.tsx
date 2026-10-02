// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

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

  it('celular: botão abre o sheet de tela cheia com campo de 16px e recentes', () => {
    media.celular = true;
    window.localStorage.setItem('mf-analise-ativos-buscas-recentes', JSON.stringify(['HGLG11']));
    render(<BuscaAtivos variante="cabecalho" />);
    fireEvent.click(screen.getByRole('button', { name: 'Buscar ativo' }));
    const dialogo = screen.getByRole('dialog', { name: 'Buscar ativo' });
    const input = within(dialogo).getByRole('combobox');
    expect(input.className).toMatch(/text-base/);
    fireEvent.click(within(dialogo).getByRole('button', { name: 'HGLG11' }));
    expect(nav.push).toHaveBeenCalledWith('/analise-ativos/HGLG11');
  });
});
