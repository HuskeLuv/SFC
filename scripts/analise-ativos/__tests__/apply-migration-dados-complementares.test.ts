import { describe, expect, it, vi } from 'vitest';
import {
  MIGRATION_NAME,
  aplicarComplementos,
  lerStatementsComplementos,
  statementsAditivosComplementos,
  type ClienteMigration,
} from '../apply-migration-dados-complementares';

describe('migration A6 — dados complementares (aditiva e idempotente)', () => {
  it('o migration.sql commitado: 15 colunas anuláveis, 6 tabelas e 1 índice, nada destrutivo', () => {
    const { statements } = lerStatementsComplementos();
    expect(statements).toHaveLength(22);
    const colunas = statements.slice(0, 15);
    expect(colunas.every((s) => /^ALTER TABLE "[a-z_]+" ADD COLUMN IF NOT EXISTS/.test(s))).toBe(
      true,
    );
    expect(colunas.some((s) => /NOT NULL|DEFAULT/.test(s))).toBe(false);
    const tabelas = statements
      .slice(15, 21)
      .map((s) => /^CREATE TABLE IF NOT EXISTS "([a-z_]+)"/.exec(s)?.[1]);
    expect(tabelas).toEqual([
      'fii_imovel_trimestral',
      'fii_inquilino_setor_trimestral',
      'asset_retornos_cotacao',
      'cia_fre_posicao_acionaria',
      'cia_fre_societario',
      'cia_fre_direito_acao',
    ]);
    expect(statements[21]).toMatch(/^CREATE INDEX IF NOT EXISTS "fii_imovel_trimestral_/);
    const tudo = statements.join('\n');
    expect(tudo).not.toMatch(/\b(DROP|INSERT|DELETE FROM|RENAME|ALTER COLUMN|UPDATE|REFERENCES)\b/);
    // sem nota proprietária nem score no banco
    expect(tudo).not.toMatch(/score|rating|nota|indice|semaforo/i);
    // decisão 5: nenhum documento do acionista (CPF/CNPJ) na posição acionária
    const posicao = statements[18];
    expect(posicao).toContain('"nome" TEXT NOT NULL');
    expect(posicao).not.toMatch(/cpf|documento|cnpjAcionista|"cpfCnpj/i);
    // PK com coluna que pode vir vazia: text NOT NULL DEFAULT '' só em tabela nova
    expect(statements[16]).toContain(`"setor" TEXT NOT NULL DEFAULT ''`);
    expect(statements[20]).toContain(`"classePn" TEXT NOT NULL DEFAULT ''`);
  });

  it('recusa coluna fora da lista, coluna não anulável, tabela fora da lista e statement destrutivo', () => {
    const recusa = (sql: string) =>
      expect(() => statementsAditivosComplementos(sql)).toThrow(/não aditivo/);
    recusa(
      'ALTER TABLE "fii_monthly" ADD COLUMN IF NOT EXISTS "valoresReceber" DECIMAL(20,2) NOT NULL;',
    );
    recusa(
      'ALTER TABLE "fii_monthly" ADD COLUMN IF NOT EXISTS "valoresReceber" DECIMAL(20,2) DEFAULT 0;',
    );
    recusa('ALTER TABLE "fii_monthly" ADD COLUMN IF NOT EXISTS "outra" DOUBLE PRECISION;');
    recusa('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "obrigacoesAtivoPct" DOUBLE PRECISION;');
    recusa('ALTER TABLE "fii_monthly" ADD COLUMN "valoresReceber" DECIMAL(20,2);');
    recusa('CREATE TABLE IF NOT EXISTS "outra_tabela" ("id" TEXT NOT NULL);');
    recusa('CREATE TABLE "asset_retornos_cotacao" ("symbol" TEXT NOT NULL);');
    recusa('CREATE INDEX IF NOT EXISTS "x_idx" ON "fii_monthly"("cnpj");');
    recusa('DROP TABLE "fii_monthly";');
    recusa('DELETE FROM "fii_monthly";');
    recusa('ALTER TABLE "fii_monthly" ALTER COLUMN "pl" TYPE TEXT;');
    recusa(
      'CREATE TABLE IF NOT EXISTS "cia_fre_societario" ("cnpj" TEXT REFERENCES "Asset"("id"));',
    );
  });

  it('aplicar 2× é idempotente: mesmos statements, registra em _prisma_migrations só uma vez', async () => {
    const lido = lerStatementsComplementos();
    const registradas = new Set<string>();
    const executados: string[] = [];
    const cliente: ClienteMigration = {
      $executeRawUnsafe: vi.fn(async (sql: string, ...valores: unknown[]) => {
        if (sql.startsWith('INSERT INTO "_prisma_migrations"')) registradas.add(String(valores[1]));
        else executados.push(sql);
        return 0;
      }),
      $queryRawUnsafe: vi.fn(async (_sql: string, nome: unknown) => [
        { count: registradas.has(String(nome)) ? 1n : 0n },
      ]) as ClienteMigration['$queryRawUnsafe'],
    };
    const r1 = await aplicarComplementos(cliente, lido);
    const r2 = await aplicarComplementos(cliente, lido);
    expect(r1).toEqual({ executados: 22, registrada: true });
    expect(r2).toEqual({ executados: 22, registrada: false });
    expect([...registradas]).toEqual([MIGRATION_NAME]);
    expect(executados).toHaveLength(44);
    expect(executados.every((s) => /IF NOT EXISTS/.test(s))).toBe(true);
  });
});
