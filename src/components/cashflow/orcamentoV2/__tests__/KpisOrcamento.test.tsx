// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { OrcamentoV2Response } from '@/types/orcamentoV2';
import KpisOrcamento from '../KpisOrcamento';
import { montarPayload } from './payloadAnexoB';

const kpi = (container: HTMLElement, id: string) =>
  container.querySelector<HTMLElement>(`[data-mf-kpi="${id}"]`)!;

function comReceita(
  base: OrcamentoV2Response,
  receitaPrevista: OrcamentoV2Response['receitaPrevista'],
  resumo: Partial<OrcamentoV2Response['resumo']> = {},
): OrcamentoV2Response {
  return { ...base, receitaPrevista, resumo: { ...base.resumo, ...resumo } };
}

describe('KpisOrcamento', () => {
  it('T01/T02/T03: os 5 KPIs do Anexo B (mês corrente, Lançado)', () => {
    const { container } = render(<KpisOrcamento data={montarPayload()} />);
    expect(kpi(container, 'receita')).toHaveTextContent('R$ 24.000,00');
    expect(kpi(container, 'receita')).toHaveTextContent('do Fluxo de Caixa · Outubro 2026');
    expect(kpi(container, 'orcado')).toHaveTextContent('R$ 18.014,90');
    expect(kpi(container, 'orcado')).toHaveTextContent('75,1% da receita · 13 categorias');
    expect(kpi(container, 'realizado')).toHaveTextContent('Lançado no mês · dia 23 de 31');
    expect(kpi(container, 'realizado')).toHaveTextContent('R$ 16.176,00');
    expect(kpi(container, 'realizado')).toHaveTextContent('90% do orçado · 74% do mês passou');
    expect(kpi(container, 'disponivel')).toHaveTextContent('R$ 1.838,90');
    expect(kpi(container, 'disponivel')).toHaveTextContent('orçado − realizado · 8 dias restantes');
    expect(kpi(container, 'indice')).toHaveTextContent('24,9%');
    expect(kpi(container, 'indice')).toHaveTextContent('sobra prevista R$ 5.985,10 para investir');
  });

  it('receita nas 3 origens: fluxo, média de 3 meses e nenhuma (com o link para o Fluxo)', () => {
    const base = montarPayload();
    const { container, rerender } = render(<KpisOrcamento data={base} />);
    expect(kpi(container, 'receita')).toHaveTextContent('do Fluxo de Caixa · Outubro 2026');

    rerender(
      <KpisOrcamento
        data={comReceita(base, {
          valor: 21_000,
          origem: 'media3m',
          mesesBase: [
            { ano: 2026, mes: 7 },
            { ano: 2026, mes: 8 },
            { ano: 2026, mes: 9 },
          ],
        })}
      />,
    );
    expect(kpi(container, 'receita')).toHaveTextContent('R$ 21.000,00');
    expect(kpi(container, 'receita')).toHaveTextContent('média dos últimos 3 meses');

    rerender(
      <KpisOrcamento
        data={comReceita(
          base,
          { valor: null, origem: 'nenhuma' },
          { orcadoPctReceita: null, sobraPrevista: null, indicePoupanca: null },
        )}
      />,
    );
    expect(kpi(container, 'receita')).toHaveTextContent('—');
    expect(
      screen.getByRole('link', { name: 'Informe a receita prevista no Fluxo de Caixa' }),
    ).toHaveAttribute('href', '/fluxodecaixa');
    expect(kpi(container, 'orcado')).not.toHaveTextContent('da receita');
    expect(kpi(container, 'indice')).toHaveTextContent('—');
    expect(kpi(container, 'indice')).toHaveTextContent('sem receita prevista');
  });

  it('Consolidado: "Realizado até dia 23"; mês passado e futuro (Previsto, Q18)', () => {
    const { container, rerender } = render(
      <KpisOrcamento data={montarPayload({ fonte: 'consolidado' })} />,
    );
    expect(kpi(container, 'realizado')).toHaveTextContent('Realizado até dia 23');

    rerender(<KpisOrcamento data={montarPayload({ mes0: 8 })} />);
    expect(kpi(container, 'realizado')).toHaveTextContent('Lançado no mês');
    expect(kpi(container, 'realizado')).not.toHaveTextContent('do mês passou');
    expect(kpi(container, 'disponivel')).not.toHaveTextContent('dias restantes');

    rerender(<KpisOrcamento data={montarPayload({ mes0: 11 })} />);
    expect(kpi(container, 'realizado')).toHaveTextContent('Previsto no mês');
    expect(kpi(container, 'disponivel')).toHaveTextContent('orçado − previsto');
  });

  it('Acumulado do ano: rótulos do ano e meses sem orçado', () => {
    const data = montarPayload({ visao: 'ano' });
    const { container } = render(<KpisOrcamento data={data} />);
    expect(kpi(container, 'receita')).toHaveTextContent('Receita prevista no ano');
    expect(kpi(container, 'receita')).toHaveTextContent('Janeiro a Outubro 2026');
    expect(kpi(container, 'orcado')).toHaveTextContent('Orçado no ano');
    expect(kpi(container, 'realizado')).toHaveTextContent('Lançado até 23/10');
    expect(kpi(container, 'realizado')).toHaveTextContent('do ano passou');
    expect(data.mesesSemOrcamento?.length).toBeGreaterThan(0);
    expect(kpi(container, 'orcado')).toHaveTextContent('sem orçado em jan');
  });

  it('disponível negativo em vermelho', () => {
    const base = montarPayload();
    const { container } = render(
      <KpisOrcamento data={{ ...base, resumo: { ...base.resumo, disponivel: -50 } }} />,
    );
    expect(kpi(container, 'disponivel').querySelector('p.text-xl')!.className).toContain(
      'text-[#D92D20]',
    );
  });

  it('Disponível: "?" com a explicação e a linha do que passou do orçado', () => {
    const data = montarPayload();
    const bad = data.categorias.flatMap((c) => c.subcategorias).filter((s) => s.status === 'bad');
    const excesso = bad.reduce((t, s) => t + Math.max(0, s.realizado - s.orcado), 0);
    const { container } = render(<KpisOrcamento data={data} />);
    expect(
      screen.getByRole('button', { name: /^Ajuda: Sobra do orçado total/ }),
    ).toBeInTheDocument();
    const linha = kpi(container, 'disponivel').querySelector('[data-mf-kpi-excesso]')!;
    expect(bad.length).toBeGreaterThan(1);
    expect(linha).toHaveTextContent(`acima do orçado em ${bad.length} subcategorias`);
    expect(linha.textContent!.replace(/\s/g, ' ')).toContain(
      excesso.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    );
  });

  it('sem estouro, sem a linha do excesso', () => {
    const base = montarPayload();
    const data = {
      ...base,
      categorias: base.categorias.map((c) => ({
        ...c,
        subcategorias: c.subcategorias.map((s) =>
          s.status === 'bad' ? { ...s, status: 'ok' as const } : s,
        ),
      })),
    };
    const { container } = render(<KpisOrcamento data={data} />);
    expect(kpi(container, 'disponivel').querySelector('[data-mf-kpi-excesso]')).toBeNull();
  });
});
