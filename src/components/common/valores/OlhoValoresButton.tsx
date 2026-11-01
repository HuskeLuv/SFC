'use client';

import React from 'react';
import { useValoresOcultos } from '@/context/ValoresOcultosContext';

/**
 * Botão de olho do "esconder valores" (decisões 8 e 13): no MobileHeader logo antes do sino
 * (`variant="mobile"`, raio 12px) e no rodapé da sidebar ao lado do tema (`variant="sidebar"`,
 * redondo com borda, igual ao ThemeToggleButton). 44×44 nos dois.
 *
 * O ícone mostra o estado atual (olho aberto = visíveis; olho cortado = ocultos). Nome fixo
 * "Esconder valores" + aria-pressed; o title alterna. Sem a flag não renderiza nada.
 */

const PATH_OLHO =
  'M10.0002 13.8619C7.23361 13.8619 4.86803 12.1372 3.92328 9.70241C4.86804 7.26761 7.23361 5.54297 10.0002 5.54297C12.7667 5.54297 15.1323 7.26762 16.0771 9.70243C15.1323 12.1372 12.7667 13.8619 10.0002 13.8619ZM10.0002 4.04297C6.48191 4.04297 3.49489 6.30917 2.4155 9.4593C2.3615 9.61687 2.3615 9.78794 2.41549 9.94552C3.49488 13.0957 6.48191 15.3619 10.0002 15.3619C13.5184 15.3619 16.5055 13.0957 17.5849 9.94555C17.6389 9.78797 17.6389 9.6169 17.5849 9.45932C16.5055 6.30919 13.5184 4.04297 10.0002 4.04297ZM9.99151 7.84413C8.96527 7.84413 8.13333 8.67606 8.13333 9.70231C8.13333 10.7286 8.96527 11.5605 9.99151 11.5605H10.0064C11.0326 11.5605 11.8646 10.7286 11.8646 9.70231C11.8646 8.67606 11.0326 7.84413 10.0064 7.84413H9.99151Z';

const PATH_OLHO_CORTADO =
  'M4.63803 3.57709C4.34513 3.2842 3.87026 3.2842 3.57737 3.57709C3.28447 3.86999 3.28447 4.34486 3.57737 4.63775L4.85323 5.91362C3.74609 6.84199 2.89363 8.06395 2.4155 9.45936C2.3615 9.61694 2.3615 9.78801 2.41549 9.94558C3.49488 13.0957 6.48191 15.3619 10.0002 15.3619C11.255 15.3619 12.4422 15.0737 13.4994 14.5598L15.3625 16.4229C15.6554 16.7158 16.1302 16.7158 16.4231 16.4229C16.716 16.13 16.716 15.6551 16.4231 15.3622L4.63803 3.57709ZM12.3608 13.4212L10.4475 11.5079C10.3061 11.5423 10.1584 11.5606 10.0064 11.5606H9.99151C8.96527 11.5606 8.13333 10.7286 8.13333 9.70237C8.13333 9.5461 8.15262 9.39434 8.18895 9.24933L5.91885 6.97923C5.03505 7.69015 4.34057 8.62704 3.92328 9.70247C4.86803 12.1373 7.23361 13.8619 10.0002 13.8619C10.8326 13.8619 11.6287 13.7058 12.3608 13.4212ZM16.0771 9.70249C15.7843 10.4569 15.3552 11.1432 14.8199 11.7311L15.8813 12.7925C16.6329 11.9813 17.2187 11.0143 17.5849 9.94561C17.6389 9.78803 17.6389 9.61696 17.5849 9.45938C16.5055 6.30925 13.5184 4.04303 10.0002 4.04303C9.13525 4.04303 8.30244 4.17999 7.52218 4.43338L8.75139 5.66259C9.1556 5.58413 9.57311 5.54303 10.0002 5.54303C12.7667 5.54303 15.1323 7.26768 16.0771 9.70249Z';

/** Ícone do olho (aberto = visíveis, cortado = ocultos), mesmo desenho de src/icons/eye*.svg. */
export function IconeOlhoValores({ cortado, size = 20 }: { cortado: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path fillRule="evenodd" clipRule="evenodd" d={cortado ? PATH_OLHO_CORTADO : PATH_OLHO} />
    </svg>
  );
}

const BASE =
  'flex h-11 w-11 shrink-0 items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-mf-outside dark:focus-visible:ring-mf-tranquilidade [&>svg]:transition-transform [&>svg]:duration-150 [&>svg]:ease-out active:[&>svg]:scale-90 motion-reduce:[&>svg]:transition-none';

const VARIANTES = {
  mobile: {
    forma: 'rounded-xl',
    repouso: 'text-gray-700 active:bg-gray-100 dark:text-gray-300 dark:active:bg-white/5',
    ligado: 'bg-[#EDF2F8] text-mf-seguranca dark:bg-mf-tranquilidade/14 dark:text-mf-escolha',
  },
  sidebar: {
    forma: 'rounded-full border',
    repouso:
      'border-gray-200 bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white',
    ligado:
      'border-[#DCE6F2] bg-[#EDF2F8] text-mf-seguranca dark:border-mf-tranquilidade/35 dark:bg-mf-tranquilidade/14 dark:text-mf-escolha',
  },
} as const;

export function OlhoValoresButton({ variant }: { variant: 'mobile' | 'sidebar' }) {
  const { habilitado, ocultos, alternar } = useValoresOcultos();
  if (!habilitado) return null;
  const v = VARIANTES[variant];
  return (
    <button
      type="button"
      onClick={alternar}
      aria-label="Esconder valores"
      aria-pressed={ocultos}
      title={ocultos ? 'Mostrar valores' : 'Esconder valores'}
      data-mf-olho-valores={variant}
      className={`${BASE} ${v.forma} ${ocultos ? v.ligado : v.repouso}`}
    >
      <IconeOlhoValores cortado={ocultos} size={variant === 'mobile' ? 22 : 20} />
    </button>
  );
}

export default OlhoValoresButton;
