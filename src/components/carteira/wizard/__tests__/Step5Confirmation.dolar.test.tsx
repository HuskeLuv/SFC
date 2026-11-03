// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Step5Confirmation from '../Step5Confirmation';
import { resumoCompraEmDolar, valorDaCompraBRL } from '../shared/caixaDaOperacao';
import type { WizardFormData } from '@/types/wizard';

/**
 * Carteira EUA em US$ (fatia FA): a confirmação de Stock EUA/REIT mostra o total em US$, a
 * corretagem em R$ à parte e o equivalente em R$ (o mesmo valor que sai do caixa).
 */
vi.mock('../shared/PlanejamentoVinculoField', () => ({ default: () => null }));
vi.mock('../shared/UsarCaixaField', () => ({ default: () => null }));
vi.mock('@/hooks/useCategoriaEfetivaAtivo', () => ({
  useCategoriaEfetivaAtivo: () => ({ categoria: null, override: false, carregando: false }),
}));

const compra = (over: Partial<WizardFormData> = {}): WizardFormData =>
  ({
    operacao: 'novo-ativo',
    tipoAtivo: 'stock',
    assetId: 'STOCK-MANUAL',
    ativo: 'MSFT',
    estrategia: 'growth',
    dataCompra: '2026-10-22',
    quantidade: 2,
    cotacaoUnitaria: 512.4,
    cotacaoMoeda: 5.0385,
    taxaCorretagem: 10,
    moeda: 'USD',
    ...over,
  }) as unknown as WizardFormData;

describe('resumoCompraEmDolar', () => {
  it('total US$ sem corretagem; equivale = total × câmbio + corretagem', () => {
    const r = resumoCompraEmDolar(compra());
    expect(r.totalUsd).toBeCloseTo(1024.8, 6);
    expect(r.corretagemBrl).toBe(10);
    expect(r.equivaleBrl).toBeCloseTo(1024.8 * 5.0385 + 10, 6);
    // O caixa é debitado pelo mesmo valor, no stock e no REIT.
    expect(valorDaCompraBRL(compra())).toBeCloseTo(r.equivaleBrl, 6);
    expect(valorDaCompraBRL(compra({ tipoAtivo: 'reit', taxaCorretagem: 0 }))).toBeCloseTo(
      1024.8 * 5.0385,
      6,
    );
  });
});

describe('Step5Confirmation — Stock EUA / REIT', () => {
  it('stock: moeda fixa USD, total em US$, corretagem em R$ e equivalente em R$', () => {
    render(<Step5Confirmation formData={compra()} onSubmit={vi.fn()} loading={false} />);
    expect(screen.getByText('USD · Dólar americano')).toBeInTheDocument();
    expect(screen.getByText(/Total investido \(US\$\)/)).toBeInTheDocument();
    expect(document.querySelector('[data-total-usd]')!.textContent).toMatch(/US\$\s1\.024,80/);
    expect(screen.getByText(/Corretagem \(R\$\)/)).toBeInTheDocument();
    // 1.024,80 × 5,0385 + 10 = 5.173,45
    expect(document.querySelector('[data-equivale-brl]')!.textContent).toMatch(/R\$\s5\.173,45/);
  });

  it('REIT: mesma confirmação (sem corretagem, equivalente = total × câmbio)', () => {
    render(
      <Step5Confirmation
        formData={compra({
          tipoAtivo: 'reit',
          assetId: 'REIT-MANUAL',
          ativo: 'PLD',
          estrategiaReit: 'value',
          quantidade: 4,
          cotacaoUnitaria: 110,
          cotacaoMoeda: 5.4,
          taxaCorretagem: 0,
        })}
        onSubmit={vi.fn()}
        loading={false}
      />,
    );
    expect(document.querySelector('[data-total-usd]')!.textContent).toMatch(/US\$\s440,00/);
    expect(document.querySelector('[data-equivale-brl]')!.textContent).toMatch(/R\$\s2\.376,00/);
  });
});

describe('Step5Confirmation — ETF americano manual (ETF-MANUAL)', () => {
  const voo = compra({
    tipoAtivo: 'etf',
    assetId: 'ETF-MANUAL',
    ativo: 'VOO',
    regiaoEtf: 'estados_unidos',
    quantidade: 4,
    cotacaoUnitaria: 480,
    cotacaoMoeda: 5.2,
    taxaCorretagem: 10,
  });

  it('total em US$, corretagem em R$ e "Equivale a" R$ (q × p × câmbio + corretagem)', () => {
    render(<Step5Confirmation formData={voo} onSubmit={vi.fn()} loading={false} />);
    expect(screen.getByText('USD · Dólar americano')).toBeInTheDocument();
    expect(screen.getByText(/Preço por Cota \(US\$\)/)).toBeInTheDocument();
    expect(document.querySelector('[data-total-usd]')!.textContent).toMatch(/US\$\s1\.920,00/);
    // 1.920 × 5,20 + 10 = 9.994,00
    expect(document.querySelector('[data-equivale-brl]')!.textContent).toMatch(/R\$\s9\.994,00/);
    expect(document.querySelector('[data-equivale-brl]')!.textContent).toMatch(/Equivale a/);
    // O caixa é debitado pelo mesmo valor.
    expect(valorDaCompraBRL(voo)).toBeCloseTo(9994, 6);
  });

  it('ETF da B3 (catálogo) continua em R$, mesmo na seção EUA', () => {
    render(
      <Step5Confirmation
        formData={{ ...voo, assetId: 'uuid-ivvb11', ativo: 'IVVB11', cotacaoUnitaria: 300 }}
        onSubmit={vi.fn()}
        loading={false}
      />,
    );
    expect(document.querySelector('[data-total-usd]')).toBeNull();
    expect(document.querySelector('[data-equivale-brl]')).toBeNull();
    expect(screen.queryByText('USD · Dólar americano')).not.toBeInTheDocument();
    // 4 × 300 + 10
    expect(screen.getByText(/R\$\s1\.210,00/)).toBeInTheDocument();
  });
});
