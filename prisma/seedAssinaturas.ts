/**
 * Usuários do e2e das assinaturas (projeto Playwright "assinaturas", ClickUp 86e2zkhe2). SÓ
 * DEV/CI (mesma guarda do admin de dev: banco de dev Neon ou o sfc_test do CI/Docker local).
 *
 *  - basic.e2e@finapp.local / 123456: sem linha em "assinaturas". No servidor do projeto
 *    (ASSINATURAS_CORTESIA_CORTE no ano 2000, sem LANCAMENTO_ATE) ninguém é legado: resolve 'basic'.
 *  - pro.e2e@finapp.local / 123456: linha 'active' com o price fake price_e2e_pro_mensal
 *    (STRIPE_PRICE_PRO_MENSAL do segundo webServer): resolve 'pro'.
 *
 * Nada é cobrado nem chamado no Stripe: ids fake (cus_e2e_*, sub_e2e_*). Idempotente.
 *
 *   DATABASE_URL=... npx tsx prisma/seedAssinaturas.ts            # dry-run
 *   DATABASE_URL=... npx tsx prisma/seedAssinaturas.ts --apply    # cria/atualiza
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { bancoDevOuCi } from './seedAdminDev';

export const EMAIL_BASIC_E2E = 'basic.e2e@finapp.local';
export const EMAIL_PRO_E2E = 'pro.e2e@finapp.local';
const SENHA_E2E = '123456';
export const PRICE_PRO_MENSAL_E2E = 'price_e2e_pro_mensal';

export async function garantirUsuariosAssinaturas(prisma: PrismaClient): Promise<void> {
  if (!bancoDevOuCi(process.env.DATABASE_URL ?? '')) {
    throw new Error(
      'Seed das assinaturas recusado: DATABASE_URL não é o banco de dev nem o do CI.',
    );
  }
  const password = await bcrypt.hash(SENHA_E2E, 10);
  const basic = await prisma.user.upsert({
    where: { email: EMAIL_BASIC_E2E },
    update: { password },
    create: { email: EMAIL_BASIC_E2E, password, name: 'Basic E2E' },
    select: { id: true },
  });
  // Basic "puro": sem linha (um teste anterior pode ter criado uma).
  await prisma.assinatura.deleteMany({ where: { userId: basic.id } });

  const pro = await prisma.user.upsert({
    where: { email: EMAIL_PRO_E2E },
    update: { password },
    create: { email: EMAIL_PRO_E2E, password, name: 'Pro E2E' },
    select: { id: true },
  });
  const linha = {
    stripeCustomerId: 'cus_e2e_pro',
    stripeSubscriptionId: 'sub_e2e_pro',
    stripePriceId: PRICE_PRO_MENSAL_E2E,
    plano: 'pro',
    intervalo: 'mes',
    status: 'active',
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    cancelAtPeriodEnd: false,
    carenciaAte: null,
    primeiraCobrancaEm: new Date(),
  };
  await prisma.assinatura.upsert({
    where: { userId: pro.id },
    update: linha,
    create: { userId: pro.id, ...linha },
  });
}

if (require.main === module) {
  const aplicar = process.argv.includes('--apply');
  const ok = bancoDevOuCi(process.env.DATABASE_URL ?? '');
  console.log(`=== usuários do e2e das assinaturas (${aplicar ? 'APPLY' : 'dry-run'}) ===`);
  console.log(`  banco de dev/CI: ${ok ? 'sim' : 'NÃO — recusado'}`);
  if (!ok) process.exit(1);
  if (!aplicar) {
    console.log('  Dry-run: nada gravado. Use --apply.');
  } else {
    const prisma = new PrismaClient();
    garantirUsuariosAssinaturas(prisma)
      .then(() => console.log(`  ok: ${EMAIL_BASIC_E2E} e ${EMAIL_PRO_E2E}`))
      .catch((e: unknown) => {
        console.error(e);
        process.exitCode = 1;
      })
      .finally(() => void prisma.$disconnect());
  }
}
