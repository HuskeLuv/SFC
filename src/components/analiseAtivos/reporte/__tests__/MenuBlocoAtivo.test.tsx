// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { CORES_PERMITIDAS } from '@/constants/analiseAtivosVisual';
import type { ContextoBlocoReporte } from '@/types/analiseAtivosCuradoria';
import type { FrescorBloco } from '@/types/analiseAtivosApi';

const midia = vi.hoisted(() => ({ celular: false }));
vi.mock('@/hooks/useMediaQuery', () => ({
  useIsBelowLg: () => midia.celular,
  useMediaQuery: () => midia.celular,
}));

const botaoReportar = vi.hoisted(() => vi.fn((_props: unknown) => null));
vi.mock('@/components/analiseAtivos/reporte/BotaoReportarDado', () => ({
  default: (props: unknown) => botaoReportar(props),
}));

import MenuBlocoAtivo from '../MenuBlocoAtivo';

const CONTEXTO: ContextoBlocoReporte = {
  rotuloBloco: 'Valuation · Múltiplos',
  dados: [{ campo: 'payout', rotulo: 'Payout', valorExibido: '52%', periodo: 'últ. 12m' }],
  fonteExibida: 'CVM DFP 2025',
  frescorExibido: 'atualizado em 29/09',
  versao: '2026-10-03T10:40:00.000Z',
};

const FRESCOR: FrescorBloco = {
  fonte: 'CVM DFP/ITR',
  referencia: '2T26',
  atualizadoEm: '2026-09-29T12:00:00.000Z',
  status: 'atrasado',
  documentoEsperado: 'ITR 3T26',
};

function renderMenu(over: Partial<Parameters<typeof MenuBlocoAtivo>[0]> = {}) {
  return render(
    <MenuBlocoAtivo
      ticker="WEGE3"
      classe="acao"
      bloco="valuation"
      contexto={CONTEXTO}
      reporteHabilitado
      frescor={FRESCOR}
      {...over}
    />,
  );
}

const ultimaChamada = () =>
  botaoReportar.mock.calls[botaoReportar.mock.calls.length - 1][0] as {
    variante: string;
    aberto: boolean;
    onFechar: () => void;
    bloco: string;
    ticker: string;
  };

beforeEach(() => {
  midia.celular = false;
  botaoReportar.mockClear();
});
afterEach(cleanup);

describe('MenuBlocoAtivo — computador', () => {
  it('sem reporte e sem frescor não renderiza nada (página idêntica com flag desligada e v1)', () => {
    const { container } = renderMenu({ reporteHabilitado: false, frescor: null });
    expect(container.firstChild).toBeNull();
    expect(botaoReportar).not.toHaveBeenCalled();
  });

  it('botão ⋯ de 44×44 com nome do bloco e ARIA de menu', () => {
    renderMenu();
    const botao = screen.getByRole('button', { name: 'Opções do bloco Valuation · Múltiplos' });
    expect(botao.className).toContain('h-11');
    expect(botao.className).toContain('w-11');
    expect(botao).toHaveAttribute('aria-haspopup', 'menu');
    expect(botao).toHaveAttribute('aria-expanded', 'false');
  });

  it('abre o menu de 248px com itens de 44px; foco no 1º; setas, Home/End; Esc devolve o foco', () => {
    renderMenu();
    const botao = screen.getByRole('button', { name: /Opções do bloco/ });
    fireEvent.click(botao);
    expect(botao).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu', { name: 'Valuation · Múltiplos' });
    expect(menu.className).toContain('w-[248px]');
    const itens = within(menu).getAllByRole('menuitem');
    expect(itens.map((i) => i.textContent)).toEqual([
      'Reportar dado incorreto',
      'Fonte e atualização',
    ]);
    for (const i of itens) expect(i.className).toContain('min-h-[44px]');
    expect(document.activeElement).toBe(itens[0]);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(itens[1]);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(itens[0]);
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(itens[1]);
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement).toBe(itens[0]);
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(itens[1]);
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(botao);
  });

  it('só o item "Reportar" sem frescor; só "Fonte" sem reporte (e sem o formulário montado)', () => {
    renderMenu({ frescor: null });
    fireEvent.click(screen.getByRole('button', { name: /Opções do bloco/ }));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Reportar dado incorreto',
    ]);
    cleanup();
    botaoReportar.mockClear();
    renderMenu({ reporteHabilitado: false });
    fireEvent.click(screen.getByRole('button', { name: /Opções do bloco/ }));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Fonte e atualização',
    ]);
    expect(botaoReportar).not.toHaveBeenCalled();
  });

  it('"Reportar" fecha o menu e abre o formulário controlado; onFechar devolve o foco', () => {
    renderMenu();
    expect(ultimaChamada()).toMatchObject({
      variante: 'controlado',
      aberto: false,
      bloco: 'valuation',
      ticker: 'WEGE3',
    });
    const botao = screen.getByRole('button', { name: /Opções do bloco/ });
    fireEvent.click(botao);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reportar dado incorreto' }));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(ultimaChamada().aberto).toBe(true);
    act(() => ultimaChamada().onFechar());
    expect(ultimaChamada().aberto).toBe(false);
    expect(document.activeElement).toBe(botao);
  });

  it('"Fonte e atualização" mostra fonte, referência, situação com ícone e "Voltar"', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: /Opções do bloco/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Fonte e atualização' }));
    const painel = screen.getByRole('dialog', { name: 'Fonte e atualização' });
    expect(within(painel).getByText('CVM DFP/ITR')).toBeInTheDocument();
    expect(within(painel).getByText('2T26')).toBeInTheDocument();
    expect(within(painel).getByText('atualização em atraso')).toBeInTheDocument();
    expect(within(painel).getByText('aguardando ITR 3T26')).toBeInTheDocument();
    expect(within(painel).getByText('Atualizado em 29/09/2026')).toBeInTheDocument();
    expect(painel.querySelector('[data-frescor="atrasado"] svg')).not.toBeNull();
    fireEvent.click(within(painel).getByRole('button', { name: 'Voltar' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('clique fora fecha', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: /Opções do bloco/ }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('MenuBlocoAtivo — celular', () => {
  beforeEach(() => {
    midia.celular = true;
  });

  it('abre BottomSheet com itens de 52px e "voltar" do sistema fecha o sheet', async () => {
    renderMenu();
    const antes = window.history.length;
    fireEvent.click(screen.getByRole('button', { name: /Opções do bloco/ }));
    const sheet = await screen.findByRole('dialog');
    const itens = within(sheet)
      .getAllByRole('button')
      .filter((b) => b.hasAttribute('data-item-menu'));
    expect(itens.map((i) => i.textContent)).toEqual([
      'Reportar dado incorreto',
      'Fonte e atualização',
    ]);
    for (const i of itens) expect(i.className).toContain('min-h-[52px]');
    expect(window.history.length).toBe(antes + 1);
    act(() => window.history.back());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('MenuBlocoAtivo — paleta', () => {
  it('nenhuma cor fora da paleta', () => {
    const fonte = readFileSync(path.join(__dirname, '..', 'MenuBlocoAtivo.tsx'), 'utf8');
    const permitidas = new Set(CORES_PERMITIDAS.map((c) => c.toUpperCase()));
    const fora = [...fonte.matchAll(/#[0-9a-fA-F]{6}\b/g)]
      .map((m) => m[0])
      .filter((c) => !permitidas.has(c.toUpperCase()));
    expect(fora).toEqual([]);
  });
});
