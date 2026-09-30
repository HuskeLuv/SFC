/**
 * Escrita das tabelas da fatia C: AssetQuoteDaily (imutável, createMany skipDuplicates em lotes de
 * 1.000), AssetQuoteResumo (reescrito por completo a cada recálculo) e AssetSetorB3 (upsert por raiz;
 * raiz que sumiu fica com presenteUltimoArquivo=false, nunca é apagada).
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import type { RegistroCotahist } from '@/services/analiseAtivos/regras/b3/cotahist';
import type { SetorB3 } from '@/services/analiseAtivos/regras/b3/classifSetorial';
import { deData, paraData } from '@/services/analiseAtivos/repositorio/conversao';

export const LOTE_GRAVACAO = 1000;

export function paraLinhaQuote(r: RegistroCotahist): Prisma.AssetQuoteDailyCreateManyInput {
  return {
    symbol: r.symbol,
    date: deData(r.data),
    // Decimal exato: PREULT (centavos) ÷ 100 ÷ FATCOT, 6 casas (coluna Decimal(18,6))
    closeRaw: new Prisma.Decimal(r.preultCentavos)
      .div(100)
      .div(r.fatCot)
      .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP),
    fatCot: r.fatCot,
    volumeFin: new Prisma.Decimal(r.voltotCentavos).div(100),
    quantidade: r.quantidade,
    negocios: r.negocios,
    codBdi: r.codBdi,
    especi: r.especi,
    source: 'cotahist',
  };
}

/**
 * Acumula registros e grava em lotes. `aplicar=false` (dry-run) só conta. Devolve o nº de linhas
 * efetivamente inseridas (skipDuplicates não conta as já existentes).
 */
export class GravadorCotacoes {
  private buffer: Prisma.AssetQuoteDailyCreateManyInput[] = [];
  gravadas = 0;
  enviadas = 0;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly aplicar: boolean,
    private readonly lote = LOTE_GRAVACAO,
  ) {}

  async adicionar(r: RegistroCotahist): Promise<void> {
    this.buffer.push(paraLinhaQuote(r));
    if (this.buffer.length >= this.lote) await this.descarregar();
  }

  async descarregar(): Promise<void> {
    if (this.buffer.length === 0) return;
    const dados = this.buffer;
    this.buffer = [];
    this.enviadas += dados.length;
    if (!this.aplicar) return;
    const r = await this.prisma.assetQuoteDaily.createMany({ data: dados, skipDuplicates: true });
    this.gravadas += r.count;
  }
}

/** Datas (dentre `datas`) que já têm alguma linha em asset_quotes_daily. */
export async function datasComCotacao(prisma: PrismaClient, datas: string[]): Promise<Set<string>> {
  if (datas.length === 0) return new Set();
  const grupos = await prisma.assetQuoteDaily.groupBy({
    by: ['date'],
    where: { date: { in: datas.map(deData) } },
  });
  return new Set(grupos.map((g) => paraData(g.date)));
}

export async function ultimaDataCotacao(prisma: PrismaClient): Promise<string | null> {
  const r = await prisma.assetQuoteDaily.aggregate({ _max: { date: true } });
  return paraData(r._max.date);
}

export interface LinhaResumo {
  symbol: string;
  ultimoPregao: string;
  closeRaw: Prisma.Decimal;
  codBdi: string;
  especi: string | null;
  volumeMedio21: number;
  pregoesComNegocio21: number;
  baixaLiquidez: boolean;
  negociadoUltimos30: boolean;
  saltoSuspeito: boolean;
}

/**
 * Reescreve o resumo dos símbolos negociados na janela e zera a liquidez dos que saíram dela
 * (mantendo último preço/pregão — a fatia B ainda precisa da cotação para conferir PL×cotação).
 * Uma transação: leitores veem o resumo antigo ou o novo, nunca pela metade.
 */
