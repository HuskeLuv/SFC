// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/wrappers';
import { CashflowYearProvider } from '@/context/CashflowYearContext';
import { CASHFLOW_FLASH_EVENT } from '@/lib/cashflow/cashflowEvents';
import { lerRecentes } from '@/lib/cashflow/lancamentoRecentes';

const mocks = vi.hoisted(() => ({
  undo: vi.fn(),
  groups: [
    {
      id: 'g-desp',
      name: 'Despesas',
      type: 'despesa',
      items: [],
      children: [
        {
          id: 'g-alim',
          name: 'Alimentação',
          type: 'despesa',
          children: [],
          items: [
            { id: 'tpl-super', name: 'Supermercado', values: [] },
            { id: 'tpl-farm', name: 'Farmácia', values: [] },
          ],
        },
        {
          id: 'g-transp',
          name: 'Transporte',
          type: 'despesa',
          children: [],
          items: [{ id: 'tpl-comb', name: 'Combustível', values: [] }],
        },
      ],
    },
    {
      id: 'g-ent',
      name: 'Entradas',
      type: 'entrada',
      children: [],
      items: [{ id: 'tpl-sal', name: 'Salário', values: [] }],
    },
  ],
}));

vi.mock('@/hooks/useCashflow', () => ({
  useCashflowData: () => ({ data: mocks.groups, loading: false }),
}));
vi.mock('@/hooks/useUndoAlteracao', () => ({
  useUndoAlteracao: () => ({ mutateAsync: mocks.undo }),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuthOptional: () => ({ user: { id: 'u1' }, actingClient: null }),
}));

import LancamentoRapidoSheet, {
  mesInicialLancamento,
  normalizarBusca,
} from '../LancamentoRapidoSheet';

const ANO = new Date().getFullYear();

function stubMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <span data-testid="estado">{open ? 'aberto' : 'fechado'}</span>
      <LancamentoRapidoSheet isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}

function renderSheet() {
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <CashflowYearProvider>
        <Harness />
      </CashflowYearProvider>
    </QueryClientProvider>,
  );
}

const json = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const previaUnica = {
  itemId: 'tpl-super',
  itemNome: 'Supermercado',
  trilha: 'Despesas > Alimentação',
  tipo: 'despesa',
  ano: ANO,
  valor: 45.9,
  modo: 'somar',
  celulas: [{ mes: 8, valorAtual: 1020, valorNovo: 1065.9, diminui: false, temFormula: true }],
};

let fetchMock: ReturnType<typeof vi.fn>;
const corpo = (i: number) => JSON.parse(String(fetchMock.mock.calls[i][1].body));

const valorInput = () => screen.getByLabelText('Valor') as HTMLInputElement;
const picker = () => screen.getByRole('button', { name: /Linha do fluxo/ });

