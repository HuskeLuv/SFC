/**
 * Carteira EUA em US$ (out/2026): migra as transações de Stocks EUA e REITs manuais para a
 * unidade gravada (notes.operation.unidade = 'USD') e marca a posição (moedaRegistro 'USD').
 * Lógica pura e testada em src/services/portfolio/migracaoEuaDolar.ts.
 *
 * DRY-RUN POR PADRÃO. Nada é gravado sem --apply. Em prod, quem roda é o Wellington.
 *
 * Uso:
 *   npx tsx scripts/migrar-carteira-eua-dolar.ts                          # pré-checagens + plano
 *   npx tsx scripts/migrar-carteira-eua-dolar.ts --apply                  # backup JSON + grava
 *   ... [--user=<userId>]            só um usuário
 *   ... [--renomear]                 'X - R$ N - data' → 'X - US$ N - data' (stocks)
 *   ... [--invalidar-snapshots]      apaga snapshots do usuário desde a 1ª data USD (com --apply)
 *   ... [--backup-dir=<dir>]         onde gravar o backup (padrão: diretório atual)
 *   npx tsx scripts/migrar-carteira-eua-dolar.ts --restore=<backup.json> [--apply]
 *
 * Passos (docs/carteira-eua-dolar/desenho.json, migracao_dados):
 *  0) pré-checagens só de leitura;
 *  1) seleção: stock/reit com currency 'USD' e symbol manual, transação sem marcador 'USD';
 *  2) backup JSON gravado e relido ANTES de qualquer escrita;
 *  3–4) REIT só ganha marcador; stock legado em R$ é convertido (ou pulado / decidir à mão);
 *  5) posição aberta: moedaRegistro 'USD' + recálculo pelo portfolioId, SEM snapshots;
 *     posição encerrada: só as transações (não recria Portfolio);
 *  6) --invalidar-snapshots: invalidatePortfolioSnapshots(userId, 1ª data USD);
 *  7) idempotente: a 2ª rodada não acha pendentes. Cada Asset numa $transaction.
 *  8) --restore regrava as linhas do backup como estavam (sem recálculo).
 */
import fs from 'node:fs';
import path from 'node:path';
import prisma from '@/lib/prisma';
import { isAtivoEmDolar, MOEDA_REGISTRO_USD } from '@/lib/ativoEmDolar';
import { carregarSerieCambio, SIMBOLO_CAMBIO_USD_BRL } from '@/services/market/cambioUsdBrl';
import {
  invalidatePortfolioSnapshots,
  recalculatePortfolioFromTransactions,
} from '@/services/portfolio/portfolioRecalculation';
import {
  SIMBOLO_MANUAL_RE,
  acaoDaPosicao,
  elegivelParaMigracao,
  montarRelatorioPreChecagem,
  planejarMigracaoAsset,
  posicaoPendente,
  type AssetMigracao,
  type PlanoAsset,
  type TxMigracao,
} from '@/services/portfolio/migracaoEuaDolar';

interface Args {
  apply: boolean;
  user: string | null;
  renomear: boolean;
  invalidarSnapshots: boolean;
  restore: string | null;
  backupDir: string;
}

const lerArgs = (): Args => {
  const valor = (nome: string) =>
    process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3) ?? null;
  return {
    apply: process.argv.includes('--apply'),
    user: valor('user'),
    renomear: process.argv.includes('--renomear'),
    invalidarSnapshots: process.argv.includes('--invalidar-snapshots'),
    restore: valor('restore'),
    backupDir: valor('backup-dir') ?? process.cwd(),
  };
};

interface Backup {
  versao: 1;
  criadoEm: string;
  args: Omit<Args, 'backupDir'>;
  stockTransactions: Array<{
    id: string;
    price: number;
    total: number;
    fees: number | null;
    notes: string | null;
  }>;
  portfolios: Array<{
    id: string;
    userId: string;
    assetId: string | null;
    quantity: number;
    avgPrice: number;
    totalInvested: number;
    moedaRegistro: string | null;
    totalInvestedBrl: number | null;
  }>;
  assets: Array<{ id: string; name: string | null }>;
}

const dia = (d: Date) => d.toISOString().slice(0, 10);
const n = (v: number | null | undefined, casas = 4) =>
  v == null ? '—' : Number(v.toFixed(casas)).toString();

