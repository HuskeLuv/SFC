// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SummaryRow } from '../SummaryRow';
import { TotalRow } from '../TotalRow';

const renderRow = (ui: React.ReactElement) =>
  render(
    <table>
      <tbody>{ui}</tbody>
    </table>,
  );

describe('SummaryRow — coloração condicional dos valores', () => {
  const cells = [4000, -1200, 0, ...Array(9).fill(null)];

  it('positiveBlue: positivo azul, negativo vermelho, zero mantém a cor da variante', () => {
    renderRow(
      <SummaryRow label="Saldo teste" cells={cells} annual={2800} negativeRed positiveBlue />,
    );

    const positivo = screen.getByText(/4\.000/).closest('td')!;
    expect(positivo.className).toContain('text-blue-600');

    const negativo = screen.getByText(/-.*1\.200/).closest('td')!;
    expect(negativo.className).toContain('text-red-600');

    const zero = screen.getByText('0,00').closest('td')!;
    expect(zero.className).not.toContain('text-blue-600');
    expect(zero.className).not.toContain('text-red-600');
  });

  it('sem positiveBlue: positivo mantém a cor da variante (regressão das demais linhas)', () => {
    renderRow(<SummaryRow label="Outra linha" cells={cells} annual={2800} negativeRed />);
    const positivo = screen.getByText(/4\.000/).closest('td')!;
    expect(positivo.className).not.toContain('text-blue-600');
  });

  it('annual positivo também fica azul com positiveBlue', () => {
    renderRow(
      <SummaryRow label="Saldo teste" cells={[null]} annual={999} negativeRed positiveBlue />,
    );
    const annual = screen.getByText(/999/).closest('td')!;
    expect(annual.className).toContain('text-blue-600');
  });
});

describe('TotalRow (Saldo do mês) — pedido do Pedro ago/2026', () => {
  it('liga o azul-positivo na linha de Saldo do mês', () => {
    renderRow(<TotalRow totalByMonth={[1500, ...Array(11).fill(0)]} totalAnnual={1500} />);
    expect(screen.getByText('Saldo do mês (Lucro Líquido)')).toBeInTheDocument();
    // Mensal + anual: os dois positivos ficam azuis.
    const positivos = screen.getAllByText(/1\.500/).map((el) => el.closest('td')!);
    expect(positivos).toHaveLength(2);
    for (const td of positivos) expect(td.className).toContain('text-blue-600');
  });
});
