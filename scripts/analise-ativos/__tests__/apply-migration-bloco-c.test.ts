import { describe, expect, it } from 'vitest';
import { lerStatementsBlocoC, statementsAditivos } from '../apply-migration-bloco-c';

describe('migration do bloco C (aditiva e idempotente)', () => {
  it('o migration.sql commitado só tem CREATE TABLE/INDEX IF NOT EXISTS (3 tabelas)', () => {
    const { statements } = lerStatementsBlocoC();
    const tabelas = statements.filter((s) => s.startsWith('CREATE TABLE IF NOT EXISTS'));
    expect(tabelas).toHaveLength(3);
    // a tabela-mãe vem antes das que têm FK para ela (FKs dentro do CREATE TABLE)
    expect(tabelas[0]).toContain('"analise_casos_dado"');
    expect(statements.every((s) => !/^\s*(ALTER|DROP|UPDATE|DELETE|INSERT)\b/im.test(s))).toBe(
      true,
    );
  });

  it('recusa statement não aditivo', () => {
    expect(() => statementsAditivos('ALTER TABLE "User" ADD COLUMN "x" TEXT;')).toThrow(
      /não aditivo/,
    );
    expect(() => statementsAditivos('DROP TABLE "analise_casos_dado";')).toThrow(/não aditivo/);
    expect(() => statementsAditivos('CREATE TABLE "x" ("id" TEXT);')).toThrow(/não aditivo/);
    expect(() => statementsAditivos('CREATE INDEX "i" ON "x"("id");')).toThrow(/não aditivo/);
  });

  it('aceita CREATE [UNIQUE] INDEX IF NOT EXISTS e ignora comentários', () => {
    const sql = `-- comentário\nCREATE UNIQUE INDEX IF NOT EXISTS "a" ON "t"("c");\n\nCREATE INDEX IF NOT EXISTS "b" ON "t"("d");\n`;
    expect(statementsAditivos(sql)).toHaveLength(2);
  });
});
