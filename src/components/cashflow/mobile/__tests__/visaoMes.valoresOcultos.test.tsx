// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MonthDerived, MonthGroup, MonthItem } from '@/lib/cashflow/monthViewModel';
import MonthSummaryCard from '../MonthSummaryCard';
import { MonthItemRow } from '../MonthItemRow';
import MonthGroupBand from '../MonthGroupBand';
import { MonthDerivedRow } from '../MonthDerivedRow';
import DerivedInfoSheet from '../DerivedInfoSheet';
import MonthStepper from '../MonthStepper';
import {
  SENTINELAS,
  expectPilulas,
  expectSemValoresExpostos,
  renderComValoresOcultos,
} from '@/test/valoresOcultos';
import { formatBRL } from '@/utils/format';

/**
 * Esconder valores (Fase 2, fatia 2): visão do mês do Fluxo de caixa no celular com o olho
 * fechado. Fixtures com SENTINELAS: nenhum valor em R$ pode sobrar no texto nem em aria-label;
 * percentuais (poupança, % da receita, índices) e nomes continuam visíveis.
 */

vi.mock('next/navigation', () => ({ usePathname: () => '/fluxodecaixa' }));

const S = SENTINELAS;

const item = (over: Partial<MonthItem> = {}): MonthItem =>
  ({
    kind: 'item',
    itemId: 'salario',
    groupId: 'salarios',
    name: 'Salário',
    monthValue: S.saldo,
    annual: S.aplicado,
    colorKey: null,
    colorLabel: null,
    hasComment: false,
    hasFormula: false,
    badges: [],
    caps: {},
    readOnly: false,
    ...over,
  }) as MonthItem;

const group = (over: Partial<MonthGroup> = {}): MonthGroup => ({
  kind: 'group',
  groupId: 'despesas',
  label: 'Despesas',
  level: 1,
  groupType: 'despesa',
  monthSubtotal: S.saldo,
  annual: S.aplicado,
  readOnly: false,
  afterBand: [],
  children: [],
  items: [],
  ...over,
});

const derived = (over: Partial<MonthDerived> = {}): MonthDerived => ({
  kind: 'derived',
  key: 'fluxoLivre',
  label: 'Fluxo de Caixa livre',
  value: -S.saldo,
  format: 'currency',
  emphasis: true,
  helpKey: 'fluxoLivre',
  series: Array.from({ length: 12 }, (_, i) => (i === 6 ? -S.saldo : S.aplicado)),
  ...over,
});