function escolherLinha(nome: string) {
  fireEvent.click(picker());
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${nome}`) }));
}

beforeEach(() => {
  stubMatchMedia();
  window.localStorage.clear();
  document.cookie = 'csrf-token=tok';
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  mocks.undo.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('helpers', () => {
  it('mês inicial: hoje no ano corrente, dez no passado, jan no futuro', () => {
    const hoje = new Date(2026, 8, 26);
    expect(mesInicialLancamento(2026, hoje)).toBe(8);
    expect(mesInicialLancamento(2025, hoje)).toBe(11);
    expect(mesInicialLancamento(2027, hoje)).toBe(0);
  });

  it('busca sem acento', () => {
    expect(normalizarBusca(' Farmácia ')).toBe('farmacia');
  });
});

describe('LancamentoRapidoSheet', () => {
  it('abre no formulário sem "Em breve" e valida valor e linha antes de chamar a rota', () => {
    renderSheet();
    expect(screen.getByRole('dialog', { name: 'Lançar despesa ou receita' })).toBeTruthy();
    expect(screen.queryByText('Em breve')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }));
    expect(screen.getByText('Digite um valor maior que zero, como 45,90.')).toBeTruthy();
    expect(screen.getByText('Escolha em qual linha do fluxo o valor entra.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('busca filtra pelo tipo e ignora acentos', () => {
    renderSheet();
    fireEvent.click(picker());
    const busca = screen.getByLabelText('Buscar linha de despesa');
    fireEvent.change(busca, { target: { value: 'farmacia' } });
    const lista = screen.getByRole('list', { name: 'Linhas encontradas' });
    expect(within(lista).getByRole('button', { name: /Farmácia/ })).toBeTruthy();
    expect(within(lista).queryByRole('button', { name: /Supermercado/ })).toBeNull();
    fireEvent.change(busca, { target: { value: 'sal' } });
    expect(screen.queryByRole('button', { name: /Salário/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Receita' }));
    fireEvent.click(picker());
    expect(screen.getByRole('button', { name: /Salário/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Supermercado/ })).toBeNull();
  });

  it('Revisar manda a prévia (confirmar:false) e mostra antes → depois e o aviso de fórmula', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true, previa: previaUnica }));
    renderSheet();
    fireEvent.change(valorInput(), { target: { value: '45,90' } });
    escolherLinha('Supermercado');
    fireEvent.click(screen.getByRole('button', { name: 'Setembro' }));
    fireEvent.change(screen.getByLabelText(/Descrição/), { target: { value: '  pão ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }));

    await screen.findByRole('heading', { name: 'Supermercado' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/cashflow/lancamento-rapido');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('x-csrf-token')).toBe('tok');
    expect(corpo(0)).toEqual({
      itemId: 'tpl-super',
      valor: 45.9,
      ano: ANO,
      mes: 8,
      recorrente: false,
      descricao: 'pão',
      confirmar: false,
    });
    expect(screen.getByText(/1\.065,90/)).toBeTruthy();
    expect(
      screen.getByText('A fórmula desta célula será substituída por valor fixo.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /Lançar R\$\s45,90/ })).toBeTruthy();

    // Voltar mantém o formulário preenchido.
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(valorInput().value).toBe('45,90');
  });

  it('recorrente com redução exige o checkbox; Lançar grava, guarda o recente, pisca a linha e o aviso desfaz com o changeLogId', async () => {
    const previa = {
      ...previaUnica,
      valor: 460,
      modo: 'definir',
      celulas: [
        { mes: 9, valorAtual: 1020, valorNovo: 460, diminui: true, temFormula: false },
        { mes: 10, valorAtual: 0, valorNovo: 460, diminui: false, temFormula: false },
        { mes: 11, valorAtual: 0, valorNovo: 460, diminui: false, temFormula: false },
      ],
    };
    fetchMock.mockResolvedValueOnce(json(200, { ok: true, previa })).mockResolvedValueOnce(
      json(200, {
        ok: true,
        previa,
        resultado: {
          itemId: 'user-super',
          grupoNome: 'Despesas > Alimentação',
          celulas: previa.celulas.map((c) => ({
            mes: c.mes,
            valorAnterior: c.valorAtual,
            valorNovo: c.valorNovo,
          })),
        },
        changeLogId: 'log-1',
      }),
    );
    mocks.undo.mockResolvedValue({ success: true, section: 'fluxo-caixa' });
    const flashes: unknown[] = [];
    const onFlash = (e: Event) => flashes.push((e as CustomEvent).detail);
    window.addEventListener(CASHFLOW_FLASH_EVENT, onFlash);

    renderSheet();
    fireEvent.click(screen.getByRole('switch', { name: /Definir este valor em todo mês até/ }));
    fireEvent.change(screen.getByLabelText('Valor por mês'), { target: { value: '460' } });
    escolherLinha('Supermercado');
    fireEvent.click(screen.getByRole('button', { name: 'Outubro' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }));
    await screen.findByRole('heading', { name: 'Supermercado' });
    expect(corpo(0)).toMatchObject({ recorrente: true, mes: 9, mesFim: 11, confirmar: false });
    expect(corpo(0)).not.toHaveProperty('descricao');
    expect(screen.getByText(/diminui R\$\s560,00/)).toBeTruthy();

    const lancar = screen.getByRole('button', { name: /Lançar R\$\s460,00\/mês/ });
    fireEvent.click(lancar);
    expect(
      screen.getByText('Marque a confirmação acima: alguns meses vão ficar com valor menor.'),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText(/Entendi que 1 mês vai diminuir/));
    fireEvent.click(lancar);
    await waitFor(() => expect(screen.getByTestId('estado').textContent).toBe('fechado'));
    expect(corpo(1)).toMatchObject({ confirmar: true, aceitaReducao: true, recorrente: true });

    expect(lerRecentes('u1')).toEqual([
      { itemId: 'user-super', nome: 'Supermercado', trilha: 'Despesas > Alimentação' },
    ]);
    expect(flashes).toEqual([{ itemId: 'user-super', year: ANO, month: 9 }]);
    window.removeEventListener(CASHFLOW_FLASH_EVENT, onFlash);

    expect(
      screen.getByText(/Lançado: R\$\s460,00\/mês em Supermercado \(outubro a dezembro\)/),
    ).toBeTruthy();
    // Deixa os efeitos do aviso assentarem (a ação vive num ref atualizado em efeito).
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    });
    expect(mocks.undo).toHaveBeenCalledWith('log-1');
    expect(await screen.findByText('Lançamento desfeito')).toBeTruthy();
  });

  it('erro da rota fica no sheet com a mensagem do servidor', async () => {
    fetchMock.mockResolvedValueOnce(json(422, { error: 'Linha não encontrada ou não editável.' }));
    renderSheet();
    fireEvent.change(valorInput(), { target: { value: '10' } });
    escolherLinha('Combustível');
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }));
    expect(await screen.findByText('Linha não encontrada ou não editável.')).toBeTruthy();
    expect(screen.getByTestId('estado').textContent).toBe('aberto');
  });
});
