/**
 * Seed da Análise de Ativos — Fase 1 (fatia 0a). Idempotente.
 *
 * 1. Fixtures (só em banco SEM dados da Fase 0, i.e. asset_scores vazio — o banco efêmero do CI/e2e):
 *    carrega prisma/fixtures/analise-ativos/fase0-amostra.json (tabelas da Fase 0 dos ~20 símbolos
 *    da amostra) e quadro-linhas.json (analise_quadro_linhas), mais as linhas do catálogo (assets)
 *    dos símbolos da amostra que faltarem. Num banco com dados reais (Neon dev,
 *    produção) NÃO toca nas tabelas de dados.
 * 2. Beta: põe o usuário demo (usuario.demo@finapp.local) em feature_beta_users
 *    (recurso 'analise-ativos'), para a área abrir com ANALISE_ATIVOS_HABILITADA=true.
 *
 * Chamado por prisma/seed.ts. Também roda sozinho (ex.: só o beta do demo no dev):
 *   npx tsx --env-file=.env prisma/seedAnaliseAtivos.ts
 */
import { readFileSync } from 'fs';
import path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';

export const RECURSO_BETA_ANALISE = 'analise-ativos';
export const EMAIL_DEMO = 'usuario.demo@finapp.local';

const DIR = path.join(__dirname, 'fixtures', 'analise-ativos');

type Linha = Record<string, unknown>;

/** Ordem de carga (sem FKs entre si; a ordem só deixa o log legível). */
const MODELOS = [
  'scoringParams',
  'cvmCompany',
  'cvmCompanyTicker',
  'assetSetorB3',
  'fiiTickerMap',
  'fiiMonthly',
  'fiiQuarterly',
  'assetFundamentalsPeriod',
  'assetShareCount',
  'assetQuoteResumo',
  'assetQuoteDaily',
  'assetProventoAuditado',
  'assetCorporateActionCheck',
  'assetPerShareYearly',
  'assetMultiplesYearly',
  'assetMultiplesCurrent',
  'assetScore',
  'assetEvento',
] as const;
type Modelo = (typeof MODELOS)[number];

interface Delegado {
  createMany(args: { data: Linha[]; skipDuplicates?: boolean }): Promise<{ count: number }>;
}

function lerJson<T>(arquivo: string): T {
  return JSON.parse(readFileSync(path.join(DIR, arquivo), 'utf8')) as T;
}

/** Ajustes de tipo que o JSON perde (BigInt). Datas ISO e Decimal em texto o Prisma aceita. */
function reviver(modelo: Modelo, l: Linha): Linha {
  if (modelo === 'assetQuoteDaily' && typeof l.quantidade === 'string') {
    return { ...l, quantidade: BigInt(l.quantidade) };
  }
  return l;
}

async function carregarFixtures(prisma: PrismaClient): Promise<Record<string, number>> {
  const { tabelas } = lerJson<{ tabelas: Record<Modelo, Linha[]> }>('fase0-amostra.json');
  const contagem: Record<string, number> = {};
  for (const modelo of MODELOS) {
    const linhas = (tabelas[modelo] ?? []).map((l) => reviver(modelo, l));
    const delegado = (prisma as unknown as Record<Modelo, Delegado>)[modelo];
    let total = 0;
    for (let i = 0; i < linhas.length; i += 500) {
      const r = await delegado.createMany({ data: linhas.slice(i, i + 500), skipDuplicates: true });
      total += r.count;
    }
    contagem[modelo] = total;
  }

  const quadro = lerJson<Linha[]>('quadro-linhas.json');
  // Catálogo (assets) dos símbolos da amostra: no banco efêmero só existem os ativos do demo. Sem
  // a linha do catálogo a página do ativo vem com assetId null e o "Planejar na Carteira" abre o
  // wizard na busca (que também lê o catálogo), sem achar o ativo. skipDuplicates preserva o que
  // o seed já criou (ITSA4, MXRF11).
  const catalogo = await prisma.asset.createMany({
    data: quadro.map((l) => ({
      symbol: String(l.symbol),
      name: String(l.nome ?? l.symbol),
      type: l.classe === 'fii' ? 'fii' : 'stock',
      currency: 'BRL',
      currentPrice: l.preco == null ? null : String(l.preco),
    })),
    skipDuplicates: true,
  });
  contagem.asset = catalogo.count;
  const assets = await prisma.asset.findMany({
    where: { symbol: { in: quadro.map((l) => String(l.symbol)) } },
    select: { id: true, symbol: true },
  });
  const assetPor = new Map(assets.map((a) => [a.symbol, a.id]));
  const r = await prisma.analiseQuadroLinha.createMany({
    data: quadro.map((l) => ({
      ...(l as unknown as Prisma.AnaliseQuadroLinhaCreateManyInput),
      assetId: assetPor.get(String(l.symbol)) ?? null,
    })),
    skipDuplicates: true,
  });
  contagem.analiseQuadroLinha = r.count;
  return contagem;
}

/** Demo no beta (idempotente). Devolve false se o usuário demo não existe. */
export async function colocarDemoNoBeta(prisma: PrismaClient): Promise<boolean> {
  const demo = await prisma.user.findUnique({ where: { email: EMAIL_DEMO }, select: { id: true } });
  if (!demo) return false;
  await prisma.featureBetaUser.upsert({
    where: { recurso_userId: { recurso: RECURSO_BETA_ANALISE, userId: demo.id } },
    update: {},
    create: {
      recurso: RECURSO_BETA_ANALISE,
      userId: demo.id,
      adicionadoPor: 'seed',
      motivo: 'usuário demo (seed / e2e)',
    },
  });
  return true;
}

export async function seedAnaliseAtivos(
  prisma: PrismaClient,
): Promise<{ fixtures: Record<string, number> | null; demoNoBeta: boolean }> {
  const temDados = (await prisma.assetScore.count()) > 0;
  const fixtures = temDados ? null : await carregarFixtures(prisma);
  const demoNoBeta = await colocarDemoNoBeta(prisma);
  return { fixtures, demoNoBeta };
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedAnaliseAtivos(prisma)
    .then((r) => {
      console.log(
        r.fixtures
          ? `📈 Análise de Ativos: fixtures carregadas ${JSON.stringify(r.fixtures)}`
          : '📈 Análise de Ativos: banco já tem dados da Fase 0 — fixtures puladas',
      );
      console.log(`📈 Demo no beta: ${r.demoNoBeta ? 'sim' : 'usuário demo não encontrado'}`);
    })
    .catch((e: unknown) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => void prisma.$disconnect());
}
