// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { UseOrcamentoV2 } from '@/hooks/useOrcamentoV2';
import type { UseOrcamentoV2Estrutura } from '@/hooks/useOrcamentoV2Estrutura';
import type { OrcamentoV2Response } from '@/types/orcamentoV2';
import OrcamentoV2Cartoes from '../OrcamentoV2Cartoes';
import type { ConteudoOrcamentoV2Props } from '../OrcamentoV2Section';
import { DEBOUNCE_PREFS_MS } from '../OrcamentoV2Tabela';
import { categoriaDe, montarPayload, subDe } from './payloadAnexoB';

function renderCartoes(
  data: OrcamentoV2Response | null = montarPayload(),
  over: Partial<ConteudoOrcamentoV2Props> = {},
) {
  const salvarOrcado = { mutateAsync: vi.fn().mockResolvedValue(undefined) };
  const salvarPrefs = { mutate: vi.fn() };
  const props: ConteudoOrcamentoV2Props = {
    data,
    loading: false,
    error: null,
    ano: 2026,
    mes: 10,
    onMesChange: vi.fn(),
    visao: data?.visao ?? 'mes',
    onVisaoChange: vi.fn(),
    fonte: data?.fonte ?? 'lancado',
    onFonteChange: vi.fn(),
    orcamento: { salvarOrcado, salvarPrefs } as unknown as UseOrcamentoV2,
    estrutura: {} as UseOrcamentoV2Estrutura,
    ...over,
  };
  const utils = render(<OrcamentoV2Cartoes {...props} />);
  return { ...utils, props, salvarOrcado, salvarPrefs };
}

const cartao = (container: HTMLElement, id: string) =>
  container.querySelector<HTMLElement>(`li[data-mf-card][data-categoria-id="${id}"]`)!;

afterEach(() => {
  vi.useRealTimers();
});

