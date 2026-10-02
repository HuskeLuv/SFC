/**
 * Job 'quadro' (Fase 1): materializa analise_quadro_linhas a partir das tabelas da Fase 0.
 * Roda depois do 'scores' (cron 10:40 UTC, processo separado pelo myfinance-job.sh), via
 * executarJobAnalise (lock, AnaliseJobRun, prazo). Só banco: nenhum provedor externo.
 *
 * 1. dataRef = max(asset_scores.dataRef).
 * 2. carregarEntradaQuadro: UMA leitura por tabela (cadastro, scores da dataRef, múltiplos atuais,
 *    setor B3, nomes, informes de FII, resumo de cotação, 2 últimos pregões, per-share, lucro FY,
 *    contagem de ações, Asset.id).
 * 3. montarLinhasQuadro (pura).
 * 4. Grava numa transação (deleteMany + createMany): os leitores veem a versão anterior inteira até o
 *    commit (MVCC) e trocam de versão em até 60 s (linhasQuadro.ts).
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import { lucroParaSequencia } from '@/services/analiseAtivos/regras/calculo/sequencias';
import { contagensAcoes } from '@/services/analiseAtivos/repositorio/acoes';
import { paraNumero } from '@/services/analiseAtivos/repositorio/conversao';
import {
  listarEmissores,
  listarFiisListados,
  listarTickersAcoes,
} from '@/services/analiseAtivos/repositorio/universo';
import {
  montarLinhasQuadro,
  type EntradaQuadro,
  type LinhaQuadroGravar,
} from '@/services/analiseAtivos/quadro/montarLinhasQuadro';
import type { ContagemAcoes, JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';

const DIA_MS = 86_400_000;
/** Janela para achar os 2 últimos pregões de cada símbolo. */
const JANELA_PREGOES_DIAS = 10;

