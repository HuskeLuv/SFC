import { describe, expect, it } from 'vitest';
import { lerStatementsEua, statementsAditivosEua } from '../apply-migration-eua';

describe('migration EUA — Stocks e REITs (aditiva e idempotente)', () => {
  it('o migration.sql commitado: 9 colunas anuláveis, 3 tabelas e 5 índices, nada destrutivo', () => {
    const { statements } = lerStatementsEua();
    expect(statements).toHaveLength(17);
    expect(statements.slice(0, 9).every((s) => /ADD COLUMN IF NOT EXISTS/.test(s))).toBe(true);
    expect(statements.slice(0, 9).some((s) => /NOT NULL|DEFAULT/.test(s))).toBe(false);
    expect(statements[9]).toMatch(/^CREATE TABLE IF NOT EXISTS "sec_companies"/);
    expect(statements[10]).toMatch(/^CREATE TABLE IF NOT EXISTS "sec_company_tickers"/);
    expect(statements[11]).toMatch(/^CREATE TABLE IF NOT EXISTS "asset_quotes_daily_us"/);
    expect(statements.slice(12).every((s) => /^CREATE (UNIQUE )?INDEX IF NOT EXISTS/.test(s))).toBe(
      true,
    );
    const tudo = statements.join('\n');
    expect(tudo).not.toMatch(/\b(DROP|INSERT|DELETE FROM|RENAME|ALTER COLUMN|UPDATE)\b/);
    // sem nota proprietária nem nome de índice de mercado no banco
    expect(tudo).not.toMatch(/score|rating|nota|indice|s&p|msci/i);
  });

  it('recusa coluna fora da lista, coluna não anulável e statement destrutivo', () => {
    expect(() =>
      statementsAditivosEua(
        'ALTER TABLE "analise_quadro_linhas" ADD COLUMN IF NOT EXISTS "moeda" TEXT NOT NULL;',
      ),
    ).toThrow(/não aditivo/);
    expect(() =>
      statementsAditivosEua(
        'ALTER TABLE "analise_quadro_linhas" ADD COLUMN IF NOT EXISTS "outra" TEXT;',
      ),
    ).toThrow(/não aditivo/);
    expect(() =>
      statementsAditivosEua('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "moeda" TEXT;'),
    ).toThrow(/não aditivo/);
    expect(() =>
      statementsAditivosEua('ALTER TABLE "analise_quadro_linhas" ADD COLUMN "moeda" TEXT;'),
    ).toThrow(/não aditivo/);
    expect(() => statementsAditivosEua('DROP TABLE "criteria_eval";')).toThrow(/não aditivo/);
    expect(() => statementsAditivosEua('DELETE FROM "analise_quadro_linhas";')).toThrow(
      /não aditivo/,
    );
  });
});