describe('visão do mês do fluxo com o olho fechado', () => {
  it('cartão do mês: saldo, entradas, despesas e CC anterior viram pílula; poupança fica', () => {
    const { container } = renderComValoresOcultos(
      <MonthSummaryCard
        monthName="Julho"
        saldo={S.saldo}
        entradas={S.aplicado}
        despesas={1234.56}
        poupanca={12}
        saldoCcAnterior={-S.saldo}
      />,
    );
    expectSemValoresExpostos(container);
    expectPilulas(container, 4);
    expect(screen.getByText('Poupança 12%')).toBeInTheDocument();
    expect(screen.getByText('Saldo de julho')).toBeInTheDocument();
  });

  it('cartão do mês: CC anterior não calculável fica com o "–"', () => {
    const { container } = renderComValoresOcultos(
      <MonthSummaryCard
        monthName="Julho"
        saldo={S.saldo}
        entradas={S.aplicado}
        despesas={0}
        poupanca={null}
        saldoCcAnterior={null}
      />,
    );
    expectSemValoresExpostos(container);
    expectPilulas(container, 3);
    expect(screen.getByText('–')).toBeInTheDocument();
  });

  it('linha do mês: valor e "ano" viram pílula; nome e situação ficam', () => {
    const { container } = renderComValoresOcultos(
      <MonthItemRow
        item={item({ colorKey: 'green', colorLabel: 'Recebido' })}
        showAnnual
        onOpen={() => {}}
      />,
    );
    expectSemValoresExpostos(container);
    expectPilulas(container, 2);
    expect(screen.getByText('Salário')).toBeInTheDocument();
    expect(screen.getByText(/^ano/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Recebido' })).toBeInTheDocument();
  });

  it('linha sem valor: o "—" fica (não há pílula no lugar do vazio)', () => {
    const { container } = renderComValoresOcultos(
      <MonthItemRow item={item({ monthValue: 0 })} showAnnual={false} onOpen={() => {}} />,
    );
    expectPilulas(container, 0);
    expect(screen.getByText('sem valor')).toBeInTheDocument();
  });

  it.each([1, 2, 3] as const)('faixa nível %i: subtotal e total do ano viram pílula', (level) => {
    const { container } = renderComValoresOcultos(
      <MonthGroupBand
        group={group({ level, groupId: `g${level}`, label: `Grupo ${level}` })}
        expanded
        onToggle={() => {}}
        contentId={`c${level}`}
        showAnnual
        onActions={() => {}}
      />,
    );
    expectSemValoresExpostos(container);
    expectPilulas(container, 2);
    expect(screen.getByText(`Grupo ${level}`)).toBeInTheDocument();
  });

  it('faixa do Despesas raiz: "% da receita" fica visível', () => {
    const { container } = renderComValoresOcultos(
      <MonthGroupBand
        group={group({ percent: 85 })}
        expanded
        onToggle={() => {}}
        contentId="c"
        showAnnual
      />,
    );
    expectSemValoresExpostos(container);
    expectPilulas(container, 1);
    expect(screen.getByText('85% da receita')).toBeInTheDocument();
  });

  it('linha calculada em R$: pílula e aria-label mascarado', () => {
    const { container } = renderComValoresOcultos(
      <MonthDerivedRow row={derived()} onOpen={() => {}} single />,
    );
    expectSemValoresExpostos(container);
    expectPilulas(container, 1);
    expect(
      screen.getByRole('button', {
        name: 'Fluxo de Caixa livre, R$ •••••, calculado, ver a conta',
      }),
    ).toBeInTheDocument();
  });

  it('linha calculada em %: fica visível', () => {
    const { container } = renderComValoresOcultos(
      <MonthDerivedRow
        row={derived({
          key: 'poupanca',
          label: 'Índice de Poupança Mensal',
          value: 23.5,
          format: 'percent',
          helpKey: 'poupanca',
        })}
        onOpen={() => {}}
      />,
    );
    expectPilulas(container, 0);
    expect(screen.getByText('23,50%')).toBeInTheDocument();
  });

  it('sheet da conta: valor do mês vira pílula; explicação fica', () => {
    renderComValoresOcultos(
      <DerivedInfoSheet row={derived()} year={2026} month={6} onClose={() => {}} />,
    );
    const dialog = screen.getByRole('dialog');
    expectSemValoresExpostos(dialog);
    expectPilulas(dialog, 1);
    expect(screen.getByText('Como é calculado')).toBeInTheDocument();
  });

  it('"Escolher mês": saldo de cada mês vira pílula, também no aria-label', () => {
    renderComValoresOcultos(
      <MonthStepper
        year={2026}
        month={6}
        onChange={() => {}}
        monthStatus="fechado"
        monthSummaries={Array.from({ length: 12 }, (_, i) => ({
          saldo: i === 3 ? null : i % 2 ? S.saldo : -S.aplicado,
        }))}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Julho de 2026/ }));
    const dialog = screen.getByRole('dialog', { name: 'Escolher mês' });
    expectSemValoresExpostos(dialog);
    expectPilulas(dialog, 11);
    expect(dialog.querySelector('[data-mf-month-option="6"]')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Julho, saldo R$ •••••'),
    );
  });

  it('olho aberto: os mesmos textos de hoje, sem pílula', () => {
    const { container } = renderComValoresOcultos(
      <>
        <MonthSummaryCard
          monthName="Julho"
          saldo={S.saldo}
          entradas={S.aplicado}
          despesas={0}
          poupanca={12}
          saldoCcAnterior={-S.saldo}
        />
        <MonthItemRow item={item()} showAnnual onOpen={() => {}} />
        <MonthDerivedRow row={derived()} onOpen={() => {}} />
      </>,
      { ocultos: false },
    );
    expectPilulas(container, 0);
    const texto = container.textContent ?? '';
    expect(texto).toContain(`Saldo de julho${formatBRL(S.saldo)}`);
    expect(texto).toContain(`Entradas${formatBRL(S.aplicado)}`);
    expect(texto).toContain(`ano ${formatBRL(S.aplicado)}`);
    expect(container.querySelector('[data-mf-fluxo-derived]')).toHaveAttribute(
      'aria-label',
      `Fluxo de Caixa livre, ${formatBRL(-S.saldo)}, calculado, ver a conta`,
    );
  });
});
