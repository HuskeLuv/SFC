import prisma from '../src/lib/prisma';

/**
 * Bugs #10 + #16 (relatório de bugs Maio/2026): popular o catálogo de
 * instituições financeiras com as corretoras e plataformas digitais que
 * faltavam (Rico, XP, Terra, Modalmais, Genial, Órama, Avenue, NuInvest,
 * Clear, etc.). Idempotente — usa upsert por `codigo`.
 *
 * Uso:
 *   npx tsx scripts/seed-additional-institutions.ts
 *
 * O array é a fonte de verdade — `prisma/seed.ts` deve manter o mesmo
 * conteúdo. Para evitar drift, considere extrair pra um JSON quando o
 * catálogo crescer.
 */

const ADDITIONAL_INSTITUTIONS: Array<{
  code: string;
  name: string;
  cnpj: string | null;
}> = [
  { code: '102', name: 'XP Investimentos CCTVM', cnpj: '02332886000104' },
  { code: '380', name: 'Rico Investimentos', cnpj: '02332886000104' },
  { code: '278', name: 'Genial Investimentos CTVM', cnpj: '27652684000162' },
  { code: '107', name: 'Terra Investimentos DTVM', cnpj: '03751794000113' },
  { code: '325', name: 'Órama DTVM', cnpj: '13293225000125' },
  { code: '508', name: 'Avenue Securities DTVM', cnpj: '24933830000130' },
  { code: '260', name: 'NuInvest (ex-Easynvest)', cnpj: '62169875000179' },
  { code: '477', name: 'Citibank N.A. Brasil', cnpj: null },
  { code: '655-IC', name: 'BV Investimentos (Banco Votorantim)', cnpj: null },
  { code: '102-CL', name: 'Clear Corretora (Grupo XP)', cnpj: '02332886000104' },
];

async function main() {
  console.log('🏦 Sincronizando catálogo de instituições...\n');
  let inserted = 0;
  let updated = 0;

  for (const inst of ADDITIONAL_INSTITUTIONS) {
    const existing = await prisma.institution.findUnique({
      where: { codigo: inst.code },
      select: { id: true, nome: true },
    });

    await prisma.institution.upsert({
      where: { codigo: inst.code },
      create: {
        codigo: inst.code,
        nome: inst.name,
        cnpj: inst.cnpj,
        status: 'ATIVA',
      },
      update: {
        nome: inst.name,
        cnpj: inst.cnpj,
        status: 'ATIVA',
      },
    });

    if (existing) {
      console.log(`  ↻ ${inst.name} (${inst.code}) — atualizado`);
      updated += 1;
    } else {
      console.log(`  ✅ ${inst.name} (${inst.code}) — inserido`);
      inserted += 1;
    }
  }

  console.log(`\n${inserted} inseridos · ${updated} atualizados.`);
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error('❌ Erro:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

export default main;
