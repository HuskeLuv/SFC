// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import type { HistoricoAlteracaoEntry } from '@/hooks/useHistoricoAlteracoes';
import {
  expectPilulas,
  expectSemValoresExpostos,
  renderComValoresOcultos,
} from '@/test/valoresOcultos';
import { ChangesList } from '../HistoricoEntryRow';

/** Detalhes de lançar/ignorar/tirar do fluxo: uma linha por transação, sem riscado nem "→". */
const VALOR = 9876543.21;
const entry: HistoricoAlteracaoEntry = {
  id: 'log-banco',
  userId: 'u1',
  actorId: 'u1',
  viaConsultant: false,
  section: 'fluxo-caixa',
  action: 'banco.aplicar',
  entity: 'banco-transacoes',
  entityId: null,
  entityLabel: '2 transações',
  canUndo: true,
  undoneAt: null,
  revertsId: null,
  createdAt: '2026-11-05T12:00:00.000Z',
  changes: [
    {
      field: 'banco:t1',
      label: '05/11/2026 · UBER *TRIP · Nubank, Conta corrente',
      before: -VALOR,
      after: 'entrou em Transporte (novembro de 2026)',
      format: 'currency',
    },
    { field: 'banco:resto', label: 'Mais 1 transação', before: null, after: null },
  ],
};

describe('ChangesList — transações do banco', () => {
  it('olho aberto: data · descrição · conta: valor · linha (mês), e o "Mais N"', () => {
    const { container } = render(<ChangesList entry={entry} />);
    const itens = [...container.querySelectorAll('li')].map((li) => li.textContent);
    const brl = (-VALOR).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    expect(itens).toEqual([
      `05/11/2026 · UBER *TRIP · Nubank, Conta corrente: ${brl} · entrou em Transporte (novembro de 2026)`,
      'Mais 1 transação',
    ]);
    expect(container.querySelector('.line-through')).toBeNull();
  });

  it('olho fechado: o valor vira pílula', () => {
    const { container } = renderComValoresOcultos(<ChangesList entry={entry} />);
    expectPilulas(container, 1);
    expectSemValoresExpostos(container, { sentinelas: [VALOR] });
    expect(container.textContent).toContain('entrou em Transporte (novembro de 2026)');
  });
});
