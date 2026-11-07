/**
 * Plano mínimo de cada rota da API (gate central das assinaturas, ClickUp 86e2zkhe2).
 *
 * Puro e edge-safe. Quem aplica é exigirPlanoDaRota (src/services/planos/exigirPlano.ts), chamado
 * por requireAuthWithActing; rotas que não passam por ele (Pluggy, Análise de Ativos) chamam
 * exigirPlano explicitamente. Com ASSINATURAS_HABILITADAS desligada nada disto é consultado.
 *
 * Regras:
 *  - Vence o PREFIXO MAIS LONGO que casa com o pathname.
 *  - Prefixo sem '-' no fim casa por segmento: '/api/historico' casa '/api/historico/ativos', mas
 *    NÃO '/api/historico-alteracoes'. Prefixo terminado em '-' casa o começo do segmento
 *    ('/api/analises/ir-' casa '/api/analises/ir-mensal').
 *  - 'isento' = fora do gate (auth, admin, cron, webhooks, assinaturas…); 'basic' = liberado a
 *    todo usuário logado; { need, livre } = exige o plano, menos nos métodos de `livre` (quem caiu
 *    de plano ainda pode EXCLUIR ativos, decisão 6 de 07/11).
 *  - Toda rota de src/app/api/** precisa estar classificada (acessoRotas.cobertura.test.ts).
 */
import type { Plano, PlanoPago } from '@/lib/planos';

export type AcessoRota =
  | 'isento'
  | Plano
  | {
      need: PlanoPago;
      /** Métodos HTTP liberados para qualquer plano (ex.: ['DELETE']). */
      livre?: readonly string[];
    };

const PRO_DELETE_LIVRE: AcessoRota = { need: 'pro', livre: ['DELETE'] };

export const ACESSO_ROTAS: Readonly<Record<string, AcessoRota>> = {
  // ── Fora do gate ────────────────────────────────────────────────────────────
  '/api/admin': 'isento',
  '/api/assinaturas': 'isento',
  '/api/auth': 'isento',
  '/api/comunidade': 'isento', // flag COMUNIDADE_HABILITADA desligada (sugestão: Pro ao ligar)
  '/api/consultant': 'isento',
  '/api/cron': 'isento',
  '/api/csat': 'isento',
  '/api/dashboard': 'isento', // só role consultant (requireRole)
  '/api/health': 'isento',
  '/api/institutions': 'isento',
  '/api/public': 'isento',
  '/api/version': 'isento',
  '/api/webhooks': 'isento',

  // ── Basic: tudo do dia a dia ────────────────────────────────────────────────
  '/api/agenda': 'basic',
  '/api/assistente': 'basic', // cota mensal por plano em src/services/assistente/limite.ts
  '/api/calendar': 'basic',
  '/api/cashflow': 'basic', // inclui cashflow/investimentos e evolucao-patrimonio (só leitura)
  '/api/dividas': 'basic',
  '/api/educacao': 'basic', // todo conteúdo publicado é nível 0 (F4 deriva o nível do plano)
  '/api/historico-alteracoes': 'basic', // Desfazer sempre liberado
  '/api/notifications': 'basic',
  '/api/pluggy': 'basic', // limite de conexões no connect-token/connections
  '/api/preferencias': 'basic',
  '/api/profile': 'basic', // exportação e exclusão de conta sempre liberadas
  '/api/push': 'basic',
  '/api/relatorios/financeiro': 'basic', // cadeado por bloco no próprio route.ts
  '/api/saude-financeira/config': 'basic',
  '/api/analises/indicadores': 'basic',
  '/api/analises/indices': 'basic',

  // ── Pro: carteira, planejamento, Análise de Ativos ──────────────────────────
  '/api/carteira': PRO_DELETE_LIVRE,
  '/api/ativos': PRO_DELETE_LIVRE,
  '/api/historico': PRO_DELETE_LIVRE,
  '/api/tesouro-direto': PRO_DELETE_LIVRE,
  '/api/assets': PRO_DELETE_LIVRE,
  '/api/analises/rentabilidade-janelas': 'pro',
  '/api/analises/carteira-historico': 'pro',
  '/api/analises/portfolio-goal': 'pro',
  '/api/aposentadoria': 'pro',
  '/api/planejamento': 'pro',
  '/api/planejamento-sonhos': 'pro',
  '/api/relatorios/movimentacoes': 'pro',
  '/api/pluggy/carteira': 'pro', // exigirPlano explícito (Pluggy não usa requireAuthWithActing)
  '/api/analise-ativos': 'pro', // exigirAcessoAnalise chama exigirPlano depois das flags

  // ── Advanced: análise da carteira, IR, Saúde Financeira ─────────────────────
  '/api/analises/proventos': 'adv',
  '/api/analises/risco-retorno': 'adv',
  '/api/analises/sensibilidade-carteira': 'adv',
  '/api/analises/cobertura-fgc': 'adv',
  '/api/analises/ir-': 'adv',
  '/api/saude-financeira': 'adv',
};

function casaPrefixo(pathname: string, prefixo: string): boolean {
  if (prefixo.endsWith('-')) return pathname.startsWith(prefixo);
  return pathname === prefixo || pathname.startsWith(`${prefixo}/`);
}

function normalizar(pathname: string): string {
  const semQuery = pathname.split(/[?#]/, 1)[0];
  return semQuery.length > 1 ? semQuery.replace(/\/+$/, '') : semQuery;
}

/** Prefixo vencedor (o mais longo) e a classificação; null = rota não classificada. */
export function classificarRota(pathname: string): { prefixo: string; acesso: AcessoRota } | null {
  const caminho = normalizar(pathname);
  let melhor: string | null = null;
  for (const prefixo of Object.keys(ACESSO_ROTAS)) {
    if (casaPrefixo(caminho, prefixo) && (melhor === null || prefixo.length > melhor.length)) {
      melhor = prefixo;
    }
  }
  return melhor === null ? null : { prefixo: melhor, acesso: ACESSO_ROTAS[melhor] };
}

/**
 * Plano pago que a rota exige para o método, ou null quando não exige nada (isento, basic,
 * método livre ou rota não classificada — esta última o teste de cobertura impede).
 */
export function planoExigidoPelaRota(pathname: string, method: string = 'GET'): PlanoPago | null {
  const c = classificarRota(pathname);
  if (!c) return null;
  const { acesso } = c;
  if (acesso === 'isento' || acesso === 'basic') return null;
  if (acesso === 'pro' || acesso === 'adv') return acesso;
  if (acesso.livre?.includes(method.toUpperCase())) return null;
  return acesso.need;
}
