/**
 * Séries anuais de FII para os Filtros de Fundamentos (fatia A), a partir do banco (informes CVM +
 * proventos auditados). Mesmas fontes e regras do Essencial (fundamentosEssencial.montarFundamentosFii):
 *  - rendCota / vpCota = AssetPerShareYearly.rendCota / vpCotaFim levados à base de cotas de HOJE
 *    (÷ fatorCotasApos(31/12 do ano): desdobramento posterior ao ano, ex.: HGLG11 2017);
 *  - obrigacoesPl = AssetMultiplesYearly.obrigacoesPlPct ('Obrigações/PL', D3);
 *  - resultadoFii = Σ dos 4 trimestres de FiiQuarterly.resultadoTrimestral (ano com menos de 4
 *    trimestres ou trimestre sem valor = ausente), em R$ mi;
 *  - meses = proventos auditados até dez/anoFim (mesesJanela.mesesAteAnoFim, rec. 4).
 * Conferência: ano com a base por cota quebrada (decisão 1 do Bloco D: salto_acoes_sem_evento /
 * dados_incompletos) = rendCota e vpCota ausentes; ticker↔CNPJ não conferido = os números do
 * informe (VP/cota, Obrigações/PL, resultado) ausentes — rendimento/cota (proventos B3) continua.
 * Chaves de saída = nomes canônicos da spec (v2.5): income_per_share, nav_per_share, leverage_pct,
 * ffo. v2.5: a vacância física da CVM (FiiQuarterly.vacanciaFisicaCvmPct, informe trimestral) sai
 * TRIMESTRAL em vacanciaTrimestralFii — a FonteCvm devolve os pontos 'Q' e o resolverSeries leva ao
 * ano pela agregação de criteria_params.fontes (decisão 4: o último trimestre do ano). Papel (flag
 * nsa:vacanciaFisicaCvmPct) e ticker↔CNPJ não conferido = sem dado. Inadimplência e LTV não têm
 * série na CVM (só fii_property_quality aprovada de um provedor).
 */
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { fatorCotasApos } from '@/services/analiseAtivos/regras/calculo/fatorCotas';
import { paraData, paraNumero } from '@/services/analiseAtivos/repositorio/conversao';
import { anosPerShareEmConferencia } from '@/services/analiseAtivos/regras/conferencia/conferenciaAnual';
import {
  mesesAteAnoFim,
  type MesesRendimento,
  type ParamsMeses,
  type ProventoMeses,
} from '@/services/analiseAtivos/regras/criterios/mesesJanela';
import { imoveisSobrePlPct } from '@/services/analiseAtivos/regras/criterios/perfilCriterios';
import { mesesDyCvm } from '@/services/analiseAtivos/regras/calculo/proventos';
import type { SeriesCriterios } from '@/services/analiseAtivos/regras/criterios/seriesAcao';
import type { FiiTipoTela } from '@/types/analiseAtivosApi';

/** Entrada pura de um FII (também o formato da fixture do DEV). */
export interface BrutoFii {
  symbol: string;
  cnpj: string;
  /** casamento ticker↔CNPJ conferido (FiiTickerMap.conferido) */
  conferido: boolean;
  /** tipo vigente do último informe mensal (após histerese e override); null = sem tipo */
  fiiTipo: FiiTipoTela | null;
  /** composição do último informe mensal (R$) */
  composicao: { pl: number | null; imoveis: number | null; spe: number | null };
  perShare: Array<{
    anoFiscal: number;
    rendCota: number | null;
    vpCotaFim: number | null;
    flags: string[];
  }>;
  multiplos: Array<{ anoFiscal: number; obrigacoesPlPct: number | null; flags: string[] }>;
  /**
   * refQuarter = último dia do trimestre (AAAA-MM-DD); resultado em R$. v2.5: vacância física (%)
   * e flags do trimestre (nsa:vacanciaFisicaCvmPct = papel) — opcionais (fixtures da v2.4).
   */
  trimestres: Array<{
    refQuarter: string;
    resultadoTrimestral: number | null;
    vacanciaFisicaCvmPct?: number | null;
    flags?: string[];
  }>;
  /** meses com desdobramento de cotas (fii_monthly.fatorDesdobramento) */
  desdobramentos: Array<{ refMonth: string; fator: number }>;
  proventos: ProventoMeses[];
  /**
   * DY do mês do informe mensal da CVM (todas as versões; backtest 18/10/2026, A5/M7): prova de que
   * o fundo distribuiu num mês sem provento na base. Opcional (fixtures antigas).
   */
  dyMesCvm?: Array<{ refMonth: string; dyMesCvmPct: number | null }>;
}

const finito = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n);

