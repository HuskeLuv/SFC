import type { ApexOptions } from 'apexcharts';

/**
 * Pizzas das abas da carteira no celular (PWA fase 1): legenda embaixo e legível, sem rótulos em
 * cima das fatias. O Apex aplica o bloco quando a largura é MENOR que o breakpoint, então 1024
 * cobre tudo abaixo de lg (até 1023px) e o desktop não muda.
 */
export const PIE_MOBILE_RESPONSIVE: NonNullable<ApexOptions['responsive']>[number] = {
  breakpoint: 1024,
  options: {
    chart: { height: 340 },
    legend: {
      position: 'bottom',
      fontSize: '12px',
      markers: { size: 5 },
      itemMargin: { horizontal: 8, vertical: 4 },
    },
    dataLabels: { enabled: false },
  },
};
