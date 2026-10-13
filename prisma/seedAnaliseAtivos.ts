/**
 * Seed da Análise de Ativos — Fase 1 (fatia 0a). Idempotente.
 *
 * 1. Fixtures (só em banco SEM dados da Fase 0, i.e. asset_scores vazio — o banco efêmero do CI/e2e):
 *    carrega prisma/fixtures/analise-ativos/fase0-amostra.json (tabelas da Fase 0 dos ~20 símbolos
 *    da amostra) e quadro-linhas.json (analise_quadro_linhas), mais as linhas do catálogo (assets)
 *    dos símbolos da amostra que faltarem. Num banco com dados reais (Neon dev,
 *    produção) NÃO toca nas tabelas de dados.
 *    v2.4 (Filtros de Fundamentos): no mesmo banco efêmero grava criteria_params v1 (o do código),
 *    roda o MESMO job 'criterios' (executarCriterios) sobre as tabelas da amostra e copia a forma
 *    compacta para AnaliseQuadroLinha.criterios/perfilCriterios — o e2e vê o Quadro e a página do
 *    ativo com os critérios reais da amostra.
 * 2. Beta: põe o usuário demo (usuario.demo@finapp.local) em feature_beta_users
 *    (recurso 'analise-ativos'), para a área abrir com ANALISE_ATIVOS_HABILITADA=true.
 *
 * Chamado por prisma/seed.ts. Também roda sozinho (ex.: só o beta do demo no dev):
 *   npx tsx --env-file=.env prisma/seedAnaliseAtivos.ts
 */
import { readFileSync } from 'fs';
import path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';
import { CRITERIA_PARAMS_V1 } from '../src/services/analiseAtivos/params/criteriaParamsV1';

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

/** Vigência do criteria_params v1 gravado pelo seed (antes de qualquer data de teste). */
export const VALIDO_DESDE_CRITERIOS = new Date('2026-10-13T00:00:00.000Z');

/**
 * v2.4: criteria_params v1 + job 'criterios' sobre as fixtures + cópia compacta nas linhas do
 * Quadro. Devolve quantas linhas do Quadro ficaram com critérios. Imports dinâmicos: o motor só é
 * carregado quando há fixtures para avaliar.
 */
export async function avaliarCriteriosFixtures(prisma: PrismaClient): Promise<number> {
  await prisma.criteriaParams.createMany({
    data: [
      {
        version: CRITERIA_PARAMS_V1.versao,
        params: CRITERIA_PARAMS_V1 as unknown as Prisma.InputJsonValue,
        validFrom: VALIDO_DESDE_CRITERIOS,
        createdBy: 'seed',
        notas: 'seed do banco efêmero (CI/e2e) — o mesmo CRITERIA_PARAMS_V1 do código',
      },
    ],
    skipDuplicates: true,
  });
  const [{ executarCriterios }, { obterScoringParams }, { SCORING_PARAMS_V1 }, repo] =
    await Promise.all([
      import('../src/services/analiseAtivos/calculo/executarCriterios'),
      import('../src/services/analiseAtivos/params/obterScoringParams'),
      import('../src/services/analiseAtivos/params/scoringParamsV1'),
      import('../src/services/analiseAtivos/repositorio/criterios'),
    ]);
  const scoring = await obterScoringParams(prisma).catch(() => ({
    versao: SCORING_PARAMS_V1.versao,
    params: SCORING_PARAMS_V1,
  }));
  const alertas: string[] = [];
  await executarCriterios({
    prisma,
    prazo: Date.now() + 600_000,
    restanteMs: () => 600_000,
    estourouPrazo: () => false,
    alertar: (a) => alertas.push(`${a.codigo}: ${a.mensagem}`),
    contar: () => {},
    params: scoring.params,
    paramsVersion: scoring.versao,
    hoje: new Date().toISOString().slice(0, 10),
    origem: 'script',
    aplicar: true,
  });
  for (const a of alertas) console.log(`📈 critérios (seed): ${a}`);
  const compactos = await repo.lerCompactosPorSimbolo(prisma);
  let n = 0;
  for (const [symbol, c] of compactos) {
    const r = await prisma.analiseQuadroLinha.updateMany({
      where: { symbol },
      data: {
        criterios: c.criterios as unknown as Prisma.InputJsonValue,
        perfilCriterios: c.perfil,
      },
    });
    n += r.count;
  }
  return n;
}

export interface DependenciasSeedAnalise {
  avaliarCriterios: (prisma: PrismaClient) => Promise<number>;
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
  deps: DependenciasSeedAnalise = { avaliarCriterios: avaliarCriteriosFixtures },
): Promise<{ fixtures: Record<string, number> | null; demoNoBeta: boolean }> {
  const temDados = (await prisma.assetScore.count()) > 0;
  const fixtures = temDados ? null : await carregarFixtures(prisma);
  if (fixtures) fixtures.quadroComCriterios = await deps.avaliarCriterios(prisma);
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