/** Séries anuais de um FII. Pura (series.test usa a fixture real do DEV). */
export function seriesFii(b: BrutoFii): SeriesCriterios {
  const informe = b.conferido;
  const desd = informe ? b.desdobramentos : [];
  const fator = (ano: number) => fatorCotasApos(`${ano}-12-31`, desd);
  const perShareConf = anosPerShareEmConferencia(b.perShare, b.multiplos, { mediana: false });

  const rendCota: Record<number, number | null> = {};
  const vpCota: Record<number, number | null> = {};
  for (const p of b.perShare) {
    const conf = perShareConf.has(p.anoFiscal);
    const f = fator(p.anoFiscal);
    rendCota[p.anoFiscal] = !conf && finito(p.rendCota) ? p.rendCota / f : null;
    vpCota[p.anoFiscal] = !conf && informe && finito(p.vpCotaFim) ? p.vpCotaFim / f : null;
  }

  const obrigacoesPl: Record<number, number | null> = {};
  for (const m of b.multiplos) {
    obrigacoesPl[m.anoFiscal] = informe && finito(m.obrigacoesPlPct) ? m.obrigacoesPlPct : null;
  }

  const resultadoFii: Record<number, number | null> = {};
  if (informe) {
    const porAno = new Map<number, Array<number | null>>();
    for (const t of b.trimestres) {
      const ano = Number(t.refQuarter.slice(0, 4));
      const lista = porAno.get(ano);
      if (lista) lista.push(t.resultadoTrimestral);
      else porAno.set(ano, [t.resultadoTrimestral]);
    }
    for (const [ano, vals] of porAno) {
      resultadoFii[ano] =
        vals.length === 4 && vals.every(finito)
          ? (vals as number[]).reduce((a, v) => a + v, 0) / 1e6
          : null;
    }
  }
  return {
    income_per_share: rendCota,
    nav_per_share: vpCota,
    leverage_pct: obrigacoesPl,
    ffo: resultadoFii,
  };
}

/** Ponto trimestral de vacância física (% da área, CVM). valor null = sem dado (papel/nsa). */
export interface VacanciaTrimestre {
  refQuarter: string;
  valor: number | null;
}

/**
 * Vacância física trimestral da CVM (v2.5, série vacancy_physical). Ticker↔CNPJ não conferido = nada
 * (os números do informe não valem para o ticker); trimestre com a flag nsa (fundo sem imóveis) ou
 * sem o campo = null. Pura.
 */
export function vacanciaTrimestralFii(
  b: Pick<BrutoFii, 'conferido' | 'trimestres'>,
): VacanciaTrimestre[] {
  if (!b.conferido) return [];
  return b.trimestres
    .filter((t) => t.vacanciaFisicaCvmPct !== undefined || t.flags !== undefined)
    .map((t) => ({
      refQuarter: t.refQuarter,
      valor:
        !(t.flags ?? []).includes('nsa:vacanciaFisicaCvmPct') && finito(t.vacanciaFisicaCvmPct)
          ? t.vacanciaFisicaCvmPct
          : null,
    }));
}

/** Meses com rendimento até dez/anoFim (rec. 4), com a prova da CVM das lacunas (A5/M7). */
export function mesesFii(
  b: Pick<BrutoFii, 'proventos' | 'dyMesCvm'>,
  anoFim: number,
  scoring: ParamsMeses,
) {
  return mesesAteAnoFim(
    b.proventos,
    anoFim,
    scoring,
    b.dyMesCvm ? mesesDyCvm(b.dyMesCvm) : undefined,
  ) satisfies MesesRendimento;
}

/** (imóveis + SPE) ÷ PL do último informe, para a regra de composição do perfil. */
export function imoveisPlPctFii(b: Pick<BrutoFii, 'composicao' | 'conferido'>): number | null {
  return b.conferido ? imoveisSobrePlPct(b.composicao) : null;
}

// ---------------------------------------------------------------------------
// Leitura do banco (job 'criterios' e exportar-fixtures-criterios)
// ---------------------------------------------------------------------------

const TIPOS_FII: ReadonlySet<string> = new Set(['tijolo', 'papel', 'hibrido', 'fof', 'indefinido']);

export interface FiiCriterios {
  symbol: string;
  cnpj: string;
  conferido: boolean;
}

