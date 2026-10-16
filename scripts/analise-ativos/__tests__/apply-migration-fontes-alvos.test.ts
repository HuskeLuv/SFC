import { describe, expect, it } from 'vitest';
import {
  lerStatementsFontesAlvos,
  statementsAditivosFontesAlvos,
} from '../apply-migration-fontes-alvos';

describe('migration da v2.5 — fontes e alvos (aditiva e idempotente)', () => {
  it('o migration.sql commitado: 3 colunas anuláveis, 3 tabelas, 8 índices e 2 FKs', () => {
    const { statements } = lerStatementsFontesAlvos();
    expect(statements).toHaveLength(16);
    expect(statements.slice(0, 3)).toEqual([
      'ALTER TABLE "asset_fundamentals_period" ADD COLUMN IF NOT EXISTS "reviewedBy" TEXT',
      'ALTER TABLE "fii_monthly" ADD COLUMN IF NOT EXISTS "reviewedBy" TEXT',
      'ALTER TABLE "fii_quarterly" ADD COLUMN IF NOT EXISTS "reviewedBy" TEXT',
    ]);
    expect(statements[3]).toMatch(/^CREATE TABLE IF NOT EXISTS "asset_fundamentals_serie"/);
    expect(statements[4]).toMatch(/^CREATE TABLE IF NOT EXISTS "fii_property_quality"/);
    expect(statements[5]).toMatch(/^CREATE TABLE IF NOT EXISTS "planning_asset_targets"/);
    expect(
      statements.slice(6, 14).every((s) => /^CREATE (UNIQUE )?INDEX IF NOT EXISTS/.test(s)),
    ).toBe(true);
    expect(statements[14]).toMatch(/REFERENCES "User"\("id"\) ON DELETE CASCADE/);
    expect(statements[15]).toMatch(/REFERENCES "assets"\("id"\) ON DELETE CASCADE/);
    const tudo = statements.join('\n');
    expect(tudo).not.toMatch(/\b(DROP|INSERT|DELETE FROM|RENAME|ALTER COLUMN)\b/);
    expect(statements.some((s) => /^UPDATE\b/.test(s))).toBe(false);
    // sem nota proprietária no banco (contratoSemNota)
    expect(tudo).not.toMatch(/score|rating|nota|indice/i);
  });

  it('recusa statement não aditivo, coluna não anulável ou tabela fora da lista', () => {
    expect(() =>
      statementsAditivosFontesAlvos(
        'ALTER TABLE "fii_monthly" ADD COLUMN IF NOT EXISTS "reviewedBy" TEXT NOT NULL;',
      ),
    ).toThrow(/não aditivo/);
    expect(() =>
      statementsAditivosFontesAlvos('ALTER TABLE "fii_monthly" ADD COLUMN "reviewedBy" TEXT;'),
    ).toThrow(/não aditivo/);
    expect(() =>
      statementsAditivosFontesAlvos(
        'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "reviewedBy" TEXT;',
      ),
    ).toThrow(/não aditivo/);
    expect(() =>
      statementsAditivosFontesAlvos('ALTER TABLE "fii_monthly" DROP COLUMN "pl";'),
    ).toThrow(/não aditivo/);
    expect(() => statementsAditivosFontesAlvos('DROP TABLE "criteria_eval";')).toThrow(
      /não aditivo/,
    );
    expect(() => statementsAditivosFontesAlvos('CREATE TABLE "x" ("id" TEXT);')).toThrow(
      /não aditivo/,
    );
  });
});
