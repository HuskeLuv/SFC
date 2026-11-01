// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ApexOptions } from 'apexcharts';

vi.mock('next/navigation', () => ({ usePathname: () => '/carteira' }));

import { mascararOpcoesGrafico, useOpcoesGraficoSensiveis } from '../useOpcoesGraficoSensiveis';
import { deepMergeOptions } from '../ApexChartWrapper';
import { ValoresOcultosProvider } from '@/context/ValoresOcultosContext';
import { MASCARA_VALOR } from '@/utils/valoresOcultos';
import { formatBRL } from '@/utils/format';

type AnyFn = (...args: unknown[]) => unknown;
const chamar = (f: unknown, ...args: unknown[]) => (f as AnyFn)(...args);

const reais = (v: number) => formatBRL(v);
const compacto = (v: number) => `${(v / 1000).toFixed(0)}K`;
const pct = (v: number) => `${v.toFixed(1)}%`;

function wrapper(ocultos: boolean) {
  return function ComProvider({ children }: { children: React.ReactNode }) {
    return React.createElement(
      ValoresOcultosProvider,
      { habilitado: true, inicial: ocultos },
      children,
    );
  };
}

describe('useOpcoesGraficoSensiveis', () => {
  it('olho aberto (e fora do provider): devolve a MESMA referência', () => {
    const options: ApexOptions = { yaxis: { labels: { formatter: reais } } };
    expect(
      renderHook(() => useOpcoesGraficoSensiveis(options), { wrapper: wrapper(false) }).result
        .current,
    ).toBe(options);
    expect(renderHook(() => useOpcoesGraficoSensiveis(options)).result.current).toBe(options);
  });

  it('olho fechado: clone mascarado, sem mutar o original; memo estável', () => {
    const options: ApexOptions = { yaxis: { labels: { formatter: reais } } };
    const { result, rerender } = renderHook(() => useOpcoesGraficoSensiveis(options), {
      wrapper: wrapper(true),
    });
    const primeira = result.current;
    expect(primeira).not.toBe(options);
    expect(chamar((options.yaxis as ApexYAxis).labels!.formatter, 10)).toBe(reais(10));
    rerender();
    expect(result.current).toBe(primeira);
  });
});

