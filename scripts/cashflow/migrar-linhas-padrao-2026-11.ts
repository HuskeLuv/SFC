/**
 * Migra as linhas padrão do Fluxo de Caixa para a planilha-base do Pedro (30/10/2026). O plano é
 * src/services/cashflow/linhasPadrao/planejarMigracao.ts (puro, com as regras); aqui só lê,
 * grava numa transação e relata. Dry-run é o padrão. Idempotente: rodar de novo depois do
 * --apply dá um plano vazio.
 *
 *   npx tsx --env-file=.env scripts/cashflow/migrar-linhas-padrao-2026-11.ts --saida=/var/tmp/linhas-dry.json
 *   npx tsx --env-file=.env scripts/cashflow/migrar-linhas-padrao-2026-11.ts --apply \
 *     --saida=/var/tmp/linhas-apply.json
 *
 * Opções:
 *   --apply          grava (exige --saida)
 *   --saida=rel.json plano completo + as linhas apagadas por inteiro (para reverter)
 *
 * Reverter: restaurar o backup da tabela "CashflowItem" feito antes (pg_dump -t '"CashflowItem"');
 * nenhum valor (CashflowValue) é movido ou apagado, só linhas sem dados.
 */
import { writeFileSync } from 'fs';
import { prisma } from '../../src/lib/prisma';
import { LINHAS_PADRAO } from '../../src/lib/cashflow/linhasPadrao';
import {
  planejarMigracao,
  type PlanoMigracao,
  type RefTemplate,
} from '../../src/services/cashflow/linhasPadrao/planejarMigracao';

const APLICAR = process.argv.includes('--apply');
const arg = (nome: string) =>
  process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3) ?? null;
const SAIDA = arg('saida');

async function lerEstado() {
  const [gruposTemplate, itensTemplate, gruposUsuario, itensUsuario] = await Promise.all([
    prisma.cashflowGroup.findMany({ where: { userId: null }, select: { id: true, name: true } }),
    prisma.cashflowItem.findMany({
      where: { userId: null },
      select: {
        id: true,
        groupId: true,
        name: true,
        orderIndex: true,
        significado: true,
        rank: true,
      },
    }),
    prisma.cashflowGroup.findMany({
      where: { userId: { not: null } },
      select: { id: true, userId: true, templateId: true },
    }),
    prisma.cashflowItem.findMany({
      where: { userId: { not: null } },
      select: {
        id: true,
        userId: true,
        groupId: true,
        templateId: true,
        name: true,
        hidden: true,
        objetivoId: true,
        dividaId: true,
        isGeral: true,
        _count: { select: { values: true, bankTransactions: true, orcamentoItens: true } },
      },
    }),
  ]);
  return {
    gruposTemplate,
    itensTemplate,
    gruposUsuario: gruposUsuario.map((g) => ({ ...g, userId: g.userId! })),
    itensUsuario: itensUsuario.map((i) => {
      const espelhoOuGeral = i.objetivoId !== null || i.dividaId !== null || i.isGeral;
      return {
        id: i.id,
        userId: i.userId!,
        groupId: i.groupId,
        templateId: i.templateId,
        name: i.name,
        hidden: i.hidden,
        espelhoOuGeral,
        temDados:
          espelhoOuGeral ||
          i._count.values > 0 ||
          i._count.bankTransactions > 0 ||
          i._count.orcamentoItens > 0,
      };
    }),
  };
}

function resumir(plano: PlanoMigracao) {
  const porUsuario = (lista: { userId: string }[]) => new Set(lista.map((x) => x.userId)).size;
  return {
    template: {
      renomear: plano.renomear.length,
      criar: plano.criar.length,
      aposentar: plano.aposentar.length,
      atualizarPosicao: plano.atualizar.length,
    },
    usuarios: {
      vincularLegado: `${plano.vincularLegado.length} linhas / ${porUsuario(plano.vincularLegado)} usuários`,
      desvincularComDados: `${plano.desvincular.length} linhas / ${porUsuario(plano.desvincular)} usuários`,
      apagarSemDados: `${plano.apagar.length} linhas / ${porUsuario(plano.apagar)} usuários`,
      adotarCustom: `${plano.adotar.length} linhas / ${porUsuario(plano.adotar)} usuários`,
      ocultarNova: `${plano.ocultar.length} linhas / ${porUsuario(plano.ocultar)} usuários`,
    },
    avisos: plano.avisos,
  };
}

