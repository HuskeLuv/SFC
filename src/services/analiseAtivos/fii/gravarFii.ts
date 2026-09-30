/**
 * Gravação das tabelas da fatia B (FiiTickerMap, FiiMonthly, FiiQuarterly) — única escritora.
 *
 * Idempotente: linha nova ⇒ createMany (lotes de 1.000, skipDuplicates); linha existente com versão
 * MAIOR na fonte ou com derivado diferente (tipo vigente após override, flags…) ⇒ update; versão
 * menor na fonte ⇒ ignorada (nunca regride um reenvio). Linha igual ⇒ nada (2ª execução não escreve).
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { deData, paraData, paraNumero } from '@/services/analiseAtivos/repositorio/conversao';
import type { LinhaMapa, PlanoMapa } from '@/services/analiseAtivos/regras/fii/tickerCnpj';

const LOTE_CREATE = 1_000;
const LOTE_UPDATE = 100;

export interface ResultadoGravacao {
  criadas: number;
  atualizadas: number;
  iguais: number;
  versaoMenor: number;
}

// ---------------------------------------------------------------------------------------------
// FiiMonthly
// ---------------------------------------------------------------------------------------------

export interface LinhaFiiMensal {
  cnpj: string;
  refMonth: string;
  versao: number;
  dtEntrega: string | null;
  vpCota: number | null;
  vpCotaRecalculado: boolean;
  pl: number | null;
  cotas: number | null;
  cotistas: number | null;
  dyMesCvmPct: number | null;
  rentEfetivaMesPct: number | null;
  taxaAdmPct: number | null;
  ativoTotal: number | null;
  passivoTotal: number | null;
  rendDistribuir: number | null;
  obrigAquisicao: number | null;
  obrigSecuritizacao: number | null;
  imoveis: number | null;
  spe: number | null;
  cri: number | null;
  lciLca: number | null;
  cotasFii: number | null;
  rendaFixa: number | null;
  acoes: number | null;
  segmentoCvm: string | null;
  tipoComposicao: string | null;
  tipoVigente: string | null;
  reguaVigente: string | null;
  obrigacoesPlPct: number | null;
  fatorDesdobramento: number | null;
  flags: string[];
  sourceUrl: string;
}

/** Arredonda na escala da coluna (Decimal) ou em 10 dígitos significativos (Float). */
const r = (v: number | null, casas?: number): string =>
  v === null || !Number.isFinite(v)
    ? '∅'
    : casas === undefined
      ? Number(v.toPrecision(10)).toString()
      : v.toFixed(casas);

export function impressaoMensal(l: LinhaFiiMensal): string {
  return [
    l.versao,
    l.dtEntrega ?? '∅',
    r(l.vpCota, 8),
    l.vpCotaRecalculado,
    r(l.pl, 2),
    r(l.cotas, 4),
    l.cotistas ?? '∅',
    r(l.dyMesCvmPct),
    r(l.rentEfetivaMesPct),
    r(l.taxaAdmPct),
    r(l.ativoTotal, 2),
    r(l.passivoTotal, 2),
    r(l.rendDistribuir, 2),
    r(l.obrigAquisicao, 2),
    r(l.obrigSecuritizacao, 2),
    r(l.imoveis, 2),
    r(l.spe, 2),
    r(l.cri, 2),
    r(l.lciLca, 2),
    r(l.cotasFii, 2),
    r(l.rendaFixa, 2),
    r(l.acoes, 2),
    l.segmentoCvm ?? '∅',
    l.tipoComposicao ?? '∅',
    l.tipoVigente ?? '∅',
    l.reguaVigente ?? '∅',
    r(l.obrigacoesPlPct),
    r(l.fatorDesdobramento),
    [...l.flags].sort().join(','),
  ].join('|');
}

type RowMensal = Prisma.FiiMonthlyGetPayload<object>;

