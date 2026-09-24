/**
 * Atalhos do "+ Lançar" da barra de abas mobile (PWA fase 0).
 *
 * `href` null = ainda não existe (aparece desabilitado com o selo "Em breve"). `requires` é o
 * item do menu (useMainNavItems) que precisa existir para o atalho aparecer — assim a
 * personificação e os perfis filtram o + Lançar do mesmo jeito que filtram a sidebar.
 */
export type QuickLaunchId = 'novo-ativo' | 'resgate' | 'fluxo';

export interface QuickLaunchAction {
  id: QuickLaunchId;
  label: string;
  description: string;
  href: string | null;
  requires: 'Carteira' | 'Fluxo de Caixa';
  /** Fase do PWA em que o atalho passa a funcionar (só para os desabilitados). */
  phase?: 2;
}

export const QUICK_LAUNCH_ACTIONS: QuickLaunchAction[] = [
  {
    id: 'novo-ativo',
    label: 'Novo investimento',
    description: 'Compra de ação, FII, título ou fundo',
    href: '/carteira?acao=novo',
    requires: 'Carteira',
  },
  {
    id: 'resgate',
    label: 'Resgatar investimento',
    description: 'Venda ou resgate de uma posição',
    href: '/carteira?acao=resgate',
    requires: 'Carteira',
  },
  {
    id: 'fluxo',
    label: 'Despesa ou receita',
    description: 'Valor, categoria e data sem sair da tela',
    href: null,
    requires: 'Fluxo de Caixa',
    phase: 2,
  },
];

/**
 * Evento disparado quando o atalho é tocado já na rota de destino (o Link não remonta a
 * página, então o `?acao=` não seria relido). `detail` = QuickLaunchId.
 */
export const QUICK_LAUNCH_EVENT = 'mf:quick-launch';

/** Valor de `?acao=` na Carteira para cada atalho. */
export const QUICK_LAUNCH_ACAO: Partial<Record<QuickLaunchId, string>> = {
  'novo-ativo': 'novo',
  resgate: 'resgate',
};
