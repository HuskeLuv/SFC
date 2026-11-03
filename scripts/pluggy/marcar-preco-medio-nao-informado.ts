/**
 * Marca as compras de ação/FII/ETF que o Open Finance JÁ importou sem custo (03/11/2026): o banco
 * manda só quantidade e cotação atual, e a compra entrou com a cotação e a data do dia da conexão
 * como se fossem o preço médio (ex.: IVVB11 40 × R$ 472, real R$ 393,70). A importação nova já
 * grava o marcador; este script só alcança o legado.
 *
 * Marca = notes.operation.precoMedioNaoInformado (src/lib/precoMedioNaoInformado.ts). Não mexe em
 * preço, quantidade, data nem no Portfolio: a Carteira só passa a mostrar o aviso "Preço médio não
 * informado pelo banco — informe" até o cliente corrigir a compra.
 *
 * Alvo: bank_investments EQUITY/ETF 'importado' sem amountOriginal → a compra do mesmo usuário e
 * ativo cujas notes ainda são as da importação (texto "Importado do banco (Open Finance)", ou
 * { raw } depois de trocar a instituição). Pula compra que o cliente já editou (transacao.editar
 * no histórico de alterações). Update condicional pelas notes antigas: rodar de novo não muda nada.
 *
 *   npx tsx --env-file=.env scripts/pluggy/marcar-preco-medio-nao-informado.ts [--user=<e-mail>] [--saida=<arq.json>]
 *   ... --apply --saida=/var/tmp/preco-medio-apply.json
 *   ... --restaurar=/var/tmp/preco-medio-apply.json   (devolve as notes de antes)
 */
import { readFileSync, writeFileSync } from 'fs';
import { prisma } from '../../src/lib/prisma';
import { NOTA_IMPORTACAO } from '../../src/services/pluggy/importarCarteira';
import { lerNotesTransacao } from '../../src/lib/ativoEmDolar';
import {
  comMarcadorPrecoMedio,
  temPrecoMedioNaoInformado,
} from '../../src/lib/precoMedioNaoInformado';

const APLICAR = process.argv.includes('--apply');
const arg = (nome: string) =>
  process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3) ?? null;
const EMAIL = arg('user');
const SAIDA = arg('saida');
const RESTAURAR = arg('restaurar');

interface Marcacao {
  txId: string;
  email: string;
  ticker: string;
  quantidade: number;
  preco: number;
  data: string;
  notesAntes: string | null;
  notesDepois: string;
}
interface Pulada {
  email: string;
  ticker: string;
  motivo: string;
}
interface Relatorio {
  aplicado: boolean;
  em: string;
  marcadas: Marcacao[];
  puladas: Pulada[];
}

/** Notes ainda são as que a importação gravou (texto solto, ou { raw } da troca de instituição)? */
function notesDaImportacao(notes: string | null): boolean {
  if (!notes) return false;
  if (notes === NOTA_IMPORTACAO) return true;
  const obj = lerNotesTransacao(notes);
  return !!obj && (obj.raw === NOTA_IMPORTACAO || obj.observacoes === NOTA_IMPORTACAO);
}

async function restaurar(arquivo: string) {
  const rel = JSON.parse(readFileSync(arquivo, 'utf8')) as Relatorio;
  if (!rel.aplicado) throw new Error('O relatório não é de um --apply');
  let n = 0;
  for (const m of rel.marcadas) {
    // Só volta se ninguém mexeu depois (notes ainda iguais às gravadas pelo --apply).
    const r = await prisma.stockTransaction.updateMany({
      where: { id: m.txId, notes: m.notesDepois },
      data: { notes: m.notesAntes },
    });
    n += r.count;
  }
  console.log(`✅ restauradas: ${n} de ${rel.marcadas.length}`);
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
      type: { in: ['EQUITY', 'ETF'] },
      importStatus: 'importado',
      amountOriginal: null,
      assetId: { not: null },
    },
    select: { userId: true, assetId: true, code: true, user: { select: { email: true } } },
  });

  const marcadas: Marcacao[] = [];
  const puladas: Pulada[] = [];
  const vistas = new Set<string>();
  for (const b of importadas) {
    const ticker = b.code ?? '-';
    const compras = await prisma.stockTransaction.findMany({
      where: { userId: b.userId, assetId: b.assetId, type: 'compra' },
      select: { id: true, quantity: true, price: true, date: true, notes: true },
      orderBy: { date: 'asc' },
    });
    if (compras.some((c) => temPrecoMedioNaoInformado(c.notes))) {
      puladas.push({ email: b.user.email, ticker, motivo: 'já marcada' });
      continue;
    }
    const daImportacao = compras.filter((c) => notesDaImportacao(c.notes) && !vistas.has(c.id));
    if (daImportacao.length !== 1) {
      puladas.push({
        email: b.user.email,
        ticker,
        motivo: `${daImportacao.length} compras com a nota da importação`,
      });
      continue;
    }
    const c = daImportacao[0];
    vistas.add(c.id);
    const editada = await prisma.userChangeLog.count({
      where: { userId: b.userId, action: 'transacao.editar', entityId: c.id, undoneAt: null },
    });
    if (editada > 0) {
      puladas.push({ email: b.user.email, ticker, motivo: 'compra já editada pelo cliente' });
      continue;
    }
    marcadas.push({
      txId: c.id,
      email: b.user.email,
      ticker,
      quantidade: c.quantity,
      preco: c.price,
      data: c.date.toISOString().slice(0, 10),
      notesAntes: c.notes,
      notesDepois: comMarcadorPrecoMedio(c.notes, NOTA_IMPORTACAO),
    });
  }

  console.log(`\nA marcar (${marcadas.length})`);
  console.table(
    marcadas.map(({ email, ticker, quantidade, preco, data }) => ({
      email,
      ticker,
      quantidade,
      preco,
      data,
    })),
  );
  console.log(`\nPuladas (${puladas.length})`);
  if (puladas.length) console.table(puladas);

  if (APLICAR) {
    let n = 0;
    for (const m of marcadas) {
      const r = await prisma.stockTransaction.updateMany({
        where: { id: m.txId, notes: m.notesAntes },
        data: { notes: m.notesDepois },
      });
      n += r.count;
    }
    console.log(`\n✅ aplicado: ${n} compras marcadas`);
  } else {
    console.log('\n(dry-run: nada gravado; use --apply --saida=<arq.json>)');
  }
  if (SAIDA) {
    const rel: Relatorio = { aplicado: APLICAR, em: new Date().toISOString(), marcadas, puladas };
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
