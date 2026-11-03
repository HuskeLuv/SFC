/**
 * Zera a parte DIGITADA das células de uma linha "Geral" do Orçamento v2, mantendo a parte lançada
 * pelo banco (valorBanco, Open Finance). Uso pontual (ticket 86e3vxd5r, 03/11/2026): a Geral de
 * Habitação do Pedro recebeu, ao excluir linhas, valores que ele já tinha lançado em outra linha.
 * Dry-run é o padrão. Idempotente: depois do --apply, um novo dry-run não tem o que mudar.
 *
 *   npx tsx --env-file=.env scripts/cashflow/zerar-manual-geral.ts --item=<id da Geral> \
 *     --email=<e-mail do dono> --saida=/var/tmp/geral-dry.json
 *   ... --apply --saida=/var/tmp/geral-apply.json
 *   ... --restaurar=/var/tmp/geral-apply.json            (volta cada célula ao estado de antes)
 *
 * Opções:
 *   --item=<id>        id da linha Geral (CashflowItem.isGeral = true) — obrigatório
 *   --email=<e-mail>   dono da linha (conferência: a linha tem de ser dele) — obrigatório
 *   --ano=<AAAA>       só um ano (padrão: todos)
 *   --apply            grava (exige --saida, que guarda o estado de antes para reverter)
 *   --saida=rel.json   relatório mês a mês: antes, depois
 *   --restaurar=rel    lê o relatório de um --apply e devolve as células ao estado "antes"
 *
 * O que muda por célula com valor digitado (value ≠ valorBanco): value = valorBanco, fórmula
 * removida (era a do valor somado) e uma linha no comentário. Cor e valorBanco ficam. Orçados e
 * transações do banco não são tocados. Depois de gravar, recalcula a Evolução do Patrimônio.
 */
import { readFileSync, writeFileSync } from 'fs';
import { prisma } from '../../src/lib/prisma';
import { recomputeEvolucaoSnapshotsSafe } from '../../src/services/cashflow/evolucaoPatrimonioServer';

const APLICAR = process.argv.includes('--apply');
const arg = (nome: string) =>
  process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3) ?? null;
const ITEM = arg('item');
const EMAIL = arg('email');
const ANO = arg('ano') ? Number(arg('ano')) : null;
const SAIDA = arg('saida');
const RESTAURAR = arg('restaurar');
const NOTA = 'Parte digitada zerada em 03/11/2026 (valores já lançados em outra linha).';

interface EstadoCelula {
  value: number;
  formula: string | null;
  comment: string | null;
}
interface Mudanca {
  id: string;
  ano: number;
  mes: number;
  valorBanco: number;
  antes: EstadoCelula;
  depois: EstadoCelula;
}

const n = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;

async function conferirLinha() {
  if (!ITEM || !EMAIL) throw new Error('Informe --item=<id da Geral> e --email=<e-mail do dono>');
  const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
  if (!user) throw new Error(`Usuário não encontrado: ${EMAIL}`);
  const item = await prisma.cashflowItem.findUnique({
    where: { id: ITEM },
    select: {
      id: true,
      name: true,
      isGeral: true,
      userId: true,
      group: { select: { name: true } },
    },
  });
  if (!item) throw new Error(`Linha não encontrada: ${ITEM}`);
  if (item.userId !== user.id) throw new Error('A linha não é deste usuário');
  if (!item.isGeral) throw new Error('A linha não é uma Geral do Orçamento v2');
  return { userId: user.id, rotulo: `${item.group?.name ?? '?'} / ${item.name}` };
}

async function restaurar(arquivo: string) {
  const rel = JSON.parse(readFileSync(arquivo, 'utf8')) as {
    aplicado: boolean;
    userId: string;
    mudancas: Mudanca[];
  };
  if (!rel.aplicado) throw new Error('O relatório não é de um --apply');
  let n2 = 0;
  await prisma.$transaction(async (tx) => {
    for (const m of rel.mudancas) {
      const r = await tx.cashflowValue.updateMany({
        where: { id: m.id, itemId: ITEM!, userId: rel.userId },
        data: { value: m.antes.value, formula: m.antes.formula, comment: m.antes.comment },
      });
      n2 += r.count;
    }
  });
  await recomputeEvolucaoSnapshotsSafe(rel.userId, new Date(0));
  console.log(`✅ restauradas ${n2} de ${rel.mudancas.length} células`);
}

async function main() {
  const { userId, rotulo } = await conferirLinha();
  if (RESTAURAR) return restaurar(RESTAURAR);
  if (APLICAR && !SAIDA) throw new Error('--apply exige --saida (é o backup para reverter)');

  const celulas = await prisma.cashflowValue.findMany({
    where: { itemId: ITEM!, userId, ...(ANO ? { year: ANO } : {}) },
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
    select: {
      id: true,
      year: true,
      month: true,
      value: true,
      valorBanco: true,
      formula: true,
      comment: true,
    },
  });
  const mudancas: Mudanca[] = celulas
    .filter((c) => n(c.value) !== n(c.valorBanco))
    .map((c) => ({
      id: c.id,
      ano: c.year,
      mes: c.month,
      valorBanco: n(c.valorBanco),
      antes: { value: n(c.value), formula: c.formula ?? null, comment: c.comment ?? null },
      depois: {
        value: n(c.valorBanco),
        formula: null,
        comment: [c.comment, NOTA].filter((x): x is string => Boolean(x && x.trim())).join('\n'),
      },
    }));

  const totalAntes = mudancas.reduce((t, m) => t + m.antes.value, 0);
  const totalDepois = mudancas.reduce((t, m) => t + m.depois.value, 0);
  console.log(`Linha: ${rotulo} (${ITEM})`);
  console.table(
    mudancas.map((m) => ({
      mes: `${String(m.mes + 1).padStart(2, '0')}/${m.ano}`,
      antes: m.antes.value,
      banco: m.valorBanco,
      depois: m.depois.value,
      zerado: n(m.antes.value - m.depois.value),
    })),
  );
  console.log(
    `${mudancas.length} células · antes R$ ${n(totalAntes)} · depois R$ ${n(totalDepois)} · ` +
      `sai R$ ${n(totalAntes - totalDepois)} digitado`,
  );

  if (APLICAR && mudancas.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const m of mudancas) {
        await tx.cashflowValue.update({
          where: { id: m.id },
          data: { value: m.depois.value, formula: m.depois.formula, comment: m.depois.comment },
        });
      }
    });
    await recomputeEvolucaoSnapshotsSafe(userId, new Date(0));
    console.log('✅ aplicado');
  } else if (!APLICAR) {
    console.log('(dry-run: nada gravado; use --apply)');
  }
  if (SAIDA) {
    writeFileSync(
      SAIDA,
      JSON.stringify(
        { aplicado: APLICAR, em: new Date().toISOString(), item: ITEM, userId, rotulo, mudancas },
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
