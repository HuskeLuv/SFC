// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { RendaFixaAtivo, RendaFixaData } from '@/types/rendaFixa';

const { mockUpdate, hookState } = vi.hoisted(() => ({
  mockUpdate: vi.fn(),
  hookState: { data: null as RendaFixaData | null },
}));

vi.mock('@/hooks/useRendaFixa', () => ({
  useRendaFixa: () => ({
    data: hookState.data,
    loading: false,
    error: null,
    formatCurrency: (v: number) =>
      `R$ ${(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    formatPercentage: (v: number) => `${(v ?? 0).toFixed(2)}%`,
    updateCaixaParaInvestir: vi.fn(),
    updateRendaFixaCampo: mockUpdate,
  }),
}));

vi.mock('@/context/CarteiraResumoContext', () => ({
  useCarteiraResumoContext: () => ({ necessidadeAporteMap: {} }),
}));

vi.mock('@/icons', () => ({
  ChevronDownIcon: () => <span />,
  ChevronUpIcon: () => <span />,
}));

vi.mock('@/components/carteira/shared/CaixaParaInvestirCard', () => ({
  default: () => <div data-testid="caixa" />,
}));

import RendaFixaTable, {
  diasAteVencimento,
  formatPrazoVencimento,
} from '@/components/carteira/RendaFixaTable';

function stubMatchMedia(mobile: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: mobile,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

const ativo = (over: Partial<RendaFixaAtivo>): RendaFixaAtivo => ({
  id: 'p1',
  nome: 'CDB Banco X',
  valorAtualizado: 11000,
  riscoPorAtivo: 0,
  percentualCarteira: 0,
  rentabilidade: 10,
  valorInicialAplicado: 10000,
  aporte: 0,
  resgate: 0,
  percentualRentabilidade: 10,
  cotizacaoResgate: 'D+0',
  liquidacaoResgate: 'D+0',
  vencimento: new Date('2030-01-10T00:00:00Z'),
  benchmark: 'CDI',
  tipo: 'pos-fixada',
  ...over,
});

function setData(ativos: RendaFixaAtivo[]) {
  hookState.data = {
    resumo: {
      necessidadeAporte: 0,
      caixaParaInvestir: 0,
      saldoInicioMes: 0,
      saldoAtual: 0,
      rendimento: 0,
      rentabilidade: 0,
    } as RendaFixaData['resumo'],
    secoes: [
      {
        tipo: 'pos-fixada',
        nome: 'Pos-fixada',
        ativos,
        totalValorAplicado: 10000,
        totalAporte: 0,
        totalResgate: 0,
        totalValorAtualizado: ativos.reduce((s, a) => s + a.valorAtualizado, 0),
        percentualTotal: 100,
        rentabilidadeMedia: 10,
      },
    ],
    totalGeral: {
      valorAplicado: 10000,
      aporte: 0,
      resgate: 0,
      valorAtualizado: 11000,
      rentabilidade: 10,
    } as RendaFixaData['totalGeral'],
  };
}

async function openCardAndEdit(campo: string) {
  fireEvent.click(screen.getByRole('button', { name: /CDB Banco X/ }));
  const edit = document.querySelector(`[data-mf-edit="${campo}"]`) as HTMLButtonElement;
  expect(edit).not.toBeNull();
  fireEvent.click(edit);
  return screen.findByRole('dialog');
}

describe('RendaFixaTable — celular (< lg)', () => {
  beforeEach(() => {
    stubMatchMedia(true);
    mockUpdate.mockReset();
    setData([ativo({})]);
  });
  afterEach(() => {
    // @ts-expect-error — remove o stub
    delete window.matchMedia;
  });

  it('mostra cartões em vez da <table>', () => {
    render(<RendaFixaTable totalCarteira={100000} />);
    expect(document.querySelector('table')).toBeNull();
    expect(document.querySelectorAll('[data-mf-card]').length).toBe(1);
    expect(document.querySelector('[data-mf-section]')).not.toBeNull();
  });

  it("'1.234,56' chama onUpdateCampo(id, 'valorAtualizado', 1234.56) e fecha", async () => {
    mockUpdate.mockResolvedValue(true);
    render(<RendaFixaTable totalCarteira={100000} />);
    const dialog = await openCardAndEdit('valorAtualizado');
    const input = within(dialog).getByLabelText('Valor atualizado');
    fireEvent.change(input, { target: { value: '1.234,56' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('p1', 'valorAtualizado', 1234.56));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('retorno false mantém o sheet aberto com erro', async () => {
    mockUpdate.mockResolvedValue(false);
    render(<RendaFixaTable totalCarteira={100000} />);
    const dialog = await openCardAndEdit('valorAtualizado');
    fireEvent.change(within(dialog).getByLabelText('Valor atualizado'), {
      target: { value: '500' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(await within(dialog).findByText(/Não foi possível salvar/)).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('valor 0 é recusado antes do request (maior que zero)', async () => {
    render(<RendaFixaTable totalCarteira={100000} />);
    const dialog = await openCardAndEdit('valorAtualizado');
    fireEvent.change(within(dialog).getByLabelText('Valor atualizado'), {
      target: { value: '0' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await within(dialog).findByText(/maior que 0/)).toBeTruthy();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('observações: textarea e salva o texto com o mesmo callback', async () => {
    mockUpdate.mockResolvedValue(true);
    render(<RendaFixaTable totalCarteira={100000} />);
    const dialog = await openCardAndEdit('observacoes');
    const area = within(dialog).getByLabelText('Observações');
    expect(area.tagName).toBe('TEXTAREA');
    fireEvent.change(area, { target: { value: 'linha 1\nlinha 2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('p1', 'observacoes', 'linha 1\nlinha 2'),
    );
  });

  it('sem botão de editar o valor quando isAutoUpdated (PU oficial)', () => {
    setData([ativo({ isAutoUpdated: true })]);
    render(<RendaFixaTable totalCarteira={100000} />);
    fireEvent.click(screen.getByRole('button', { name: /CDB Banco X/ }));
    expect(document.querySelector('[data-mf-edit="valorAtualizado"]')).toBeNull();
    expect(document.querySelector('[data-mf-locked="valorAtualizado"]')).not.toBeNull();
    expect(document.querySelector('[data-mf-edit="observacoes"]')).not.toBeNull();
  });

  it('mostra o IR se resgatar hoje que já vem da API', () => {
    setData([
      ativo({
        ir: {
          isento: false,
          motivoIsencao: null,
          category: 'tabela_regressiva',
          diasDecorridos: 400,
          aliquota: 17.5,
          rendimentoBruto: 1000,
          iof: 0,
          ir: 175,
          valorLiquido: 10825,
        },
      }),
    ]);
    render(<RendaFixaTable totalCarteira={100000} />);
    fireEvent.click(screen.getByRole('button', { name: /CDB Banco X/ }));
    expect(document.querySelector('[data-mf-rf-ir]')?.textContent).toContain('175,00');
  });
});

describe('RendaFixaTable — desktop (≥ lg)', () => {
  beforeEach(() => {
    stubMatchMedia(false);
    setData([ativo({})]);
  });
  afterEach(() => {
    // @ts-expect-error — remove o stub
    delete window.matchMedia;
  });

  it('renderiza a <table> de hoje, sem cartões', () => {
    render(<RendaFixaTable totalCarteira={100000} />);
    expect(document.querySelector('table')).not.toBeNull();
    expect(document.querySelector('[data-mf-card]')).toBeNull();
    expect(screen.getByText('Cotizacao de resgate')).toBeTruthy();
  });
});

describe('vencimento (formatação pura)', () => {
  it('conta dias até o vencimento pelo dia', () => {
    const hoje = new Date(2026, 8, 25, 15, 0);
    expect(diasAteVencimento(new Date('2026-10-02T00:00:00Z'), hoje)).toBe(7);
    expect(diasAteVencimento(new Date('2026-09-24T00:00:00Z'), hoje)).toBe(-1);
  });

  it('prazo por extenso', () => {
    expect(formatPrazoVencimento(-3)).toBe('já venceu');
    expect(formatPrazoVencimento(0)).toBe('vence hoje');
    expect(formatPrazoVencimento(1)).toBe('vence amanhã');
    expect(formatPrazoVencimento(12)).toBe('em 12 dias');
    expect(formatPrazoVencimento(240)).toBe('em 8 meses');
    expect(formatPrazoVencimento(365)).toBe('em 1 ano');
    expect(formatPrazoVencimento(456)).toBe('em 1 ano e 3 meses');
  });
});
