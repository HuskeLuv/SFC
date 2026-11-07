// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Kpi } from '../ui/Kpi';
import { KpiLock } from '../ui/KpiLock';
import { Cadeado } from '../ui/Cadeado';
import { Ganho } from '../ui/Ganho';
import { Pagina } from '../ui/Pagina';
import { Legenda } from '../ui/Legenda';
import { ChartBox } from '../ui/ChartBox';
import { Progresso } from '../ui/Progresso';
import { SvgBars } from '../graficos/SvgBars';
import { SvgLines } from '../graficos/SvgLines';
import { Donut } from '../graficos/Donut';
import { ticks } from '../graficos/escala';
import type { MetaPagina } from '../ui/Pagina';

const ANTES = new Date('2026-11-03T09:42:00-03:00');
const DEPOIS = new Date('2026-12-06T12:00:00-03:00');

describe('primitivos do relatório (mesmo DOM/classes do protótipo)', () => {
  it('Kpi', () => {
    const { container } = render(
      <Kpi rotulo="Sobra" valor="R$ 1" sub="índice" destaque tom="good" />,
    );
    expect(container.innerHTML).toBe(
      '<div class="kpi hl"><span class="l">Sobra</span><span class="v good">R$ 1</span><span class="s">índice</span></div>',
    );
  });

  it('KpiLock', () => {
    const { container } = render(<KpiLock rotulo="Saúde financeira" plano="adv" />);
    const kpi = container.querySelector('.kpi.lockt')!;
    expect(kpi.querySelector('.v')!.textContent).toBe(' Advanced');
    expect(kpi.querySelector('.s')!.textContent).toBe('Disponível no Advanced');
    expect(kpi.querySelector('svg')).not.toBeNull();
  });

  it('Cadeado: oferta vigente e depois da validade', () => {
    const { container, rerender } = render(
      <Cadeado
        plano="pro"
        titulo="Carteira de investimentos"
        descricao="Patrimônio investido."
        gancho="Você teve sobra."
        referencia={ANTES}
      >
        <div className="kpis">fictício</div>
      </Cadeado>,
    );
    const cta = container.querySelector('a.cta')!;
    expect(cta.textContent).toBe('Liberar no Pro com 20% off');
    expect(cta.getAttribute('href')).toBe('/planos?need=pro');
    expect(cta.getAttribute('target')).toBeNull();
    expect(container.querySelector('.url')!.textContent).toBe(
      'Anual: R$ 479,04/ano, equivale a R$ 39,92 por mês · Black Friday até 05/12 · appmyfinance.com.br/planos',
    );
    expect(container.querySelector('.blur')!.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.hook')!.textContent).toBe('Você teve sobra.');

    rerender(
      <Cadeado plano="adv" titulo="t" descricao="d" tamanho="tall" referencia={DEPOIS}>
        <div />
      </Cadeado>,
    );
    expect(container.querySelector('.locked')!.className).toBe('locked tall');
    expect(container.querySelector('a.cta')!.textContent).toBe('Conhecer o Advanced');
    expect(container.querySelector('.url')!.textContent).toBe('appmyfinance.com.br/planos');
    expect(container.querySelector('.hook')).toBeNull();
  });

  it('Ganho', () => {
    const { container } = render(
      <Ganho rotulo="Pode ser" valor="+ R$ 6.151" sub="maior" selo="Prazo para agir" />,
    );
    expect(container.querySelector('.gain b')!.innerHTML).toBe('<small>até</small>+ R$ 6.151');
    expect(container.querySelector('.gain .tag')!.textContent).toBe('Prazo para agir');
  });

  it('Pagina: cabeçalho, sec-head e rodapé', () => {
    const r: MetaPagina = {
      cliente: 'Ana Ribeiro',
      consultor: null,
      plano: 'basic',
      geradoEm: '2026-11-03T09:42:00-03:00',
      periodo: {
        meses: 1,
        rotulo: 'Novembro de 2026 (parcial, lançado até 03/11)',
        inicio: '2026-11',
        fim: '2026-11',
        parcial: true,
        lancadoAte: '03/11',
      },
    };
    const { container, rerender } = render(
      <Pagina numero={2} titulo="Orçamento" lead="Para onde foi o dinheiro." relatorio={r}>
        <p>corpo</p>
      </Pagina>,
    );
    expect(container.querySelector('.ph span')!.textContent).toBe(
      'Relatório financeiro · Novembro de 2026 (parcial, lançado até 03/11)',
    );
    expect(container.querySelector('.sec-num')!.textContent).toBe('2');
    const pf = container.querySelectorAll('.pf span');
    expect(pf[0].textContent).toBe('Ana Ribeiro · Plano Basic · gerado em 03/11/2026 às 09:42');
    expect(pf[1].textContent).toBe('Página 2');

    rerender(<Pagina numero={9} titulo="x" relatorio={{ ...r, consultor: 'Carlos' }} />);
    expect(container.querySelector('.pf span')!.textContent).toContain(
      '· gerado pelo consultor Carlos',
    );
    expect(container.querySelector('.sec-head p')).toBeNull();
  });

  it('Legenda, ChartBox e Progresso', () => {
    const { container } = render(
      <ChartBox titulo="Receita" sub="por mês">
        <Legenda series={[{ nome: 'Meta', cor: '#b07110', tracejado: true }]} />
        <Progresso pct={140} tom="good" />
      </ChartBox>,
    );
    expect(container.querySelector('.chart h3')!.innerHTML).toBe('Receita <small>por mês</small>');
    expect(container.querySelector('.legend i')!.className).toBe('dash');
    expect((container.querySelector('.prog.good i') as HTMLElement).style.width).toBe('100%');
  });

  it('gráficos com role=img e aria-label', () => {
    const { container } = render(
      <>
        <SvgBars
          labels={['Set/26', 'Out/26', 'Nov/26']}
          series={[
            { color: '#c9d0da', values: [50000, 51000, 50000] },
            { color: '#314666', values: [30000, 31000, 22000] },
          ]}
          ariaLabel="Receita e gastos"
        />
        <SvgLines
          series={[{ color: '#0079f2', values: [1, 2, 3], dot: true }]}
          xTicks={ticks(['a', 'b', 'c'])}
          area
          ariaLabel="Saldo"
        />
        <Donut
          parts={[
            ['Renda fixa', 75, '#0079f2'],
            ['Ações', 25, '#314666'],
          ]}
        />
      </>,
    );
    const svgs = container.querySelectorAll('svg[role="img"]');
    expect(svgs).toHaveLength(3);
    expect(svgs[0].getAttribute('aria-label')).toBe('Receita e gastos');
    expect(svgs[0].querySelectorAll('rect')).toHaveLength(6);
    expect(svgs[1].querySelectorAll('path')).toHaveLength(2);
    expect(svgs[1].querySelector('circle')).not.toBeNull();
    expect(container.querySelector('.dl')!.textContent).toContain('75,0%');
  });
});
