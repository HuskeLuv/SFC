// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';

/**
 * Esconder valores — Alocação de Ativos (fatia 2): tabela do computador, cartões do celular, o
 * modal "Distribuir caixa livre" e a meta em R$ da Reserva de Emergência. Valores em pílula; % atual,
 * % target e "Falta/Excesso x%" continuam visíveis.
 */

const ambiente = vi.hoisted(() => ({ isBelowLg: false }));
vi.mock('next/navigation', () => ({ usePathname: () => '/carteira' }));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => ambiente.isBelowLg }));

import AlocacaoAtivosTable from '../AlocacaoAtivosTable';
import type { UseAlocacaoConfigReturn } from '@/hooks/useAlocacaoConfig';
import {
  SENTINELAS,
  expectSemValoresExpostos,
  renderComValoresOcultos,
} from '@/test/valoresOcultos';
import { formatBRL } from '@/utils/format';

const zero = { valor: 0, percentual: 0 };
const distribuicao = {
  reservaEmergencia: { valor: SENTINELAS.precoMedio * 1000, percentual: 1 },
  reservaOportunidade: zero,
  rendaFixaFundos: { valor: SENTINELAS.aplicado, percentual: 60 },
  fimFia: zero,
  fiis: zero,
  acoes: { valor: SENTINELAS.saldo - SENTINELAS.aplicado, percentual: 39 },
  stocks: zero,
  reits: zero,
  etfs: zero,
  moedasCriptos: zero,
  previdenciaSeguros: zero,
  opcoes: zero,
  imoveisBens: { valor: SENTINELAS.aplicado, percentual: 47 },
};

const config: UseAlocacaoConfigReturn = {
  configuracoes: [
    { categoria: 'reservaEmergencia', minimo: 5, maximo: 10, target: 10 },
    { categoria: 'rendaFixaFundos', minimo: 20, maximo: 60, target: 40 },
    { categoria: 'acoes', minimo: 20, maximo: 60, target: 50 },
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

const tabela = (
  <AlocacaoAtivosTable
    distribuicao={distribuicao}
    alocacaoConfig={config}
    caixaParaInvestir={SENTINELAS.quantidade * 100}
    totais={{
      dinheiro: SENTINELAS.saldo,
      dinheiroMaisBens: SENTINELAS.saldo + SENTINELAS.aplicado,
    }}
    onNavigateToTab={vi.fn()}
    onDistribuirCaixa={vi.fn().mockResolvedValue(true)}
  />
);

const sentinelas = [...Object.values(SENTINELAS), SENTINELAS.quantidade * 100];

describe('AlocacaoAtivosTable no computador', () => {
  beforeEach(() => {
    ambiente.isBelowLg = false;
  });

  it('olho fechado: TOTAL, necessidade de aporte, totais e meta da reserva em pílula; % ficam', () => {
    const { container } = renderComValoresOcultos(tabela);
    expectSemValoresExpostos(container, { sentinelas });
    // % atual, alocação mínima/máxima e % target continuam.
    expect(container).toHaveTextContent('60.00%');
    expect(container).toHaveTextContent('50.00%');
    expect(container).toHaveTextContent(/Falta \d+\.\d{2}%/);
    expect(container.querySelectorAll('.mf-sensivel').length).toBeGreaterThan(8);
    // O botão continua com o nome de sempre (a pílula fica dentro dele, sem embrulhá-lo).
    expect(screen.getByRole('button', { name: /^Distribuir caixa livre/ })).toBeInTheDocument();
  });

  it('olho fechado: o modal "Distribuir caixa livre" também esconde os valores', () => {
    renderComValoresOcultos(tabela);
    fireEvent.click(screen.getByRole('button', { name: /^Distribuir caixa livre/ }));
    const modal = screen.getByText('Continua livre').closest('div.p-6') as HTMLElement;
    expect(modal).toHaveTextContent('Falta p/ o target');
    expectSemValoresExpostos(modal, { sentinelas });
  });

  it('olho aberto: valores de hoje, sem pílula', () => {
    const { container } = renderComValoresOcultos(tabela, { ocultos: false });
    expect(container.querySelectorAll('.mf-sensivel')).toHaveLength(0);
    expect(container.textContent).toContain(formatBRL(SENTINELAS.saldo));
    expect(
      screen.getByRole('button', {
        name: `Distribuir caixa livre (${formatBRL(SENTINELAS.quantidade * 100)})`,
      }),
    ).toBeInTheDocument();
  });
});

describe('AlocacaoAtivosMobile (cartões)', () => {
  beforeEach(() => {
    ambiente.isBelowLg = true;
  });

  it('olho fechado: valor da classe, aporte, totais e Imóveis em pílula; % ficam', () => {
    const { container } = renderComValoresOcultos(tabela);
    expectSemValoresExpostos(container, { sentinelas });
    expect(container).toHaveTextContent('60.00%');
    expect(container).toHaveTextContent('Soma dos % Target');
    expect(container).toHaveTextContent('do dinheiro + bens');
    expect(screen.getByRole('button', { name: /^Distribuir caixa livre/ })).toBeInTheDocument();
    // A barra da alocação (aria-label) só tem %.
    expect(screen.getByRole('img', { name: /^Alocação atual:/ })).toBeInTheDocument();
  });

  it('olho fechado: o texto de apoio da meta da reserva sai mascarado; o campo mostra o número', () => {
    renderComValoresOcultos(tabela);
    fireEvent.click(screen.getByRole('button', { name: 'Editar meta de Reserva de Emergência' }));
    expect(document.body.textContent).toContain('Hoje: R$ ••••• na reserva.');
  });

  it('olho aberto: cartões como hoje', () => {
    const { container } = renderComValoresOcultos(tabela, { ocultos: false });
    expect(container.querySelectorAll('.mf-sensivel')).toHaveLength(0);
    expect(container.textContent).toContain(formatBRL(SENTINELAS.aplicado));
  });
});
