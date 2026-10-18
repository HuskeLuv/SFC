/**
 * Estilos compartilhados das pílulas, segmentos e abas da Análise de Ativos (ticket do Pedro, 16/10:
 * "está tudo muito apagado"). Segue o protótipo HTML dele: `.pill.on` (pílula selecionada
 * PREENCHIDA de azul, texto branco) e `.ptabs span.on` (aba ativa preenchida escura).
 *
 * Só cores da paleta (src/constants/brandColors.ts): patrimonio #396CAA, seguranca #314666,
 * tranquilidade #6E9DC4, escolha #EAEAEA, potencia #2D2D2D + cinzas do app. Dark mode por classe
 * (ThemeContext): no escuro, tons CLAROS da paleta (navy some no fundo escuro).
 *
 * Contraste: branco sobre #396CAA ≈ 5,3:1; #2D2D2D sobre #6E9DC4 ≈ 5,6:1; branco sobre #314666
 * ≈ 10:1.
 *
 * - PILULA_*: pílulas com borda (janela 3/5/10 anos, A–Z / coluna, Tijolo | Papel).
 * - SEGMENTO_*: botões dentro de um trilho cinza (Resumo | Detalhado, 1A/3A/5A/10A/Máx).
 * - ABA_AREA_*: abas da área (Quadro | Comparador | Salvos).
 */

export const PILULA_LIGADA =
  'border-[#396CAA] bg-[#396CAA] font-semibold text-white dark:border-[#6E9DC4] dark:bg-[#6E9DC4] dark:text-[#2D2D2D]';

export const PILULA_DESLIGADA =
  'border-gray-300 bg-white font-medium text-gray-800 hover:border-[#396CAA] hover:text-[#314666] dark:border-gray-600 dark:bg-transparent dark:text-gray-200 dark:hover:border-[#6E9DC4] dark:hover:text-white';

export const SEGMENTO_LIGADO =
  'bg-[#396CAA] font-semibold text-white shadow-sm dark:bg-[#6E9DC4] dark:text-[#2D2D2D]';

export const SEGMENTO_DESLIGADO =
  'font-medium text-gray-700 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-white';

export const ABA_AREA_LIGADA =
  'bg-[#314666] text-white shadow-sm dark:bg-[#EAEAEA] dark:text-[#2D2D2D]';

export const ABA_AREA_DESLIGADA =
  'text-[#396CAA] hover:bg-white hover:text-[#314666] dark:text-[#6E9DC4] dark:hover:bg-white/[0.06] dark:hover:text-white';

/**
 * Anel de foco das pílulas/segmentos. Com roving tabindex o foco cai na opção SELECIONADA (já
 * preenchida): anel colado no preenchimento parecia só uma pílula maior. Afastado 2 px (offset na
 * cor do card: branco / #1F1F22) e, no escuro, em #EAEAEA (escolha), distinto do #6E9DC4.
 * - ANEL_FOCO_GRUPO: o <button> é `group` e o visual fica no <span> interno.
 * - ANEL_FOCO: o próprio elemento focado leva o visual.
 */
export const ANEL_FOCO_GRUPO =
  'group-focus-visible:ring-2 group-focus-visible:ring-[#0079F2] group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-white dark:group-focus-visible:ring-[#EAEAEA] dark:group-focus-visible:ring-offset-[#1F1F22]';

export const ANEL_FOCO =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0079F2] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-[#EAEAEA] dark:focus-visible:ring-offset-[#1F1F22]';
