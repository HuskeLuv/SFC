// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CaixaParaInvestirCard from '../CaixaParaInvestirCard';
import { CarteiraResumoProvider } from '@/context/CarteiraResumoContext';
import type { CarteiraResumo } from '@/hooks/useCarteira';
import { formatBRL } from '@/utils/format';

/** formatBRL usa espaço não separável; o getByText normaliza o texto do DOM pra espaço comum. */
const brl = (valor: number) => formatBRL(valor).replace(/\s/g, ' ');

const renderWithCaixa = (ui: React.ReactElement, caixa: NonNullable<CarteiraResumo['caixa']>) => {
  const value = {
    resumo: { caixaParaInvestir: caixa.total, caixa } as unknown as CarteiraResumo,
    loading: false,
    error: null,
    formatCurrency: formatBRL,
    formatPercentage: () => '',
    updateMeta: vi.fn(),
    updateCaixaParaInvestir: vi.fn(),
    refetch: vi.fn(),
    necessidadeAporteMap: {},
    isAlocacaoLoading: false,
    invalidateAssets: vi.fn(),
  };
  return render(<CarteiraResumoProvider value={value}>{ui}</CarteiraResumoProvider>);
};

const startEditing = (novoValor: string) => {
  fireEvent.click(screen.getByRole('button', { name: 'Editar caixa para investir' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: novoValor } });
};

describe('CaixaParaInvestirCard', () => {
  it('fora do provider mostra só o valor (sem detalhe do bolso)', () => {
    render(<CaixaParaInvestirCard value={1500} formatCurrency={formatBRL} />);
    expect(screen.getByText(brl(1500))).toBeInTheDocument();
    expect(screen.queryByText('Livre')).not.toBeInTheDocument();
  });

  it('escopo total: mostra reservado nas abas e livre', () => {
    renderWithCaixa(
      <CaixaParaInvestirCard value={10000} formatCurrency={formatBRL} escopo="total" />,
      { total: 10000, reservado: 6000, livre: 4000, porAba: {} },
    );
    expect(screen.getByText('Nas abas')).toBeInTheDocument();
    expect(screen.getByText(brl(6000))).toBeInTheDocument();
    expect(screen.getByText(brl(4000))).toBeInTheDocument();
  });

  it('escopo aba: mostra o caixa total e quanto há livre', () => {
    renderWithCaixa(<CaixaParaInvestirCard value={2000} formatCurrency={formatBRL} />, {
      total: 10000,
      reservado: 6000,
      livre: 4000,
      porAba: {},
    });
    expect(screen.getByText('Caixa total')).toBeInTheDocument();
    expect(screen.getByText(brl(10000))).toBeInTheDocument();
    expect(screen.getByText('Livre')).toBeInTheDocument();
  });

  it('avisa quando as reservas passam do total (dado legado)', () => {
    renderWithCaixa(
      <CaixaParaInvestirCard value={1000} formatCurrency={formatBRL} escopo="total" />,
      { total: 1000, reservado: 3000, livre: -2000, porAba: {} },
    );
    expect(screen.getByText(/As reservas das abas passam do total/)).toBeInTheDocument();
  });

  it('ações ficam na linha do título (card não cresce para caber o botão)', () => {
    render(<CaixaParaInvestirCard value={1500} formatCurrency={formatBRL} onSave={vi.fn()} />);
    const titulo = screen.getByText('Caixa para Investir');
    const editar = screen.getByRole('button', { name: 'Editar caixa para investir' });
    expect(titulo.parentElement).toBe(editar.parentElement);

    fireEvent.click(editar);
    expect(
      screen.getByRole('button', { name: 'Salvar caixa para investir' }).parentElement
        ?.parentElement,
    ).toBe(titulo.parentElement);
  });

  it('salva e sai da edição quando onSave devolve true', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<CaixaParaInvestirCard value={0} formatCurrency={formatBRL} onSave={onSave} />);
    startEditing('2500');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar caixa para investir' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(2500));
    await waitFor(() =>
      expect(screen.queryByLabelText('Salvar caixa para investir')).not.toBeInTheDocument(),
    );
  });

  it('reserva que não cabe: mostra o motivo e oferece aumentar o total', async () => {
    const onSave = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        code: 'RESERVA_EXCEDE_TOTAL',
        message: 'A reserva de Ações não cabe no Caixa para Investir total.',
        totalNecessario: 12000,
      })
      .mockResolvedValueOnce(true);
    render(<CaixaParaInvestirCard value={0} formatCurrency={formatBRL} onSave={onSave} />);
    startEditing('9000');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar caixa para investir' }));

    expect(await screen.findByText(/não cabe no Caixa para Investir total/)).toBeInTheDocument();
    const oferta = screen.getByRole('button', { name: /Aumentar o total para/ });
    expect(oferta).toHaveTextContent(brl(12000));

    fireEvent.click(oferta);
    await waitFor(() => expect(onSave).toHaveBeenLastCalledWith(9000, { ajustarTotal: true }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Aumentar o total/ })).not.toBeInTheDocument(),
    );
  });

  it('total abaixo das reservas: mostra o motivo sem oferta de ajuste', async () => {
    const onSave = vi.fn().mockResolvedValue({
      ok: false,
      code: 'TOTAL_ABAIXO_DAS_RESERVAS',
      message: 'As abas já reservam R$ 6.000,00 deste caixa.',
    });
    render(
      <CaixaParaInvestirCard
        value={10000}
        formatCurrency={formatBRL}
        onSave={onSave}
        escopo="total"
      />,
    );
    startEditing('5000');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar caixa para investir' }));

    expect(await screen.findByText(/As abas já reservam/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aumentar o total/ })).not.toBeInTheDocument();
  });

  it('falha genérica mantém a mensagem padrão', async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    render(<CaixaParaInvestirCard value={0} formatCurrency={formatBRL} onSave={onSave} />);
    startEditing('100');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar caixa para investir' }));
    expect(await screen.findByText('Não foi possível salvar o valor.')).toBeInTheDocument();
  });
});