export async function carregarEntradaQuadro(
  prisma: PrismaClient,
  hoje: string,
  geradoEm: Date = new Date(),
): Promise<EntradaQuadro> {
  const ultimoScore = await prisma.assetScore.aggregate({ _max: { dataRef: true } });
  const dataRef = ultimoScore._max.dataRef;
  if (!dataRef) throw new Error('asset_scores vazio: rode o job scores antes do quadro');

  const [acoes, fiis] = await Promise.all([listarTickersAcoes(prisma), listarFiisListados(prisma)]);
  const symbols = [...acoes.map((a) => a.symbol), ...fiis.map((f) => f.symbol)];
  const cnpjsAcao = [...new Set(acoes.map((a) => a.cnpj))];
  const cnpjsFii = [...new Set(fiis.map((f) => f.cnpj))];
  const desdePregoes = new Date(dataRef.getTime() - JANELA_PREGOES_DIAS * DIA_MS);

  const [
    scores,
    multiplos,
    resumos,
    setores,
    cias,
    mapasFii,
    assets,
    porAcaoAno,
    emissores,
    contagens,
  ] = await Promise.all([
    prisma.assetScore.findMany({ where: { dataRef } }),
    prisma.assetMultiplesCurrent.findMany({ where: { symbol: { in: symbols } } }),
    prisma.assetQuoteResumo.findMany({ where: { symbol: { in: symbols } } }),
    prisma.assetSetorB3.findMany(),
    prisma.cvmCompany.findMany({
      where: { cnpj: { in: cnpjsAcao } },
      select: { cnpj: true, nome: true },
    }),
    prisma.fiiTickerMap.findMany({
      where: { validTo: null },
      select: { ticker: true, nomeB3: true },
    }),
    prisma.asset.findMany({
      where: { symbol: { in: symbols } },
      select: { id: true, symbol: true, name: true },
    }),
    prisma.assetPerShareYearly.findMany({
      where: { symbol: { in: symbols } },
      select: {
        symbol: true,
        anoFiscal: true,
        dpaAjHoje: true,
        rendCota: true,
        payoutDmplPct: true,
      },
    }),
    listarEmissores(prisma, cnpjsAcao),
    contagensAcoes(prisma, cnpjsAcao),
  ]);

  const [fiiMensal, fiiTrimestral, mesesInforme, ultimos, fys] = await Promise.all([
    cnpjsFii.length
      ? prisma.$queryRaw<
          Array<{
            cnpj: string;
            segmentoCvm: string | null;
            tipoVigente: string | null;
            cotistas: number | null;
            pl: Prisma.Decimal | null;
            cotas: Prisma.Decimal | null;
          }>
        >`SELECT DISTINCT ON ("cnpj") "cnpj", "segmentoCvm", "tipoVigente", "cotistas", "pl", "cotas"
          FROM "fii_monthly" WHERE "cnpj" IN (${Prisma.join(cnpjsFii)})
          ORDER BY "cnpj", "refMonth" DESC, "versao" DESC`
      : Promise.resolve([]),
    cnpjsFii.length
      ? prisma.$queryRaw<
          Array<{
            cnpj: string;
            vacanciaFisicaCvmPct: number | null;
            nImoveisRenda: number | null;
            nCri: number | null;
          }>
        >`SELECT DISTINCT ON ("cnpj") "cnpj", "vacanciaFisicaCvmPct", "nImoveisRenda", "nCri"
          FROM "fii_quarterly" WHERE "cnpj" IN (${Prisma.join(cnpjsFii)})
          ORDER BY "cnpj", "refQuarter" DESC, "versao" DESC`
      : Promise.resolve([]),
    cnpjsFii.length
      ? prisma.$queryRaw<Array<{ cnpj: string; ano: number; meses: number }>>`
          SELECT "cnpj", EXTRACT(YEAR FROM "refMonth")::int AS ano,
                 COUNT(DISTINCT "refMonth")::int AS meses
          FROM "fii_monthly" WHERE "cnpj" IN (${Prisma.join(cnpjsFii)})
          GROUP BY 1, 2`
      : Promise.resolve([]),
    prisma.$queryRaw<Array<{ symbol: string; closeRaw: Prisma.Decimal; rn: bigint | number }>>`
      SELECT "symbol", "closeRaw", rn FROM (
        SELECT "symbol", "closeRaw",
               ROW_NUMBER() OVER (PARTITION BY "symbol" ORDER BY "date" DESC) rn
        FROM "asset_quotes_daily" WHERE "date" >= ${desdePregoes} AND "date" <= ${dataRef}
      ) x WHERE rn <= 2`,
    lucrosFyVigentes(prisma, cnpjsAcao, emissores),
  ]);
  const lucrosFy = fys;

  // contagem mais recente (ok) por emissor
  const contagemPor = new Map<string, ContagemAcoes>();
  for (const c of contagens) {
    if (c.status !== 'ok') continue;
    const atual = contagemPor.get(c.cnpj);
    if (!atual || c.data > atual.data) contagemPor.set(c.cnpj, c);
  }

  return {
    hoje,
    dataRef,
    geradoEm,
    acoes,
    fiis: fiis.map((f) => ({ symbol: f.symbol, cnpj: f.cnpj })),
    scores: scores.map((s) => ({
      symbol: s.symbol,
      cnpj: s.cnpj,
      classe: s.classe,
      regua: s.regua,
      fiiTipo: s.fiiTipo,
      tickerReferencia: s.tickerReferencia,
      indiceMf: s.indiceMf,
      componentes: s.componentes,
      checks: s.checks,
      criteriosAplicaveis: s.criteriosAplicaveis,
      criteriosAtendidos: s.criteriosAtendidos,
      incompleto: s.incompleto,
      motivosIncompleto: s.motivosIncompleto,
      paramsVersion: s.paramsVersion,
    })),
    multiplos: multiplos.map((m) => ({
      symbol: m.symbol,
      preco: paraNumero(m.preco),
      precoData: m.precoData,
      lpaTtm: m.lpaTtm,
      rend12m: m.rend12m,
      pl: m.pl,
      pvp: m.pvp,
      dy12mPct: m.dy12mPct,
      payoutPct: m.payoutPct,
      margemLiquidaPct: m.margemLiquidaPct,
      roePct: m.roePct,
      divLiqEbitda: m.divLiqEbitda,
      divLiqPl: m.divLiqPl,
      obrigacoesPlPct: m.obrigacoesPlPct,
      anosLucroConsecutivos: m.anosLucroConsecutivos,
      mesesComRendimento: m.mesesComRendimento,
      naoSeAplica: m.naoSeAplica,
      flags: m.flags,
    })),
    resumos: resumos.map((r) => ({
      symbol: r.symbol,
      ultimoPregao: r.ultimoPregao,
      closeRaw: paraNumero(r.closeRaw) ?? 0,
      volumeMedio21: paraNumero(r.volumeMedio21) ?? 0,
      baixaLiquidez: r.baixaLiquidez,
      negociadoUltimos30: r.negociadoUltimos30,
    })),
    setores,
    nomesCia: cias,
    nomesFii: mapasFii,
    assets,
    fiiMensal: fiiMensal.map((m) => ({
      cnpj: m.cnpj,
      segmentoCvm: m.segmentoCvm,
      tipoVigente: m.tipoVigente,
      cotistas: m.cotistas,
      pl: paraNumero(m.pl),
      cotas: paraNumero(m.cotas),
    })),
    fiiTrimestral,
    ultimosPregoes: ultimos.map((q) => ({
      symbol: q.symbol,
      ordem: Number(q.rn),
      closeRaw: paraNumero(q.closeRaw) ?? 0,
    })),
    porAcaoAno,
    lucrosFy,
    mesesInformeFii: mesesInforme.map((m) => ({ cnpj: m.cnpj, ano: m.ano, meses: m.meses })),
    contagens: [...contagemPor.values()],
  };
}

