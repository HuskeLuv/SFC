/**
 * Cartão no mês do vencimento da fatura (ticket 86e3tjtep, 20/10/2026) para o que JÁ foi
 * importado: busca as faturas de cada cartão no Pluggy, calcula a competência de todas as
 * compras e move as já lançadas no Fluxo de Caixa para o mês da fatura. Só a parte do banco
 * (CashflowValue.valorBanco) muda de mês; o que o usuário digitou na célula fica.
 *
 * Ordem em prod (cada passo com OK do Wellington):
 *   1. simulação (lê o banco e o Pluggy, não grava nada);
 *   2. --apply --backup=/tmp/x.json (guarda value/valorBanco das células afetadas antes);
 *   3. ligar PLUGGY_CARTAO_MES_FATURA=true no app.env + restart (o sync passa a manter).
 * Reverter: --reverter (simulação) e --reverter --apply --backup=… → competência volta a null
 * e as células voltam ao mês da data; depois desligar a chave.
 *
 *   npx tsx --env-file=.env scripts/pluggy/backfill-competencia-cartao.ts [--usuario=<id>]
 *   npx tsx --env-file=.env scripts/pluggy/backfill-competencia-cartao.ts --apply --backup=/tmp/cartao.json
 */
import { writeFileSync } from 'fs';
import { prisma } from '../../src/lib/prisma';
import { getPluggyClient } from '../../src/lib/pluggy';
import {
  celulaDe,
  chaveCelula,
  recomputarCelula,
  type Celula,
} from '../../src/services/pluggy/caixaEntrada';
import {
  atualizarCompetenciasDoCartao,
  sincronizarFaturas,
} from '../../src/services/pluggy/faturasCartao';

const APLICAR = process.argv.includes('--apply');
const REVERTER = process.argv.includes('--reverter');
const arg = (nome: string) =>
  process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3) ?? null;
const USUARIO = arg('usuario');
const BACKUP = arg('backup');

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rot = (ano: number, mes: number) => `${MESES[mes]}/${ano}`;

interface Movimento {
  userId: string;
  txId: string;
  itemId: string;
  valor: number;
  de: string;
  para: string;
}

