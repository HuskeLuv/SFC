import { describe, it, expect } from 'vitest';
import { classifyByName } from '../brapiSync';

describe('classifyByName', () => {
  it('classifica FII quando o nome contém "imobil"', () => {
    expect(
      classifyByName('Kinea Fundo Fundos de Investimento Imobiliario -FII', 'KFOF11', 'stock'),
    ).toBe('fii');
    expect(
      classifyByName(
        'XP Selection Fundo de Fundos de Investimento Imobiliario - FII',
        'XPSF11',
        'stock',
      ),
    ).toBe('fii');
    expect(
      classifyByName('Hedge Top Fofii 3 Fundo Investimento Imobiliario', 'HFOF11', 'stock'),
    ).toBe('fii');
  });

  it('classifica FII quando "FII" aparece como palavra solta', () => {
    expect(classifyByName('Generic Real Estate FII', 'XXXX11', 'stock')).toBe('fii');
  });

  it('reclassifica units como stock mesmo se ticker termina em 11', () => {
    expect(classifyByName('Energisa SA Units Cons of 1 Sh + 4 Pfd Shs', 'ENGI11', 'fii')).toBe(
      'stock',
    );
    expect(
      classifyByName(
        'Banco Santander (Brasil) S.A. Units Cons of 1 Sh + 1 Pfd Sh',
        'SANB11',
        'fii',
      ),
    ).toBe('stock');
    expect(
      classifyByName('Banco BTG Pactual SA Units Cons of 1 Sh + 2 Pfd Shs A', 'BPAC11', 'fii'),
    ).toBe('stock');
    // "Unit" singular também (BRAPI usa pra ALUP11)
    expect(
      classifyByName('Alupar Investimento SA Unit Cons of 1 Sh + 2 Pfd Shs', 'ALUP11', 'fii'),
    ).toBe('stock');
  });

  it('NÃO confunde "United" com "Unit"', () => {
    expect(classifyByName('United Health Group Inc', 'UNHH34', 'stock')).toBe('bdr');
  });

  it('classifica ETF quando "ETF" aparece word-bounded ou contém iShares', () => {
    expect(classifyByName('IT NOW ID ETF IMA-B Fundo De Indice', 'IMAB11', 'fii')).toBe('etf');
    expect(classifyByName('iShares S&P 500 Fundo de Investimento em Cotas', 'IVVB11', 'fii')).toBe(
      'etf',
    );
    expect(classifyByName('Trend ETF Ibovespa Fundo de Indice', 'BOVX11', 'fii')).toBe('etf');
  });

  it('NÃO classifica como REIT quando o nome contém "direitos" (creditórios/infra)', () => {
    // KDIF11 e IFRA11 são fundos de direitos creditórios/infra, não REIT
    expect(
      classifyByName(
        'Kinea Infra Fundo Investimento Cotas Fundos Investimento Direitos Creditorios',
        'KDIF11',
        'fii',
      ),
    ).toBe('fii'); // mantém o tipo atual (não há sinal claro de outro tipo)
    expect(
      classifyByName(
        'Itau Fundo de Investimento em Cotas de Fundos de Investimento Direitos Creditorios',
        'IFRA11',
        'fii',
      ),
    ).toBe('fii');
  });

  it('classifica REIT quando "REIT" aparece word-bounded', () => {
    expect(classifyByName('Apartment Investment & Management Co REIT', 'AIVA34', 'stock')).toBe(
      'reit',
    );
  });

  it('classifica BDR quando o ticker termina em 34 e nome não tem outro sinal', () => {
    expect(classifyByName('Apple Inc', 'AAPL34', 'stock')).toBe('bdr');
  });

  it('mantém currentType quando o nome não dá sinal e symbol não é especial', () => {
    expect(classifyByName('Petroleo Brasileiro SA Petrobras', 'PETR4', 'stock')).toBe('stock');
    expect(classifyByName('Vale SA', 'VALE3', 'stock')).toBe('stock');
  });

  it('mantém currentType quando nome vem vazio (sem sinal pra reclassificar)', () => {
    expect(classifyByName('', 'KFOF11', 'fii')).toBe('fii');
    expect(classifyByName('', 'ENGI11', 'stock')).toBe('stock');
  });

  it('mantém currentType quando nome === symbol (BRAPI list fallback)', () => {
    expect(classifyByName('KFOF11', 'KFOF11', 'fii')).toBe('fii');
  });
});
