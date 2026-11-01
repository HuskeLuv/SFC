'use client';

import { useMemo } from 'react';
import type { ApexOptions } from 'apexcharts';
import { useValoresOcultos } from '@/context/ValoresOcultosContext';
import { MASCARA_VALOR } from '@/utils/valoresOcultos';
import { deepMergeOptions } from '../ApexChartWrapper';
import { useOpcoesGraficoSensiveis } from '../useOpcoesGraficoSensiveis';

/**
 * Esconder valores nas pizzas das abas da Carteira (decisão 7), que usam o ReactApexChart direto
 * (sem o ApexChartWrapper). O mascaramento vale sobre as opções FINAIS, inclusive `responsive[]`.
 *
 * `serieEmValor`: a série é o VALOR de cada fatia (ETF, REIT, Stocks), e o centro da rosca mostra
 * esse número sem símbolo — o total (formatter padrão do Apex, a soma) e o valor da fatia em foco
 * (`${val}%`). Com o olho fechado os dois viram "•••••" e o tooltip ("$1,234.56") vira pílula.
 * As fatias e os nomes ficam. Olho aberto: a MESMA referência (nada muda).
 */
export function usePizzaSensivel<T extends ApexOptions>(
  options: T,
  { serieEmValor = false }: { serieEmValor?: boolean } = {},
): T {
  const { ativo } = useValoresOcultos();
  const base = useMemo(
    () =>
      ativo && serieEmValor
        ? deepMergeOptions(options, {
            plotOptions: {
              pie: {
                donut: {
                  labels: {
                    value: { formatter: () => MASCARA_VALOR },
                    total: { formatter: () => MASCARA_VALOR },
                  },
                },
              },
            },
          })
        : options,
    [ativo, serieEmValor, options],
  );
  return useOpcoesGraficoSensiveis(base, serieEmValor ? OPCOES_SERIE_EM_VALOR : undefined);
}

const OPCOES_SERIE_EM_VALOR = { eixosSemSimbolo: true } as const;