export async function gravarResumo(
  prisma: PrismaClient,
  linhas: LinhaResumo[],
  agora: Date,
): Promise<number> {
  const symbols = linhas.map((l) => l.symbol);
  const dados: Prisma.AssetQuoteResumoCreateManyInput[] = linhas.map((l) => ({
    symbol: l.symbol,
    ultimoPregao: deData(l.ultimoPregao),
    closeRaw: l.closeRaw,
    codBdi: l.codBdi,
    especi: l.especi,
    volumeMedio21: new Prisma.Decimal(l.volumeMedio21.toFixed(2)),
    pregoesComNegocio21: l.pregoesComNegocio21,
    baixaLiquidez: l.baixaLiquidez,
    negociadoUltimos30: l.negociadoUltimos30,
    saltoSuspeito: l.saltoSuspeito,
    atualizadoEm: agora,
  }));
  await prisma.$transaction([
    prisma.assetQuoteResumo.updateMany({
      where: { symbol: { notIn: symbols } },
      data: {
        volumeMedio21: new Prisma.Decimal(0),
        pregoesComNegocio21: 0,
        baixaLiquidez: true,
        negociadoUltimos30: false,
        saltoSuspeito: false,
        atualizadoEm: agora,
      },
    }),
    prisma.assetQuoteResumo.deleteMany({ where: { symbol: { in: symbols } } }),
    prisma.assetQuoteResumo.createMany({ data: dados }),
  ]);
  return dados.length;
}

export interface ResultadoSetores {
  inseridas: number;
  atualizadas: number;
  marcadasAusentes: number;
}

/**
 * Upsert do cadastro setorial. Só regrava raízes com algum campo diferente (normalmente nenhuma);
 * todas as presentes ganham `atualizadoEm = agora` (frescor da camada cadastro_b3).
 */
export async function gravarSetores(
  prisma: PrismaClient,
  setores: SetorB3[],
  sumidas: string[],
  agora: Date,
): Promise<ResultadoSetores> {
  const existentes = new Map(
    (await prisma.assetSetorB3.findMany()).map((s) => [s.raiz, s] as const),
  );
  const novas: Prisma.AssetSetorB3CreateManyInput[] = [];
  const alteradas: SetorB3[] = [];
  for (const s of setores) {
    const e = existentes.get(s.raiz);
    if (!e) {
      novas.push({ ...s, presenteUltimoArquivo: true, atualizadoEm: agora });
    } else if (
      e.nomePregao !== s.nomePregao ||
      e.setor !== s.setor ||
      e.subsetor !== s.subsetor ||
      e.segmento !== s.segmento ||
      e.segmentoListagem !== s.segmentoListagem ||
      !e.presenteUltimoArquivo
    ) {
      alteradas.push(s);
    }
  }
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  if (novas.length > 0)
    ops.push(prisma.assetSetorB3.createMany({ data: novas, skipDuplicates: true }));
  for (const s of alteradas) {
    ops.push(
      prisma.assetSetorB3.update({
        where: { raiz: s.raiz },
        data: { ...s, presenteUltimoArquivo: true, atualizadoEm: agora },
      }),
    );
  }
  if (sumidas.length > 0) {
    ops.push(
      prisma.assetSetorB3.updateMany({
        where: { raiz: { in: sumidas } },
        data: { presenteUltimoArquivo: false, atualizadoEm: agora },
      }),
    );
  }
  ops.push(
    prisma.assetSetorB3.updateMany({
      where: { raiz: { in: setores.map((s) => s.raiz) } },
      data: { atualizadoEm: agora },
    }),
  );
  await prisma.$transaction(ops);
  return {
    inseridas: novas.length,
    atualizadas: alteradas.length,
    marcadasAusentes: sumidas.length,
  };
}

/** Arquivo ClassifSetorial inalterado (sha256 igual): só confirma o frescor das raízes presentes. */
export async function confirmarSetoresPresentes(
  prisma: PrismaClient,
  agora: Date,
): Promise<number> {
  const r = await prisma.assetSetorB3.updateMany({
    where: { presenteUltimoArquivo: true },
    data: { atualizadoEm: agora },
  });
  return r.count;
}
