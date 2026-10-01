/**
 * Reclassifica o subgrupo das posições que a importação do Pluggy criou antes
 * do fix de 01/10/2026 (FII caía em "FOFI", fundo manual em "FIM").
 *
 * Só mexe no que a importação CRIOU (importStatus 'importado'); posições do
 * próprio usuário que foram só vinculadas ficam como estão. Também não troca
 * um tipoFii que o usuário já tenha escolhido.
 *   - FII sem tipoFii → Portfolio.tipoFii pelo catálogo da CVM / nome
 *   - fundo manual do Pluggy (Asset 'fund', source 'pluggy') → Asset.type pelo subtipo
 *
 * Rodar DEPOIS do backfill da Análise de Ativos (fii_ticker_map/fii_monthly),
 * senão os FIIs de papel ficam como "tijolo".
 *
 *   npx tsx --env-file=.env scripts/reclassificar-secao-pluggy.ts            # simulação
 *   npx tsx --env-file=.env scripts/reclassificar-secao-pluggy.ts --apply    # grava
 */
import { prisma } from '../src/lib/prisma';
import { tipoAssetFundoPluggy, tipoFiiImportado } from '../src/services/pluggy/secaoImportada';

const APLICAR = process.argv.includes('--apply');

async function main() {
  console.log(
    `=== Reclassificar subgrupo das importações do Pluggy (${APLICAR ? 'APLICANDO' : 'simulação'}) ===`,
  );
  const importados = await prisma.bankInvestment.findMany({
    where: { importStatus: 'importado', assetId: { not: null }, portfolioId: { not: null } },
    select: { id: true, userId: true, subtype: true, assetId: true, portfolioId: true },
  });
  let fiis = 0;
  let fundos = 0;
  for (const bi of importados) {
    const [asset, port] = await Promise.all([
      prisma.asset.findUnique({
        where: { id: bi.assetId! },
        select: { id: true, symbol: true, name: true, type: true, source: true },
      }),
      prisma.portfolio.findUnique({
        where: { id: bi.portfolioId! },
        select: { id: true, tipoFii: true },
      }),
    ]);
    if (!asset || !port) continue;

    if (asset.type === 'fii' && !port.tipoFii) {
      const tipoFii = await tipoFiiImportado(asset.symbol, asset.name);
      console.log(
        `  FII   ${asset.symbol.padEnd(10)} user ${bi.userId.slice(0, 8)} → tipoFii ${tipoFii}`,
      );
      if (APLICAR) await prisma.portfolio.update({ where: { id: port.id }, data: { tipoFii } });
      fiis++;
    }

    if (asset.type === 'fund' && asset.source === 'pluggy') {
      const type = tipoAssetFundoPluggy(bi.subtype);
      if (type !== 'fund') {
        console.log(`  FUNDO ${asset.symbol.padEnd(22)} ${bi.subtype} → Asset.type ${type}`);
        if (APLICAR) await prisma.asset.update({ where: { id: asset.id }, data: { type } });
        fundos++;
      }
    }
  }
  console.log(
    `\n${importados.length} importações lidas · ${fiis} FIIs · ${fundos} fundos${APLICAR ? ' atualizados' : ' a atualizar'}`,
  );
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