export function linhaMensalDoBanco(b: RowMensal): LinhaFiiMensal {
  return {
    cnpj: b.cnpj,
    refMonth: paraData(b.refMonth),
    versao: b.versao,
    dtEntrega: paraData(b.dtEntrega),
    vpCota: paraNumero(b.vpCota),
    vpCotaRecalculado: b.vpCotaRecalculado,
    pl: paraNumero(b.pl),
    cotas: paraNumero(b.cotas),
    cotistas: b.cotistas,
    dyMesCvmPct: b.dyMesCvmPct,
    rentEfetivaMesPct: b.rentEfetivaMesPct,
    taxaAdmPct: b.taxaAdmPct,
    ativoTotal: paraNumero(b.ativoTotal),
    passivoTotal: paraNumero(b.passivoTotal),
    rendDistribuir: paraNumero(b.rendDistribuir),
    obrigAquisicao: paraNumero(b.obrigAquisicao),
    obrigSecuritizacao: paraNumero(b.obrigSecuritizacao),
    imoveis: paraNumero(b.imoveis),
    spe: paraNumero(b.spe),
    cri: paraNumero(b.cri),
    lciLca: paraNumero(b.lciLca),
    cotasFii: paraNumero(b.cotasFii),
    rendaFixa: paraNumero(b.rendaFixa),
    acoes: paraNumero(b.acoes),
    segmentoCvm: b.segmentoCvm,
    tipoComposicao: b.tipoComposicao,
    tipoVigente: b.tipoVigente,
    reguaVigente: b.reguaVigente,
    obrigacoesPlPct: b.obrigacoesPlPct,
    fatorDesdobramento: b.fatorDesdobramento,
    flags: b.flags,
    sourceUrl: b.sourceUrl,
  };
}

/** Linhas gravadas de FiiMonthly (cnpj|refMonth → linha) no intervalo. */
export async function lerMensalGravado(
  prisma: PrismaClient,
  cnpjs: string[],
  desde: string,
  ate: string,
): Promise<Map<string, LinhaFiiMensal>> {
  const out = new Map<string, LinhaFiiMensal>();
  for (let i = 0; i < cnpjs.length; i += 500) {
    const linhas = await prisma.fiiMonthly.findMany({
      where: {
        cnpj: { in: cnpjs.slice(i, i + 500) },
        refMonth: { gte: deData(desde), lte: deData(ate) },
      },
    });
    for (const b of linhas) out.set(`${b.cnpj}|${paraData(b.refMonth)}`, linhaMensalDoBanco(b));
  }
  return out;
}

function dadosMensal(l: LinhaFiiMensal, agora: Date) {
  return {
    ...l,
    refMonth: deData(l.refMonth),
    dtEntrega: l.dtEntrega ? deData(l.dtEntrega) : null,
    fetchedAt: agora,
  };
}

async function emLotes<T>(itens: T[], n: number, fn: (lote: T[]) => Promise<unknown>) {
  for (let i = 0; i < itens.length; i += n) await fn(itens.slice(i, i + n));
}

export async function gravarMensal(
  prisma: PrismaClient,
  linhas: LinhaFiiMensal[],
  existentes: Map<string, LinhaFiiMensal>,
  aplicar: boolean,
): Promise<ResultadoGravacao> {
  const res: ResultadoGravacao = { criadas: 0, atualizadas: 0, iguais: 0, versaoMenor: 0 };
  const novas: LinhaFiiMensal[] = [];
  const mudadas: LinhaFiiMensal[] = [];
  for (const l of linhas) {
    const e = existentes.get(`${l.cnpj}|${l.refMonth}`);
    if (!e) novas.push(l);
    else if (l.versao < e.versao) res.versaoMenor++;
    else if (impressaoMensal(l) === impressaoMensal(e)) res.iguais++;
    else mudadas.push(l);
  }
  res.criadas = novas.length;
  res.atualizadas = mudadas.length;
  if (!aplicar) return res;
  const agora = new Date();
  await emLotes(novas, LOTE_CREATE, (lote) =>
    prisma.fiiMonthly.createMany({
      data: lote.map((l) => dadosMensal(l, agora)),
      skipDuplicates: true,
    }),
  );
  await emLotes(mudadas, LOTE_UPDATE, (lote) =>
    prisma.$transaction(
      lote.map((l) => {
        const { cnpj, refMonth, ...resto } = dadosMensal(l, agora);
        return prisma.fiiMonthly.update({
          where: { cnpj_refMonth: { cnpj, refMonth } },
          data: resto,
        });
      }),
    ),
  );
  return res;
}

// ---------------------------------------------------------------------------------------------
// FiiQuarterly
// ---------------------------------------------------------------------------------------------

