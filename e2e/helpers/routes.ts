/**
 * Inventário de rotas para os testes de layout (PWA fase 0).
 *
 * Toda rota nova do app deve entrar numa destas listas: autenticada fixa, atrás de flag,
 * pública, dinâmica (resolvida em runtime) ou fora de escopo — com o motivo.
 */

/** Rotas autenticadas fixas (usuário demo, sem personificação). */
export const AUTH_STATIC_ROUTES = [
  '/carteira',
  '/fluxodecaixa',
  '/planejamento-financeiro',
  '/saude-financeira',
  '/dividas',
  '/calendario',
  '/profile',
  '/historico-alteracoes',
  '/relatorios',
  '/educacao',
] as const;

/** Atrás de flag de ambiente: pula se redirecionar ou não responder 200. */
export const FLAGGED_ROUTES = ['/conexoes-bancarias', '/comunidade'] as const;

/** Sem sessão (storageState vazio). `/` sem sessão cai em /signin (LANDING_PUBLICA=false). */
export const PUBLIC_ROUTES = [
  '/',
  '/signin',
  '/signup',
  '/reset-password',
  '/politica-de-privacidade',
  '/termos-de-uso',
  '/subprocessadores',
] as const;

/** Fora do escopo dos testes automáticos, com o motivo. */
export const OUT_OF_SCOPE_ROUTES: Record<string, string> = {
  '/admin': 'só papel admin; o usuário demo é cliente (painel só leitura, uso em desktop)',
  '/consultor': 'só papel consultor; entra no plano da fase 4 (consultor no celular)',
  '/consultor/[clientId]': 'só papel consultor, com cliente vinculado',
  '/dashboard/consultor': 'só papel consultor',
  '/dashboard/consultor/[clientId]': 'só papel consultor, com cliente vinculado',
  '/comunidade/[id]': 'depende de post existente; coberto pela fatia da comunidade',
  '/comunidade/moderacao': 'só cargo de equipe/moderação',
};

/** Rota dinâmica resolvida a partir de um link de outra página. */
export interface DynamicRoute {
  /** Nome estável do teste. */
  name: string;
  /** Página onde procurar o link. */
  from: string;
  /** Seletor do link (o primeiro visível ou não é usado). */
  linkSelector: string;
  /** Transforma o href encontrado na rota a medir. */
  toRoute?: (href: string) => string;
  /** Botões (nome exato) a clicar, em ordem, até o link aparecer — ex.: abas da carteira. */
  reveal?: string[];
  /**
   * Abaixo de lg, o link pode ficar dentro de um cartão fechado (PWA fase 1): seletor do botão que
   * abre o cartão, clicado (se visível) quando a aba não mostra o link.
   */
  expand?: string;
}

/** Botão que abre um cartão fechado da carteira no celular (ResponsiveCardList). */
const CARD_TOGGLE_FECHADO = '[data-mf-card-toggle][aria-expanded="false"]';

/** Abas da /carteira onde costuma haver ativos com link para /ativos/{id}. */
const CARTEIRA_TABS = ['Ações', "FII's", 'Renda Fixa', 'Fundos', "ETF's", 'Stocks'];

export const DYNAMIC_ROUTES: DynamicRoute[] = [
  {
    name: '/ativos/{id}',
    from: '/carteira',
    linkSelector: 'a[href^="/ativos/"]',
    reveal: CARTEIRA_TABS,
    expand: CARD_TOGGLE_FECHADO,
  },
  {
    name: '/ativos/{id}/editar',
    from: '/carteira',
    linkSelector: 'a[href^="/ativos/"]',
    reveal: CARTEIRA_TABS,
    expand: CARD_TOGGLE_FECHADO,
    toRoute: (href) => `${href.split('?')[0].replace(/\/$/, '')}/editar`,
  },
  { name: '/educacao/{slug}', from: '/educacao', linkSelector: 'a[href^="/educacao/"]' },
];

/**
 * Seletor que indica "página montada" (o helper exige que esteja visível E tenha texto). O layout
 * do app não tem <main> hoje (a casca da fatia B pode acrescentar), então o padrão aceita qualquer
 * título (h1–h3; a /profile só tem <h3>) FORA da sidebar — o <h2>Menu</h2> do <aside> existe desde
 * o primeiro paint e faria o teste medir o spinner/skeleton.
 */
export const DEFAULT_READY_SELECTOR = 'main h1, main h2, :is(h1, h2, h3):not(aside *)';

export const READY_SELECTOR: Record<string, string> = {
  // A /carteira mostra um spinner por ~10s antes do cabeçalho real (onde está o transbordo).
  // Fase 1: o h1 continua visível no celular (compacto); `[data-mf-carteira-ready]` (fatia A)
  // também serve. `.sr-only` fica de fora: um h1 de 1px não prova que a página montou.
  '/carteira':
    ':is(h1, h2):has-text("Carteira de Investimentos"):not(.sr-only), [data-mf-carteira-ready]',
  // FullCalendar é carregado sob demanda e os eventos chegam depois; o transbordo só aparece com
  // os eventos na tela (nomes longos). Abaixo de 768px a visão inicial é a LISTA
  // (AgendaFullCalendar) — é ela que um celular vê. O usuário demo tem parcelas de dívida todo mês.
  // Se não houver evento (ou o mount abrir a visão de mês), a espera estoura e o teste falha.
  // Lista vazia também é conteúdo (o usuário do seed no CI não tem eventos).
  '/calendario': '.fc-list-event, .fc-list-empty',
  // A planilha não tem título <h1>/<h2>: espera a primeira linha da tabela (desktop) ou a visão
  // do mês montada (celular, PWA fase 2).
  '/fluxodecaixa': 'table tbody tr, [data-mf-fluxo-ready]',
  '/signin': 'form',
  '/signup': 'form',
  '/reset-password': 'form',
  '/': 'form, h1',
};

export const readySelectorFor = (route: string): string => {
  const path = route.split('?')[0];
  return READY_SELECTOR[path] ?? DEFAULT_READY_SELECTOR;
};
