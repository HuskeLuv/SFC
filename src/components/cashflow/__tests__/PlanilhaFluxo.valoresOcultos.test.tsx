// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SummaryRow } from '../SummaryRow';
import { TotalRow } from '../TotalRow';
import { SavingsIndexRow } from '../SavingsIndexRow';
import { InflationPedroRow } from '../InflationPedroRow';
import { FinancialPeaceIndexRow } from '../FinancialPeaceIndexRow';
import { InvestmentIncomeRow } from '../InvestmentIncomeRow';
import { SaldoContaCorrenteAnteriorRow } from '../SaldoContaCorrenteAnteriorRow';
import { GroupHeader } from '../GroupHeader';
import { ItemRow } from '../ItemRow';
import { EditableItemRow } from '../EditableItemRow';
import { NewItemRow } from '../NewItemRow';
import { BancoIndicator } from '../BancoIndicator';
import { CashflowDndProvider } from '../CashflowDnd';
import type { CashflowGroup, CashflowItem } from '@/types/cashflow';
import {
  SENTINELAS,
  expectPilulas,
  expectSemValoresExpostos,
  renderComValoresOcultos,
} from '@/test/valoresOcultos';

/**
 * Esconder valores (Fase 2, fatia 1): planilha anual do Fluxo de Caixa no computador.
 * O formatCurrency deprecated sai SEM "R$": quem pega o vazamento são as representações do
 * sentinela ('9.876.543,21'). Dinheiro vira pílula; % (índices, inflação, % da receita) fica.
 */