/**
 * Lucro FY por emissor e ano — a MESMA regra de repositorio/acoes.fundamentosVigentes (maior versão
 * por período e escopo; escopo preferido do emissor; individual quando controladora_zero) +
 * umFyPorAno + lucroParaSequencia, mas lendo só as colunas do lucro: a leitura completa dos ~12 mil
 * FY custava ~200 MB de RSS no job.
 */
export async function lucrosFyVigentes(
  prisma: PrismaClient,
  cnpjs: string[],
  emissores: Array<{ cnpj: string; escopoPreferido: string }>,
): Promise<EntradaQuadro['lucrosFy']> {
  if (cnpjs.length === 0) return [];
  const linhas = await prisma.assetFundamentalsPeriod.findMany({
    where: { emissorId: { in: cnpjs }, tipoPeriodo: 'FY' },
    select: {
      emissorId: true,
      dtFim: true,
      escopo: true,
      versao: true,
      anoFiscal: true,
      lucroAtribuivel: true,
      flags: true,
    },
  });
  type Linha = (typeof linhas)[number];
  const vigentes = new Map<string, Linha>();
  for (const l of linhas) {
    const k = `${l.emissorId}|${l.dtFim.toISOString()}|${l.escopo}`;
    const atual = vigentes.get(k);
    if (!atual || l.versao > atual.versao) vigentes.set(k, l);
  }
  const preferido = new Map(emissores.map((e) => [e.cnpj, e.escopoPreferido]));
  const porPeriodo = new Map<string, Linha[]>();
  for (const l of vigentes.values()) {
    const k = `${l.emissorId}|${l.dtFim.toISOString()}`;
    porPeriodo.set(k, [...(porPeriodo.get(k) ?? []), l]);
  }
  // um FY por ano fiscal: o de dtFim mais recente (umFyPorAno)
  const porAno = new Map<string, { dtFim: Date; lucro: number | null }>();
  for (const grupo of porPeriodo.values()) {
    const quer = preferido.get(grupo[0].emissorId) ?? 'con';
    const f = grupo.find((g) => g.escopo === quer) ?? grupo[0];
    const ind = grupo.find((g) => g.escopo === 'ind');
    const v = lucroParaSequencia({
      lucroAtribuivel: paraNumero(f.lucroAtribuivel),
      lucroAtribuivelIndividual: f.escopo === 'con' && ind ? paraNumero(ind.lucroAtribuivel) : null,
      flags: f.flags,
    });
    const k = `${f.emissorId}|${f.anoFiscal}`;
    const atual = porAno.get(k);
    if (!atual || f.dtFim > atual.dtFim) {
      porAno.set(k, { dtFim: f.dtFim, lucro: v.estado === 'ok' ? v.valor : null });
    }
  }
  return [...porAno.entries()].map(([k, v]) => {
    const [cnpj, ano] = k.split('|');
    return { cnpj, anoFiscal: Number(ano), lucro: v.lucro };
  });
}

/** Troca todas as linhas numa transação (idempotente: rodar 2× deixa o mesmo conjunto). */
export async function gravarLinhasQuadro(
  prisma: PrismaClient,
  linhas: LinhaQuadroGravar[],
): Promise<number> {
  const [, criadas] = await prisma.$transaction([
    prisma.analiseQuadroLinha.deleteMany({}),
    prisma.analiseQuadroLinha.createMany({ data: linhas }),
  ]);
  return criadas.count;
}

export interface DependenciasQuadro {
  carregar: typeof carregarEntradaQuadro;
}

export async function gerarQuadro(
  ctx: JobContexto,
  deps: DependenciasQuadro = { carregar: carregarEntradaQuadro },
): Promise<ResultadoJob> {
  const entrada = await deps.carregar(ctx.prisma, ctx.hoje);
  const universo = entrada.acoes.length + entrada.fiis.length;
  ctx.contar('linhasLidas', universo);
  const r = montarLinhasQuadro(entrada);
  for (const a of r.alertas) ctx.alertar(a);
  if (r.linhas.length === 0) {
    // cadastro vazio: não apaga a versão atual
    ctx.alertar({ codigo: 'quadro_vazio', nivel: 'erro', mensagem: 'cadastro sem ações nem FIIs' });
    return { detalhes: { linhasGravadas: 0 } };
  }
  let gravadas = 0;
  if (ctx.aplicar) {
    gravadas = await gravarLinhasQuadro(ctx.prisma, r.linhas);
    ctx.contar('linhasGravadas', gravadas);
  }
  return {
    detalhes: {
      dataRef: entrada.dataRef.toISOString().slice(0, 10),
      linhas: r.linhas.length,
      linhasGravadas: gravadas,
      noQuadroPorClasse: r.noQuadroPorClasse,
      foraDoQuadroPorClasse: r.foraDoQuadroPorClasse,
      aplicar: ctx.aplicar,
    },
  };
}