describe('mascararOpcoesGrafico', () => {
  it('(a) eixo Y objeto: rótulo vazio e largura reservada', () => {
    const out = mascararOpcoesGrafico<ApexOptions>({ yaxis: { labels: { formatter: reais } } });
    const labels = (out.yaxis as ApexYAxis).labels!;
    expect(chamar(labels.formatter, 1234.56)).toBe('');
    expect(labels.minWidth).toBe(56);
  });

  it('(a) eixo Y array; largura configurável; minWidth já definido fica', () => {
    const out = mascararOpcoesGrafico<ApexOptions>(
      {
        yaxis: [{ labels: { formatter: reais } }, { labels: { formatter: reais, minWidth: 80 } }],
      },
      { larguraEixoY: 64 },
    );
    const eixos = out.yaxis as ApexYAxis[];
    expect(chamar(eixos[0].labels!.formatter, 1)).toBe('');
    expect(eixos[0].labels!.minWidth).toBe(64);
    expect(eixos[1].labels!.minWidth).toBe(80);
  });

  it('(a) eixo Y de % continua', () => {
    const out = mascararOpcoesGrafico<ApexOptions>({ yaxis: { labels: { formatter: pct } } });
    expect(chamar((out.yaxis as ApexYAxis).labels!.formatter, 12.5)).toBe('12.5%');
  });

  it('(c) tooltip.y: pílula HTML e nenhum dígito do valor', () => {
    const out = mascararOpcoesGrafico<ApexOptions>({ tooltip: { y: { formatter: reais } } });
    const html = String(chamar((out.tooltip!.y as { formatter: AnyFn }).formatter, 1234.56));
    expect(html).toContain('mf-pilula-grafico');
    expect(html).not.toMatch(/\d/);
  });

  it('(c) tooltip.x (data) fica', () => {
    const out = mascararOpcoesGrafico<ApexOptions>({
      tooltip: { x: { formatter: () => 'out/2026' } },
    });
    expect(chamar(out.tooltip!.x!.formatter, 0)).toBe('out/2026');
  });

  it('sem tooltip.y.formatter, o tooltip ganha pílula a partir do formatter do eixo', () => {
    const out = mascararOpcoesGrafico<ApexOptions>({ yaxis: { labels: { formatter: reais } } });
    const html = String(
      chamar((out.tooltip!.y as { formatter: AnyFn }).formatter, 99.5, { seriesIndex: 0 }),
    );
    expect(html).toContain('mf-pilula-grafico');
    expect(html).not.toMatch(/\d/);
  });

  it('(b) tooltip.custom (Proventos) com fixture: sem "1.234,56"', () => {
    const custom = ({ series, dataPointIndex }: { series: number[][]; dataPointIndex: number }) =>
      `<div>Dividendos: R$ ${series[0][dataPointIndex].toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
      })}</div><div>Total: R$ 1.234,56</div>`;
    const out = mascararOpcoesGrafico<ApexOptions>({ tooltip: { custom } });
    const html = String(chamar(out.tooltip!.custom, { series: [[1000.5]], dataPointIndex: 0 }));
    expect(html).not.toContain('1.234,56');
    expect(html).not.toContain('1.000,5');
    expect(html).toContain('Dividendos:');
    expect(html.match(/mf-pilula-grafico/g)).toHaveLength(2);
  });

  it('responsive[].options também é mascarado', () => {
    const out = mascararOpcoesGrafico<ApexOptions>({
      responsive: [{ breakpoint: 640, options: { yaxis: { labels: { formatter: reais } } } }],
    });
    const yaxis = out.responsive![0].options.yaxis as ApexYAxis;
    expect(chamar(yaxis.labels!.formatter, 10)).toBe('');
  });

  it('(d) total e valor do donut: "•••••"; dataLabels de % ficam', () => {
    const out = mascararOpcoesGrafico<ApexOptions>({
      dataLabels: { formatter: (v: number) => `${v.toFixed(1)}%` },
      plotOptions: {
        pie: {
          donut: {
            labels: {
              show: true,
              value: { formatter: (v: string) => reais(Number(v)) },
              total: { show: true, formatter: () => '1.234.567,89' },
            },
          },
        },
      },
    });
    const labels = out.plotOptions!.pie!.donut!.labels!;
    expect(chamar(labels.total!.formatter, {})).toBe(MASCARA_VALOR);
    expect(String(chamar(labels.value!.formatter, '10'))).toBe(`R$ ${MASCARA_VALOR}`);
    expect(chamar(out.dataLabels!.formatter, 12.34)).toBe('12.3%');
  });

  it('(e) outro formatter (legenda): só o R$ some', () => {
    const out = mascararOpcoesGrafico<ApexOptions>({
      legend: { formatter: (nome: string) => `${nome} - ${reais(10)}` },
    });
    expect(chamar(out.legend!.formatter, 'Ações', {})).toBe(`Ações - R$ ${MASCARA_VALOR}`);
  });

  it('eixosSemSimbolo: "2000K" some do eixo, do tooltip e dos rótulos; datas ficam', () => {
    const out = mascararOpcoesGrafico<ApexOptions>(
      {
        xaxis: { labels: { formatter: () => 'jan/26' } },
        yaxis: { labels: { formatter: compacto } },
        tooltip: { y: { formatter: compacto } },
        dataLabels: { formatter: compacto },
      },
      { eixosSemSimbolo: true },
    );
    expect(chamar((out.yaxis as ApexYAxis).labels!.formatter, 2_000_000)).toBe('');
    expect(String(chamar((out.tooltip!.y as { formatter: AnyFn }).formatter, 2_000_000))).toContain(
      'mf-pilula-grafico',
    );
    expect(chamar(out.dataLabels!.formatter, 2_000_000)).toBe(MASCARA_VALOR);
    expect(chamar(out.xaxis!.labels!.formatter, 0)).toBe('jan/26');
  });

  it('preserva o resto (séries, cores, funções que não são formatter)', () => {
    const click = vi.fn();
    const out = mascararOpcoesGrafico<ApexOptions>({
      chart: { type: 'line', events: { click } },
      colors: ['#314666'],
    });
    expect(out.chart!.events!.click).toBe(click);
    expect(out.colors).toEqual(['#314666']);
  });

  it('opções FINAIS: formatter que só vem nas mobileOptions também é mascarado', () => {
    const base: ApexOptions = { chart: { type: 'area' } };
    const mobile: ApexOptions = { yaxis: { labels: { formatter: reais } } };
    const out = mascararOpcoesGrafico(deepMergeOptions(base, mobile));
    expect(chamar((out.yaxis as ApexYAxis).labels!.formatter, 1500)).toBe('');
  });
});
