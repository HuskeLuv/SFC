// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

/**
 * Ticket 86e3vxd5r (Pedro, 24/10/2026): com caixa livre grande a coluna "Necessidade de aporte em"
 * ficava toda "-" — o caixa era abatido da necessidade, embora já esteja no total da carteira.
 * Agora a coluna mostra quanto cada classe precisa receber para chegar no target, com ou sem caixa.
 */

vi.mock('next/navigation', () => ({ usePathname: () => '/carteira' }));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => false }));

import AlocacaoAtivosTable from '../AlocacaoAtivosTable';
import type { UseAlocacaoConfigReturn } from '@/hooks/useAlocacaoConfig';

const zero = { valor: 0, percentual: 0 };
// Total dinheiro 200 mil = 100 mil em classes + 100 mil de caixa livre.
const distribuicao = {
  reservaEmergencia: { valor: 8000, percentual: 4 },
  reservaOportunidade: zero,
  rendaFixaFundos: { valor: 62000, percentual: 31 },
  fimFia: zero,
  fiis: { valor: 10000, percentual: 5 },
  acoes: { valor: 20000, percentual: 10 },
  stocks: zero,
  reits: zero,
  etfs: zero,
  moedasCriptos: zero,
  previdenciaSeguros: zero,
  opcoes: zero,
  imoveisBens: zero,
};

const config = {
  configuracoes: [
    { categoria: 'reservaEmergencia', minimo: 0, maximo: 0, target: 10 },
    { categoria: 'rendaFixaFundos', minimo: 0, maximo: 0, target: 20 },
    { categoria: 'fiis', minimo: 0, maximo: 0, target: 30 },
    { categoria: 'acoes', minimo: 0, maximo: 0, target: 40 },
  ],
  loading: false,
  error: null,
  updateConfiguracao: vi.fn(),
  saveChanges: vi.fn().mockResolvedValue(true),
  startEditing: vi.fn(),
  stopEditing: vi.fn(),
  isEditing: vi.fn(() => false),
  totalTargets: 100,
  changedCategorias: [],
  refetch: vi.fn().mockResolvedValue(undefined),
} as unknown as UseAlocacaoConfigReturn;

const linha = (nome: string) => screen.getByText(nome).closest('tr') as HTMLElement;
// getByText normaliza o espaço não separável do toLocaleString para espaço comum.
const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\s/g, ' ');

function renderTabela(caixaParaInvestir: number) {
  render(
    <AlocacaoAtivosTable
      distribuicao={distribuicao}
      alocacaoConfig={config}
      caixaParaInvestir={caixaParaInvestir}
      totais={{ dinheiro: 200000, dinheiroMaisBens: 200000 }}
      onNavigateToTab={vi.fn()}
    />,
  );
}

describe('AlocacaoAtivosTable — necessidade de aporte com caixa livre', () => {
  it.each([0, 100000, 500000])('caixa livre de %d não apaga a necessidade', (caixa) => {
    renderTabela(caixa);
    // alvo − atual sobre o total de 200 mil (que já contém o caixa livre)
    expect(within(linha('Reserva de Emergência')).getByText(brl(12000))).toBeInTheDocument();
    expect(within(linha("FII's")).getByText(brl(50000))).toBeInTheDocument();
    expect(within(linha('Ações')).getByText(brl(60000))).toBeInTheDocument();
    // Classe acima do target segue mostrando o excesso em vermelho
    expect(
      within(linha('Renda Fixa & Fundos Renda Fixa')).getByText(`-${brl(22000)}`),
    ).toBeInTheDocument();
  });
});
