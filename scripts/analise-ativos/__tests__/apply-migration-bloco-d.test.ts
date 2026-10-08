import { describe, expect, it } from 'vitest';
import {
  dividirStatementsComBlocos,
  lerStatementsBlocoD,
  statementsAditivosBlocoD,
} from '../apply-migration-bloco-d';

describe('migration do bloco D (aditiva e idempotente)', () => {
  it('o migration.sql commitado: 1 tabela, 2 índices e a FK para "User" num DO $$', () => {
    const { statements } = lerStatementsBlocoD();
    expect(statements).toHaveLength(4);
    expect(statements[0]).toMatch(/^CREATE TABLE IF NOT EXISTS "analise_cenarios"/);
    expect(statements[1]).toMatch(
      /^CREATE UNIQUE INDEX IF NOT EXISTS "analise_cenarios_userId_symbol_key"/,
    );
    expect(statements[2]).toMatch(
      /^CREATE INDEX IF NOT EXISTS "analise_cenarios_userId_updatedAt_idx"/,
    );
    expect(statements[3]).toMatch(/^DO \$\$ BEGIN/);
    expect(statements[3]).toContain('REFERENCES "User"("id") ON DELETE CASCADE');
    expect(statements[3]).toContain('EXCEPTION WHEN duplicate_object THEN NULL;');
    // nenhuma outra tabela é tocada
    expect(statements.join('\n')).not.toMatch(/\b(DROP|INSERT)\b|^\s*(UPDATE|DELETE)\b/m);
    expect(statements.join('\n')).not.toMatch(/ALTER TABLE "(?!analise_cenarios")/);
  });

  it('o ; dentro do bloco $$ não separa statements', () => {
    const sql = `CREATE INDEX IF NOT EXISTS "a" ON "t"("c");\nDO $$ BEGIN\n  SELECT 1;\nEXCEPTION WHEN duplicate_object THEN NULL;\nEND $$;\n`;
    const partes = dividirStatementsComBlocos(sql);
    expect(partes).toHaveLength(2);
    expect(partes[1]).toMatch(/^DO \$\$ BEGIN[\s\S]*END \$\$$/);
  });

  it('recusa statement não aditivo, inclusive DO $$ que não seja FK idempotente', () => {
    expect(() => statementsAditivosBlocoD('ALTER TABLE "User" ADD COLUMN "x" TEXT;')).toThrow(
      /não aditivo/,
    );
    expect(() => statementsAditivosBlocoD('DROP TABLE "analise_cenarios";')).toThrow(/não aditivo/);
    expect(() => statementsAditivosBlocoD('CREATE TABLE "x" ("id" TEXT);')).toThrow(/não aditivo/);
    expect(() => statementsAditivosBlocoD('DO $$ BEGIN\n  DELETE FROM "User";\nEND $$;\n')).toThrow(
      /não aditivo/,
    );
    // FK sem o EXCEPTION também é recusada (não seria idempotente)
    expect(() =>
      statementsAditivosBlocoD(
        'DO $$ BEGIN\n  ALTER TABLE "t" ADD CONSTRAINT "t_fk" FOREIGN KEY ("u") REFERENCES "User"("id");\nEND $$;\n',
      ),
    ).toThrow(/não aditivo/);
  });
});
