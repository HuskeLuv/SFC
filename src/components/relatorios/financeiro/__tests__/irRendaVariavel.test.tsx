// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { RelatorioFinanceiro } from '@/types/relatorioFinanceiro';
import type {
  BlocoIrRendaVariavelRelatorio,
  MesIrRendaVariavelRelatorio,
} from '@/types/relatorioFinanceiroIrRendaVariavel';
import { relatorioExemplo } from '../__fixtures__/relatorioExemplo';
import { SecaoCarteira } from '../secoes/SecaoCarteira';
import { IrRendaVariavelReal } from '../secoes/real/IrRendaVariavelReal';
import { carregados } from './dynamicMock';

vi.mock('next/dynamic', () => import('./dynamicMock'));

const VALOR_SENTINELA = 987_654_321.12;

const mes = (
  m: string,
  extra: Partial<MesIrRendaVariavelRelatorio> = {},
): MesIrRendaVariavelRelatorio => ({
  mes: m,
  vendasAcoes: 0,
  vendasEtf: 0,
  isentoAcoes: false,
  lucroAcoes: 0,
  prejuizoCompensadoAcoes: 0,
  irAcoes: 0,
  vendasFii: 0,
  lucroFii: 0,
  prejuizoCompensadoFii: 0,
  irFii: 0,
  irMes: 0,
  acumuladoAnterior: 0,
  darf: { status: 'sem', valor: 0 },
  ...extra,
});

const COLUNAS = [
  'Mês',
  'Vendas de ações',
  'Lucro ações',
  'IR ações (15%)',
  'Lucro FIIs',
  'IR FIIs (20%)',
  'DARF',
];

/** Fixture Advanced com o bloco de IR trocado. */
function comIr(plano: RelatorioFinanceiro['plano'], ir: BlocoIrRendaVariavelRelatorio | null) {
  const base = relatorioExemplo(3, 'adv');
  return {
    ...base,
    plano,
    carteiraAvancada: { ...base.carteiraAvancada!, irRendaVariavel: ir },
  } satisfies RelatorioFinanceiro;
}