describe('OrcamentoV2Cartoes — celular', () => {
  it('esqueleto enquanto carrega; erro com alerta', () => {
    const { unmount } = renderCartoes(null, { loading: true });
    expect(screen.getByLabelText('Carregando orçamento')).toHaveAttribute('aria-busy', 'true');
    expect(document.querySelector('table')).toBeNull();
    unmount();
    renderCartoes(null, { error: 'Falhou' });
    expect(screen.getByRole('alert')).toHaveTextContent('Falhou');
  });

  it('herói com o resumo do payload, um cartão por categoria e o total — sem tabela', () => {
    const data = montarPayload();
    const { container } = renderCartoes(data);

    const heroi = container.querySelector('[data-mf-orcamento-heroi]')!;
    expect(heroi).toHaveTextContent('Lançado até dia 23');
    expect(container.querySelector('[data-mf-heroi-realizado]')!.textContent).toMatch(
      /R\$\s*[\d.]+,\d{2}/,
    );
    expect(heroi).toHaveTextContent('8 dias restantes');
    expect(heroi.querySelectorAll('[data-mf-kpi]')).toHaveLength(2);

    expect(container.querySelector('table')).toBeNull();
    expect(screen.getByRole('list', { name: 'Orçamento por categoria' })).toBeInTheDocument();
    expect(container.querySelectorAll('li[data-mf-card]')).toHaveLength(data.categorias.length);

    // Habitação: nome, contagem de subs e a soma que veio do payload.
    const hab = categoriaDe(data, 'Habitação');
    const card = cartao(container, hab.id);
    expect(card).toHaveTextContent('Habitação');
    expect(card).toHaveTextContent(
      `${hab.qtdComOrcamento} de ${hab.subcategorias.length} subcategorias com orçamento`,
    );
    expect(card.querySelectorAll('[data-mf-sub-mobile]')).toHaveLength(hab.subcategorias.length);

    // Total do mês com as contagens do resumo.
    expect(container.querySelector('[data-mf-orcamento-total-mobile]')).toHaveTextContent(
      `Total do mês${data.resumo.totalCategorias} categorias · ${data.resumo.totalSubcategorias} subcategorias`,
    );
    expect(container.querySelector('[data-mf-orcamento-referencia]')).toHaveTextContent(
      'Lançado até 23/10 · 8 dias para fechar o mês',
    );
  });

  it('subcategoria em duas linhas: nome e valores numa, campo do orçado na outra', () => {
    const data = montarPayload();
    const mercado = subDe(data, 'Habitação', 'Mercado');
    const { container } = renderCartoes(data);
    const linha = container.querySelector<HTMLElement>(
      `[data-mf-sub-mobile][data-item-id="${mercado.id}"]`,
    )!;
    const [l1, l2] = Array.from(linha.children);
    expect(l1).toHaveTextContent('Mercado');
    expect(l1).toHaveTextContent('real');
    expect(within(l1 as HTMLElement).queryByRole('textbox')).toBeNull();
    expect(
      within(l2 as HTMLElement).getByRole('textbox', { name: 'Orçado de Mercado em Habitação' }),
    ).toHaveValue('1.400,00');
  });

  it('editar o orçado chama a mutation; inválido não salva e mostra o erro', async () => {
    const data = montarPayload();
    const mercado = subDe(data, 'Habitação', 'Mercado');
    const { salvarOrcado } = renderCartoes(data);
    const input = screen.getByRole('textbox', { name: 'Orçado de Mercado em Habitação' });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '1.500,00' } });
    fireEvent.blur(input);
    expect(salvarOrcado.mutateAsync).toHaveBeenCalledTimes(1);
    expect(salvarOrcado.mutateAsync).toHaveBeenCalledWith({ itemId: mercado.id, valor: 1500 });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '12,345' } });
    fireEvent.blur(input);
    expect(await screen.findByRole('alert')).toHaveTextContent('Valor inválido');
    expect(salvarOrcado.mutateAsync).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue('1.400,00');
  });

  it('erro do servidor aparece junto do campo', async () => {
    const { salvarOrcado } = renderCartoes();
    salvarOrcado.mutateAsync.mockRejectedValueOnce(new Error('Item não encontrado'));
    const input = screen.getByRole('textbox', { name: 'Orçado de Mercado em Habitação' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(await screen.findByRole('alert')).toHaveTextContent('Item não encontrado');
  });

  it('seletor Mês | Acumulado e Lançado | Consolidado', () => {
    const { props } = renderCartoes();
    const visao = screen.getByRole('group', { name: 'Visão' });
    expect(within(visao).getByRole('button', { name: 'Mês' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(within(visao).getByRole('button', { name: 'Acumulado' }));
    expect(props.onVisaoChange).toHaveBeenCalledWith('ano');

    fireEvent.click(screen.getByRole('button', { name: 'Consolidado' }));
    expect(props.onFonteChange).toHaveBeenCalledWith('consolidado');

    fireEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(props.onMesChange).toHaveBeenCalledWith(9);
  });

  it('acumulado: orçado somente leitura e "Total acumulado"', () => {
    const { container } = renderCartoes(montarPayload({ visao: 'ano' }), { visao: 'ano' });
    expect(
      within(screen.getByRole('group', { name: 'Visão' })).getByRole('button', {
        name: 'Acumulado',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(container.querySelector('[data-mf-orcamento-total-mobile]')).toHaveTextContent(
      'Total acumulado',
    );
  });

  it('recolher um cartão esconde as subs e salva a preferência depois do debounce', () => {
    vi.useFakeTimers();
    const data = montarPayload();
    const hab = categoriaDe(data, 'Habitação');
    const { container, salvarPrefs } = renderCartoes(data);
    const botao = within(cartao(container, hab.id)).getByRole('button', { expanded: true });
    fireEvent.click(botao);
    expect(botao).toHaveAttribute('aria-expanded', 'false');
    expect(cartao(container, hab.id).querySelector('[data-mf-sub-mobile]')).toBeNull();
    expect(salvarPrefs.mutate).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_PREFS_MS);
    });
    expect(salvarPrefs.mutate).toHaveBeenCalledWith({ categoriasRecolhidas: [hab.id] });
  });

  it('categorias recolhidas nas prefs começam fechadas; "Expandir todas" abre', async () => {
    const base = montarPayload();
    const data = {
      ...base,
      prefs: { ...base.prefs, categoriasRecolhidas: base.categorias.map((c) => c.id) },
    };
    const { container } = renderCartoes(data);
    expect(container.querySelector('[data-mf-sub-mobile]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Expandir todas' }));
    await waitFor(() =>
      expect(container.querySelectorAll('[data-mf-sub-mobile]').length).toBeGreaterThan(0),
    );
  });

  it('T31/M01: nenhuma largura fixa em px e números com tabular-nums', () => {
    const { container } = renderCartoes();
    const fixas = Array.from(container.querySelectorAll<HTMLElement>('[class]')).filter((el) =>
      /(^|\s)(min-)?w-\[\d+px\]/.test(el.getAttribute('class') ?? ''),
    );
    expect(fixas).toHaveLength(0);
    // O padding do cartão é zerado de fato (twMerge): sem `px-4`/`py-3.5` ao lado do `p-0`, que
    // no Tailwind 4 ganhariam do `p-0` e dobrariam o recuo do botão e do corpo.
    const casca = container.querySelector<HTMLElement>('li[data-mf-card] > div')!;
    const classes = casca.className.split(/\s+/);
    expect(classes).toContain('p-0');
    expect(classes.filter((c) => /^p[xytrbl]?-/.test(c))).toEqual(['p-0']);
    expect(container.querySelector('[data-mf-heroi-realizado]')!.className).toContain(
      'tabular-nums',
    );
  });
});
