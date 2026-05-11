// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Step5Confirmation from '../Step5Confirmation';
import type { WizardFormData } from '@/types/wizard';

const baseFormData = (): WizardFormData =>
  ({
    operacao: 'novo-ativo',
    tipoAtivo: 'acoes-brasil',
    acoesBrasilTipo: 'acao',
    instituicaoId: 'inst-1',
    instituicaoNome: 'XP Investimentos',
    assetId: 'asset-1',
    ativo: 'PETR4 - Petrobras',
    estrategia: 'value',
    dataCompra: '2025-01-15',
    quantidade: 500,
    cotacaoUnitaria: 29.36,
    taxaCorretagem: 0,
  }) as unknown as WizardFormData;

describe('Step5Confirmation — Bug #13 (linha Total)', () => {
  it('renderiza linha "Total" em acoes-brasil com qtd × cotação + corretagem', () => {
    render(<Step5Confirmation formData={baseFormData()} onSubmit={vi.fn()} loading={false} />);

    // Em "Ações Brasileiras" o cálculo é 500 × 29,36 + 0 = R$ 14.680,00
    // (cenário exato do bug report).
    expect(screen.getByText(/Total:?/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*14\.680,00/)).toBeInTheDocument();
  });

  it('inclui corretagem no Total quando taxa é > 0', () => {
    const formData = {
      ...baseFormData(),
      quantidade: 100,
      cotacaoUnitaria: 10,
      taxaCorretagem: 15,
    } as WizardFormData;

    render(<Step5Confirmation formData={formData} onSubmit={vi.fn()} loading={false} />);

    // 100 × 10 + 15 = R$ 1.015,00
    expect(screen.getByText(/R\$\s*1\.015,00/)).toBeInTheDocument();
  });

  it('renderiza Total no fallback default (ex: bdr/reit) com qtd × cotação', () => {
    const formData = {
      ...baseFormData(),
      tipoAtivo: 'bdr',
      acoesBrasilTipo: undefined,
      quantidade: 10,
      cotacaoUnitaria: 200.5,
      taxaCorretagem: 5,
    } as unknown as WizardFormData;

    render(<Step5Confirmation formData={formData} onSubmit={vi.fn()} loading={false} />);

    // 10 × 200,50 + 5 = R$ 2.010,00
    expect(screen.getByText(/R\$\s*2\.010,00/)).toBeInTheDocument();
  });
});
