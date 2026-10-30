/**
 * Banco emissor (FGC) da renda fixa que o Open Finance JÁ importou (ClickUp 86e2xqh69). A
 * importação nova já grava o emissor; este script preenche os FixedIncomeAsset antigos casando
 * o issuer do Pluggy (bank_investments.issuer/issuerCnpj) com o catálogo: raiz do CNPJ, senão
 * nome normalizado ou apelido de exatamente uma instituição; na dúvida, não casa.
 *
 * Não sobrescreve nada:
 *   - só FI com emissorInstitutionId null, sem tesouroBondType e que aceita emissor
 *     (CDB/LC/LCI/LCA/RDB/LIG; debênture, LF, CRI e CRA ficam de fora);
 *   - PULA o FI cujo usuário já mexeu no emissor na edição do ativo (user_change_logs
 *     'ativo.editar' com o campo 'emissor' em `changes`), inclusive quem escolheu
 *     "Usar a corretora" (que grava null, igual a "nunca informado");
 *   - o update é condicional (emissorInstitutionId ainda null): rodar de novo não muda nada.
 * Não recalcula nada (o emissor só muda o agrupamento da Cobertura FGC).
 *
 * Ordem em prod (cada passo com OK do Wellington): sync do Pluggy (para o issuerCnpj chegar ao
 * espelho) → simulação → --apply. Reverter: o JSON do --apply traz os ids e o SQL.
 *
 *   npx tsx --env-file=.env scripts/pluggy/backfill-emissor-rf.ts [--user=<id>] [--saida=<arq.json>]
 *   npx tsx --env-file=.env scripts/pluggy/backfill-emissor-rf.ts --apply [--saida=<arq.json>]
 */
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { prisma } from '../../src/lib/prisma';
import { SUBTIPOS_PLUGGY_COM_EMISSOR } from '../../src/lib/fgc/produtosCobertos';
import {
  carregarIndiceEmissores,
  planejarBackfillEmissor,
  type CandidatoBackfill,
  type ItemBackfill,
} from '../../src/services/instituicoes/casarEmissor';

const APLICAR = process.argv.includes('--apply');
const arg = (nome: string) =>
  process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3) ?? null;
