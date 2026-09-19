/**
 * Corrige `FixedIncomeAsset.taxExempt` das posições de Tesouro Direto.
 *
 * Até 18/09/2026 o cadastro gravava `taxExempt: true` em toda posição de
 * Tesouro (renda fixa e reserva). Tesouro segue a tabela regressiva — nunca é
 * isento —, e a marca fazia a Cobertura FGC e o detalhe da Agenda anunciarem
 * isenção que não existe. A exibição já ignora a marca para Tesouro; este
 * script deixa o dado honesto também.
 *
 * DRY-RUN por padrão. Para gravar:
 *   npx tsx --env-file=.env scripts/backfill-tesouro-taxexempt.ts --apply
 */
import { prisma } from '../src/lib/prisma';
import { ehTesouroDireto } from '../src/services/ir/fixedIncomeIR';

async function main() {
  const aplicar = process.argv.includes('--apply');
  const marcados = await prisma.fixedIncomeAsset.findMany({
    where: { taxExempt: true },
    select: {
      id: true,
      description: true,
      type: true,
      tesouroBondType: true,
      userId: true,
      asset: { select: { symbol: true } },
    },
  });

  const doTesouro = marcados.filter((m) => ehTesouroDireto(m.tesouroBondType, m.asset?.symbol));
  console.log(`FI com taxExempt=true: ${marcados.length} | do Tesouro: ${doTesouro.length}`);
  for (const m of doTesouro) {
    console.log(
      `  ${m.description} | type ${m.type} | bondType ${m.tesouroBondType} | ${m.asset?.symbol}`,
    );
  }
  if (doTesouro.length === 0) {
    console.log('Nada a corrigir.');
    return;
  }
  if (!aplicar) {
    console.log('\nDRY-RUN. Rode com --apply para gravar taxExempt=false nessas linhas.');
    return;
  }
  const r = await prisma.fixedIncomeAsset.updateMany({
    where: { id: { in: doTesouro.map((m) => m.id) } },
    data: { taxExempt: false },
  });
  console.log(`\n✓ ${r.count} linhas corrigidas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
