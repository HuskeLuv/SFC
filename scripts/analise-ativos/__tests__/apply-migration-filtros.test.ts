import { describe, expect, it } from 'vitest';
import { lerStatementsFiltros, statementsAditivosFiltros } from '../apply-migration-filtros';

describe('migration da v2.4 — Filtros de Fundamentos (aditiva e idempotente)', () => {
  it('o migration.sql commitado: 2 colunas anuláveis, 2 tabelas e 4 índices', () => {
    const { statements } = lerStatementsFiltros();
    expect(statements).toHaveLength(8);
    expect(statements[0]).toBe(
      'ALTER TABLE "analise_quadro_linhas" ADD COLUMN IF NOT EXISTS "criterios" JSONB',
    );
    expect(statements[1]).toBe(
      'ALTER TABLE "analise_quadro_linhas" ADD COLUMN IF NOT EXISTS "perfilCriterios" TEXT',
    );
    expect(statements[2]).toMatch(/^CREATE TABLE IF NOT EXISTS "criteria_params"/);
    expect(statements[3]).toMatch(/^CREATE TABLE IF NOT EXISTS "criteria_eval"/);
    expect(statements.slice(4).every((s) => /^CREATE (UNIQUE )?INDEX IF NOT EXISTS/.test(s))).toBe(
      true,
    );
    const tudo = statements.join('\n');
    // nada do banco do score é tocado (D6 é etapa separada) e nenhuma remoção
    expect(tudo).not.toMatch(/\b(DROP|INSERT|UPDATE|DELETE|RENAME)\b/);
    expect(tudo).not.toMatch(/asset_scores|scoring_params/);
  });

  it('recusa statement não aditivo ou coluna não anulável', () => {
    expect(() =>
      statementsAditivosFiltros(
        'ALTER TABLE "analise_quadro_linhas" ADD COLUMN IF NOT EXISTS "x" TEXT NOT NULL;',
      ),
    ).toThrow(/não aditivo/);
    expect(() =>
      statementsAditivosFiltros(
        'ALTER TABLE "analise_quadro_linhas" ADD COLUMN IF NOT EXISTS "x" TEXT DEFAULT \'a\';',
      ),
    ).toThrow(/não aditivo/);
    expect(() =>
      statementsAditivosFiltros('ALTER TABLE "analise_quadro_linhas" ADD COLUMN "x" TEXT;'),
    ).toThrow(/não aditivo/);
    expect(() =>
      statementsAditivosFiltros('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "x" TEXT;'),
    ).toThrow(/não aditivo/);
    expect(() =>
      statementsAditivosFiltros('ALTER TABLE "analise_quadro_linhas" DROP COLUMN "indiceMf";'),
    ).toThrow(/não aditivo/);
    expect(() => statementsAditivosFiltros('DROP TABLE "asset_scores";')).toThrow(/não aditivo/);
    expect(() => statementsAditivosFiltros('CREATE TABLE "x" ("id" TEXT);')).toThrow(/não aditivo/);
  });
});
