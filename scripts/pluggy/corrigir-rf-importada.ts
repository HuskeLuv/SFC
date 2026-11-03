/**
 * Conserta a renda fixa que o Open Finance JÁ importou com as regras antigas (tickets 86e3vxd5r e
 * 86e3x9801, 03/11/2026). A importação nova já faz certo; este script só alcança o legado:
 *
 *   1. liquidez: CDB/LC/RDB pós-fixado até 100% do CDI importado com liquidityType null passa a
 *      'DAILY' (ia para "Renda Fixa acima de D+360" no Balanço Patrimonial);
 *   2. prefixado com taxa 0: o banco manda rate = 0 e a taxa em fixedAnnualRate; o FI ficou com
 *      annualRate 0 (rendendo nada). Passa a annualRate = fixedAnnualRate e recalcula a posição;
 *   3. debênture parada em "cadastre à mão" (subtipo DEBENTURES/CORPORATE_DEBT, sem-suporte com
 *      "ainda não importa sozinho") volta a 'pendente': a próxima sincronização do banco (cron
 *      diário 08:30 ou "Atualizar agora") preenche a data da compra e importa sozinha.
 *
 * Só toca o que veio do Pluggy (asset.source = 'pluggy', bank_investments importado) e com o
 * valor antigo ainda lá (update condicional): rodar de novo não muda nada. Rodar DEPOIS do
 * deploy do PR (a regra nova de debênture precisa estar no ar antes do passo 3).
 *
 *   npx tsx --env-file=.env scripts/pluggy/corrigir-rf-importada.ts [--user=<e-mail>] [--saida=<arq.json>]
 *   ... --apply --saida=/var/tmp/rf-importada-apply.json
 *   ... --restaurar=/var/tmp/rf-importada-apply.json   (devolve cada linha ao estado de antes)
 */
import { readFileSync, writeFileSync } from 'fs';
import { prisma } from '../../src/lib/prisma';
import {
  liquidezRendaFixaPluggy,
  SUBTIPOS_DEBENTURE,
} from '../../src/services/pluggy/importarCarteira';
import { recalculatePortfolioFromTransactions } from '../../src/services/portfolio/portfolioRecalculation';

const APLICAR = process.argv.includes('--apply');
const arg = (nome: string) =>
  process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3) ?? null;
const EMAIL = arg('user');
const SAIDA = arg('saida');
const RESTAURAR = arg('restaurar');

interface Liquidez {
  fiId: string;
  email: string;
  nome: string;
  subtype: string | null;
  taxa: string;
}
interface Taxa {
  fiId: string;
  assetId: string;
  portfolioId: string | null;
  userId: string;
  email: string;
  nome: string;
  startDate: string;
  antes: number;
  depois: number;
}
interface Debenture {
  biId: string;
  email: string;
  nome: string;
  importErrorAntes: string | null;
}
interface Relatorio {
  aplicado: boolean;
  em: string;
  liquidez: Liquidez[];
  taxa: Taxa[];
  debentures: Debenture[];
}

async function restaurar(arquivo: string) {
  const rel = JSON.parse(readFileSync(arquivo, 'utf8')) as Relatorio;
  if (!rel.aplicado) throw new Error('O relatório não é de um --apply');
  let liq = 0;
  let tx = 0;
  let deb = 0;
  for (const l of rel.liquidez) {
    const r = await prisma.fixedIncomeAsset.updateMany({
      where: { id: l.fiId, liquidityType: 'DAILY' },
      data: { liquidityType: null },
    });
    liq += r.count;
  }
  for (const t of rel.taxa) {
    const r = await prisma.fixedIncomeAsset.updateMany({
      where: { id: t.fiId, annualRate: t.depois },
      data: { annualRate: t.antes },
    });
    tx += r.count;
    if (r.count > 0) {
      await recalculatePortfolioFromTransactions({
        targetUserId: t.userId,
        assetId: t.assetId,
        portfolioId: t.portfolioId ?? undefined,
        recomputeSnapshotsFrom: new Date(t.startDate),
      });
    }
  }
  for (const d of rel.debentures) {
    // Só volta se ainda não importou (depois de importada, desfazer é pela tela).
    const r = await prisma.bankInvestment.updateMany({
      where: { id: d.biId, importStatus: 'pendente' },
      data: { importStatus: 'sem-suporte', importError: d.importErrorAntes },
    });
    deb += r.count;
  }
  console.log(`✅ restaurados: liquidez ${liq}, taxa ${tx}, debêntures ${deb}`);
}

