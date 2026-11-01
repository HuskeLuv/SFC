// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import type { ApexOptions } from 'apexcharts';

vi.mock('next/navigation', () => ({ usePathname: () => '/carteira' }));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => true }));

const capturado = vi.hoisted(() => ({ options: null as ApexOptions | null, montagens: 0 }));
vi.mock('react-apexcharts', async () => {
  const { useEffect } = await import('react');
  return {
    default: function GraficoFalso(props: { options: ApexOptions }) {
      capturado.options = props.options;
      useEffect(() => {
        capturado.montagens += 1;
      }, []);
      return <div data-testid="chart" />;
    },
  };
});

import ApexChartWrapper from '../ApexChartWrapper';
import { ValoresOcultosProvider, useValoresOcultos } from '@/context/ValoresOcultosContext';
import { formatBRL } from '@/utils/format';

const base: ApexOptions = { chart: { type: 'area' } };
const mobile: ApexOptions = { yaxis: { labels: { formatter: (v: number) => formatBRL(v) } } };

const renderGrafico = (ocultos: boolean) =>
  render(
    <ValoresOcultosProvider habilitado inicial={ocultos}>
      <ApexChartWrapper options={base} series={[]} type="area" mobileOptions={mobile} />
    </ValoresOcultosProvider>,
  );

const formatterDoEixo = () =>
  (capturado.options!.yaxis as ApexYAxis).labels!.formatter as (v: number) => string;

describe('ApexChartWrapper + esconder valores', () => {
  it('olho fechado: o formatter que vem só nas mobileOptions sai mascarado', async () => {
    renderGrafico(true);
    await waitFor(() => expect(capturado.options).not.toBeNull());
    expect(formatterDoEixo()(1500)).toBe('');
  });

  it('olho aberto: as opções finais são as de hoje', async () => {
    capturado.options = null;
    renderGrafico(false);
    await waitFor(() => expect(capturado.options).not.toBeNull());
    expect(formatterDoEixo()(1500)).toBe(formatBRL(1500));
  });

  describe('alternar o olho', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      document.documentElement.removeAttribute('data-valores-ocultos');
    });

    it('remonta o gráfico (o Apex mescla opções: chave criada no modo oculto não sobra)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
      const olho = { alternar: () => {} };
      function Olho() {
        olho.alternar = useValoresOcultos().alternar;
        return null;
      }
      capturado.options = null;
      capturado.montagens = 0;
      render(
        <ValoresOcultosProvider habilitado inicial={false}>
          <Olho />
          <ApexChartWrapper options={base} series={[]} type="area" mobileOptions={mobile} />
        </ValoresOcultosProvider>,
      );
      await waitFor(() => expect(capturado.montagens).toBe(1));
      act(() => olho.alternar());
      await waitFor(() => expect(capturado.montagens).toBe(2));
      expect(formatterDoEixo()(1500)).toBe('');
      act(() => olho.alternar());
      await waitFor(() => expect(capturado.montagens).toBe(3));
      expect(formatterDoEixo()(1500)).toBe(formatBRL(1500));
      expect((capturado.options!.yaxis as ApexYAxis).labels!.minWidth).toBeUndefined();
    });
  });
});
