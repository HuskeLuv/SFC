// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type {
  SaudeFinanceiraIndicadores,
  SaudeFinanceiraPayload,
} from '@/hooks/useSaudeFinanceira';

vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => true, useMediaQuery: () => true }));

import BalancoPatrimonial, { montarQuadrantes } from '../../BalancoPatrimonial';
import BalancoMobile from '../BalancoMobile';

const composicao = {
  altaLiquidez: [
    { chave: 'reserva', label: 'Reserva Emergência', valor: 10_000 },
    { chave: 'rf', label: 'Renda Fixa até D+360', valor: 5_000 },
  ],
  baixaLiquidez: [{ chave: 'imoveis', label: 'Imóveis & Bens', valor: 300_000 }],
  passivos: [
    { id: 'd1', nome: 'Nubank', tipo: 'cartao_credito', prazo: 'curto', saldo: 2_000 },
    {
      id: 'd2',
      nome: 'Apartamento',
      tipo: 'financiamento_imobiliario',
      prazo: 'longo',
      saldo: 150_000,
    },
  ],
} as unknown as SaudeFinanceiraPayload['composicao'];

const indicadores = {
  balanco: {
    ativosAltaLiquidez: 15_000,
    ativosBaixaLiquidez: 300_000,
    passivosCurtoPrazo: 2_000,
    passivosLongoPrazo: 150_000,
    patrimonioLiquido: 163_000,
  },
  metricas: { grauIndependencia: 0.5 },
} as unknown as SaudeFinanceiraIndicadores;

const tendencias = { patrimonioLiquido: null, grauIndependencia: null } as never;

describe('montarQuadrantes', () => {
  it('mesmas linhas do cálculo antigo: reais antes, tipos sem cadastro zerados depois', () => {
    const q = montarQuadrantes(composicao, indicadores);
    expect(q.ativo.curto.itens.map((i) => [i.label, i.valor])).toEqual([
      ['Reserva Emergência', 10_000],
      ['Renda Fixa até D+360', 5_000],
    ]);
    expect(q.ativo.longo.itens.map((i) => i.key)).toEqual(['imoveis']);
    // Curto: o cartão real + o cheque especial zerado (o cartão já tem cadastro).
    expect(q.passivo.curto.itens.map((i) => [i.key, i.valor])).toEqual([
      ['d1', 2_000],
      ['modelo-cheque_especial', 0],
    ]);
    expect(q.passivo.curto.itens[0].label).toMatch(/^Nubank \(/);
    // Longo: o financiamento real + os 3 tipos-modelo que faltam (sem duplicar o imobiliário).
    expect(q.passivo.longo.itens.map((i) => i.key)).toEqual([
      'd2',
      'modelo-financiamento_veiculo',
      'modelo-emprestimo_pessoal',
      'modelo-consignado',
    ]);
  });

  it('totais e rótulos vêm do balanço (os mesmos da tabela)', () => {
    const q = montarQuadrantes(composicao, indicadores);
    expect([q.ativo.curto.totalLabel, q.ativo.curto.total]).toEqual([
      'TOTAL Ativos Curto Prazo',
      15_000,
    ]);
    expect([q.ativo.longo.totalLabel, q.ativo.longo.total]).toEqual([
      'TOTAL Ativos Longo Prazo',
      300_000,
    ]);
    expect([q.passivo.curto.totalLabel, q.passivo.curto.total]).toEqual([
      'TOTAL Passivos Curto Prazo',
      2_000,
    ]);
    expect([q.passivo.longo.totalLabel, q.passivo.longo.total]).toEqual([
      'TOTAL Passivos Longo Prazo',
      150_000,
    ]);
    expect(q.patrimonioLiquido).toBe(163_000);
  });
});

describe('BalancoMobile', () => {
  it('totais do celular iguais aos da tabela, na ordem Ativo → Passivo → PL', () => {
    const { container } = render(
      <BalancoPatrimonial
        indicadores={indicadores}
        composicao={composicao}
        tendencias={tendencias}
      />,
    );
    const mobile = container.querySelector('[data-mf-mobile]') as HTMLElement;
    const table = container.querySelector('table') as HTMLElement;
    expect(mobile).not.toBeNull();
    // A tabela continua no DOM (é ela que imprime), escondida só na tela do celular.
    expect(table.parentElement!.className).toContain('mscreen:hidden');
    for (const label of [
      'TOTAL Ativos Curto Prazo',
      'TOTAL Ativos Longo Prazo',
      'TOTAL Passivos Curto Prazo',
      'TOTAL Passivos Longo Prazo',
      'Total do Patrimônio Líquido',
    ]) {
      const cell = within(table).getByText(label);
      const tableValue = cell.nextElementSibling?.textContent ?? cell.parentElement!.textContent;
      const mobileRow = within(mobile).getByText(label).parentElement!;
      const mobileValue = mobileRow.lastElementChild!.textContent;
      expect(tableValue).toContain(mobileValue);
    }
    const texto = mobile.textContent ?? '';
    expect(texto.indexOf('Ativo')).toBeLessThan(texto.indexOf('Passivo'));
    expect(texto.indexOf('Passivo')).toBeLessThan(texto.indexOf('Total do Patrimônio Líquido'));
  });

  it('faixa de quadrante recolhe e abre a lista', () => {
    render(<BalancoMobile quadrantes={montarQuadrantes(composicao, indicadores)} />);
    const faixa = screen.getByRole('button', { name: /Ativos curto prazo/ });
    expect(faixa).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Reserva Emergência')).toBeInTheDocument();
    fireEvent.click(faixa);
    expect(faixa).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Reserva Emergência')).toBeNull();
    // O total do quadrante continua à vista.
    expect(screen.getByText('TOTAL Ativos Curto Prazo')).toBeInTheDocument();
  });
});