vi.mock('next/navigation', () => ({ usePathname: () => '/fluxodecaixa' }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const S = SENTINELAS.saldo;
const A = SENTINELAS.aplicado;
const ANO = 2026;

const grupo = (overrides: Partial<CashflowGroup> = {}): CashflowGroup => ({
  id: 'g1',
  userId: 'u1',
  name: 'Despesas Variáveis',
  type: 'despesa',
  parentId: 'pai',
  orderIndex: 1,
  items: [],
  children: [],
  ...overrides,
});

const item = (overrides: Partial<CashflowItem> = {}): CashflowItem => ({
  id: 'i1',
  userId: 'u1',
  groupId: 'g1',
  name: 'Mercado',
  significado: 'Comida',
  rank: '1',
  values: [{ id: 'v1', itemId: 'i1', year: ANO, month: 0, value: S, valorBanco: A }],
  ...overrides,
});

const linhaMensal = [S, -A, 0, ...Array(9).fill(A)];

const planilha = (rows: React.ReactNode) => (
  <CashflowDndProvider onReorder={vi.fn()}>
    <table>
      <tbody>{rows}</tbody>
    </table>
  </CashflowDndProvider>
);

const todasAsLinhas = (isEditing = false) =>
  planilha(
    <>
      <GroupHeader
        group={grupo()}
        isCollapsed={false}
        groupTotals={linhaMensal}
        groupAnnualTotal={S}
        groupPercentage={12.5}
        onToggleCollapse={vi.fn()}
        onAddRow={vi.fn()}
      />
      <ItemRow
        item={item()}
        itemTotals={linhaMensal}
        itemAnnualTotal={S}
        itemPercentage={7.25}
        group={grupo()}
        currentYear={ANO}
      />
      <EditableItemRow
        item={item({ id: 'i2', name: 'Farmácia' })}
        editedData={null}
        group={grupo()}
        itemTotals={linhaMensal}
        itemAnnualTotal={S}
        itemPercentage={3}
        isEditing={isEditing}
        onUpdateField={vi.fn()}
        onDeleteItem={vi.fn()}
        currentYear={ANO}
      />
      <NewItemRow item={item({ id: 'i3', name: 'Nova', values: [] })} />
      <SaldoContaCorrenteAnteriorRow cells={linhaMensal} />
      <TotalRow totalByMonth={linhaMensal} totalAnnual={S} />
      <SavingsIndexRow
        totalByMonth={linhaMensal}
        entradasByMonth={Array(12).fill(A * 4)}
        totalAnnual={S}
        entradasAnnual={A * 48}
      />
      <InflationPedroRow despesasByMonth={[100, 110, 121, ...Array(9).fill(121)]} />
      <InvestmentIncomeRow valuesByMonth={linhaMensal} totalAnnual={S} />
      <FinancialPeaceIndexRow
        proventosByMonth={Array(12).fill(500)}
        despesasFixasByMonth={Array(12).fill(1000)}
        proventosAnnual={6000}
        despesasFixasAnnual={12000}
      />
      <SummaryRow label="Evolução do Patrimônio" cells={linhaMensal} annual={S} negativeRed />
    </>,
  );

describe('Planilha do Fluxo de Caixa — olho fechado', () => {
  it('nenhum valor em dinheiro exposto; nomes e % ficam', () => {
    const { container } = renderComValoresOcultos(todasAsLinhas());
    expectSemValoresExpostos(container);
    expectPilulas(container);

    // Nomes, porquê e rótulos das linhas de resumo.
    expect(screen.getAllByText('Mercado').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Comida').length).toBeGreaterThan(0);
    expect(screen.getByText('Saldo do mês (Lucro Líquido)')).toBeInTheDocument();
    // % visíveis: % da receita da linha/grupo, paz financeira (500/1000 = 50%), inflação (10%).
    expect(container.textContent).toMatch(/7,25\s?%/);
    expect(container.textContent).toMatch(/12,50\s?%/);
    expect(container.textContent).toMatch(/50,00\s?%/);
    expect(container.textContent).toMatch(/10,00\s?%/);
  });

  it('índices em % não viram pílula', () => {
    const { container } = renderComValoresOcultos(
      planilha(
        <FinancialPeaceIndexRow
          proventosByMonth={Array(12).fill(500)}
          despesasFixasByMonth={Array(12).fill(1000)}
          proventosAnnual={6000}
          despesasFixasAnnual={12000}
        />,
      ),
    );
    expectPilulas(container, 0);
  });

  it('linha de resumo em dinheiro: uma pílula por célula (12 meses + anual), "–" fica fora', () => {
    const { container } = renderComValoresOcultos(
      planilha(<SaldoContaCorrenteAnteriorRow cells={[S, null, ...Array(10).fill(A)]} />),
    );
    // 11 meses com valor; o mês null e o anual (null) mostram "–" sem pílula.
    expectPilulas(container, 11);
    expect(container.textContent).toContain('–');
    expectSemValoresExpostos(container);
  });

  it('pílula fica DENTRO do span colorido da célula (cor e alinhamento preservados)', () => {
    const { container } = renderComValoresOcultos(
      planilha(
        <ItemRow
          item={item({
            values: [{ id: 'v', itemId: 'i1', year: ANO, month: 0, value: S, color: '#ff0000' }],
          })}
          itemTotals={linhaMensal}
          itemAnnualTotal={S}
          itemPercentage={0}
          group={grupo()}
          currentYear={ANO}
        />,
      ),
    );
    const pilula = container.querySelector('td[data-cf-month="0"] .mf-sensivel')!;
    expect(pilula).not.toBeNull();
    expect(pilula.parentElement!.tagName).toBe('SPAN');
    expect(pilula.closest('td')).not.toBe(pilula.parentElement);
  });

  it('célula editável: parada = pílula; em edição = input com o número (formulário visível)', () => {
    const parada = renderComValoresOcultos(
      planilha(
        <EditableItemRow
          item={item()}
          editedData={null}
          group={grupo()}
          itemTotals={linhaMensal}
          itemAnnualTotal={S}
          itemPercentage={0}
          isEditing={false}
          onUpdateField={vi.fn()}
          onDeleteItem={vi.fn()}
          currentYear={ANO}
        />,
      ),
    );
    expect(parada.container.querySelectorAll('input')).toHaveLength(0);
    // 12 meses + anual.
    expectPilulas(parada.container, 13);
    expectSemValoresExpostos(parada.container);
    parada.unmount();

    const editando = renderComValoresOcultos(
      planilha(
        <EditableItemRow
          item={item()}
          editedData={null}
          group={grupo()}
          itemTotals={linhaMensal}
          itemAnnualTotal={S}
          itemPercentage={0}
          isEditing
          onUpdateField={vi.fn()}
          onDeleteItem={vi.fn()}
          currentYear={ANO}
        />,
      ),
    );
    const inputs = Array.from(editando.container.querySelectorAll('td[data-cf-month] input'));
    expect(inputs).toHaveLength(12);
    expect((inputs[0] as HTMLInputElement).value).toContain('9.876.543,21');
    // O total anual (fora do campo) segue pílula.
    expect(editando.container.querySelector('td[data-cf-annual] .mf-sensivel')).not.toBeNull();
  });

  it('BancoIndicator: sem R$ no title/aria-label com o olho fechado', () => {
    const { container } = renderComValoresOcultos(<BancoIndicator valorBanco={A} />);
    const marca = screen.getByRole('img');
    expect(marca.getAttribute('title')).toMatch(/lançados pelo banco/);
    expectSemValoresExpostos(container);
  });
});

describe('Planilha do Fluxo de Caixa — olho aberto', () => {
  it('texto de hoje, sem pílulas', () => {
    const { container } = renderComValoresOcultos(todasAsLinhas(), { ocultos: false });
    expectPilulas(container, 0);
    expect(container.querySelector('[data-mf-sensivel]')).toBeNull();
    expect(container.textContent).toContain('9.876.543,21');
    expect(container.textContent).toContain('8.765.432,10');
  });

  it('BancoIndicator: mostra a parte do banco', () => {
    renderComValoresOcultos(<BancoIndicator valorBanco={30} />, { ocultos: false });
    expect(
      screen.getByRole('img', { name: /^Inclui R\$\s30,00 lançados pelo banco/ }),
    ).toBeTruthy();
  });
});
