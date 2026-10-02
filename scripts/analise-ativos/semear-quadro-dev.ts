/**
 * TEMPORÁRIO (fatia 0a; a fatia A REMOVE quando o job 'quadro' real existir).
 *
 * Preenche analise_quadro_linhas no banco de DEV a partir das tabelas da Fase 0, para que as
 * fatias A–D tenham dados enquanto o gerador real (src/services/analiseAtivos/quadro/*) não sai.
 * Simplificações em relação ao job da fatia A (documentadas para não virar referência):
 * - serie10a das ações = LPA ajustado (AssetPerShareYearly.lpaAjHoje), não o lucro FY absoluto;
 * - sem pares, sem valor de mercado, sem detecção de Fiagro (Fiagro não tem cotação no COTAHIST
 *   filtrado, então cai em 'sem_negociacao_30');
 * - anosDividendo = anos fechados seguidos com DPA > 0, do último para trás.
 * Usa a mesma convenção de colunas do leitor (leitura/linhasQuadro.ts) e as séries ÚNICAS
 * (leitura/ativo/series.ts): só anos fechados + últ. 12m; provento > 2× = 'provento_suspeito'.
 *
 * Uso (só DEV; grava só na tabela nova, numa transação):
 *   npx tsx --env-file=.env scripts/analise-ativos/semear-quadro-dev.ts           # dry-run
 *   npx tsx --env-file=.env scripts/analise-ativos/semear-quadro-dev.ts --apply   # grava
 */
import { Prisma, PrismaClient } from '@prisma/client';
import {
  listarFiisListados,
  listarTickersAcoes,
} from '@/services/analiseAtivos/repositorio/universo';
import { anosFechados, detectarSaltoProvento } from '@/services/analiseAtivos/leitura/ativo/series';
import type { PontoSerieAnual } from '@/types/analiseAtivosApi';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const raiz = (s: string) => s.slice(0, 4);

interface StatusCheck {
  status?: string;
}
interface ComponenteJson {
  estado?: string;
  motivo?: string;
}

