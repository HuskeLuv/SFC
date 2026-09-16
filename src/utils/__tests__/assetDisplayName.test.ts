import { describe, it, expect } from 'vitest';
import { formatAssetDisplayTitle, simplifyAssetName } from '../assetDisplayName';

describe('formatAssetDisplayTitle', () => {
  it('exibe ticker e nome separados por em-dash em ativos normais', () => {
    const r = formatAssetDisplayTitle({ ticker: 'PETR4', nome: 'Petrobras PN' });
    expect(r.full).toBe('PETR4 — Petrobras PN');
    expect(r.ticker).toBe('PETR4');
    expect(r.nome).toBe('Petrobras PN');
  });

  it('omite o nome quando coincide com o ticker', () => {
    const r = formatAssetDisplayTitle({ ticker: 'HGLG11', nome: 'HGLG11' });
    expect(r.full).toBe('HGLG11');
  });

  it('exibe só ticker quando nome está vazio', () => {
    expect(formatAssetDisplayTitle({ ticker: 'PETR4', nome: '' }).full).toBe('PETR4');
    expect(formatAssetDisplayTitle({ ticker: 'PETR4', nome: null }).full).toBe('PETR4');
  });

  // Bug #08
  describe('Bug #08 — title sanitization', () => {
    it('oculta symbol sintético RENDA-FIXA-*', () => {
      const r = formatAssetDisplayTitle(
        { ticker: 'RENDA-FIXA-1778032635345-izwgvhx', nome: 'CRI Banco C6' },
        'Renda Fixa',
      );
      expect(r.full).toBe('CRI Banco C6');
      expect(r.ticker).toBe('');
    });

    it('oculta symbol legado órfão "-{ts}-{uuid}" (baseSymbol vazio antes do fix)', () => {
      const r = formatAssetDisplayTitle(
        { ticker: '-1778032635345-izwgvhx', nome: ' - R$ 35.000 - 17/05/2023' },
        'Renda Fixa',
      );
      // ticker sintético é ocultado e o nome é normalizado removendo hífen/espaço inicial
      expect(r.ticker).toBe('');
      expect(r.full).not.toContain('-1778032635345');
      expect(r.full).not.toMatch(/^[\s\-]/);
      expect(r.full).toContain('R$ 35.000');
    });

    it('aplica fallback quando ticker é sintético e nome só ruído', () => {
      const r = formatAssetDisplayTitle(
        { ticker: '-1778032635345-izwgvhx', nome: ' - ' },
        'Renda Fixa',
      );
      expect(r.full).toBe('Renda Fixa');
    });

    it('aplica fallback quando ambos vazios', () => {
      expect(formatAssetDisplayTitle({ ticker: '', nome: null }, 'Ativo').full).toBe('Ativo');
    });

    it('oculta todos os prefixos sintéticos (RESERVA, PERSONALIZADO, CONTA-CORRENTE, POUPANCA)', () => {
      const prefixes = [
        'RESERVA-EMERG-x',
        'RESERVA-OPORT-y',
        'PERSONALIZADO-z',
        'CONTA-CORRENTE-a',
        'POUPANCA-b',
      ];
      for (const p of prefixes) {
        const r = formatAssetDisplayTitle({ ticker: p, nome: 'Nome OK' });
        expect(r.ticker).toBe('');
        expect(r.full).toBe('Nome OK');
      }
    });

    it('preserva tickers reais B3 e cripto', () => {
      expect(formatAssetDisplayTitle({ ticker: 'BOVA11', nome: '' }).full).toBe('BOVA11');
      expect(formatAssetDisplayTitle({ ticker: 'BTC', nome: 'Bitcoin' }).full).toBe(
        'BTC — Bitcoin',
      );
    });
  });
});

describe('simplifyAssetName (nomes simplificados nas abas, 16/09/2026)', () => {
  it('remove o sufixo "- R$ valor - data" dos ativos manuais', () => {
    expect(simplifyAssetName('CDB Teste 110% CDI - R$ 10.000 - 01/07/2025')).toBe(
      'CDB Teste 110% CDI',
    );
    expect(simplifyAssetName('Tesouro Selic 2030 - R$ 2.000 - 31/05/2026')).toBe(
      'Tesouro Selic 2030',
    );
    expect(simplifyAssetName('Apartamento Teste - R$ 500.000 - 31/05/2026')).toBe(
      'Apartamento Teste',
    );
  });

  it('remove sufixo em dólar (REIT manual) e sufixo só de data', () => {
    expect(simplifyAssetName('Realty Income - $1,000 - 1/7/2025')).toBe('Realty Income');
    expect(simplifyAssetName('Fundo XP Macro - US$ 500 - 01/07/2025')).toBe('Fundo XP Macro');
    expect(simplifyAssetName('Fundo XP Macro - 01/07/2025')).toBe('Fundo XP Macro');
  });

  it('preserva a instituição da conta corrente (só o valor/data saem)', () => {
    expect(
      simplifyAssetName('Conta Corrente (Reserva Emergência) - Nubank - R$ 5.000 - 01/01/2026'),
    ).toBe('Conta Corrente (Reserva Emergência) - Nubank');
  });

  it('é idempotente e não toca em nomes sem sufixo', () => {
    expect(simplifyAssetName('PETROLEO BRASILEIRO S.A. PETROBRAS')).toBe(
      'PETROLEO BRASILEIRO S.A. PETROBRAS',
    );
    expect(simplifyAssetName('Tesouro IPCA+ 2035')).toBe('Tesouro IPCA+ 2035');
    expect(simplifyAssetName(simplifyAssetName('CDB - R$ 1.000 - 01/01/2026'))).toBe('CDB');
  });

  it('nunca devolve vazio para nome não-vazio; vazio/null viram ""', () => {
    expect(simplifyAssetName(' - R$ 1.000 - 01/01/2026')).toBe(' - R$ 1.000 - 01/01/2026'.trim());
    expect(simplifyAssetName('')).toBe('');
    expect(simplifyAssetName(null)).toBe('');
    expect(simplifyAssetName(undefined)).toBe('');
  });
});