const USUARIO = arg('user');
const SAIDA =
  arg('saida') ??
  (APLICAR
    ? join(tmpdir(), `backfill-emissor-rf-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
    : null);

const mascarar = (id: string) => (id.length > 8 ? `${id.slice(0, 4)}…${id.slice(-2)}` : id);

/** Entre os espelhos que apontam para o mesmo FI (reconexão), o ativo, com CNPJ e mais recente. */
function melhorEspelho<
  T extends { ativo: boolean; issuerCnpj: string | null; issuer: string | null; updatedAt: Date },
>(a: T, b: T): T {
  if (a.ativo !== b.ativo) return a.ativo ? a : b;
  if (!!a.issuerCnpj !== !!b.issuerCnpj) return a.issuerCnpj ? a : b;
  if (!!a.issuer !== !!b.issuer) return a.issuer ? a : b;
  return a.updatedAt >= b.updatedAt ? a : b;
}

async function main() {
  console.log(
    `=== Emissor da renda fixa do Open Finance — ${APLICAR ? 'APLICANDO' : 'simulação (nada é gravado)'}${USUARIO ? ` · usuário ${mascarar(USUARIO)}` : ''} ===`,
  );

  const espelhos = await prisma.bankInvestment.findMany({
    where: {
      type: 'FIXED_INCOME',
      subtype: { in: [...SUBTIPOS_PLUGGY_COM_EMISSOR] },
      importStatus: { in: ['importado', 'vinculado'] },
      fixedIncomeAssetId: { not: null },
      ...(USUARIO ? { userId: USUARIO } : {}),
    },
    select: {
      userId: true,
      subtype: true,
      issuer: true,
      issuerCnpj: true,
      portfolioId: true,
      fixedIncomeAssetId: true,
      ativo: true,
      updatedAt: true,
    },
  });
  const porFi = new Map<string, (typeof espelhos)[number]>();
  const portfoliosEspelho = new Map<string, Set<string>>();
  for (const e of espelhos) {
    const fiId = e.fixedIncomeAssetId!;
    const atual = porFi.get(fiId);
    porFi.set(fiId, atual ? melhorEspelho(atual, e) : e);
    if (e.portfolioId) {
      const s = portfoliosEspelho.get(fiId) ?? new Set<string>();
      s.add(e.portfolioId);
      portfoliosEspelho.set(fiId, s);
    }
  }

  const fis = await prisma.fixedIncomeAsset.findMany({
    where: {
      id: { in: [...porFi.keys()] },
      emissorInstitutionId: null,
      tesouroBondType: null,
    },
    select: {
      id: true,
      userId: true,
      assetId: true,
      type: true,
      tesouroBondType: true,
      emissorInstitutionId: true,
      asset: { select: { symbol: true } },
    },
  });
  // Portfolio do ativo: é o entityId do 'ativo.editar' no histórico.
  const portfolios = await prisma.portfolio.findMany({
    where: { assetId: { in: fis.map((f) => f.assetId) } },
    select: { id: true, userId: true, assetId: true },
  });

  const candidatos: CandidatoBackfill[] = [];
  for (const fi of fis) {
    const espelho = porFi.get(fi.id)!;
    // Segurança: espelho e FI do mesmo usuário.
    if (espelho.userId !== fi.userId) continue;
    const ids = new Set(portfoliosEspelho.get(fi.id) ?? []);
    for (const p of portfolios) {
      if (p.assetId === fi.assetId && p.userId === fi.userId) ids.add(p.id);
    }
    candidatos.push({
      fixedIncomeAssetId: fi.id,
      userId: fi.userId,
      portfolioIds: [...ids],
      fiType: fi.type,
      tesouroBondType: fi.tesouroBondType,
      emissorInstitutionId: fi.emissorInstitutionId,
      assetSymbol: fi.asset?.symbol ?? null,
      pluggySubtype: espelho.subtype,
      issuer: espelho.issuer,
      issuerCnpj: espelho.issuerCnpj,
    });
  }

  const entityIds = [...new Set(candidatos.flatMap((c) => c.portfolioIds))];
  const logs =
    entityIds.length > 0
      ? await prisma.userChangeLog.findMany({
          where: { action: 'ativo.editar', entityId: { in: entityIds } },
          select: { userId: true, entityId: true, changes: true },
        })
      : [];

  const indice = await carregarIndiceEmissores(prisma);
  const itens = planejarBackfillEmissor(candidatos, logs, indice);

  const linha = (i: ItemBackfill) =>
    [
      mascarar(i.userId),
      `fi=${i.fixedIncomeAssetId}`,
      `issuer=${i.issuer ?? '-'}`,
      `issuerCnpj=${i.issuerCnpj ?? '-'}`,
      `via=${i.emissor?.via ?? '-'}`,
      `instituição=${i.emissor ? `${i.emissor.nome} (${i.emissor.id})` : '-'}`,
      i.puladoPorEscolha ? 'PULADO-POR-ESCOLHA' : '',
    ]
      .filter(Boolean)
      .join(' | ');
  for (const i of itens) console.log(`  ${linha(i)}`);

  const casados = itens.filter((i) => i.emissor);
  const totais = {
    espelhos: espelhos.length,
    fisSemEmissor: fis.length,
    avaliados: itens.length,
    casados: casados.length,
    porCnpj: casados.filter((i) => i.emissor!.via === 'cnpj').length,
    porNome: casados.filter((i) => i.emissor!.via === 'nome').length,
    porApelido: casados.filter((i) => i.emissor!.via === 'apelido').length,
    semCasamento: itens.filter((i) => !i.emissor && !i.puladoPorEscolha).length,
    puladosPorEscolha: itens.filter((i) => i.puladoPorEscolha).length,
  };
  console.log('\ntotais:', totais);

  const alterados: Array<{ fixedIncomeAssetId: string; emissorInstitutionId: string }> = [];
  if (APLICAR) {
    for (const i of casados) {
      const r = await prisma.fixedIncomeAsset.updateMany({
        // Condicional: se o usuário escolheu o emissor no meio-tempo, não sobrescreve.
        where: { id: i.fixedIncomeAssetId, emissorInstitutionId: null },
        data: { emissorInstitutionId: i.emissor!.id },
      });
      if (r.count > 0) {
        alterados.push({
          fixedIncomeAssetId: i.fixedIncomeAssetId,
          emissorInstitutionId: i.emissor!.id,
        });
      }
    }
    console.log(`\ngravados: ${alterados.length} FI(s)`);
  }

  if (SAIDA) {
    const relatorio = {
      geradoEm: new Date().toISOString(),
      modo: APLICAR ? 'apply' : 'simulacao',
      usuario: USUARIO,
      totais,
      itens: itens.map((i) => ({
        fixedIncomeAssetId: i.fixedIncomeAssetId,
        userId: mascarar(i.userId),
        issuer: i.issuer,
        issuerCnpj: i.issuerCnpj,
        via: i.emissor?.via ?? null,
        emissorInstitutionId: i.emissor?.id ?? null,
        emissorNome: i.emissor?.nome ?? null,
        puladoPorEscolha: i.puladoPorEscolha,
      })),
      alterados,
      // Só desfaz o que ainda está como o backfill deixou (não apaga escolha posterior do usuário).
      reverter: alterados.map(
        (a) =>
          `UPDATE fixed_income_assets SET "emissorInstitutionId" = NULL WHERE id = '${a.fixedIncomeAssetId}' AND "emissorInstitutionId" = '${a.emissorInstitutionId}';`,
      ),
    };
    writeFileSync(SAIDA, JSON.stringify(relatorio, null, 2));
    console.log(`relatório: ${SAIDA}`);
  }
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
