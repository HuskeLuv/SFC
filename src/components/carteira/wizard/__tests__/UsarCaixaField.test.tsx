// @vitest-environment jsdom
import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import UsarCaixaField from '../shared/UsarCaixaField';
import CreditarCaixaField from '../shared/CreditarCaixaField';
import { CarteiraResumoProvider } from '@/context/CarteiraResumoContext';
import type { CarteiraResumo } from '@/hooks/useCarteira';
import type { CaixaAbaKey } from '@/lib/caixaParaInvestirPlano';

/** formatBRL usa espaço não separável; o DOM normalizado tem espaço comum. */
const texto = (el: HTMLElement | null) => (el?.textContent ?? '').replace(/\s/g, ' ');

const withCaixa = (ui: React.ReactElement, total: number, porAba: Record<string, number>) => {
  const reservado = Object.values(porAba).reduce((a, b) => a + b, 0);
  const value = {
    resumo: {
      caixaParaInvestir: total,
      caixa: { total, reservado, livre: total - reservado, porAba },
    } as unknown as CarteiraResumo,
    loading: false,
    error: null,
    formatCurrency: () => '',
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

/** Campo controlado como no assistente: o padrão é aplicado via onChange. */
function UsarCaixaHarness(props: {
  valor: number;
  aba: CaixaAbaKey | null;
  isReinvestimento?: boolean;
  onValue?: (v: boolean) => void;
}) {
  const [checked, setChecked] = useState<boolean | undefined>(undefined);
  return (
    <UsarCaixaField
      valor={props.valor}
      aba={props.aba}
      checked={checked}
      isReinvestimento={props.isReinvestimento}
      onChange={(v) => {
        setChecked(v);
        props.onValue?.(v);
      }}
    />
  );
}

describe('UsarCaixaField', () => {
  it('sem caixa nenhum (ou fora da carteira) não aparece', () => {
    const { container } = render(<UsarCaixaHarness valor={1000} aba="acoes" />);
    expect(container).toBeEmptyDOMElement();
    const vazio = withCaixa(<UsarCaixaHarness valor={1000} aba="acoes" />, 0, {});
    expect(vazio.container).toBeEmptyDOMElement();
  });

  it('reserva cobre: ligado por padrão e diz de onde sai e como fica o total', () => {
    const onValue = vi.fn();
    withCaixa(<UsarCaixaHarness valor={1000} aba="acoes" onValue={onValue} />, 10000, {
      acoes: 3000,
    });
    expect(onValue).toHaveBeenCalledWith(true);
    expect(screen.getByLabelText('Descontar do Caixa para Investir')).toBeChecked();
    const descricao = texto(screen.getByText(/^Sai /));
    expect(descricao).toContain('R$ 1.000,00 da reserva de Ações');
    expect(descricao).toContain('O caixa total fica em R$ 9.000,00');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('avisa quando a reserva da aba não cobre e o resto sai do livre', () => {
    withCaixa(<UsarCaixaHarness valor={5000} aba="acoes" />, 10000, { acoes: 3000 });
    const alertas = screen.getAllByRole('alert').map(texto);
    expect(alertas).toEqual([
      'A reserva de Ações (R$ 3.000,00) não cobre este investimento. R$ 2.000,00 vão sair do caixa livre.',
    ]);
  });

  it('avisa quando o caixa total não cobre: só o que existe é descontado', () => {
    withCaixa(<UsarCaixaHarness valor={12000} aba="acoes" />, 10000, { acoes: 3000, fii: 1000 });
    const alertas = screen.getAllByRole('alert').map(texto);
    // 3.000 da reserva + 6.000 livres (os 1.000 de FIIs não são usados).
    expect(alertas).toContain(
      'O Caixa para Investir não tem saldo suficiente: faltam R$ 3.000,00. Só R$ 9.000,00 serão descontados.',
    );
  });

  it('aba sem reserva: desligado por padrão; ligando, explica que usa só o livre', () => {
    const onValue = vi.fn();
    withCaixa(<UsarCaixaHarness valor={500} aba={null} onValue={onValue} />, 2000, {});
    expect(onValue).toHaveBeenCalledWith(false);
    const checkbox = screen.getByLabelText('Descontar do Caixa para Investir');
    expect(checkbox).not.toBeChecked();
    expect(texto(screen.getByText(/O caixa não será alterado/))).toContain('hoje: R$ 2.000,00');

    fireEvent.click(checkbox);
    expect(screen.getByText(/não tem reserva própria/)).toBeInTheDocument();
    expect(texto(screen.getByText(/^Sai /))).toContain('R$ 500,00 do caixa livre');
  });

  it('reinvestimento esconde o campo', () => {
    const { container } = withCaixa(
      <UsarCaixaHarness valor={1000} aba="acoes" isReinvestimento />,
      10000,
      { acoes: 3000 },
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('CreditarCaixaField', () => {
  function Harness(props: { moeda: string; isReinvestimento?: boolean }) {
    const [checked, setChecked] = useState<boolean | undefined>(undefined);
    return (
      <CreditarCaixaField
        valor={1000}
        moeda={props.moeda}
        checked={checked}
        onChange={setChecked}
        isReinvestimento={props.isReinvestimento}
      />
    );
  }

  it('resgate em reais: ligado por padrão e mostra o total depois', () => {
    withCaixa(<Harness moeda="BRL" />, 2000, {});
    expect(screen.getByLabelText('Devolver ao Caixa para Investir')).toBeChecked();
    expect(texto(screen.getByText(/voltam como caixa livre/))).toContain(
      'O caixa total fica em R$ 3.000,00',
    );
  });

  it('moeda estrangeira: só explica, sem opção', () => {
    render(<Harness moeda="USD" />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText(/moeda estrangeira não volta automaticamente/)).toBeInTheDocument();
  });

  it('reinvestimento esconde o campo', () => {
    const { container } = render(<Harness moeda="BRL" isReinvestimento />);
    expect(container).toBeEmptyDOMElement();
  });
});
