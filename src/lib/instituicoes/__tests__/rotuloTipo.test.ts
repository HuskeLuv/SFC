import { describe, it, expect } from 'vitest';
import { rotuloTipoInstituicao } from '../rotuloTipo';

describe('rotuloTipoInstituicao', () => {
  it.each([
    ['B1', 'Banco'],
    ['B2', 'Banco'],
    ['B4', 'Banco'],
    ['N1', 'Financeira'],
    ['B3S', 'Cooperativa'],
    ['B3C', 'Cooperativa'],
    ['N2', 'Corretora'],
    ['N4', 'Instituição de pagamento'],
  ])('%s → %s', (tipo, rotulo) => expect(rotuloTipoInstituicao(tipo)).toBe(rotulo));

  it('null, NAO_EMISSOR e desconhecido → null', () => {
    expect(rotuloTipoInstituicao(null)).toBeNull();
    expect(rotuloTipoInstituicao('NAO_EMISSOR')).toBeNull();
    expect(rotuloTipoInstituicao('X9')).toBeNull();
  });
});
