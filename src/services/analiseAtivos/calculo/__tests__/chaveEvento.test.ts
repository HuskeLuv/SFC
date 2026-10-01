import { describe, expect, it } from 'vitest';
import { chaveEvento } from '@/services/analiseAtivos/calculo/gravarDerivados';

describe('chaveEvento (regravação de asset_corporate_action_checks)', () => {
  it('mesmo evento com CNPJ mascarado (formato antigo) ⇒ chave diferente: o símbolo é regravado', () => {
    const base = {
      symbol: 'WEGE3',
      dataEvento: '2021-04-15',
      fator: 2,
      tipo: 'DESDOBRAMENTO',
      anoBase: 2021,
      status: 'confirmado',
      razaoCvm: 2,
      idsOrigem: ['a'],
    };
    expect(chaveEvento({ ...base, cnpj: '84.429.695/0001-11' })).not.toBe(
      chaveEvento({ ...base, cnpj: '84429695000111' }),
    );
    expect(chaveEvento({ ...base, cnpj: '84429695000111' })).toBe(
      chaveEvento({ ...base, cnpj: '84429695000111' }),
    );
  });
});
