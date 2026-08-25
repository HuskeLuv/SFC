/**
 * Sincroniza as aulas da trilha (src/constants/educacaoAulas.ts) com o banco:
 * aula existente no mesmo (módulo, orderIndex) recebe título + embed VTurb
 * (id e progresso dos alunos preservados); aula ausente é criada. Aulas além
 * da lista são mantidas e listadas. Idempotente. NÃO apaga nada.
 *
 * Uso: npx tsx scripts/educacao/sync-aulas-trilha.ts [--dry-run]
 * Em prod: rodar via SSM de dentro de /opt/myfinance/current (ver memória).
 * Pré-requisito: módulos já sincronizados (sync-modulos-trilha.ts).
 */
import { PrismaClient } from '@prisma/client';
import { CURSO_ESR_SLUG, MODULOS_TRILHA_ESR } from '../../src/constants/educacaoModulos';
import { AULAS_TRILHA_ESR, buildVturbEmbed } from '../../src/constants/educacaoAulas';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

async function main() {
  const curso = await prisma.course.findUnique({
    where: { slug: CURSO_ESR_SLUG },
    include: {
      modules: {
        orderBy: { orderIndex: 'asc' },
        include: { lessons: { orderBy: { orderIndex: 'asc' } } },
      },
    },
  });
  if (!curso) throw new Error(`Curso ${CURSO_ESR_SLUG} não encontrado`);

  const moduloPorIndex = new Map(curso.modules.map((m) => [m.orderIndex, m]));
  let updated = 0;
  let created = 0;

  for (const [mIdxStr, aulas] of Object.entries(AULAS_TRILHA_ESR)) {
    const mIdx = Number(mIdxStr);
    const modulo = moduloPorIndex.get(mIdx);
    if (!modulo) {
      throw new Error(
        `Módulo [${mIdx}] "${MODULOS_TRILHA_ESR[mIdx]?.title}" não existe — rode sync-modulos-trilha.ts antes`,
      );
    }
    const aulaPorIndex = new Map(modulo.lessons.map((l) => [l.orderIndex, l]));

    for (const [aIdx, aula] of aulas.entries()) {
      const embed = buildVturbEmbed(aula.vturbId);
      const existente = aulaPorIndex.get(aIdx);
      if (existente) {
        const mudou = existente.title !== aula.title || existente.vturbEmbed !== embed;
        console.log(
          `[${mIdx}.${aIdx}] ${mudou ? 'update' : 'ok    '} "${existente.title}" → "${aula.title}" (vid-${aula.vturbId})`,
        );
        if (mudou && !dryRun) {
          await prisma.courseLesson.update({
            where: { id: existente.id },
            data: { title: aula.title, vturbEmbed: embed },
          });
        }
        if (mudou) updated += 1;
      } else {
        console.log(`[${mIdx}.${aIdx}] create "${aula.title}" (vid-${aula.vturbId})`);
        if (!dryRun) {
          await prisma.courseLesson.create({
            data: {
              moduleId: modulo.id,
              title: aula.title,
              vturbEmbed: embed,
              orderIndex: aIdx,
              requiredLevel: 0,
            },
          });
        }
        created += 1;
      }
    }

    const extras = modulo.lessons.filter((l) => l.orderIndex >= aulas.length);
    if (extras.length > 0) {
      console.log(
        `⚠️ módulo [${mIdx}] "${modulo.title}": ${extras.length} aula(s) além da lista mantidas:`,
        extras.map((l) => `${l.orderIndex}:${l.title}`),
      );
    }
  }

  console.log(
    dryRun
      ? `dry-run: nada gravado (${updated} update, ${created} create)`
      : `✅ aulas sincronizadas (${updated} update, ${created} create)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