describe('IR mensal de ações e FIIs (4b)', () => {
  it('mês sem venda nem imposto fica de fora da tabela, com a nota', () => {
    const { container } = render(
      <IrRendaVariavelReal
        bloco={{
          meses: [
            mes('2026-09', {}),
            mes('2026-10', { vendasAcoes: 343, lucroAcoes: -12 }),
            mes('2026-11', {}),
          ],
        }}
      />,
    );
    const linhas = container.querySelectorAll('tbody tr');
    expect(linhas).toHaveLength(1);
    expect(linhas[0].textContent).toContain('Out/26');
    expect(container.textContent).toContain('Os 2 meses sem venda nem imposto ficam de fora.');
  });

  it('Advanced: tabela do protótipo, um mês por linha, data-label e o texto do DARF', async () => {
    const rel = relatorioExemplo(12, 'adv');
    const { container } = render(<SecaoCarteira relatorio={rel} />);
    await waitFor(() => expect(container.querySelector('.tw.cards')).not.toBeNull());
    const tabela = [...container.querySelectorAll('.tw.cards')].find((t) =>
      t.textContent?.includes('IR FIIs (20%)'),
    )!;
    expect([...tabela.querySelectorAll('th')].map((th) => th.textContent)).toEqual(COLUNAS);
    expect(tabela.querySelectorAll('tbody tr')).toHaveLength(12);
    expect(tabela.querySelector('tbody td')!.textContent).toBe('Dez/25');
    const rotulos = [...tabela.querySelectorAll('tbody tr:first-child td')].map((td) =>
      td.getAttribute('data-label'),
    );
    expect(rotulos).toEqual([null, ...COLUNAS.slice(1)]);
    expect(container.textContent).toContain(
      'DARF vence no último dia útil do mês seguinte à venda. DARF abaixo de R$ 10 é somado ao do mês seguinte.',
    );
    expect(container.textContent).not.toContain('IR mensal de ações e FIIs: em breve');
  });

  it('DARF: a pagar com código 6015, acumula abaixo de R$ 10, sem imposto; subtextos', () => {
    const { container } = render(
      <IrRendaVariavelReal
        bloco={{
          meses: [
            mes('2026-09', {
              vendasAcoes: 15000,
              isentoAcoes: true,
              lucroAcoes: 900,
              darf: { status: 'sem', valor: 0 },
            }),
            mes('2026-10', {
              vendasFii: 300,
              lucroFii: 30,
              irFii: 6,
              irMes: 6,
              darf: { status: 'acumula', valor: 6 },
            }),
            mes('2026-11', {
              vendasAcoes: 30000,
              vendasEtf: 5000,
              lucroAcoes: 2000,
              prejuizoCompensadoAcoes: 500,
              irAcoes: 225,
              irMes: 225,
              acumuladoAnterior: 6,
              darf: { status: 'pagar', valor: 231 },
            }),
          ],
        }}
      />,
    );
    const linhas = [...container.querySelectorAll('tbody tr')].map((tr) => tr.textContent);
    expect(linhas[0]).toContain('isento, até R$ 20 mil');
    expect(linhas[0]).toContain('Sem imposto');
    expect(linhas[1]).toContain('acumula p/ próximo');
    expect(linhas[1]).toContain('R$ 6,00');
    expect(linhas[2]).toContain('R$ 231,00 · código 6015');
    expect(linhas[2]).toContain('+ R$ 5.000 em ETFs');
    expect(linhas[2]).toContain('R$ 500 compensado');
    expect(linhas[2]).toContain('inclui R$ 6,00 de meses anteriores');
    expect(container.querySelector('.tag.warn')!.textContent).toContain('código 6015');
  });

  it('estado vazio honesto: nenhuma venda no período', () => {
    const { container } = render(
      <IrRendaVariavelReal bloco={{ meses: [mes('2026-10'), mes('2026-11')] }} />,
    );
    expect(container.textContent).toContain('Nenhuma venda de ações ou FIIs no período.');
    expect(container.querySelector('table')).toBeNull();
  });

  it('bloco null (apuração falhou): aviso com link para Análises > IR', async () => {
    const { container } = render(<SecaoCarteira relatorio={comIr('adv', null)} />);
    await waitFor(() =>
      expect(container.textContent).toContain('O IR mensal de ações e FIIs não pôde ser carregado'),
    );
    const links = [...container.querySelectorAll('.callout a')].map((a) => a.textContent);
    expect(links).toContain('Análises > IR');
  });

  it.each(['basic', 'pro'] as const)(
    '%s: a 4b fica sob o cadeado com a tabela fictícia, sem dado real nem corpo real',
    async (plano) => {
      carregados.length = 0;
      const sentinela = {
        meses: [mes('2026-11', { vendasAcoes: VALOR_SENTINELA, irAcoes: VALOR_SENTINELA })],
      };
      const { container } = render(<SecaoCarteira relatorio={comIr(plano, sentinela)} />);
      if (plano === 'pro') {
        await waitFor(() => expect(container.textContent).toContain('Aportes no período'));
      }
      const cadeado = [...container.querySelectorAll('.locked')].pop()!;
      expect(cadeado.textContent).toContain('IR FIIs (20%)');
      expect(cadeado.querySelectorAll('tbody tr')).toHaveLength(3);
      expect(container.innerHTML).not.toContain('987.654.321');
      expect(carregados.some((c) => /Avancada|IrRendaVariavelReal/.test(c))).toBe(false);
    },
  );

  it('relatórios Basic/Pro do fixture não trazem a 4b (aplicarCadeado)', () => {
    expect(relatorioExemplo(3, 'basic').carteiraAvancada).toBeNull();
    expect(relatorioExemplo(3, 'pro').carteiraAvancada).toBeNull();
    expect(relatorioExemplo(3, 'adv').carteiraAvancada!.irRendaVariavel!.meses).toHaveLength(3);
  });
});