export interface LinhaFiiTrimestral {
  cnpj: string;
  refQuarter: string;
  versao: number;
  nImoveisRenda: number | null;
  nImoveisOutros: number | null;
  areaM2: number | null;
  areaMaiorImovelM2: number | null;
  vacanciaFisicaCvmPct: number | null;
  inadimplenciaCvmPct: number | null;
  somaPctReceita: number | null;
  prazoMedioAnosAprox: number | null;
  vencAte12mPct: number | null;
  vencAcima36mPct: number | null;
  idxIpcaPct: number | null;
  idxIgpmPct: number | null;
  nCri: number | null;
  valorCri: number | null;
  maiorCriPct: number | null;
  nFii: number | null;
  receitaAluguel: number | null;
  resultadoTrimestral: number | null;
  rendimentosDeclarados: number | null;
  taxaPerformance: number | null;
  flags: string[];
  sourceUrl: string;
}

export function impressaoTrimestral(l: LinhaFiiTrimestral): string {
  return [
    l.versao,
    l.nImoveisRenda ?? '∅',
    l.nImoveisOutros ?? '∅',
    r(l.areaM2),
    r(l.areaMaiorImovelM2),
    r(l.vacanciaFisicaCvmPct),
    r(l.inadimplenciaCvmPct),
    r(l.somaPctReceita),
    r(l.prazoMedioAnosAprox),
    r(l.vencAte12mPct),
    r(l.vencAcima36mPct),
    r(l.idxIpcaPct),
    r(l.idxIgpmPct),
    l.nCri ?? '∅',
    r(l.valorCri, 2),
    r(l.maiorCriPct),
    l.nFii ?? '∅',
    r(l.receitaAluguel, 2),
    r(l.resultadoTrimestral, 2),
    r(l.rendimentosDeclarados, 2),
    r(l.taxaPerformance, 2),
    [...l.flags].sort().join(','),
  ].join('|');
}

type RowTrimestral = Prisma.FiiQuarterlyGetPayload<object>;

function linhaTrimestralDoBanco(b: RowTrimestral): LinhaFiiTrimestral {
  return {
    cnpj: b.cnpj,
    refQuarter: paraData(b.refQuarter),
    versao: b.versao,
    nImoveisRenda: b.nImoveisRenda,
    nImoveisOutros: b.nImoveisOutros,
    areaM2: b.areaM2,
    areaMaiorImovelM2: b.areaMaiorImovelM2,
    vacanciaFisicaCvmPct: b.vacanciaFisicaCvmPct,
    inadimplenciaCvmPct: b.inadimplenciaCvmPct,
    somaPctReceita: b.somaPctReceita,
    prazoMedioAnosAprox: b.prazoMedioAnosAprox,
    vencAte12mPct: b.vencAte12mPct,
    vencAcima36mPct: b.vencAcima36mPct,
    idxIpcaPct: b.idxIpcaPct,
    idxIgpmPct: b.idxIgpmPct,
    nCri: b.nCri,
    valorCri: paraNumero(b.valorCri),
    maiorCriPct: b.maiorCriPct,
    nFii: b.nFii,
    receitaAluguel: paraNumero(b.receitaAluguel),
    resultadoTrimestral: paraNumero(b.resultadoTrimestral),
    rendimentosDeclarados: paraNumero(b.rendimentosDeclarados),
    taxaPerformance: paraNumero(b.taxaPerformance),
    flags: b.flags,
    sourceUrl: b.sourceUrl,
  };
}

export async function lerTrimestralGravado(
  prisma: PrismaClient,
  cnpjs: string[],
  desde: string,
  ate: string,
): Promise<Map<string, LinhaFiiTrimestral>> {
  const out = new Map<string, LinhaFiiTrimestral>();
  for (let i = 0; i < cnpjs.length; i += 500) {
    const linhas = await prisma.fiiQuarterly.findMany({
      where: {
        cnpj: { in: cnpjs.slice(i, i + 500) },
        refQuarter: { gte: deData(desde), lte: deData(ate) },
      },
    });
    for (const b of linhas) {
      out.set(`${b.cnpj}|${paraData(b.refQuarter)}`, linhaTrimestralDoBanco(b));
    }
  }
  return out;
}

function dadosTrimestral(l: LinhaFiiTrimestral, agora: Date) {
  return { ...l, refQuarter: deData(l.refQuarter), fetchedAt: agora };
}

