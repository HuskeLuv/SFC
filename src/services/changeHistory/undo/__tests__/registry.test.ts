import { describe, it, expect, vi } from 'vitest';

// O registry importa os handlers, que importam prisma/serviços — mocka tudo.
vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));
vi.mock('@/services/portfolio/portfolioRecalculation', () => ({
  recalculatePortfolioFromTransactions: vi.fn(),
  invalidatePortfolioSnapshots: vi.fn(),
}));
vi.mock('@/services/planejamento/sonhoCashflowSync', () => ({
  syncObjetivoToCashflow: vi.fn(),
  syncObjetivoRecordToCashflow: vi.fn(),
  removeObjetivoCashflow: vi.fn(),
}));
vi.mock('@/services/planejamento/carteiraToSonhoRealizado', () => ({
  syncSonhoRealizadoBestEffort: vi.fn(),
}));

import { UNDO_REGISTRY } from '../registry';

describe('UNDO_REGISTRY', () => {
  it('toda definição tem strategy, requires e execute', () => {
    for (const [action, def] of Object.entries(UNDO_REGISTRY)) {
      expect(def.strategy, action).toBeDefined();
      expect(def.requires, action).toBeDefined();
      expect(typeof def.execute, action).toBe('function');
    }
  });

  it('ações proibidas NUNCA entram no registry', () => {
    const forbidden = [
      'senha.alterar',
      '2fa.ativar',
      '2fa.desativar',
      'operacao.registrar',
      'investimento.registrar',
      'aporte.registrar',
      'resgate.registrar',
      'ativo.editar',
      'valores.editar-lote',
      'aposentadoria-aporte.auto',
    ];
    for (const action of forbidden) {
      expect(UNDO_REGISTRY[action], action).toBeUndefined();
    }
  });

  it('cobre as ações reversíveis planejadas', () => {
    const expected = [
      'transacao.editar',
      'transacao.excluir',
      'ativo.remover',
      'provento.adicionar',
      'provento.editar',
      'provento.excluir',
      'caixa-investir.atualizar',
      'resumo.atualizar',
      'imovel-bem.atualizar-valor',
      'fundo.atualizar-valor',
      'objetivo-classe.definir',
      'valor.editar',
      'comentario.editar',
      'item.criar',
      'item.editar',
      'item.excluir',
      'grupo.criar',
      'grupo.editar',
      'grupo.excluir',
      'lancamento.editar',
      'lancamento.excluir',
      'sonho.criar',
      'sonho.editar',
      'sonho.excluir',
      'sonho-aporte.registrar',
      'sonho-aporte.excluir',
      'aposentadoria.editar',
      'aposentadoria-aporte.registrar',
      'aposentadoria-aporte.excluir',
      'perfil.editar',
    ];
    for (const action of expected) {
      expect(UNDO_REGISTRY[action], action).toBeDefined();
    }
  });
});