async function aplicar(plano: PlanoMigracao) {
  return prisma.$transaction(
    async (tx) => {
      const idCriado = new Map<string, string>();
      const resolver = (ref: RefTemplate): string => {
        if ('id' in ref) return ref.id;
        const id = idCriado.get(ref.criar);
        if (!id) throw new Error(`linha a criar não resolvida: ${ref.criar}`);
        return id;
      };

      // Usuários primeiro: soltam as cópias das linhas-template que vão sair.
      for (const v of plano.vincularLegado) {
        await tx.cashflowItem.update({
          where: { id: v.itemId, templateId: null },
          data: { templateId: v.templateId },
        });
      }
      for (const d of plano.desvincular) {
        await tx.cashflowItem.update({ where: { id: d.itemId }, data: { templateId: null } });
      }
      const apagarIds = plano.apagar.map((a) => a.itemId);
      const apagadas = await tx.cashflowItem.findMany({ where: { id: { in: apagarIds } } });
      if (apagarIds.length > 0) {
        const comDados = await tx.cashflowItem.count({
          where: {
            id: { in: apagarIds },
            OR: [
              { values: { some: {} } },
              { bankTransactions: { some: {} } },
              { orcamentoItens: { some: {} } },
            ],
          },
        });
        if (comDados > 0) throw new Error(`${comDados} linha(s) a apagar ganharam dados: abortado`);
        await tx.cashflowItem.deleteMany({ where: { id: { in: apagarIds } } });
      }

      // Template.
      const tplAposentadas = await tx.cashflowItem.findMany({
        where: { id: { in: plano.aposentar.map((a) => a.id) } },
      });
      for (const a of plano.aposentar) {
        const refs = await tx.cashflowItem.count({ where: { templateId: a.id } });
        if (refs > 0)
          throw new Error(`linha-template ${a.grupo}/${a.name} ainda tem ${refs} cópias`);
      }
      await tx.cashflowItem.deleteMany({
        where: { id: { in: plano.aposentar.map((a) => a.id) }, userId: null },
      });
      for (const r of plano.renomear) {
        await tx.cashflowItem.update({ where: { id: r.id, userId: null }, data: { name: r.para } });
      }
      for (const u of plano.atualizar) {
        await tx.cashflowItem.update({
          where: { id: u.id, userId: null },
          data: {
            orderIndex: u.orderIndex,
            ...(u.limparPorque ? { significado: null, rank: null } : {}),
          },
        });
      }
      for (const c of plano.criar) {
        const novo = await tx.cashflowItem.create({
          data: { userId: null, groupId: c.groupId, name: c.name, orderIndex: c.orderIndex },
          select: { id: true },
        });
        idCriado.set(c.chave, novo.id);
      }

      // Colisões de nome com linhas que o usuário já tem.
      for (const a of plano.adotar) {
        await tx.cashflowItem.update({
          where: { id: a.itemId, templateId: null },
          data: { templateId: resolver(a.template) },
        });
      }
      for (const o of plano.ocultar) {
        const templateId = resolver(o.template);
        const tpl = await tx.cashflowItem.findUniqueOrThrow({ where: { id: templateId } });
        await tx.cashflowItem.create({
          data: {
            userId: o.userId,
            groupId: o.userGroupId,
            templateId,
            name: tpl.name,
            orderIndex: tpl.orderIndex,
            hidden: true,
          },
        });
      }

      return { apagadas, tplAposentadas, idCriado: Object.fromEntries(idCriado) };
    },
    { timeout: 120_000 },
  );
}

async function main() {
  if (APLICAR && !SAIDA) throw new Error('--apply exige --saida=<arquivo.json>');
  const estado = await lerEstado();
  const plano = planejarMigracao(estado, LINHAS_PADRAO);
  const resumo = resumir(plano);
  console.log(JSON.stringify(resumo, null, 2));

  let gravado: Awaited<ReturnType<typeof aplicar>> | null = null;
  if (APLICAR) {
    gravado = await aplicar(plano);
    console.log('✅ aplicado');
  } else {
    console.log('(dry-run: nada gravado; use --apply)');
  }
  if (SAIDA) {
    writeFileSync(
      SAIDA,
      JSON.stringify(
        { aplicado: APLICAR, em: new Date().toISOString(), resumo, plano, gravado },
        null,
        2,
      ),
    );
    console.log(`relatório: ${SAIDA}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