// ---------------------------------------------------------------------------
// 0) Pré-checagens (só leitura)
// ---------------------------------------------------------------------------
async function preChecagens(user: string | null) {
  const porUsuario = user ? { userId: user } : {};
  const [assetsStockNaoBrl, posicoesStock, txUsd, proventosUsd, posicoesCurrency, serie] =
    await Promise.all([
      prisma.asset.findMany({
        // Asset.currency é obrigatória no schema: "nula" aqui = vazia.
        where: { type: 'stock', currency: { not: 'BRL' } },
        select: { symbol: true, currency: true },
      }),
      prisma.portfolio.findMany({
        where: { ...porUsuario, asset: { type: 'stock' } },
        select: { asset: { select: { symbol: true, currency: true } } },
      }),
      prisma.stockTransaction.findMany({
        where: { ...porUsuario, asset: { type: { in: ['stock', 'reit'] }, currency: 'USD' } },
        select: { userId: true, assetId: true, asset: { select: { symbol: true, type: true } } },
      }),
      prisma.portfolioProvento.findMany({
        where: {
          ...porUsuario,
          portfolio: { asset: { type: { in: ['stock', 'reit'] }, currency: 'USD' } },
        },
        select: {
          dataPagamento: true,
          valorTotal: true,
          source: true,
          portfolio: { select: { asset: { select: { symbol: true } } } },
        },
      }),
      prisma.portfolio.findMany({
        where: { ...porUsuario, asset: { type: 'currency' } },
        select: { quantity: true, totalInvested: true, asset: { select: { symbol: true } } },
      }),
      prisma.assetPriceHistory.findMany({
        where: { symbol: SIMBOLO_CAMBIO_USD_BRL },
        select: { date: true },
        orderBy: { date: 'asc' },
      }),
    ]);

  const chavesComPortfolio = new Set(
    (
      await prisma.portfolio.findMany({
        where: { ...porUsuario, assetId: { in: [...new Set(txUsd.map((t) => t.assetId!))] } },
        select: { userId: true, assetId: true },
      })
    ).map((p) => `${p.userId}:${p.assetId}`),
  );

  const relatorio = montarRelatorioPreChecagem({
    assetsStockNaoBrl: assetsStockNaoBrl.map((a) => ({
      symbol: a.symbol,
      currency: a.currency || null,
    })),
    posicoesStock: posicoesStock.map((p) => ({
      symbol: p.asset?.symbol ?? '?',
      currency: p.asset?.currency ?? null,
    })),
    txUsd: txUsd.map((t) => ({
      symbol: t.asset?.symbol ?? '?',
      type: t.asset?.type ?? '?',
      temPortfolio: chavesComPortfolio.has(`${t.userId}:${t.assetId}`),
    })),
    proventosUsd: proventosUsd.map((p) => ({
      symbol: p.portfolio?.asset?.symbol ?? '?',
      dataPagamento: p.dataPagamento,
      valorTotal: p.valorTotal,
      source: p.source,
    })),
    posicoesCurrency: posicoesCurrency.map((p) => ({
      symbol: p.asset?.symbol ?? '?',
      quantity: p.quantity,
      totalInvested: p.totalInvested,
    })),
    serieDatas: serie.map((s) => s.date),
    hoje: new Date(),
  });

  console.log('── 0) Pré-checagens (só leitura) ──────────────────────────────');
  for (const l of relatorio.linhas) console.log(`  ${l}`);
  if (relatorio.alertas.length > 0) {
    console.log('  ⚠ Alertas:');
    for (const a of relatorio.alertas) console.log(`    - ${a}`);
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// 1) Seleção + plano
// ---------------------------------------------------------------------------
interface ItemPlano {
  userId: string;
  asset: AssetMigracao;
  txs: TxMigracao[];
  plano: PlanoAsset;
  portfolio: {
    id: string;
    userId: string;
    assetId: string | null;
    quantity: number;
    avgPrice: number;
    totalInvested: number;
    moedaRegistro: string | null;
    totalInvestedBrl: number | null;
  } | null;
  /** Só a posição está pendente (transações já marcadas, moedaRegistro ≠ 'USD'). */
  soPosicao: boolean;
}

async function montarPlano(args: Args): Promise<ItemPlano[]> {
  const txs = await prisma.stockTransaction.findMany({
    where: {
      ...(args.user ? { userId: args.user } : {}),
      asset: { type: { in: ['stock', 'reit'] }, currency: 'USD' },
    },
    include: {
      asset: { select: { id: true, symbol: true, name: true, type: true, currency: true } },
    },
    orderBy: { date: 'asc' },
  });

  const grupos = new Map<string, { userId: string; asset: AssetMigracao; txs: TxMigracao[] }>();
  for (const t of txs) {
    if (!t.asset || !SIMBOLO_MANUAL_RE.test(t.asset.symbol)) continue;
    const asset: AssetMigracao = t.asset;
    if (!elegivelParaMigracao(asset)) continue;
    const chave = `${t.userId}:${asset.id}`;
    if (!grupos.has(chave)) grupos.set(chave, { userId: t.userId, asset, txs: [] });
    grupos.get(chave)!.txs.push({
      id: t.id,
      type: t.type,
      quantity: t.quantity,
      price: t.price,
      total: t.total,
      fees: t.fees,
      date: t.date,
      notes: t.notes,
    });
  }

  const portfolios = grupos.size
    ? await prisma.portfolio.findMany({
        where: { assetId: { in: [...new Set([...grupos.values()].map((g) => g.asset.id))] } },
        select: {
          id: true,
          userId: true,
          assetId: true,
          quantity: true,
          avgPrice: true,
          totalInvested: true,
          moedaRegistro: true,
          totalInvestedBrl: true,
        },
      })
    : [];
  const portfolioPorChave = new Map(portfolios.map((p) => [`${p.userId}:${p.assetId}`, p]));

  const serie = await carregarSerieCambio();
  return [...grupos.entries()].map(([chave, g]) => {
    const plano = planejarMigracaoAsset(g.asset, g.txs, { serie, renomear: args.renomear });
    const portfolio = portfolioPorChave.get(chave) ?? null;
    return {
      ...g,
      plano,
      portfolio,
      soPosicao: plano.status === 'ja-migrado' && posicaoPendente(portfolio),
    };
  });
}

function imprimirPlano(itens: ItemPlano[]) {
  console.log('── 1) Plano por Asset ─────────────────────────────────────────');
  const cont = { migrar: 0, soPosicao: 0, jaMigrado: 0, pular: 0, decidir: 0, linhas: 0 };
  for (const it of itens) {
    const cab = `  ${it.asset.type?.toUpperCase()} ${it.asset.symbol} (user ${it.userId}) — posição ${
      it.portfolio ? `aberta (moedaRegistro ${it.portfolio.moedaRegistro ?? 'null'})` : 'encerrada'
    }`;
    switch (it.plano.status) {
      case 'migrar':
        cont.migrar += 1;
        cont.linhas += it.plano.atualizacoes.length;
        console.log(`${cab}: MIGRAR ${it.plano.atualizacoes.length} transação(ões)`);
        for (const a of it.plano.atualizacoes) {
          console.log(
            `      ${a.id} ${a.classificacao}: price ${n(a.antes.price)} → ${n(a.depois.price)}, total ${n(a.antes.total, 2)} → ${n(a.depois.total, 2)}, fees R$ ${n(a.antes.fees, 2)}, fx ${n(a.fx)}`,
          );
        }
        if (it.plano.novoNome)
          console.log(`      nome: "${it.asset.name}" → "${it.plano.novoNome}"`);
        console.log(
          `      posição: ${acaoDaPosicao(it.portfolio).tipo === 'nenhuma' ? 'encerrada — sem recálculo' : "moedaRegistro 'USD' + recálculo (sem snapshots)"}`,
        );
        break;
      case 'ja-migrado':
        if (it.soPosicao) {
          cont.soPosicao += 1;
          console.log(`${cab}: transações já marcadas; PENDENTE moedaRegistro 'USD' + recálculo`);
        } else {
          cont.jaMigrado += 1;
        }
        break;
      case 'pular':
        cont.pular += 1;
        console.log(`${cab}: PULADO — ${it.plano.motivo}`);
        break;
      case 'decidir-a-mao':
        cont.decidir += 1;
        console.log(`${cab}: DECIDIR À MÃO — ${it.plano.motivo}`);
        break;
    }
  }
  console.log('');
  console.log('── Totais ─────────────────────────────────────────────────────');
  console.log(`  Assets USD manuais:        ${itens.length}`);
  console.log(`  A migrar:                  ${cont.migrar} (${cont.linhas} transações)`);
  console.log(`  Só a posição pendente:     ${cont.soPosicao}`);
  console.log(`  Já migrados:               ${cont.jaMigrado}`);
  console.log(`  Pulados (sem fx/ilegível): ${cont.pular}`);
  console.log(`  Decidir à mão:             ${cont.decidir}`);
  console.log(`  PENDENTES:                 ${cont.migrar + cont.soPosicao}`);
  console.log('');
  return cont;
}

// ---------------------------------------------------------------------------
// 2) Backup (antes de qualquer escrita) e 3–5) aplicação
// ---------------------------------------------------------------------------
function gravarBackup(args: Args, itens: ItemPlano[]): string {
  const backup: Backup = {
    versao: 1,
    criadoEm: new Date().toISOString(),
    args: {
      apply: args.apply,
      user: args.user,
      renomear: args.renomear,
      invalidarSnapshots: args.invalidarSnapshots,
      restore: args.restore,
    },
    stockTransactions: [],
    portfolios: [],
    assets: [],
  };
  for (const it of itens) {
    if (it.plano.status === 'migrar') {
      for (const a of it.plano.atualizacoes) {
        backup.stockTransactions.push({ id: a.id, ...a.antes });
      }
      if (it.plano.novoNome) backup.assets.push({ id: it.asset.id, name: it.asset.name });
    }
    if (it.portfolio && (it.plano.status === 'migrar' || it.soPosicao)) {
      backup.portfolios.push(it.portfolio);
    }
  }
  const arquivo = path.resolve(
    args.backupDir,
    `backup-eua-dolar-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, JSON.stringify(backup, null, 2));
  // Relê: sem backup íntegro, nada é gravado.
  const relido = JSON.parse(fs.readFileSync(arquivo, 'utf8')) as Backup;
  if (
    relido.stockTransactions.length !== backup.stockTransactions.length ||
    relido.portfolios.length !== backup.portfolios.length
  ) {
    throw new Error(`Backup ${arquivo} não confere — abortando sem gravar.`);
  }
  return arquivo;
}

async function aplicar(itens: ItemPlano[]) {
  let ok = 0;
  let falhas = 0;
  for (const it of itens) {
    const migrar = it.plano.status === 'migrar' ? it.plano : null;
    if (!migrar && !it.soPosicao) continue;
    try {
      await prisma.$transaction(async (tx) => {
        for (const a of migrar?.atualizacoes ?? []) {
          await tx.stockTransaction.update({
            where: { id: a.id },
            data: { price: a.depois.price, total: a.depois.total, notes: a.depois.notes },
          });
        }
        if (migrar?.novoNome) {
          await tx.asset.update({ where: { id: it.asset.id }, data: { name: migrar.novoNome } });
        }
        const acao = acaoDaPosicao(it.portfolio);
        if (acao.tipo === 'marcar-e-recalcular') {
          await tx.portfolio.update({
            where: { id: acao.portfolioId },
            data: { moedaRegistro: MOEDA_REGISTRO_USD },
          });
        }
      });
      const acao = acaoDaPosicao(it.portfolio);
      if (acao.tipo === 'marcar-e-recalcular') {
        // Sem recomputeSnapshotsFrom: snapshots só com --invalidar-snapshots.
        await recalculatePortfolioFromTransactions({
          targetUserId: it.userId,
          assetId: it.asset.id,
          portfolioId: acao.portfolioId,
        });
      }
      ok += 1;
      console.log(`  ✓ ${it.asset.symbol} (user ${it.userId})`);
    } catch (error: unknown) {
      falhas += 1;
      console.error(
        `  ✗ ${it.asset.symbol} (user ${it.userId}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  console.log(`\n  Aplicados: ${ok} · falhas: ${falhas}\n`);
}

// ---------------------------------------------------------------------------
// 6) Snapshots (destrutivo, só com --invalidar-snapshots)
// ---------------------------------------------------------------------------
async function invalidarSnapshots(args: Args) {
  const txs = await prisma.stockTransaction.findMany({
    where: {
      ...(args.user ? { userId: args.user } : {}),
      asset: { type: { in: ['stock', 'reit'] }, currency: 'USD' },
    },
    select: {
      userId: true,
      date: true,
      asset: { select: { symbol: true, type: true, currency: true } },
    },
  });
  const primeiraPorUsuario = new Map<string, Date>();
  for (const t of txs) {
    if (!isAtivoEmDolar(t.asset) || !SIMBOLO_MANUAL_RE.test(t.asset?.symbol ?? '')) continue;
    const atual = primeiraPorUsuario.get(t.userId);
    if (!atual || t.date < atual) primeiraPorUsuario.set(t.userId, t.date);
  }
  console.log('── 6) Snapshots ───────────────────────────────────────────────');
  for (const [userId, desde] of primeiraPorUsuario) {
    if (!args.apply) {
      console.log(`  (dry-run) invalidaria snapshots de ${userId} desde ${dia(desde)}`);
      continue;
    }
    await invalidatePortfolioSnapshots(userId, desde);
    console.log(`  ✓ snapshots de ${userId} invalidados desde ${dia(desde)}`);
  }
  if (primeiraPorUsuario.size === 0) console.log('  nenhum usuário com ativo USD');
  console.log('');
}

// ---------------------------------------------------------------------------
// 8) Restore
// ---------------------------------------------------------------------------
async function restaurar(args: Args) {
  const arquivo = path.resolve(args.restore!);
  const backup = JSON.parse(fs.readFileSync(arquivo, 'utf8')) as Backup;
  if (backup.versao !== 1) throw new Error(`Backup ${arquivo} em versão desconhecida`);
  console.log(
    `── 8) Restore de ${arquivo}: ${backup.stockTransactions.length} transações, ${backup.portfolios.length} posições, ${backup.assets.length} nomes`,
  );
  if (!args.apply) {
    console.log('  DRY RUN — rode com --apply para regravar.\n');
    return;
  }
  await prisma.$transaction(async (tx) => {
    for (const t of backup.stockTransactions) {
      await tx.stockTransaction.update({
        where: { id: t.id },
        data: { price: t.price, total: t.total, fees: t.fees, notes: t.notes },
      });
    }
    for (const a of backup.assets) {
      if (a.name != null) await tx.asset.update({ where: { id: a.id }, data: { name: a.name } });
    }
    for (const p of backup.portfolios) {
      await tx.portfolio.update({
        where: { id: p.id },
        data: {
          quantity: p.quantity,
          avgPrice: p.avgPrice,
          totalInvested: p.totalInvested,
          moedaRegistro: p.moedaRegistro,
          totalInvestedBrl: p.totalInvestedBrl,
        },
      });
    }
  });
  // Sem recálculo: o backup já tem as colunas da posição, e o recálculo regravaria
  // moedaRegistro/totalInvestedBrl de REIT (o rollback deixaria de ser exato).
  console.log('  ✓ restaurado\n');
}

async function main() {
  const args = lerArgs();
  if (args.restore) {
    await restaurar(args);
    return;
  }
  console.log(
    args.apply
      ? '✍  --apply: grava (backup JSON antes de qualquer escrita).\n'
      : '🔍 DRY RUN — nada é gravado. Rode com --apply para persistir.\n',
  );

  await preChecagens(args.user);
  const itens = await montarPlano(args);
  const cont = imprimirPlano(itens);
  const pendentes = cont.migrar + cont.soPosicao;

  if (args.apply && pendentes > 0) {
    const arquivo = gravarBackup(args, itens);
    console.log(`── 2) Backup gravado: ${arquivo}\n`);
    console.log('── 3–5) Aplicando ──────────────────────────────────────────────');
    await aplicar(itens);
  } else if (args.apply) {
    console.log('Nada pendente — nenhuma escrita.\n');
  } else if (pendentes > 0) {
    console.log('👉 Rode novamente com --apply para persistir.\n');
  }

  if (args.invalidarSnapshots) await invalidarSnapshots(args);
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
