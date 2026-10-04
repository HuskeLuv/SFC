/**
 * Admin de DESENVOLVIMENTO/CI para a fila de curadoria do bloco C da Análise de Ativos
 * (/admin/curadoria; curadores = admins). SÓ DEV/CI: admin.demo@finapp.local / 123456.
 *
 * Guardas (as duas valem sempre):
 *  - o banco tem de ser o de dev (host *.neon.tech) ou o efêmero do CI (base sfc_test). Produção
 *    roda Postgres local no Lightsail, então "localhost" sozinho NÃO basta;
 *  - pelo seed (prisma/seed.ts), só com SEED_ADMIN_DEV=1 no ambiente (ligado no job de e2e do CI).
 *
 * Sozinho (dev):
 *   npx tsx --env-file=.env prisma/seedAdminDev.ts            # dry-run
 *   npx tsx --env-file=.env prisma/seedAdminDev.ts --apply    # cria/atualiza
 */
import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';

export const EMAIL_ADMIN_DEV = 'admin.demo@finapp.local';
const SENHA_ADMIN_DEV = '123456';

/** Banco de dev (Neon) ou do CI (sfc_test). Nunca produção. */
export function bancoDevOuCi(databaseUrl: string): boolean {
  try {
    const u = new URL(databaseUrl);
    const base = u.pathname.replace(/^\//, '');
    return u.hostname.endsWith('.neon.tech') || base === 'sfc_test';
  } catch {
    return false;
  }
}

/** Cria/atualiza o admin de dev (idempotente). Lança fora de dev/CI. */
export async function garantirAdminDev(prisma: PrismaClient): Promise<{ id: string }> {
  if (!bancoDevOuCi(process.env.DATABASE_URL ?? '')) {
    throw new Error('Admin de dev recusado: DATABASE_URL não é o banco de dev (Neon) nem o do CI.');
  }
  const password = await bcrypt.hash(SENHA_ADMIN_DEV, 10);
  return prisma.user.upsert({
    where: { email: EMAIL_ADMIN_DEV },
    update: { password, role: UserRole.admin },
    create: {
      email: EMAIL_ADMIN_DEV,
      password,
      name: 'Admin Demo (dev)',
      role: UserRole.admin,
    },
    select: { id: true },
  });
}

if (require.main === module) {
  const aplicar = process.argv.includes('--apply');
  const ok = bancoDevOuCi(process.env.DATABASE_URL ?? '');
  console.log(`=== admin de dev ${EMAIL_ADMIN_DEV} (${aplicar ? 'APPLY' : 'dry-run'}) ===`);
  console.log(`  banco de dev/CI: ${ok ? 'sim' : 'NÃO — recusado'}`);
  if (!ok) process.exit(1);
  if (!aplicar) {
    console.log('  Dry-run: nada gravado. Use --apply.');
  } else {
    const prisma = new PrismaClient();
    garantirAdminDev(prisma)
      .then((r) => console.log(`  ✓ admin de dev pronto (${r.id})`))
      .catch((e: unknown) => {
        console.error(e instanceof Error ? e.message : e);
        process.exitCode = 1;
      })
      .finally(() => void prisma.$disconnect());
  }
}
