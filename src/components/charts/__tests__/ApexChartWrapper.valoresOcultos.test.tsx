// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { ApexOptions } from 'apexcharts';

vi.mock('next/navigation', () => ({ usePathname: () => '/carteira' }));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => true }));

const capturado = vi.hoisted(() => ({ options: null as ApexOptions | null }));
vi.mock('react-apexcharts', () => ({
  default: (props: { options: ApexOptions }) => {
    capturado.options = props.options;
    return <div data-testid="chart" />;
  },
}));

import ApexChartWrapper from '../ApexChartWrapper';
import { ValoresOcultosProvider } from '@/context/ValoresOcultosContext';
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
});
