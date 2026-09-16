// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SummaryRow } from '../SummaryRow';
import { TotalRow } from '../TotalRow';
import { SavingsIndexRow } from '../SavingsIndexRow';
import { SaldoContaCorrenteAnteriorRow } from '../SaldoContaCorrenteAnteriorRow';

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
    expect(positivo.className).toContain('text-[#0079F2]');

    const negativo = screen.getByText(/-.*1\.200/).closest('td')!;
    expect(negativo.className).toContain('text-red-600');

    const zero = screen.getByText('0,00').closest('td')!;
    expect(zero.className).not.toContain('text-[#0079F2]');
    expect(zero.className).not.toContain('text-red-600');
  });

  it('sem positiveBlue: positivo mantém a cor da variante (regressão das demais linhas)', () => {
    renderRow(<SummaryRow label="Outra linha" cells={cells} annual={2800} negativeRed />);
    const positivo = screen.getByText(/4\.000/).closest('td')!;
    expect(positivo.className).not.toContain('text-[#0079F2]');
  });

  it('annual positivo também fica azul com positiveBlue', () => {
    renderRow(
      <SummaryRow label="Saldo teste" cells={[null]} annual={999} negativeRed positiveBlue />,
    );
    const annual = screen.getByText(/999/).closest('td')!;
    expect(annual.className).toContain('text-[#0079F2]');
  });
});

describe('SavingsIndexRow — convenção da planilha (ticket 19/08/2026)', () => {
  it('positivo azul, negativo vermelho, zero herda a cor da linha (variante total)', () => {
    // Entradas 100 por mês ⇒ o saldo vira o índice em % diretamente.
    const saldos = [25, -10, 0, ...Array(9).fill(null)] as number[];
    renderRow(
      <SavingsIndexRow
        totalByMonth={saldos.map((v) => v ?? 0)}
        entradasByMonth={saldos.map((v, i) => (v === null || i >= 3 ? 0 : 100))}
        totalAnnual={65}
        entradasAnnual={100}
      />,
    );

    const cellOf = (texto: RegExp) => screen.getAllByText(texto)[0].closest('td')!;
    expect(cellOf(/^25,00%$/).className).toContain('text-[#0079F2]'); // positivo azul
    expect(cellOf(/-10,00%/).className).toContain('text-red-600'); // negativo vermelho
    expect(cellOf(/^0,00%$/).className).not.toContain('text-[#0079F2]'); // zero neutro
    expect(cellOf(/^0,00%$/).className).not.toContain('text-red-600');
    // Anual positivo também fica azul.
    expect(cellOf(/^65,00%$/).className).toContain('text-[#0079F2]');
    // Linha de total padrão do app (cinza-claro) na célula do rótulo.
    const label = screen.getByText('Índice de Poupança Mensal').closest('td')!;
    expect(label.className).toContain('bg-gray-50');
  });
});

describe('TotalRow (Saldo do mês) — pedido do Pedro ago/2026', () => {
  it('liga o azul-positivo na linha de Saldo do mês', () => {
    renderRow(<TotalRow totalByMonth={[1500, ...Array(11).fill(0)]} totalAnnual={1500} />);
    expect(screen.getByText('Saldo do mês (Lucro Líquido)')).toBeInTheDocument();
    // Mensal + anual: os dois positivos ficam azuis.
    const positivos = screen.getAllByText(/1\.500/).map((el) => el.closest('td')!);
    expect(positivos).toHaveLength(2);
    for (const td of positivos) expect(td.className).toContain('text-[#0079F2]');
  });
});

describe('SaldoContaCorrenteAnteriorRow — mesmo visual do Saldo do mês (pedido 16/09/2026)', () => {
  it('usa a variante azul e pinta positivo azul / negativo vermelho, anual em branco', () => {
    renderRow(<SaldoContaCorrenteAnteriorRow cells={[2500, -300, 0, ...Array(9).fill(null)]} />);
    const label = screen.getByText('Saldo Conta Corrente Mês Anterior').closest('td')!;
    expect(label.className).toContain('bg-[#C7D9EA]');
    expect(label.className).not.toContain('bg-gray-50');
    expect(screen.getByText(/2\.500/).closest('td')!.className).toContain('text-[#0079F2]');
    expect(screen.getByText(/-.*300/).closest('td')!.className).toContain('text-red-600');
    // Anual continua '–' (somar estoque mês a mês não faz sentido).
    const tds = label.closest('tr')!.querySelectorAll('td');
    expect(tds[tds.length - 1].textContent).toBe('–');
  });
});
