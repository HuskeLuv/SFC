import { describe, it, expect } from 'vitest';
import { RECURSO, lerOpcoes, planejar } from '../beta';
import { RECURSO_ORCAMENTO_V2 } from '@/services/cashflow/orcamentoV2/acesso';

describe('scripts/orcamento-v2/beta', () => {
  it('usa o mesmo recurso do gate', () => {
    expect(RECURSO).toBe(RECURSO_ORCAMENTO_V2);
  });

  describe('lerOpcoes', () => {
    it('dry-run por padrão; --aplicar grava', () => {
      expect(lerOpcoes(['--adicionar', 'a@x.com']).aplicar).toBe(false);
      expect(lerOpcoes(['--adicionar', 'a@x.com', '--aplicar']).aplicar).toBe(true);
      // --apply (padrão da Análise) NÃO grava aqui
      expect(lerOpcoes(['--adicionar', 'a@x.com', '--apply']).aplicar).toBe(false);
    });

    it('adicionar/remover com lista por vírgula; motivo e por', () => {
      expect(
        lerOpcoes(['--adicionar', 'a@x.com,b@y.com', '--motivo', 'interno', '--por', 'well']),
      ).toEqual({
        acao: 'adicionar',
        alvos: ['a@x.com', 'b@y.com'],
        motivo: 'interno',
        por: 'well',
        aplicar: false,
      });
      expect(lerOpcoes(['--remover', 'a@x.com']).acao).toBe('remover');
      expect(lerOpcoes(['--listar']).acao).toBe('listar');
    });

    it('sem ação → erro', () => {
      expect(() => lerOpcoes([])).toThrow(/--listar/);
    });
  });

  describe('planejar', () => {
    const a = { id: '11111111-1111-1111-1111-111111111111', email: 'Pedro@X.com' };
    const b = { id: '22222222-2222-2222-2222-222222222222', email: 'pri@y.com' };

    it('adicionar: separa quem entra, quem já está e quem não existe', () => {
      const plano = planejar(
        'adicionar',
        ['pedro@x.com', b.id, 'nao@z.com'],
        [a, b],
        new Set([b.id]),
      );
      expect(plano).toEqual({ mudar: [a], semMudanca: [b], naoEncontrados: ['nao@z.com'] });
    });

    it('remover: só sai quem está na lista; duplicados contam uma vez', () => {
      const plano = planejar(
        'remover',
        ['pedro@x.com', a.id, 'pri@y.com'],
        [a, b],
        new Set([a.id]),
      );
      expect(plano).toEqual({ mudar: [a], semMudanca: [b], naoEncontrados: [] });
    });
  });
});
