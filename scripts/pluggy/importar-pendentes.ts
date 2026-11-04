/**
 * Importa já as posições do Open Finance que estão "pendente" para um usuário, sem esperar o
 * próximo sync (ticket 86e3x9801, 04/11/2026). Mesmo caminho do sync e do botão Importar:
 * importarPendentes + atualizarImportados. Útil depois de um script que devolve posições a
 * "pendente" (ex.: corrigir-rf-importada), já que o "Atualizar agora" tem cooldown de 6 h.
 *
 * Dry-run é o padrão (só lista). Idempotente: depois do --apply não sobra pendente para importar.
 *
 *   npx tsx --env-file=.env scripts/pluggy/importar-pendentes.ts --user=<e-mail>
 *   ... --apply
 */
import { prisma } from '../../src/lib/prisma';
import { atualizarImportados, importarPendentes } from '../../src/services/pluggy/importarCarteira';

const APLICAR = process.argv.includes('--apply');
const EMAIL = process.argv.find((a) => a.startsWith('--user='))?.slice('--user='.length) ?? null;

async function main() {
  if (!EMAIL) throw new Error('Informe --user=<e-mail>');
  const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
  if (!user) throw new Error(`Usuário não encontrado: ${EMAIL}`);

  const [invs, loans] = await Promise.all([
    prisma.bankInvestment.findMany({
      where: { userId: user.id, importStatus: 'pendente', ativo: true },
      select: { name: true, code: true, type: true, subtype: true, balance: true },
      orderBy: { name: 'asc' },
    }),
    prisma.bankLoan.findMany({
      where: { userId: user.id, importStatus: 'pendente', ativo: true },
      select: { id: true },
    }),
  ]);
  console.log(`Pendentes de ${EMAIL}: ${invs.length} investimentos, ${loans.length} empréstimos`);
  console.table(
    invs.map((i) => ({
      nome: i.name,
      codigo: i.code,
      tipo: `${i.type}/${i.subtype ?? '-'}`,
      saldo: Number(i.balance ?? 0),
    })),
  );

  if (!APLICAR) {
    console.log('(dry-run: nada gravado; use --apply)');
    return;
  }
  const r = await importarPendentes(user.id);
  await atualizarImportados(user.id);
  console.log('✅ aplicado', r);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
