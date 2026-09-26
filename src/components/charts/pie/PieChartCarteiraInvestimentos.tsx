'use client';
import React, { useMemo } from 'react';
import { ApexOptions } from 'apexcharts';
import ApexChartWrapper from '../ApexChartWrapper';
import { useTheme } from '@/context/ThemeContext';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { CATEGORIA_CORES, CATEGORIA_LABELS, SECOES_ORDEM } from '@/lib/carteiraCategoryColors';

// Categorias do donut na ordem canônica das seções (Imóveis & Bens fica fora
// da distribuição de investimentos). Cores/labels vêm do mapeamento central —
// paleta My Finance PARTE 2 (ticket 21/08/2026).
const CATEGORIAS_DONUT = SECOES_ORDEM.filter((c) => c !== 'imoveisBens');

/**
 * PWA fase 1 (abaixo de lg): a legenda do Apex sai (a 480px ela já sumia) e entra uma legenda em
 * HTML embaixo, com o % de cada tipo. `responsive: []` desliga os breakpoints de largura fixa.
 */
const MOBILE_OPTIONS: ApexOptions = {
  legend: { show: false },
  responsive: [],
  chart: { width: '100%' },
};

interface PieChartCarteiraInvestimentosProps {
  distribuicao: {
    reservaEmergencia: {
      valor: number;
      percentual: number;
    };
    reservaOportunidade: {
      valor: number;
      percentual: number;
    };
    rendaFixaFundos: {
      valor: number;
      percentual: number;
    };
    fimFia: {
      valor: number;
      percentual: number;
    };
    fiis: {
      valor: number;
      percentual: number;
    };
    acoes: {
      valor: number;
      percentual: number;
    };
    stocks: {
      valor: number;
      percentual: number;
    };
    reits: {
      valor: number;
      percentual: number;
    };
    etfs: {
      valor: number;
      percentual: number;
    };
    moedasCriptos: {
      valor: number;
      percentual: number;
    };
    previdenciaSeguros: {
      valor: number;
      percentual: number;
    };
    opcoes: {
      valor: number;
      percentual: number;
    };
  };
}