async function main() {
  if (APLICAR && !BACKUP) throw new Error('--apply exige --backup=<arquivo.json>');
  console.log(
    `=== Cartão no mês da fatura — ${REVERTER ? 'REVERTER' : 'calcular'} (${APLICAR ? 'APLICANDO' : 'simulação'}) ===`,
  );

  const contas = await prisma.bankAccount.findMany({
    where: {
      type: 'CREDIT',
      ...(USUARIO ? { userId: USUARIO } : {}),
      connection: { status: { not: 'DELETED' } },
    },
    select: { id: true, providerAccountId: true, userId: true, creditDueDate: true, name: true },
  });

  const movimentos: Movimento[] = [];
  const celulas = new Map<string, Celula & { userId: string }>();
  let txMudam = 0;
  const client = REVERTER ? null : getPluggyClient();

  for (const conta of contas) {
    if (REVERTER) {
      const txs = await prisma.bankTransaction.findMany({
        where: { accountId: conta.id, competenciaAno: { not: null } },
        select: {
          id: true,
          cashflowItemId: true,
          amount: true,
          date: true,
          competenciaAno: true,
          competenciaMes: true,
        },
      });
      txMudam += txs.length;
      for (const t of txs) {
        if (!t.cashflowItemId) continue;
        const de = celulaDe(t.cashflowItemId, t);
        const para = celulaDe(t.cashflowItemId, { date: t.date });
        celulas.set(`${conta.userId}|${chaveCelula(de)}`, { ...de, userId: conta.userId });
        celulas.set(`${conta.userId}|${chaveCelula(para)}`, { ...para, userId: conta.userId });
        if (chaveCelula(de) !== chaveCelula(para)) {
          movimentos.push({
            userId: conta.userId,
            txId: t.id,
            itemId: t.cashflowItemId,
            valor: Math.abs(Number(t.amount)),
            de: rot(de.year, de.month),
            para: rot(para.year, para.month),
          });
        }
      }
      if (APLICAR && txs.length) {
        await prisma.bankTransaction.updateMany({
          where: { id: { in: txs.map((t) => t.id) } },
          data: { competenciaAno: null, competenciaMes: null },
        });
      }
      continue;
    }

    const faturas = await sincronizarFaturas(client!, conta, { gravar: APLICAR });
    const { mudancas, celulas: tocadas } = await atualizarCompetenciasDoCartao(conta, faturas, {
      aplicar: APLICAR,
    });
    console.log(
      `  cartão ${conta.id.slice(0, 8)} (user ${conta.userId.slice(0, 8)}): ${faturas.length} faturas, ${mudancas.length} transações com competência nova`,
    );
    txMudam += mudancas.length;
    for (const c of tocadas)
      celulas.set(`${conta.userId}|${chaveCelula(c)}`, { ...c, userId: conta.userId });
    const datas = new Map(
      (
        await prisma.bankTransaction.findMany({
          where: { id: { in: mudancas.filter((m) => m.cashflowItemId).map((m) => m.id) } },
          select: { id: true, date: true },
        })
      ).map((t) => [t.id, t.date]),
    );
    for (const m of mudancas) {
      if (!m.cashflowItemId) continue;
      const data = datas.get(m.id)!;
      const de = m.de ?? { ano: data.getUTCFullYear(), mes: data.getUTCMonth() };
      if (de.ano === m.para.ano && de.mes === m.para.mes) continue;
      movimentos.push({
        userId: conta.userId,
        txId: m.id,
        itemId: m.cashflowItemId,
        valor: Math.abs(m.amount),
        de: rot(de.ano, de.mes),
        para: rot(m.para.ano, m.para.mes),
      });
    }
  }

  // Resumo por usuário: lançadas que mudam de mês e o valor que anda.
  const porUsuario = new Map<string, { n: number; valor: number; rotas: Map<string, number> }>();
  for (const m of movimentos) {
    const u = porUsuario.get(m.userId) ?? { n: 0, valor: 0, rotas: new Map() };
    u.n += 1;
    u.valor += m.valor;
    const k = `${m.de} → ${m.para}`;
    u.rotas.set(k, (u.rotas.get(k) ?? 0) + m.valor);
    porUsuario.set(m.userId, u);
  }
  console.log(`\nCartões: ${contas.length} · transações com competência nova/limpa: ${txMudam}`);
  console.log(
    `Lançadas no Fluxo que mudam de mês: ${movimentos.length} (${porUsuario.size} usuários)`,
  );
  for (const [userId, u] of porUsuario) {
    console.log(`  user ${userId.slice(0, 8)}: ${u.n} lançadas, R$ ${u.valor.toFixed(2)}`);
    for (const [rota, valor] of u.rotas) console.log(`      ${rota}: R$ ${valor.toFixed(2)}`);
  }
  console.log(`Células do Fluxo a recalcular: ${celulas.size}`);

  if (!APLICAR) {
    console.log('\nSimulação: nada foi gravado. Para aplicar: --apply --backup=<arquivo.json>');
    return;
  }

  const antes = await Promise.all(
    [...celulas.values()].map((c) =>
      prisma.cashflowValue
        .findUnique({
          where: {
            itemId_userId_year_month: {
              itemId: c.itemId,
              userId: c.userId,
              year: c.year,
              month: c.month,
            },
          },
          select: {
            itemId: true,
            userId: true,
            year: true,
            month: true,
            value: true,
            valorBanco: true,
            formula: true,
          },
        })
        .then((v) => v ?? { ...c, value: null, valorBanco: null, formula: null }),
    ),
  );
  writeFileSync(
    BACKUP!,
    JSON.stringify({ geradoEm: new Date().toISOString(), celulas: antes }, null, 2),
  );
  console.log(`Backup das ${antes.length} células em ${BACKUP}`);

  for (const c of celulas.values()) {
    await recomputarCelula(c.userId, { itemId: c.itemId, year: c.year, month: c.month });
  }
  console.log(`Aplicado: ${celulas.size} células recalculadas.`);
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
