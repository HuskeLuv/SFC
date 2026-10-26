// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { acharGrupo, idCat, indiceCategoria, item } from '@/test/fixtures/orcamentoAnexoBArvore';
import { arvoreAnexoB } from '@/test/fixtures/orcamentoAnexoBArvore';
import type { OrcamentoV2Response } from '@/types/orcamentoV2';
import OrcamentoV2Tabela, {
  DEBOUNCE_PREFS_MS,
  type OrcamentoV2TabelaProps,
} from '../OrcamentoV2Tabela';
import { categoriaDe, montarPayload, subDe } from './payloadAnexoB';

function renderTabela(
  data: OrcamentoV2Response = montarPayload(),
  over: Partial<OrcamentoV2TabelaProps> = {},
) {
  const props: OrcamentoV2TabelaProps = {
    data,
    onSalvarOrcado: vi.fn().mockResolvedValue(undefined),
    onMarcarFixa: vi.fn(),
    onSalvarRecolhidas: vi.fn(),
    onCriarSub: vi.fn().mockResolvedValue(undefined),
    onErroCriarSub: vi.fn(),
    onRenomearSub: vi.fn().mockResolvedValue(undefined),
    onBuscarImpacto: vi.fn(),
    onExcluirSub: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
  const utils = render(<OrcamentoV2Tabela {...props} />);
  return { ...utils, props };
}

const linhaCategoria = (container: HTMLElement, id: string) =>
  container.querySelector<HTMLTableRowElement>(
    `tr[data-mf-linha="categoria"][data-categoria-id="${id}"]`,
  )!;
const linhaSub = (container: HTMLElement, id: string) =>
  container.querySelector<HTMLTableRowElement>(`tr[data-mf-linha="sub"][data-item-id="${id}"]`)!;
const linhasSub = (container: HTMLElement) => container.querySelectorAll('tr.sub');
const linhasCategoria = (container: HTMLElement) => container.querySelectorAll('tr.cat');

afterEach(() => {
  vi.useRealTimers();
});

describe('OrcamentoV2Tabela — Anexo B', () => {
  it('sem rolagem vertical própria (rola a página), cabeçalho grudado, tabela de 860 px', () => {
    const { container } = renderTabela();
    const rolagem = container.querySelector('[data-mf-orcamento-v2-rolagem]')!;
    expect(rolagem.className).toContain('overflow-x-auto');
    expect(rolagem.className).toContain('xl:overflow-clip');
    expect(rolagem.className).not.toContain('overflow-y-auto');
    expect(rolagem.className).not.toContain('max-h-');
    expect(rolagem.querySelector('table')!.className).toContain('min-w-[860px]');
    const ths = rolagem.querySelectorAll('thead th');
    expect(ths).toHaveLength(7);
    ths.forEach((th) => expect(th.className).toContain('sticky'));
  });

  it('T05: linha de Habitação = soma das subcategorias, sem etiqueta', () => {
    const data = montarPayload();
    const hab = categoriaDe(data, 'Habitação');
    const { container } = renderTabela(data);
    const tr = linhaCategoria(container, hab.id);
    const tds = tr.querySelectorAll('td');
    expect(tds[2]).toHaveTextContent('5.250,00');
    expect(tds[2]).toHaveTextContent('soma das subcategorias');
    expect(tds[3]).toHaveTextContent('4.768,80');
    expect(tds[4]).toHaveTextContent('481,20');
    expect(tds[5]).toHaveTextContent('91%');
    expect(tr.querySelector('[data-mf-etiqueta]')).toBeNull();
    // O orçado da categoria não é editável.
    expect(tds[2].querySelector('input')).toBeNull();
  });

  it('T15: Lazer recolhida mostra os contadores e a barra laranja de 87%', () => {
    const data = montarPayload();
    const lazer = categoriaDe(data, 'Lazer');
    const { container } = renderTabela(data);
    fireEvent.click(
      within(linhaCategoria(container, lazer.id)).getByRole('button', { name: /Lazer/ }),
    );
    const tr = linhaCategoria(container, lazer.id);
    expect(within(tr).getByRole('button', { name: /Lazer/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(tr).toHaveTextContent('1 estouro');
    expect(tr).toHaveTextContent('2 à frente do ritmo');
    const consumo = tr.querySelector('[data-mf-consumo]')!;
    expect(consumo).toHaveAttribute('data-mf-consumo', 'warn');
    expect(consumo).toHaveTextContent('87%');
    // As subs de Lazer saíram da tela.
    for (const s of lazer.subcategorias) expect(linhaSub(container, s.id)).toBeNull();
  });

  it('T16/T17: recolher todas (0 linhas de sub, 13 categorias, preferência salva) e expandir todas (82)', async () => {
    vi.useFakeTimers();
    const data = montarPayload();
    const onSalvarRecolhidas = vi.fn();
    const { container } = renderTabela(data, { onSalvarRecolhidas });
    expect(linhasSub(container)).toHaveLength(82);

    fireEvent.click(screen.getByRole('button', { name: 'Recolher todas' }));
    expect(linhasSub(container)).toHaveLength(0);
    expect(linhasCategoria(container)).toHaveLength(13);
    expect(onSalvarRecolhidas).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_PREFS_MS);
    });
    expect(onSalvarRecolhidas).toHaveBeenCalledTimes(1);
    expect(onSalvarRecolhidas).toHaveBeenCalledWith(data.categorias.map((c) => c.id));

    fireEvent.click(screen.getByRole('button', { name: 'Expandir todas' }));
    expect(linhasSub(container)).toHaveLength(82);
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_PREFS_MS);
    });
    expect(onSalvarRecolhidas).toHaveBeenLastCalledWith([]);
  });

  it('preferência salva: categorias recolhidas do payload começam fechadas', () => {
    const base = montarPayload();
    const hab = categoriaDe(base, 'Habitação');
    const data = { ...base, prefs: { ...base.prefs, categoriasRecolhidas: [hab.id] } };
    const { container } = renderTabela(data);
    expect(linhasSub(container)).toHaveLength(82 - hab.subcategorias.length);
  });

  it('T21: adicionar subcategoria — Enter cria pela rota da Planilha e a linha nova entra antes do "+ Adicionar"', async () => {
    const data = montarPayload();
    const lazer = categoriaDe(data, 'Lazer');
    expect(linhaCategoria(document.body, lazer.id)).toBeNull();
    const onCriarSub = vi.fn().mockResolvedValue(undefined);
    const { container, rerender, props } = renderTabela(data, { onCriarSub });
    expect(linhaCategoria(container, lazer.id)).toHaveTextContent(
      '6 de 7 subcategorias com orçamento',
    );

    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar subcategoria em Lazer' }));
    const input = screen.getByRole('textbox', { name: 'Nome da nova subcategoria em Lazer' });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: 'Shows e teatro' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onCriarSub).toHaveBeenCalledWith(lazer.id, 'Shows e teatro'));

    // O servidor devolve o item novo (antes da Geral, orçado 0, não fixa).
    const arvore = arvoreAnexoB();
    const g = acharGrupo(arvore, idCat(indiceCategoria('Lazer')));
    const geral = g.items.pop()!;
    g.items.push(item('it-novo', g.id, 'Shows e teatro', { orderIndex: 6 }), geral);
    const novo = montarPayload({ arvore });
    rerender(<OrcamentoV2Tabela {...props} data={novo} />);

    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: /Nome da nova subcategoria/ })).toBeNull(),
    );
    const linhaNova = linhaSub(container, 'it-novo');
    expect(linhaNova).toHaveTextContent('Shows e teatro');
    expect(linhaNova).not.toHaveTextContent('fixa');
    expect(
      within(linhaNova).getByRole('textbox', { name: /Orçado de Shows e teatro/ }),
    ).toHaveValue('');
    expect(linhaCategoria(container, lazer.id)).toHaveTextContent(
      '6 de 8 subcategorias com orçamento',
    );
    // Ordem: … nova sub, Geral, "+ Adicionar".
    const geralLinha = linhaSub(container, subDe(novo, 'Lazer', 'Geral').id);
    expect(linhaNova.nextElementSibling).toBe(geralLinha);
    expect(geralLinha.nextElementSibling).toHaveAttribute('data-mf-linha', 'adicionar');
  });

  it('T21: nome duplicado na categoria não chama o servidor', () => {
    const { props } = renderTabela();
    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar subcategoria em Lazer' }));
    const input = screen.getByRole('textbox', { name: 'Nome da nova subcategoria em Lazer' });
    fireEvent.change(input, { target: { value: 'restaurantes' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent('Já existe uma subcategoria com esse nome');
    expect(props.onCriarSub).not.toHaveBeenCalled();
  });

  it('abrir outra categoria enquanto a primeira salva não fecha a nova nem perde o texto', async () => {
    let resolver!: () => void;
    const onCriarSub = vi.fn(() => new Promise<void>((r) => (resolver = r)));
    const data = montarPayload();
    renderTabela(data, { onCriarSub });
    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar subcategoria em Lazer' }));
    const lazer = screen.getByRole('textbox', { name: 'Nome da nova subcategoria em Lazer' });
    fireEvent.change(lazer, { target: { value: 'Shows e teatro' } });
    fireEvent.blur(lazer);
    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar subcategoria em Habitação' }));
    const hab = screen.getByRole('textbox', { name: 'Nome da nova subcategoria em Habitação' });
    fireEvent.change(hab, { target: { value: 'Condomínio extra' } });
    expect(onCriarSub).toHaveBeenCalledWith(categoriaDe(data, 'Lazer').id, 'Shows e teatro');

    await act(async () => resolver());
    expect(
      screen.getByRole('textbox', { name: 'Nome da nova subcategoria em Habitação' }),
    ).toHaveValue('Condomínio extra');
  });

  it('recusa do servidor depois que a linha fechou vai para o aviso da seção', async () => {
    let rejeitar!: (e: Error) => void;
    const onCriarSub = vi.fn(() => new Promise<void>((_r, j) => (rejeitar = j)));
    const { props } = renderTabela(montarPayload(), { onCriarSub });
    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar subcategoria em Lazer' }));
    const lazer = screen.getByRole('textbox', { name: 'Nome da nova subcategoria em Lazer' });
    fireEvent.change(lazer, { target: { value: 'Shows e teatro' } });
    fireEvent.blur(lazer);
    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar subcategoria em Habitação' }));

    await act(async () => rejeitar(new Error('Nome já existe')));
    expect(props.onErroCriarSub).toHaveBeenCalledWith(
      'A subcategoria "Shows e teatro" não foi adicionada em Lazer: Nome já existe',
    );
    expect(
      screen.getByRole('textbox', { name: 'Nome da nova subcategoria em Habitação' }),
    ).toBeInTheDocument();
  });

  it('nome recusado no blur ao abrir outra categoria vai para o aviso da seção', () => {
    const { props } = renderTabela();
    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar subcategoria em Lazer' }));
    const lazer = screen.getByRole('textbox', { name: 'Nome da nova subcategoria em Lazer' });
    fireEvent.change(lazer, { target: { value: 'restaurantes' } });
    fireEvent.blur(lazer);
    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar subcategoria em Habitação' }));
    expect(props.onCriarSub).not.toHaveBeenCalled();
    expect(props.onErroCriarSub).toHaveBeenCalledWith(
      expect.stringContaining('"restaurantes" não foi adicionada em Lazer: Já existe'),
    );
  });

  it('T22: Esc ou Enter com nome vazio cancela — a linha some e nada é salvo', () => {
    const { props } = renderTabela();
    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar subcategoria em Lazer' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: /Nome da nova subcategoria/ }), {
      key: 'Escape',
    });
    expect(screen.queryByRole('textbox', { name: /Nome da nova subcategoria/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar subcategoria em Lazer' }));
    const input = screen.getByRole('textbox', { name: /Nome da nova subcategoria/ });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.queryByRole('textbox', { name: /Nome da nova subcategoria/ })).toBeNull();
    expect(props.onCriarSub).not.toHaveBeenCalled();
  });

  it('T26: Geral tem a etiqueta "padrão" e o menu sem renomear/excluir', () => {
    const data = montarPayload();
    const geral = subDe(data, 'Habitação', 'Geral');
    const { container } = renderTabela(data);
    const tr = linhaSub(container, geral.id);
    expect(tr).toHaveTextContent('padrão');
    expect(within(tr).queryByRole('button', { name: /R\$|%/ })).toBeNull();
    fireEvent.click(within(tr).getByRole('button', { name: 'Mais ações de Geral' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: 'Renomear' })).toBeNull();
    expect(within(menu).queryByRole('menuitem', { name: /Excluir/ })).toBeNull();
    expect(within(menu).getByRole('menuitem', { name: 'Marcar como fixa' })).toBeInTheDocument();
  });

  it('Planejamento (poupança): Geral sem menu; sub sem "fixa" e sem a opção de fixa', () => {
    const data = montarPayload();
    const { container } = renderTabela(data);
    const geral = linhaSub(container, subDe(data, 'Planejamento Financeiro', 'Geral').id);
    expect(within(geral).queryByRole('button', { name: /Mais ações/ })).toBeNull();
    const apto = linhaSub(
      container,
      subDe(data, 'Planejamento Financeiro', 'Entrada apartamento').id,
    );
    expect(apto).not.toHaveTextContent('fixa');
  });

  it('menu: marcar como fixa, renomear (validado e pela rota da Planilha)', async () => {
    const data = montarPayload();
    const mercado = subDe(data, 'Habitação', 'Mercado');
    const hab = categoriaDe(data, 'Habitação');
    const { container, props } = renderTabela(data);
    const tr = () => linhaSub(container, mercado.id);

    fireEvent.click(within(tr()).getByRole('button', { name: 'Mais ações de Mercado' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Marcar como fixa' }));
    expect(props.onMarcarFixa).toHaveBeenCalledWith({ itemId: mercado.id, fixa: true });

    fireEvent.click(within(tr()).getByRole('button', { name: 'Mais ações de Mercado' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Renomear' }));
    const input = within(tr()).getByRole('textbox', { name: 'Novo nome de Mercado' });
    fireEvent.change(input, { target: { value: 'Energia' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(within(tr()).getByRole('alert')).toHaveTextContent('Já existe');
    expect(props.onRenomearSub).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'Supermercado' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(props.onRenomearSub).toHaveBeenCalledWith(hab.id, mercado.id, 'Supermercado'),
    );
  });

  it('renomear recusado pelo servidor mostra a mensagem e mantém o campo', async () => {
    const data = montarPayload();
    const mercado = subDe(data, 'Habitação', 'Mercado');
    const { container } = renderTabela(data, {
      onRenomearSub: vi.fn().mockRejectedValue(new Error('Nome já usado nesta categoria')),
    });
    fireEvent.click(
      within(linhaSub(container, mercado.id)).getByRole('button', { name: /Mais ações/ }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Renomear' }));
    const input = screen.getByRole('textbox', { name: 'Novo nome de Mercado' });
    fireEvent.change(input, { target: { value: 'Feira' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByText('Nome já usado nesta categoria')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Novo nome de Mercado' })).toBeInTheDocument();
  });

  it('T27: excluir pede confirmação com o impacto e chama o DELETE', async () => {
    const data = montarPayload();
    const bar = subDe(data, 'Lazer', 'Bar / Cafés');
    const onBuscarImpacto = vi.fn().mockResolvedValue({
      itemId: bar.id,
      nome: bar.nome,
      celulas: 7,
      transacoes: 0,
      mesesComOrcado: 1,
      coresDivergentes: [],
    });
    const onExcluirSub = vi.fn().mockResolvedValue(undefined);
    const { container } = renderTabela(data, { onBuscarImpacto, onExcluirSub });

    fireEvent.click(
      within(linhaSub(container, bar.id)).getByRole('button', { name: /Mais ações/ }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir subcategoria' }));
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByText('Excluir “Bar / Cafés”?')).toBeInTheDocument();
    expect(
      await within(dialogo).findByText('Os 7 lançamentos desta subcategoria passam para Geral.'),
    ).toBeInTheDocument();
    expect(onBuscarImpacto).toHaveBeenCalledWith(bar.id, expect.any(AbortSignal));

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(onExcluirSub).toHaveBeenCalledWith(bar.id));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('T27: cores divergentes bloqueiam a exclusão com os meses (Q5); Cancelar não exclui', async () => {
    const data = montarPayload();
    const bar = subDe(data, 'Lazer', 'Bar / Cafés');
    const onExcluirSub = vi.fn();
    const { container } = renderTabela(data, {
      onBuscarImpacto: vi.fn().mockResolvedValue({
        itemId: bar.id,
        nome: bar.nome,
        celulas: 7,
        transacoes: 2,
        mesesComOrcado: 0,
        coresDivergentes: [{ ano: 2026, mes: 9 }],
      }),
      onExcluirSub,
    });
    fireEvent.click(
      within(linhaSub(container, bar.id)).getByRole('button', { name: /Mais ações/ }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir subcategoria' }));
    const dialogo = await screen.findByRole('dialog');
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('set/26');
    expect(dialogo).toHaveTextContent('2 transações importadas do banco também vão para Geral.');
    expect(within(dialogo).getByRole('button', { name: 'Excluir' })).toBeDisabled();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onExcluirSub).not.toHaveBeenCalled();
  });

  it('orçado inline: Enter salva o valor pt-BR; inválido não salva, mostra erro e restaura (Q6)', async () => {
    const data = montarPayload();
    const mercado = subDe(data, 'Habitação', 'Mercado');
    const { props } = renderTabela(data);
    const input = screen.getByRole('textbox', { name: 'Orçado de Mercado em Habitação' });
    expect(input).toHaveValue('1.400,00');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    expect(screen.getByRole('alert')).toHaveTextContent('Valor inválido');
    expect(input).toHaveValue('1.400,00');
    expect(props.onSalvarOrcado).not.toHaveBeenCalled();

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '1.500,00' } });
    fireEvent.blur(input);
    expect(props.onSalvarOrcado).toHaveBeenCalledWith({ itemId: mercado.id, valor: 1500 });

    // Vazio limpa o orçado.
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(props.onSalvarOrcado).toHaveBeenLastCalledWith({ itemId: mercado.id, valor: null });
  });

  it('acumulado do ano é somente leitura (Q7) e a coluna troca para "Previsto" no mês futuro', () => {
    const ano = montarPayload({ visao: 'ano' });
    const { unmount } = renderTabela(ano);
    expect(screen.queryByRole('textbox', { name: /Orçado de/ })).toBeNull();
    expect(screen.getByRole('row', { name: /Total acumulado/ })).toBeInTheDocument();
    unmount();

    const futuro = montarPayload({ mes0: 11 });
    renderTabela(futuro);
    expect(screen.getByRole('columnheader', { name: 'Previsto (R$)' })).toBeInTheDocument();
  });

  it('linha Total: contagem e somas do resumo', () => {
    const data = montarPayload();
    const { container } = renderTabela(data);
    const total = container.querySelector('tr[data-mf-linha="total"]')!;
    expect(total).toHaveTextContent('Total do mês');
    expect(total).toHaveTextContent('13 categorias · 82 subcategorias');
    expect(total).toHaveTextContent('18.014,90');
    expect(total).toHaveTextContent('16.176,00');
    expect(total).toHaveTextContent('1.838,90');
    expect(total).toHaveTextContent('75,1%');
  });
});
