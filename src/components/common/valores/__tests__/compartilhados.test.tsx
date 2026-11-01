// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ usePathname: () => '/carteira' }));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => false }));

import MetricCard from '@/components/carteira/shared/MetricCard';
import { CardSectionBand } from '@/components/ui/table/CardSectionBand';
import { ResponsiveTable, type ResponsiveColumn } from '@/components/ui/table/ResponsiveTable';
import {
  SENTINELAS,
  expectPilulas,
  expectSemValoresExpostos,
  renderComValoresOcultos,
} from '@/test/valoresOcultos';
import { formatBRL } from '@/utils/format';

const SALDO = formatBRL(SENTINELAS.saldo);

describe('componentes compartilhados com o olho fechado', () => {
  it('MetricCard: valor em R$ vira pílula; % do change fica', () => {
    const { container } = renderComValoresOcultos(
      <MetricCard title="Saldo" value={SALDO} change={`${SALDO} (+1,5%)`} />,
    );
    expectPilulas(container, 2);
    expect(container).toHaveTextContent('(+1,5%)');
    expectSemValoresExpostos(container);
  });

  it("MetricCard valor='visivel' (Mercado hoje) e 'sensivel' (sem R$)", () => {
    const visivel = renderComValoresOcultos(
      <MetricCard title="Dólar" value="R$ 5,37" valor="visivel" />,
    ).container;
    expectPilulas(visivel, 0);
    expect(visivel).toHaveTextContent('R$ 5,37');
    const sensivel = renderComValoresOcultos(
      <MetricCard title="Quantidade" value="7.777" valor="sensivel" />,
    ).container;
    expectSemValoresExpostos(sensivel);
  });

  it('CardSectionBand: subtotal some; o botão continua com nome', () => {
    const { container } = renderComValoresOcultos(
      <CardSectionBand
        id="s"
        label="Ações"
        subtotal={SALDO}
        count={2}
        expanded
        onToggle={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /Ações.*valor oculto/ })).toBeInTheDocument();
    expectSemValoresExpostos(container);
  });

  it('ResponsiveTable: células (desktop e cartão), subtotal e total respeitam `valor`', () => {
    type Linha = { nome: string; saldo: number; qtd: number; cotacao: number };
    const colunas: ResponsiveColumn<Linha>[] = [
      { id: 'nome', header: 'Ativo', cell: (r) => r.nome },
      { id: 'saldo', header: 'Saldo', cell: (r) => formatBRL(r.saldo), mobile: 'value' },
      {
        id: 'qtd',
        header: 'Qtd',
        cell: (r) => r.qtd.toLocaleString('pt-BR'),
        valor: 'sensivel-curto',
      },
      { id: 'cotacao', header: 'Cotação', cell: (r) => formatBRL(r.cotacao), valor: 'visivel' },
    ];
    const { container } = renderComValoresOcultos(
      <ResponsiveTable
        columns={colunas}
        rows={[{ nome: 'PETR4', saldo: SENTINELAS.saldo, qtd: SENTINELAS.quantidade, cotacao: 38 }]}
        getRowKey={(r) => r.nome}
        ariaLabel="Ações"
        groupBy={() => ({ key: 'g', label: 'Grupo', subtotal: SALDO })}
        total={{ label: 'Total', cells: { saldo: SALDO } }}
      />,
    );
    expect(container.querySelectorAll('.mf-sensivel--curto').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-mf-valor-visivel]').length).toBeGreaterThan(0);
    expect(container).toHaveTextContent('PETR4');
    expectSemValoresExpostos(container);
  });

  it('modo visível (sem provider): MetricCard e ResponsiveTable com o DOM de sempre', () => {
    const { container } = render(<MetricCard title="Saldo" value={SALDO} change="+1%" />);
    expect(container.querySelector('.mf-sensivel')).toBeNull();
    expect(container.textContent).toContain(SALDO);
  });
});