export async function gravarTrimestral(
  prisma: PrismaClient,
  linhas: LinhaFiiTrimestral[],
  existentes: Map<string, LinhaFiiTrimestral>,
  aplicar: boolean,
): Promise<ResultadoGravacao> {
  const res: ResultadoGravacao = { criadas: 0, atualizadas: 0, iguais: 0, versaoMenor: 0 };
  const novas: LinhaFiiTrimestral[] = [];
  const mudadas: LinhaFiiTrimestral[] = [];
  for (const l of linhas) {
    const e = existentes.get(`${l.cnpj}|${l.refQuarter}`);
    if (!e) novas.push(l);
    else if (l.versao < e.versao) res.versaoMenor++;
    else if (impressaoTrimestral(l) === impressaoTrimestral(e)) res.iguais++;
    else mudadas.push(l);
  }
  res.criadas = novas.length;
  res.atualizadas = mudadas.length;
  if (!aplicar) return res;
  const agora = new Date();
  await emLotes(novas, LOTE_CREATE, (lote) =>
    prisma.fiiQuarterly.createMany({
      data: lote.map((l) => dadosTrimestral(l, agora)),
      skipDuplicates: true,
    }),
  );
  await emLotes(mudadas, LOTE_UPDATE, (lote) =>
    prisma.$transaction(
      lote.map((l) => {
        const { cnpj, refQuarter, ...resto } = dadosTrimestral(l, agora);
        return prisma.fiiQuarterly.update({
          where: { cnpj_refQuarter: { cnpj, refQuarter } },
          data: resto,
        });
      }),
    ),
  );
  return res;
}

// ---------------------------------------------------------------------------------------------
// FiiTickerMap
// ---------------------------------------------------------------------------------------------

export async function lerMapa(
  prisma: PrismaClient,
): Promise<Array<LinhaMapa & { fetchedAt: Date }>> {
  const linhas = await prisma.fiiTickerMap.findMany({
    orderBy: [{ ticker: 'asc' }, { validFrom: 'asc' }],
  });
  return linhas.map((l) => ({
    id: l.id,
    ticker: l.ticker,
    cnpj: l.cnpj,
    validFrom: paraData(l.validFrom),
    validTo: paraData(l.validTo),
    origem: l.origem,
    conferido: l.conferido,
    conferidoPor: l.conferidoPor,
    motivo: l.motivo,
    nomeB3: l.nomeB3,
    fetchedAt: l.fetchedAt,
  }));
}

/** CNPJs com alguma linha no mapa (universo B3 da ingestão mensal/trimestral). */
export async function cnpjsDoMapa(prisma: PrismaClient): Promise<string[]> {
  const linhas = await prisma.fiiTickerMap.findMany({ select: { cnpj: true }, distinct: ['cnpj'] });
  return linhas.map((l) => l.cnpj).sort();
}

export async function aplicarPlanoMapa(
  prisma: PrismaClient,
  plano: PlanoMapa,
  tocados: string[] = [],
): Promise<void> {
  const agora = new Date();
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const f of plano.fechar) {
    ops.push(
      prisma.fiiTickerMap.update({ where: { id: f.id }, data: { validTo: deData(f.validTo) } }),
    );
  }
  for (const a of plano.atualizar) {
    const { id, ...dados } = a;
    ops.push(prisma.fiiTickerMap.update({ where: { id }, data: { ...dados, fetchedAt: agora } }));
  }
  const atualizados = new Set(plano.atualizar.map((a) => a.id));
  const soTocar = tocados.filter((id) => !atualizados.has(id));
  if (soTocar.length > 0) {
    ops.push(
      prisma.fiiTickerMap.updateMany({
        where: { id: { in: soTocar } },
        data: { fetchedAt: agora },
      }),
    );
  }
  if (plano.abrir.length > 0) {
    ops.push(
      prisma.fiiTickerMap.createMany({
        data: plano.abrir.map((a) => ({
          ...a,
          validFrom: deData(a.validFrom),
          validTo: a.validTo ? deData(a.validTo) : null,
          fetchedAt: agora,
        })),
        skipDuplicates: true,
      }),
    );
  }
  // fechar antes de abrir (mesma transação): o índice único é (ticker, validFrom)
  for (let i = 0; i < ops.length; i += LOTE_UPDATE) {
    await prisma.$transaction(ops.slice(i, i + LOTE_UPDATE));
  }
}