/** Brutos de um lote de FIIs (anos desde `desdeAno`). */
export async function lerBrutosFii(
  prisma: PrismaClient,
  fiis: readonly FiiCriterios[],
  desdeAno: number,
): Promise<Map<string, BrutoFii>> {
  const out = new Map<string, BrutoFii>();
  if (fiis.length === 0) return out;
  const symbols = fiis.map((f) => f.symbol);
  const cnpjs = [...new Set(fiis.map((f) => f.cnpj))];
  const desde = new Date(`${desdeAno}-01-01T00:00:00Z`);
  const [ps, my, trim, desd, mensal, prov, dyMes] = await Promise.all([
    prisma.assetPerShareYearly.findMany({
      where: { symbol: { in: symbols }, anoFiscal: { gte: desdeAno } },
      select: { symbol: true, anoFiscal: true, rendCota: true, vpCotaFim: true, flags: true },
    }),
    prisma.assetMultiplesYearly.findMany({
      where: { symbol: { in: symbols }, anoFiscal: { gte: desdeAno } },
      select: { symbol: true, anoFiscal: true, obrigacoesPlPct: true, flags: true },
    }),
    prisma.fiiQuarterly.findMany({
      where: { cnpj: { in: cnpjs }, refQuarter: { gte: desde } },
      select: {
        cnpj: true,
        refQuarter: true,
        resultadoTrimestral: true,
        vacanciaFisicaCvmPct: true,
        flags: true,
      },
    }),
    prisma.fiiMonthly.findMany({
      where: { cnpj: { in: cnpjs }, fatorDesdobramento: { not: null } },
      select: { cnpj: true, refMonth: true, fatorDesdobramento: true },
    }),
    prisma.$queryRaw<
      Array<{
        cnpj: string;
        tipoVigente: string | null;
        pl: Prisma.Decimal | null;
        imoveis: Prisma.Decimal | null;
        spe: Prisma.Decimal | null;
      }>
    >`SELECT DISTINCT ON ("cnpj") "cnpj", "tipoVigente", "pl", "imoveis", "spe"
      FROM "fii_monthly" WHERE "cnpj" IN (${Prisma.join(cnpjs)})
      ORDER BY "cnpj", "refMonth" DESC, "versao" DESC`,
    prisma.assetProventoAuditado.findMany({
      where: { symbol: { in: symbols }, status: 'valido' },
      select: {
        symbol: true,
        status: true,
        tipoNormalizado: true,
        dataPagamento: true,
        dataComReal: true,
      },
    }),
    prisma.fiiMonthly.findMany({
      where: { cnpj: { in: cnpjs }, refMonth: { gte: desde }, dyMesCvmPct: { not: null } },
      select: { cnpj: true, refMonth: true, dyMesCvmPct: true },
    }),
  ]);
  const mensalPor = new Map(mensal.map((m) => [m.cnpj, m]));
  for (const f of fiis) {
    const m = mensalPor.get(f.cnpj);
    const tipo = m?.tipoVigente && TIPOS_FII.has(m.tipoVigente) ? m.tipoVigente : null;
    out.set(f.symbol, {
      symbol: f.symbol,
      cnpj: f.cnpj,
      conferido: f.conferido,
      fiiTipo: tipo as FiiTipoTela | null,
      composicao: {
        pl: paraNumero(m?.pl),
        imoveis: paraNumero(m?.imoveis),
        spe: paraNumero(m?.spe),
      },
      perShare: [],
      multiplos: [],
      trimestres: [],
      desdobramentos: [],
      proventos: [],
      dyMesCvm: [],
    });
  }
  const porCnpj = new Map<string, BrutoFii[]>();
  for (const b of out.values()) {
    const lista = porCnpj.get(b.cnpj);
    if (lista) lista.push(b);
    else porCnpj.set(b.cnpj, [b]);
  }
  for (const p of ps) {
    out.get(p.symbol)?.perShare.push({
      anoFiscal: p.anoFiscal,
      rendCota: p.rendCota,
      vpCotaFim: p.vpCotaFim,
      flags: p.flags,
    });
  }
  for (const m of my) {
    out.get(m.symbol)?.multiplos.push({
      anoFiscal: m.anoFiscal,
      obrigacoesPlPct: m.obrigacoesPlPct,
      flags: m.flags,
    });
  }
  for (const t of trim) {
    for (const b of porCnpj.get(t.cnpj) ?? []) {
      b.trimestres.push({
        refQuarter: paraData(t.refQuarter),
        resultadoTrimestral: paraNumero(t.resultadoTrimestral),
        vacanciaFisicaCvmPct: t.vacanciaFisicaCvmPct,
        flags: t.flags,
      });
    }
  }
  for (const d of desd) {
    for (const b of porCnpj.get(d.cnpj) ?? []) {
      b.desdobramentos.push({
        refMonth: paraData(d.refMonth),
        fator: d.fatorDesdobramento as number,
      });
    }
  }
  for (const m of dyMes) {
    for (const b of porCnpj.get(m.cnpj) ?? []) {
      b.dyMesCvm!.push({ refMonth: paraData(m.refMonth), dyMesCvmPct: m.dyMesCvmPct });
    }
  }
  for (const p of prov) {
    out.get(p.symbol)?.proventos.push({
      status: p.status as ProventoMeses['status'],
      tipoNormalizado: p.tipoNormalizado as ProventoMeses['tipoNormalizado'],
      dataPagamento: paraData(p.dataPagamento),
      dataComReal: paraData(p.dataComReal),
    });
  }
  for (const b of out.values()) {
    b.perShare.sort((a, c) => a.anoFiscal - c.anoFiscal);
    b.multiplos.sort((a, c) => a.anoFiscal - c.anoFiscal);
    b.trimestres.sort((a, c) => a.refQuarter.localeCompare(c.refQuarter));
    b.desdobramentos.sort((a, c) => a.refMonth.localeCompare(c.refMonth));
    b.proventos.sort((a, c) =>
      (a.dataPagamento ?? a.dataComReal ?? '').localeCompare(
        c.dataPagamento ?? c.dataComReal ?? '',
      ),
    );
  }
  return out;
}