async function main() {
  const aplicar = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const hoje = iso(new Date());
    const ultimoScore = await prisma.assetScore.aggregate({ _max: { dataRef: true } });
    const dataRef = ultimoScore._max.dataRef;
    if (!dataRef) throw new Error('asset_scores vazio: rode o job scores antes.');

    const [acoes, fiis] = await Promise.all([
      listarTickersAcoes(prisma),
      listarFiisListados(prisma),
    ]);
    const universo = [
      ...acoes.map((a) => ({ symbol: a.symbol, cnpj: a.cnpj, classe: 'acao' as const })),
      ...fiis.map((f) => ({ symbol: f.symbol, cnpj: f.cnpj, classe: 'fii' as const })),
    ];
    const symbols = universo.map((u) => u.symbol);
    const cnpjsFii = [...new Set(fiis.map((f) => f.cnpj))];

    const [scores, multiplos, resumos, setores, cias, mapasFii, assets, perShare] =
      await Promise.all([
        prisma.assetScore.findMany({ where: { dataRef } }),
        prisma.assetMultiplesCurrent.findMany({ where: { symbol: { in: symbols } } }),
        prisma.assetQuoteResumo.findMany({ where: { symbol: { in: symbols } } }),
        prisma.assetSetorB3.findMany(),
        prisma.cvmCompany.findMany({ select: { cnpj: true, nome: true } }),
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
            lpaAjHoje: true,
            dpaAjHoje: true,
            rendCota: true,
            payoutDmplPct: true,
          },
        }),
      ]);
    const fiiMensal = cnpjsFii.length
      ? await prisma.$queryRaw<
          Array<{
            cnpj: string;
            segmentoCvm: string | null;
            tipoVigente: string | null;
            cotistas: number | null;
            pl: Prisma.Decimal | null;
          }>
        >`SELECT DISTINCT ON ("cnpj") "cnpj", "segmentoCvm", "tipoVigente", "cotistas", "pl"
          FROM "fii_monthly" WHERE "cnpj" IN (${Prisma.join(cnpjsFii)})
          ORDER BY "cnpj", "refMonth" DESC, "versao" DESC`
      : [];
    const fiiTrimestral = cnpjsFii.length
      ? await prisma.$queryRaw<
          Array<{
            cnpj: string;
            vacanciaFisicaCvmPct: number | null;
            nImoveisRenda: number | null;
            nCri: number | null;
          }>
        >`SELECT DISTINCT ON ("cnpj") "cnpj", "vacanciaFisicaCvmPct", "nImoveisRenda", "nCri"
          FROM "fii_quarterly" WHERE "cnpj" IN (${Prisma.join(cnpjsFii)})
          ORDER BY "cnpj", "refQuarter" DESC, "versao" DESC`
      : [];
    const ultimos2 = await prisma.$queryRaw<
      Array<{ symbol: string; closeRaw: Prisma.Decimal; rn: bigint }>
    >`SELECT "symbol", "closeRaw", rn FROM (
        SELECT "symbol", "closeRaw", ROW_NUMBER() OVER (PARTITION BY "symbol" ORDER BY "date" DESC) rn
        FROM "asset_quotes_daily" WHERE "date" >= ${new Date(dataRef.getTime() - 15 * 86400000)}
      ) x WHERE rn <= 2`;

    const scorePor = new Map(scores.map((s) => [s.symbol, s]));
    const multPor = new Map(multiplos.map((m) => [m.symbol, m]));
    const resumoPor = new Map(resumos.map((r) => [r.symbol, r]));
    const setorPor = new Map(setores.map((s) => [s.raiz, s]));
    const ciaPor = new Map(cias.map((c) => [c.cnpj, c.nome]));
    const nomeB3Por = new Map(mapasFii.map((m) => [m.ticker, m.nomeB3]));
    const assetPor = new Map(assets.map((a) => [a.symbol, a]));
    const mensalPor = new Map(fiiMensal.map((m) => [m.cnpj, m]));
    const trimPor = new Map(fiiTrimestral.map((t) => [t.cnpj, t]));
    const perSharePor = new Map<string, typeof perShare>();
    for (const p of perShare) {
      const l = perSharePor.get(p.symbol) ?? [];
      l.push(p);
      perSharePor.set(p.symbol, l);
    }
    const varPor = new Map<string, number>();
    const precosPor = new Map<string, number[]>();
    for (const q of ultimos2) {
      const l = precosPor.get(q.symbol) ?? [];
      l[Number(q.rn) - 1] = Number(q.closeRaw);
      precosPor.set(q.symbol, l);
    }
    for (const [s, [ult, ant]] of precosPor) {
      if (ult > 0 && ant > 0) varPor.set(s, (ult / ant - 1) * 100);
    }

    const geradoEm = new Date();
    const linhas: Prisma.AnaliseQuadroLinhaCreateManyInput[] = universo.map((u) => {
      const score = scorePor.get(u.symbol);
      const m = multPor.get(u.symbol);
      const r = resumoPor.get(u.symbol);
      const setor = u.classe === 'acao' ? setorPor.get(raiz(u.symbol)) : undefined;
      const mensal = u.classe === 'fii' ? mensalPor.get(u.cnpj) : undefined;
      const trim = u.classe === 'fii' ? trimPor.get(u.cnpj) : undefined;
      const asset = assetPor.get(u.symbol);
      const fiiTipo = u.classe === 'fii' ? (score?.fiiTipo ?? mensal?.tipoVigente ?? null) : null;

      const componentes = (score?.componentes ?? {}) as Record<string, ComponenteJson>;
      const zeroRegra = Object.entries(componentes)
        .filter(([, c]) => c?.estado === 'zero_regra')
        .map(([nome, c]) => `${nome}:${c.motivo ?? 'regra'}`);
      let estadoIndice: string;
      if (!score) estadoIndice = fiiTipo === 'fof' ? 'fora_do_indice' : 'sem_score';
      else if (score.regua === 'fora_do_indice') estadoIndice = 'fora_do_indice';
      else if (score.incompleto) estadoIndice = 'incompleto';
      else if (zeroRegra.length > 0) estadoIndice = 'zero_regra';
      else estadoIndice = 'calculado';

      const anos = (perSharePor.get(u.symbol) ?? []).map((p) => ({ ...p, ano: p.anoFiscal }));
      const fechados = anosFechados(anos, hoje);
      const serie10a: PontoSerieAnual[] = fechados.slice(-10).map((p) => ({
        ano: p.ano,
        valor: u.classe === 'acao' ? p.lpaAjHoje : p.rendCota,
      }));
      const dpa = fechados.map((p) => ({
        ano: p.ano,
        valor: u.classe === 'acao' ? p.dpaAjHoje : p.rendCota,
      }));
      const payoutPorAno =
        u.classe === 'acao'
          ? Object.fromEntries(fechados.map((p) => [p.ano, p.payoutDmplPct]))
          : undefined;
      const salto = detectarSaltoProvento(dpa, { payoutPorAno });
      let anosDividendo = 0;
      for (let i = dpa.length - 1; i >= 0 && (dpa[i].valor ?? 0) > 0; i--) anosDividendo++;

      const flags = [...(m?.flags ?? [])];
      if (salto.anosSuspeitos.length > 0) flags.push('provento_suspeito');
      const noQuadro = r?.negociadoUltimos30 ?? false;
      const checks = (score?.checks ?? []) as StatusCheck[];

      return {
        symbol: u.symbol,
        classe: u.classe,
        cnpj: u.cnpj,
        dataRef,
        noQuadro,
        foraDoQuadroMotivo: noQuadro ? null : 'sem_negociacao_30',
        temScore: !!score,
        estadoIndice,
        nome:
          asset?.name ??
          (u.classe === 'acao'
            ? (setor?.nomePregao ?? ciaPor.get(u.cnpj) ?? u.symbol)
            : (nomeB3Por.get(u.symbol) ?? u.symbol)),
        setor: setor?.setor ?? null,
        subsetor: setor?.subsetor ?? null,
        segmento: setor?.segmento ?? null,
        segmentoListagem: setor?.segmentoListagem ?? null,
        fiiTipo,
        segmentoCvm: mensal?.segmentoCvm ?? null,
        regua: score?.regua ?? null,
        tickerReferencia: score?.tickerReferencia ?? null,
        preco: m?.preco ?? r?.closeRaw ?? null,
        precoData: m?.precoData ?? r?.ultimoPregao ?? null,
        variacaoDiaPct: varPor.get(u.symbol) ?? null,
        volumeMedio21: r?.volumeMedio21 ?? null,
        baixaLiquidez: r?.baixaLiquidez ?? false,
        valorMercado: null,
        patrimonio: mensal?.pl ?? null,
        indiceMf: score?.indiceMf ?? null,
        criteriosAtendidos: score?.criteriosAtendidos ?? null,
        criteriosAplicaveis: score?.criteriosAplicaveis ?? null,
        statusCriterios: checks.map((c) => c.status ?? 'sem_dado'),
        motivosIncompleto: score?.motivosIncompleto ?? [],
        componentesZeroRegra: zeroRegra,
        anosLucroConsecutivos: m?.anosLucroConsecutivos ?? null,
        mesesComRendimento: m?.mesesComRendimento ?? null,
        anosDividendo: u.classe === 'acao' ? anosDividendo : null,
        roePct: m?.roePct ?? null,
        pl: m?.pl ?? null,
        pvp: m?.pvp ?? null,
        dy12mPct: m?.dy12mPct ?? null,
        margemLiquidaPct: m?.margemLiquidaPct ?? null,
        divLiqEbitda: m?.divLiqEbitda ?? null,
        divLiqPl: m?.divLiqPl ?? null,
        payoutPct: m?.payoutPct ?? null,
        vacanciaFisicaCvmPct: trim?.vacanciaFisicaCvmPct ?? null,
        nImoveisCvm: trim?.nImoveisRenda ?? null,
        nCri: trim?.nCri ?? null,
        obrigacoesPlPct: m?.obrigacoesPlPct ?? null,
        cotistas: mensal?.cotistas ?? null,
        naoSeAplica: m?.naoSeAplica ?? [],
        serie10a: serie10a as unknown as Prisma.InputJsonValue,
        serieUlt12m: (u.classe === 'acao' ? m?.lpaTtm : m?.rend12m) ?? null,
        pares: [],
        assetId: asset?.id ?? null,
        flags,
        paramsVersion: score?.paramsVersion ?? null,
        geradoEm,
      };
    });

    const resumo = new Map<string, number>();
    for (const l of linhas) {
      const k = `${l.classe} · noQuadro=${l.noQuadro} · ${l.estadoIndice}`;
      resumo.set(k, (resumo.get(k) ?? 0) + 1);
    }
    console.log(
      `=== semear-quadro-dev (${aplicar ? 'APPLY' : 'dry-run'}) dataRef ${iso(dataRef)} ===`,
    );
    console.log(`${linhas.length} linhas`);
    for (const [k, n] of [...resumo].sort()) console.log(`  ${k}: ${n}`);
    for (const s of ['WEGE3', 'TGMA3', 'AURE3', 'HGLG11', 'HCTR11', 'HFOF11']) {
      const l = linhas.find((x) => x.symbol === s);
      if (l)
        console.log(`  ${s}: ${l.estadoIndice} índice=${l.indiceMf} flags=${l.flags?.toString()}`);
    }
    if (!aplicar) {
      console.log('\nDry-run: nada gravado. Use --apply.');
      return;
    }
    await prisma.$transaction([
      prisma.analiseQuadroLinha.deleteMany({}),
      prisma.analiseQuadroLinha.createMany({ data: linhas }),
    ]);
    console.log(`  ✓ ${linhas.length} linhas gravadas em analise_quadro_linhas`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