export default function PieChartCarteiraInvestimentos({
  distribuicao,
}: PieChartCarteiraInvestimentosProps) {
  // 1.11 (auditoria jul/2026): antes era `const isDarkMode = true` hardcoded —
  // legenda/labels brancos ficavam ilegíveis no tema claro.
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';

  // Total ATUALIZADO (a distribuição soma valores atuais + caixas por aba)
  const totalAtualizadoFormatado = useMemo(() => {
    const total =
      (distribuicao.reservaEmergencia.valor || 0) +
      (distribuicao.reservaOportunidade.valor || 0) +
      (distribuicao.rendaFixaFundos.valor || 0) +
      (distribuicao.fimFia.valor || 0) +
      (distribuicao.fiis.valor || 0) +
      (distribuicao.acoes.valor || 0) +
      (distribuicao.stocks.valor || 0) +
      (distribuicao.reits.valor || 0) +
      (distribuicao.etfs.valor || 0) +
      (distribuicao.moedasCriptos.valor || 0) +
      (distribuicao.previdenciaSeguros.valor || 0) +
      (distribuicao.opcoes.valor || 0);
    // Arredondar para 2 casas decimais e formatar
    const totalArredondado = Number((Math.round(total * 100) / 100).toFixed(2));
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(totalArredondado);
  }, [distribuicao]);

  // Chart configuration - memoized to prevent unnecessary re-renders
  const options: ApexOptions = useMemo(
    () => ({
      colors: CATEGORIAS_DONUT.map((c) => CATEGORIA_CORES[c]),
      labels: CATEGORIAS_DONUT.map((c) => CATEGORIA_LABELS[c]),
      chart: {
        fontFamily: 'Outfit, sans-serif',
        type: 'donut',
      },
      // Com a paleta só de azuis, o contorno fino delimita fatias de tons
      // próximos — e no dark mode impede que os azuis escuros da paleta
      // (seguranca e derivados) sumam no fundo do card.
      stroke: {
        show: true,
        width: 1,
        colors: [isDarkMode ? '#6B7280' : '#FFFFFF'],
      },
      plotOptions: {
        pie: {
          donut: {
            size: '65%',
            background: 'transparent',
            labels: {
              show: true,
              name: {
                show: true,
                offsetY: -10,
                color: isDarkMode ? '#ffffff' : '#1D2939',
                fontSize: '14px',
                fontWeight: '500',
              },
              value: {
                show: true,
                offsetY: 10,
                color: isDarkMode ? '#D1D5DB' : '#667085',
                fontSize: '12px',
                fontWeight: '400',
                formatter: (val: string) => {
                  const numeric = Number(val);
                  if (Number.isFinite(numeric)) {
                    return `${numeric.toFixed(2)}%`;
                  }
                  return '0.00%';
                },
              },
              total: {
                show: true,
                // 1.11: soma exibida é de valores ATUALIZADOS — "Total
                // Aplicado" sugeria custo de aquisição.
                label: 'Total Atualizado',
                color: isDarkMode ? '#ffffff' : '#000000',
                fontSize: '16px',
                fontWeight: 'bold',
                formatter: () => totalAtualizadoFormatado,
              },
            },
          },
          expandOnClick: false,
        },
      },
      dataLabels: {
        enabled: false,
      },
      tooltip: {
        enabled: true,
        y: {
          formatter: function (val: number) {
            // O val já vem como percentual do ApexCharts
            const percentual = Number(val);
            if (Number.isFinite(percentual)) {
              return `${percentual.toFixed(2)}%`;
            }
            return '0.00%';
          },
        },
      },
      legend: {
        show: true,
        position: 'bottom',
        fontFamily: 'Outfit, sans-serif',
        fontWeight: 400,
        fontSize: '14px',
        colors: isDarkMode ? ['#ffffff'] : ['#000000'],
        labels: {
          colors: isDarkMode ? '#ffffff' : '#000000',
        },
        markers: {
          width: 8,
          height: 8,
          strokeWidth: 0,
          strokeColor: '#fff',
          fillColors: undefined,
          radius: 12,
          customHTML: undefined,
          onClick: undefined,
          offsetX: 0,
          offsetY: 0,
        },
        itemMargin: {
          horizontal: 15,
          vertical: 8,
        },
      },
      responsive: [
        {
          breakpoint: 768,
          options: {
            chart: {
              width: 350,
            },
            legend: {
              fontSize: '12px',
              itemMargin: {
                horizontal: 8,
                vertical: 4,
              },
            },
          },
        },
        {
          breakpoint: 480,
          options: {
            chart: {
              // 100% (e não 280px fixos): a 320px o card tem menos de 280 e a pizza esticava a página
              width: '100%',
            },
            legend: {
              show: false,
            },
          },
        },
      ],
    }),
    [isDarkMode, totalAtualizadoFormatado],
  );

  const series = useMemo(
    () =>
      CATEGORIAS_DONUT.map((c) =>
        Number((distribuicao[c as keyof typeof distribuicao]?.percentual ?? 0).toFixed(2)),
      ),
    [distribuicao],
  );

  const isBelowLg = useIsBelowLg();
  const legendaMobile = useMemo(
    () =>
      CATEGORIAS_DONUT.map((c) => ({
        categoria: c,
        label: CATEGORIA_LABELS[c],
        cor: CATEGORIA_CORES[c],
        percentual: distribuicao[c as keyof typeof distribuicao]?.percentual ?? 0,
      }))
        .filter((item) => item.percentual > 0)
        .sort((a, b) => b.percentual - a.percentual),
    [distribuicao],
  );

  return (
    <div className="chart-container">
      <div
        className="mx-auto"
        role={isBelowLg ? 'img' : undefined}
        aria-label={
          isBelowLg
            ? `Distribuição por tipo: ${legendaMobile
                .slice(0, 4)
                .map((i) => `${i.label} ${i.percentual.toFixed(1).replace('.', ',')}%`)
                .join(', ')}${legendaMobile.length > 4 ? ' e outros' : ''}`
            : undefined
        }
      >
        <ApexChartWrapper
          options={options}
          series={series}
          type="donut"
          width="100%"
          height="450"
          mobileOptions={MOBILE_OPTIONS}
          mobileHeight={260}
        />
      </div>
      {isBelowLg && legendaMobile.length > 0 && (
        <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 max-[359px]:grid-cols-1">
          {legendaMobile.map((item) => (
            <li key={item.categoria} className="flex min-w-0 items-center gap-1.5 text-[13px]">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/20"
                style={{ backgroundColor: item.cor }}
              />
              <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">
                {item.label}
              </span>
              <span className="shrink-0 font-medium tabular-nums text-gray-800 dark:text-white/90">
                {item.percentual.toLocaleString('pt-BR', {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
                %
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