async function main() {
  if (RESTAURAR) return restaurar(RESTAURAR);
  if (APLICAR && !SAIDA) throw new Error('--apply exige --saida (é o backup para reverter)');

  let userId: string | undefined;
  if (EMAIL) {
    const u = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
    if (!u) throw new Error(`Usuário não encontrado: ${EMAIL}`);
    userId = u.id;
  }

  const importadas = await prisma.bankInvestment.findMany({
    where: {
      ...(userId ? { userId } : {}),
      type: 'FIXED_INCOME',
      importStatus: 'importado',
      fixedIncomeAssetId: { not: null },
    },
    select: {
      subtype: true,
      rate: true,
      rateType: true,
      fixedAnnualRate: true,
      user: { select: { email: true } },
      fixedIncomeAssetId: true,
    },
  });
  const fis = await prisma.fixedIncomeAsset.findMany({
    where: { id: { in: importadas.map((b) => b.fixedIncomeAssetId!) } },
    include: { asset: { select: { source: true } } },
  });
  const fiPorId = new Map(fis.map((f) => [f.id, f]));

  const liquidez: Liquidez[] = [];
  const taxa: Taxa[] = [];
  for (const b of importadas) {
    const fi = fiPorId.get(b.fixedIncomeAssetId!);
    if (!fi || fi.asset?.source !== 'pluggy' || fi.tesouroBondType) continue;
    if (
      fi.liquidityType == null &&
      liquidezRendaFixaPluggy(b.subtype, b.rateType, b.rate) === 'DAILY'
    ) {
      liquidez.push({
        fiId: fi.id,
        email: b.user.email,
        nome: fi.description,
        subtype: b.subtype,
        taxa: `${b.rate ?? '-'}% ${b.rateType ?? ''}`.trim(),
      });
    }
    const fixa = b.fixedAnnualRate ?? 0;
    if (fi.indexer === 'PRE' && Number(fi.annualRate) === 0 && fixa > 0) {
      const port = await prisma.portfolio.findFirst({
        where: { userId: fi.userId, assetId: fi.assetId },
        select: { id: true },
      });
      taxa.push({
        fiId: fi.id,
        assetId: fi.assetId,
        portfolioId: port?.id ?? null,
        userId: fi.userId,
        email: b.user.email,
        nome: fi.description,
        startDate: fi.startDate.toISOString(),
        antes: 0,
        depois: fixa,
      });
    }
  }

  const paradas = await prisma.bankInvestment.findMany({
    where: {
      ...(userId ? { userId } : {}),
      ativo: true,
      type: 'FIXED_INCOME',
      subtype: { in: [...SUBTIPOS_DEBENTURE] },
      importStatus: 'sem-suporte',
      importError: { endsWith: 'ainda não importa sozinho' },
    },
    select: {
      id: true,
      name: true,
      code: true,
      importError: true,
      user: { select: { email: true } },
    },
  });
  const debentures: Debenture[] = paradas.map((p) => ({
    biId: p.id,
    email: p.user.email,
    nome: `${p.code ?? '-'} · ${p.name}`,
    importErrorAntes: p.importError,
  }));

  console.log(`\n1) Liquidez diária (${liquidez.length})`);
  console.table(liquidez.map(({ email, nome, subtype, taxa: t }) => ({ email, nome, subtype, t })));
  console.log(`\n2) Prefixado com taxa 0 (${taxa.length})`);
  console.table(taxa.map(({ email, nome, antes, depois }) => ({ email, nome, antes, depois })));
  console.log(`\n3) Debêntures para reimportar (${debentures.length})`);
  console.table(debentures.map(({ email, nome }) => ({ email, nome })));

  if (APLICAR) {
    for (const l of liquidez) {
      await prisma.fixedIncomeAsset.updateMany({
        where: { id: l.fiId, liquidityType: null },
        data: { liquidityType: 'DAILY' },
      });
    }
    for (const t of taxa) {
      const r = await prisma.fixedIncomeAsset.updateMany({
        where: { id: t.fiId, annualRate: 0 },
        data: { annualRate: t.depois },
      });
      if (r.count > 0) {
        await recalculatePortfolioFromTransactions({
          targetUserId: t.userId,
          assetId: t.assetId,
          portfolioId: t.portfolioId ?? undefined,
          recomputeSnapshotsFrom: new Date(t.startDate),
        });
      }
    }
    for (const d of debentures) {
      await prisma.bankInvestment.updateMany({
        where: { id: d.biId, importStatus: 'sem-suporte' },
        data: { importStatus: 'pendente', importError: null },
      });
    }
    console.log('\n✅ aplicado');
  } else {
    console.log('\n(dry-run: nada gravado; use --apply --saida=<arq.json>)');
  }
  if (SAIDA) {
    const rel: Relatorio = {
      aplicado: APLICAR,
      em: new Date().toISOString(),
      liquidez,
      taxa,
      debentures,
    };
    writeFileSync(SAIDA, JSON.stringify(rel, null, 2));
    console.log(`relatório: ${SAIDA}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
