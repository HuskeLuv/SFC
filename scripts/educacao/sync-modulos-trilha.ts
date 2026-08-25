/**
 * Sincroniza os módulos do curso "Educação Financeira do Zero" com a trilha
 * de referência (src/constants/educacaoModulos.ts): módulo existente no
 * mesmo orderIndex é renomeado/recebe descrição e capa (aulas preservadas);
 * módulo ausente é criado. Idempotente. NÃO apaga nada.
 *
 * Uso: npx tsx scripts/educacao/sync-modulos-trilha.ts [--dry-run]
 * Em prod: rodar via SSM de dentro de /opt/myfinance/current (ver memória).
 */
import { PrismaClient } from '@prisma/client';
import { CURSO_ESR_SLUG, MODULOS_TRILHA_ESR } from '../../src/constants/educacaoModulos';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

async function main() {
  const curso = await prisma.course.findUnique({
    where: { slug: CURSO_ESR_SLUG },
    include: { modules: { orderBy: { orderIndex: 'asc' }, include: { lessons: true } } },
  });
  if (!curso) throw new Error(`Curso ${CURSO_ESR_SLUG} não encontrado`);

  const porIndex = new Map(curso.modules.map((m) => [m.orderIndex, m]));
  for (const [idx, mod] of MODULOS_TRILHA_ESR.entries()) {
    const existente = porIndex.get(idx);
    if (existente) {
      console.log(
        `[${idx}] update "${existente.title}" → "${mod.title}" (${existente.lessons.length} aulas preservadas)`,
      );
      if (!dryRun) {
        await prisma.courseModule.update({
          where: { id: existente.id },
          data: { title: mod.title, description: mod.description, coverUrl: mod.coverUrl },
        });
      }
    } else {
      console.log(`[${idx}] create "${mod.title}"`);
      if (!dryRun) {
        await prisma.courseModule.create({
          data: {
            courseId: curso.id,
            title: mod.title,
            description: mod.description,
            coverUrl: mod.coverUrl,
            orderIndex: idx,
          },
        });
      }
    }
  }
  const extras = curso.modules.filter((m) => m.orderIndex >= MODULOS_TRILHA_ESR.length);
  if (extras.length > 0) {
    console.log(
      `⚠️ ${extras.length} módulo(s) além da trilha mantidos:`,
      extras.map((m) => m.title),
    );
  }
  console.log(dryRun ? 'dry-run: nada gravado' : '✅ módulos sincronizados');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
