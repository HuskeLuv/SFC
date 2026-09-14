/**
 * Configuração da integração com o Pluggy (agregador Open Finance).
 *
 * Só lê variáveis de ambiente — NÃO importa o SDK. O middleware (Edge) usa
 * este módulo para montar a CSP; o SDK (Node) vive em `@/lib/pluggy`.
 *
 * Variáveis (receita completa em docs/pluggy-dev-setup.md):
 *  - PLUGGY_HABILITADO="true"       liga o webhook, o status e os hosts na CSP
 *  - PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET   credenciais do dashboard (servidor)
 *  - PLUGGY_WEBHOOK_SECRET          valor do header X-Webhook-Secret exigido em
 *                                   POST /api/webhooks/pluggy (configurado no webhook do Pluggy)
 *  - PLUGGY_INCLUI_SANDBOX="true"   lista conectores de sandbox (só dev)
 */

/** Hosts do widget Pluggy Connect (iframe/modal + script do CDN). */
export const PLUGGY_CONNECT_HOSTS = 'https://connect.pluggy.ai https://cdn.pluggy.ai';
/** API pública — o widget e o browser SDK falam com ela direto. */
export const PLUGGY_API_HOSTS = 'https://api.pluggy.ai';
/** IP fixo de saída dos webhooks (docs.pluggy.ai/docs/webhooks). */
export const PLUGGY_WEBHOOK_IPS: readonly string[] = ['52.67.145.81'];
/** Header customizado configurado no webhook (só via API do Pluggy). */
export const PLUGGY_WEBHOOK_HEADER = 'x-webhook-secret';

export interface PluggyCredenciais {
  clientId: string;
  clientSecret: string;
}

export function pluggyCredenciais(): PluggyCredenciais | null {
  const clientId = process.env.PLUGGY_CLIENT_ID?.trim();
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** Flag + credenciais, no mesmo espírito de `assistenteHabilitado()`. */
export function pluggyHabilitado(): boolean {
  return process.env.PLUGGY_HABILITADO === 'true' && pluggyCredenciais() !== null;
}

export function pluggyIncluiSandbox(): boolean {
  return process.env.PLUGGY_INCLUI_SANDBOX === 'true';
}

export function pluggyWebhookSecret(): string | null {
  const s = process.env.PLUGGY_WEBHOOK_SECRET?.trim();
  return s ? s : null;
}
