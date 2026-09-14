/**
 * Cliente do SDK oficial (`pluggy-sdk`) — singleton por processo.
 *
 * O SDK obtém a API key em POST /auth (válida 2 h) e renova sozinho quando o
 * JWT expira, então basta uma instância. Só roda em rotas Node (runtime
 * 'nodejs'); nunca importar no middleware nem em componentes cliente.
 */
import { PluggyClient } from 'pluggy-sdk';
import { ApiError } from '@/utils/apiErrorHandler';
import { pluggyCredenciais, pluggyHabilitado } from './pluggyConfig';

let client: PluggyClient | null = null;

export function getPluggyClient(): PluggyClient {
  if (!pluggyHabilitado()) {
    throw new ApiError(503, 'Integração com o Pluggy desabilitada');
  }
  if (!client) {
    const cred = pluggyCredenciais();
    if (!cred) throw new ApiError(503, 'Credenciais do Pluggy ausentes');
    client = new PluggyClient({ clientId: cred.clientId, clientSecret: cred.clientSecret });
  }
  return client;
}

/** Descarta o singleton (testes e troca de credenciais em runtime). */
export function resetPluggyClient(): void {
  client = null;
}
