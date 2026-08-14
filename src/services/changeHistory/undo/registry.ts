/**
 * Registry central action → UndoDefinition. Ação fora do registry = sem
 * botão de desfazer (e 400 no POST).
 *
 * NUNCA registrar: 'senha.alterar' e '2fa.*' (reverter credenciais via
 * histórico é vetor de ataque em sessão roubada); 'ativo.editar' (edição
 * multi-entidade sem before único); 'valores.editar-lote' e
 * 'aposentadoria-aporte.auto' (bulk sem before).
 *
 * As adições compostas da carteira ('operacao/aporte/resgate/investimento
 * .registrar') eram proibidas na v2 ("reverter parcialmente é pior que não
 * reverter") — desde ago/2026 são registradas: o inverso delas é o mesmo
 * caminho do DELETE canônico (apagar a transação criada + recalc resolve
 * Portfolio/FI/snapshots), ver handlers/carteira.ts.
 */

import type { UndoDefinition } from './types';
import { CARTEIRA_UNDO_HANDLERS } from './handlers/carteira';
import { FLUXO_CAIXA_UNDO_HANDLERS } from './handlers/fluxoCaixa';
import { PLANEJAMENTO_UNDO_HANDLERS } from './handlers/planejamento';
import { DIVIDAS_UNDO_HANDLERS } from './handlers/dividas';
import { SAUDE_FINANCEIRA_UNDO_HANDLERS } from './handlers/saudeFinanceira';
import { PERFIL_UNDO_HANDLERS } from './handlers/perfil';

export const UNDO_REGISTRY: Record<string, UndoDefinition> = {
  ...CARTEIRA_UNDO_HANDLERS,
  ...FLUXO_CAIXA_UNDO_HANDLERS,
  ...PLANEJAMENTO_UNDO_HANDLERS,
  ...DIVIDAS_UNDO_HANDLERS,
  ...SAUDE_FINANCEIRA_UNDO_HANDLERS,
  ...PERFIL_UNDO_HANDLERS,
};
