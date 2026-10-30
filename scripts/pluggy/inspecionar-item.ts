/**
 * Só leitura: mostra o que o Pluggy tem de uma conexão (item, estado de cada produto, consentimento,
 * contas e TODOS os investimentos, página a página) ao lado do que está em bank_investments. Serve
 * para separar "o banco/Pluggy não mandou" de "chegou e não importamos" (ticket do Leonardo,
 * 23/10/2026: CDBs do BTG não apareceram). Não grava nada, nem no banco nem no Pluggy (sem
 * updateItem/PATCH). Não imprime CPF, número de conta nem credenciais. Na renda fixa mostra o
 * emissor (issuer e issuerCNPJ), o casamento com o catálogo e o emissor gravado (FGC).
 *
 *   npx tsx --env-file=.env scripts/pluggy/inspecionar-item.ts --conexao=<bank_connections.id>
 */
import { prisma } from '../../src/lib/prisma';
import { getPluggyClient } from '../../src/lib/pluggy';
import {
  carregarIndiceEmissores,
  casarEmissor,
} from '../../src/services/instituicoes/casarEmissor';

const arg = (nome: string) =>
  process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3) ?? null;
const CONEXAO = arg('conexao');

const brl = (v: number | null | undefined) =>
  typeof v === 'number' ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-';
const data = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : '-');

async function main() {
  if (!CONEXAO) throw new Error('informe --conexao=<bank_connections.id>');
  const conexao = await prisma.bankConnection.findUnique({
    where: { id: CONEXAO },
    select: { providerItemId: true, connectorName: true, createdAt: true, lastSyncAt: true },
  });
  if (!conexao) throw new Error(`conexão ${CONEXAO} não encontrada`);
  const client = getPluggyClient();
  const itemId = conexao.providerItemId;

  const item = await client.fetchItem(itemId);
  console.log(`== item ${itemId} (${item.connector?.name} #${item.connector?.id})`);
  console.log(
    `status=${item.status} execução=${item.executionStatus} erro=${item.error?.code ?? '-'}`,
  );
  console.log(`criado=${data(item.createdAt)} última atualização=${data(item.lastUpdatedAt)}`);
  console.log('produtos (isUpdated / lastUpdatedAt / avisos):');
  for (const [produto, estado] of Object.entries(item.statusDetail ?? {})) {
    if (!estado) {
      console.log(`  ${produto}: -`);
      continue;
    }
    const avisos = (estado.warnings ?? []).map((w) => `${w.code} ${w.message}`).join(' | ');
    console.log(
      `  ${produto}: ${estado.isUpdated} / ${data(estado.lastUpdatedAt)}${avisos ? ` / ${avisos}` : ''}`,
    );
  }

  const consentimentos = (await client.fetchConsents(itemId)).results;
  console.log(`\n== consentimentos (${consentimentos.length})`);
  for (const c of consentimentos) {
    console.log(
      `  criado=${data(c.createdAt)} expira=${data(c.expiresAt)} revogado=${data(c.revokedAt)}`,
    );
    console.log(`  produtos: ${c.products.join(', ')}`);
    console.log(`  permissões OF: ${c.openFinancePermissionsGranted.join(', ')}`);
  }

  const contas = (await client.fetchAccounts(itemId)).results;
  console.log(`\n== contas (${contas.length})`);
  for (const a of contas) {
    console.log(`  ${a.type}/${a.subtype} ${a.name} saldo=${brl(a.balance)}`);
  }

  const investimentos = [];
  let pagina = 1;
  let totalPaginas = 1;
  do {
    const r = await client.fetchInvestments(itemId, undefined, { page: pagina, pageSize: 500 });
    investimentos.push(...r.results);
    totalPaginas = r.totalPages;
    pagina++;
  } while (pagina <= totalPaginas);
  console.log(`\n== investimentos no Pluggy (${investimentos.length}, ${totalPaginas} página(s))`);
  for (const i of investimentos) {
    console.log(
      `  ${i.type}/${i.subtype ?? '-'} ${i.name} code=${i.code ?? '-'} saldo=${brl(i.balance)} status=${i.status ?? '-'} emissor=${i.issuer ?? '-'} cnpjEmissor=${i.issuerCNPJ ?? '-'} data=${data(i.date)}`,
    );
  }

  const nossos = await prisma.bankInvestment.findMany({
    where: { connectionId: CONEXAO },
    select: {
      providerInvestmentId: true,
      type: true,
      subtype: true,
      name: true,
      importStatus: true,
      issuer: true,
      issuerCnpj: true,
      fixedIncomeAssetId: true,
    },
  });
  // Emissor (FGC): o que o Pluggy informou, o casamento com o catálogo e o que está gravado no FI.
  const indice = await carregarIndiceEmissores(prisma);
  const fis = await prisma.fixedIncomeAsset.findMany({
    where: { id: { in: nossos.map((n) => n.fixedIncomeAssetId).filter((x): x is string => !!x) } },
    select: { id: true, emissor: { select: { nome: true } } },
  });
  const emissorDoFi = new Map(fis.map((f) => [f.id, f.emissor?.nome ?? null]));
  const noPluggy = new Set(investimentos.map((i) => i.id));
  const nossosIds = new Set(nossos.map((n) => n.providerInvestmentId));
  console.log(`\n== bank_investments (${nossos.length})`);
  for (const n of nossos) {
    const marca = noPluggy.has(n.providerInvestmentId) ? '' : '  <- não está mais no Pluggy';
    console.log(`  ${n.type}/${n.subtype ?? '-'} ${n.name} → ${n.importStatus}${marca}`);
    if (n.type === 'FIXED_INCOME') {
      const casado = casarEmissor(indice, { cnpj: n.issuerCnpj, nome: n.issuer });
      const gravado = n.fixedIncomeAssetId
        ? (emissorDoFi.get(n.fixedIncomeAssetId) ?? 'usar a corretora')
        : '-';
      console.log(
        `    emissor=${n.issuer ?? '-'} cnpjEmissor=${n.issuerCnpj ?? '-'} casamento=${casado ? `${casado.nome} (${casado.via})` : '-'} gravado=${gravado}`,
      );
    }
  }
  const faltando = investimentos.filter((i) => !nossosIds.has(i.id));
  console.log(`\nno Pluggy e não em bank_investments: ${faltando.length}`);
  for (const i of faltando) console.log(`  ${i.type}/${i.subtype ?? '-'} ${i.name}`);
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
