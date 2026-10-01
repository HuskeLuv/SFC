import { describe, expect, it } from 'vitest';
import {
  cnpjDoInicioDaLinha,
  cnpjOuOriginal,
  normalizarCnpj,
} from '@/services/analiseAtivos/regras/comum/cnpj';

describe('CNPJ em 14 dígitos sem máscara (formato único das tabelas da fase)', () => {
  it('máscara da CVM ou dígitos da B3 ⇒ 14 dígitos; inválido ⇒ null', () => {
    expect(normalizarCnpj('84.429.695/0001-11')).toBe('84429695000111');
    expect(normalizarCnpj('84429695000111')).toBe('84429695000111');
    expect(normalizarCnpj(' 00.000.000/0001-91 ')).toBe('00000000000191');
    expect(normalizarCnpj('00.000.000/0000-00')).toBeNull();
    expect(normalizarCnpj('123')).toBeNull();
    expect(normalizarCnpj(null)).toBeNull();
    expect(cnpjOuOriginal('lixo')).toBe('lixo');
  });

  it('preFiltro: CNPJ do 1º campo da linha crua', () => {
    expect(cnpjDoInicioDaLinha('84.429.695/0001-11;2025-12-31;1;WEG')).toBe('84429695000111');
    expect(cnpjDoInicioDaLinha('CNPJ_CIA;DT_REFER')).toBeNull();
  });
});
