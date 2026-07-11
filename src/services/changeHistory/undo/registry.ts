/**
 * Registry central action → UndoDefinition. Ação fora do registry = sem
 * botão de desfazer (e 400 no POST).
 *
 * NUNCA registrar: 'senha.alterar' e '2fa.*' (reverter credenciais via
 * histórico é vetor de ataque em sessão roubada); composites de carteira
 * ('operacao/investimento/aporte/resgate.registrar' — criam Asset+Portfolio+
 * transação e debitam caixa; reverter parcialmente é pior que não reverter);
 * 'ativo.editar' (edição multi-entidade sem before único);
 * 'valores.editar-lote' e 'aposentadoria-aporte.auto' (bulk sem before).
 */

import type { UndoDefinition } from './types';
import { CARTEIRA_UNDO_HANDLERS } from './handlers/carteira';

export const UNDO_REGISTRY: Record<string, UndoDefinition> = {
  ...CARTEIRA_UNDO_HANDLERS,
};
