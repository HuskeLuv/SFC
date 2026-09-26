/**
 * Atalhos do "+ Lançar" da barra de abas mobile (PWA fase 0).
 *
 * `kind: 'link'` navega para `href`; `kind: 'sheet'` abre um sheet sem sair da tela (PWA fase 2:
 * "Despesa ou receita" → lançamento rápido do Fluxo). `requires` é o item do menu
 * (useMainNavItems) que precisa existir para o atalho aparecer — assim a personificação e os
 * perfis filtram o + Lançar do mesmo jeito que filtram a sidebar.
 */
export type QuickLaunchId = 'novo-ativo' | 'resgate' | 'fluxo';

interface QuickLaunchBase {
  id: QuickLaunchId;
  label: string;
  description: string;
  requires: 'Carteira' | 'Fluxo de Caixa';
}

export type QuickLaunchAction =
  | (QuickLaunchBase & { kind: 'link'; href: string })
  | (QuickLaunchBase & { kind: 'sheet' });

export const QUICK_LAUNCH_ACTIONS: QuickLaunchAction[] = [
  {
    id: 'novo-ativo',
    label: 'Novo investimento',
    description: 'Compra de ação, FII, título ou fundo',
    kind: 'link',
    href: '/carteira?acao=novo',
    requires: 'Carteira',
  },
  {
    id: 'resgate',
    label: 'Resgatar investimento',
    description: 'Venda ou resgate de uma posição',
    kind: 'link',
    href: '/carteira?acao=resgate',
    requires: 'Carteira',
  },
  {
    id: 'fluxo',
    label: 'Despesa ou receita',
    description: 'Valor, linha do fluxo e mês sem sair da tela',
    kind: 'sheet',
    requires: 'Fluxo de Caixa',
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

/**
 * Atalho pedido já na rota de destino, guardado até alguém consumir. Na Carteira ainda
 * carregando o listener de QUICK_LAUNCH_EVENT não existe (o CarteiraResumo não montou) e o
 * evento se perderia — o CarteiraResumo lê o pendente ao montar. Expira para um toque antigo
 * não abrir o wizard numa visita futura.
 */
const PENDING_TTL_MS = 60_000;
let pendingQuickLaunch: { id: QuickLaunchId; at: number } | null = null;

/** Registra o atalho como pendente e avisa quem já estiver ouvindo. */
export function requestQuickLaunch(id: QuickLaunchId): void {
  pendingQuickLaunch = { id, at: Date.now() };
  window.dispatchEvent(new CustomEvent(QUICK_LAUNCH_EVENT, { detail: id }));
}

/** Devolve (e limpa) o atalho pendente, se ainda não expirou. */
export function takePendingQuickLaunch(): QuickLaunchId | null {
  const pending = pendingQuickLaunch;
  pendingQuickLaunch = null;
  if (!pending || Date.now() - pending.at > PENDING_TTL_MS) return null;
  return pending.id;
}
