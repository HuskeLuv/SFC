/**
 * Escrita da camada de fontes (v2.5, fatia A; desenho final.camada_fontes §6–§7). Quem grava é SÓ a
 * ingestão 'fontes-fundamentos' (pontos de provedor) e a curadoria (revisão):
 *  - point-in-time: um ponto só ganha linha nova quando o VALOR muda (versao + 1); nunca há UPDATE
 *    de valor — só os campos de revisão (reviewStatus, reviewedBy, reviewedAt) mudam;
 *  - aprovarPonto / rejeitarPonto: a ÚNICA forma de tirar um ponto de 'pending'. Chamadas pela
 *    resolução do caso de curadoria do grupo 'fonte_externa' (acoesCuradoria) e pela casca de CLI
 *    scripts/analise-ativos/revisar-fonte.ts (que passa pela MESMA ação do caso);
 *  - abrirCasoFonte: cada ponto 'pending' abre (ou atualiza) um AnaliseCasoDado do grupo
 *    'fonte_externa' com a referência {tabela, id} do ponto.
 * A leitura (sempre approved) fica em repositorio/fontesFundamentos.ts (fatia 0).
 */
import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { chaveCaso } from '@/services/analiseAtivos/curadoria/contrato';
import { paraData, paraNumero } from '@/services/analiseAtivos/repositorio/conversao';
import type {
  ContextoCasoFonteExterna,
  ReferenciaPontoFonte,
} from '@/types/analiseAtivosCuradoria';
import {
  GRUPO_CURADORIA_FONTE_EXTERNA,
  type ExtractedBy,
  type IdFonte,
  type PeriodicidadeSerie,
  type QualidadeFii,
  type ReviewStatus,
  type SerieFundamento,
  type UnidadeSerie,
} from '@/types/analiseAtivosFontes';

/** Código de regra dos casos abertos pela sanidade (AnaliseCasoDado.regraCodigo). */
export const REGRA_SANIDADE_FONTE = 'sanidade_fonte';
/** Campo do caso de uma linha de qualidade de FII. */
export const CAMPO_QUALIDADE_FII = 'qualidade_fii';
/** Linhas por createMany. */
export const LOTE_GRAVACAO_FONTES = 500;

type Tx = Prisma.TransactionClient;
type PrismaPontos = Pick<PrismaClient, 'assetFundamentalsSerie' | 'fiiPropertyQuality'>;

/** Valor como o Decimal(24,6) do banco guarda (comparação point-in-time sem ruído de float). */
export function arredondarValor(v: number | null): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : null;
}

// ---------------------------------------------------------------------------
// asset_fundamentals_serie
// ---------------------------------------------------------------------------

/** Ponto já gravado (qualquer status), o que a ingestão precisa para versionar e comparar. */
export interface PontoGravado {
  id: string;
  symbol: string;
  serie: string;
  tipoPeriodo: string;
  dtFim: string;
  valor: number | null;
  versao: number;
  reviewStatus: string;
  incompleto: boolean;
}

/** Ponto normalizado pronto para gravar (na unidade do catálogo). */
export interface PontoParaGravar {
  symbol: string;
  emissorId: string | null;
  classe: string;
  mercado: string;
  serie: SerieFundamento;
  tipoPeriodo: PeriodicidadeSerie;
  anoFiscal: number;
  dtFim: string;
  valor: number | null;
  unidade: UnidadeSerie;
  fonte: IdFonte;
  sourceUrl: string | null;
  sourceRef: string | null;
  extractedBy: ExtractedBy;
  confianca: number | null;
  sourcePdfUrl: string | null;
  sourcePage: number | null;
  incompleto: boolean;
  reviewStatus: Extract<ReviewStatus, 'approved' | 'pending'>;
  motivosRevisao: string[];
}

/** Linha a criar (id gerado aqui para a referência do caso de curadoria). */
export type LinhaPontoNova = PontoParaGravar & { id: string; versao: number };

/** Histórico de uma fonte (todas as versões e status) para os ativos e séries do lote. */
export async function lerHistoricoPontos(
  prisma: PrismaPontos,
  fonte: IdFonte,
  symbols: readonly string[],
  series: readonly string[],
): Promise<PontoGravado[]> {
  if (symbols.length === 0 || series.length === 0) return [];
  const linhas = await prisma.assetFundamentalsSerie.findMany({
    where: { fonte, symbol: { in: [...symbols] }, serie: { in: [...series] } },
    select: {
      id: true,
      symbol: true,
      serie: true,
      tipoPeriodo: true,
      dtFim: true,
      valor: true,
      versao: true,
      reviewStatus: true,
      incompleto: true,
    },
  });
  return linhas.map((l) => ({ ...l, dtFim: paraData(l.dtFim), valor: paraNumero(l.valor) }));
}

const chavePonto = (p: { symbol: string; serie: string; tipoPeriodo: string; dtFim: string }) =>
  `${p.symbol}|${p.serie}|${p.tipoPeriodo}|${p.dtFim}`;

/** Última versão (qualquer status) por ponto. Pura. */
export function ultimasVersoes(historico: readonly PontoGravado[]): Map<string, PontoGravado> {
  const out = new Map<string, PontoGravado>();
  for (const h of historico) {
    const k = chavePonto(h);
    const atual = out.get(k);
    if (!atual || h.versao > atual.versao) out.set(k, h);
  }
  return out;
}

/**
 * Valor APROVADO do período anterior (mesma série e periodicidade, dtFim imediatamente antes, maior
 * versão aprovada) — base da regra de variação. Pura.
 */
export function anteriorAprovado(
  historico: readonly PontoGravado[],
  p: { symbol: string; serie: string; tipoPeriodo: string; dtFim: string },
): number | null {
  let melhor: PontoGravado | null = null;
  for (const h of historico) {
    if (
      h.reviewStatus !== 'approved' ||
      h.symbol !== p.symbol ||
      h.serie !== p.serie ||
      h.tipoPeriodo !== p.tipoPeriodo ||
      h.dtFim >= p.dtFim ||
      h.valor === null
    ) {
      continue;
    }
    if (
      !melhor ||
      h.dtFim > melhor.dtFim ||
      (h.dtFim === melhor.dtFim && h.versao > melhor.versao)
    ) {
      melhor = h;
    }
  }
  return melhor?.valor ?? null;
}

/**
 * Point-in-time: só cria versão quando o valor (arredondado como no banco) ou a marca de incompleto
 * mudou em relação à ÚLTIMA versão gravada (qualquer status). Pura.
 */
export function planejarVersoes(
  novos: readonly PontoParaGravar[],
  historico: readonly PontoGravado[],
  gerarId: () => string = randomUUID,
): { criar: LinhaPontoNova[]; iguais: number } {
  const ultimas = ultimasVersoes(historico);
  const criar: LinhaPontoNova[] = [];
  let iguais = 0;
  const vistos = new Set<string>();
  for (const n of novos) {
    const k = chavePonto(n);
    if (vistos.has(k)) continue; // o conector mandou o mesmo ponto 2× no lote: vale o primeiro
    vistos.add(k);
    const valor = arredondarValor(n.valor);
    const ultima = ultimas.get(k);
    if (ultima && ultima.valor === valor && ultima.incompleto === n.incompleto) {
      iguais += 1;
      continue;
    }
    criar.push({ ...n, valor, id: gerarId(), versao: (ultima?.versao ?? 0) + 1 });
  }
  return { criar, iguais };
}

/** Grava as linhas novas (createMany em lotes; nunca UPDATE de valor). Devolve quantas. */
export async function gravarPontos(
  prisma: Pick<PrismaClient, 'assetFundamentalsSerie'>,
  linhas: readonly LinhaPontoNova[],
  agora: Date,
): Promise<number> {
  let gravadas = 0;
  for (let i = 0; i < linhas.length; i += LOTE_GRAVACAO_FONTES) {
    const lote = linhas.slice(i, i + LOTE_GRAVACAO_FONTES);
    const r = await prisma.assetFundamentalsSerie.createMany({
      data: lote.map((l) => ({
        id: l.id,
        symbol: l.symbol,
        emissorId: l.emissorId,
        classe: l.classe,
        mercado: l.mercado,
        serie: l.serie,
        tipoPeriodo: l.tipoPeriodo,
        anoFiscal: l.anoFiscal,
        dtFim: new Date(`${l.dtFim}T00:00:00.000Z`),
        valor: l.valor,
        unidade: l.unidade,
        fonte: l.fonte,
        sourceUrl: l.sourceUrl,
        sourceRef: l.sourceRef,
        fetchedAt: agora,
        versao: l.versao,
        reviewStatus: l.reviewStatus,
        motivosRevisao: l.motivosRevisao,
        incompleto: l.incompleto,
        extractedBy: l.extractedBy,
        confianca: l.confianca,
        sourcePdfUrl: l.sourcePdfUrl,
        sourcePage: l.sourcePage,
      })),
      skipDuplicates: true,
    });
    gravadas += r.count;
  }
  return gravadas;
}

// ---------------------------------------------------------------------------
// fii_property_quality
// ---------------------------------------------------------------------------

/** Campos de conteúdo de uma linha de qualidade (comparados no point-in-time). */
export const CAMPOS_QUALIDADE = [
  'padAaaPct',
  'padAaPct',
  'padAPct',
  'tenantsCount',
  'topTenantPct',
  'atypicalPct',
  'avgLeaseYears',
  'criCount',
  'indexMix',
  'avgRate',
  'ltvAvg',
  'defaultPct',
  'highYieldPct',
  'durationYears',
] as const;

export interface QualidadeGravada {
  id: string;
  cnpj: string;
  periodo: string;
  versao: number;
  reviewStatus: string;
  defaultPct: number | null;
  ltvAvg: number | null;
  conteudo: string;
}

/** Assinatura estável do conteúdo (para o point-in-time). Pura. */
export function assinaturaQualidade(q: Partial<Record<string, unknown>>): string {
  return JSON.stringify(CAMPOS_QUALIDADE.map((c) => q[c] ?? null));
}

export async function lerHistoricoQualidade(
  prisma: Pick<PrismaClient, 'fiiPropertyQuality'>,
  fonte: IdFonte,
  cnpjs: readonly string[],
): Promise<QualidadeGravada[]> {
  if (cnpjs.length === 0) return [];
  const linhas = await prisma.fiiPropertyQuality.findMany({
    where: { fonte, cnpj: { in: [...cnpjs] } },
  });
  return linhas.map((l) => ({
    id: l.id,
    cnpj: l.cnpj,
    periodo: paraData(l.periodo),
    versao: l.versao,
    reviewStatus: l.reviewStatus,
    defaultPct: l.defaultPct,
    ltvAvg: l.ltvAvg,
    conteudo: assinaturaQualidade(l as unknown as Record<string, unknown>),
  }));
}

export type QualidadeParaGravar = Omit<QualidadeFii, 'tipo'> & {
  fonte: IdFonte;
  reviewStatus: Extract<ReviewStatus, 'approved' | 'pending'>;
  incompleto: boolean;
};

export async function gravarQualidade(
  prisma: Pick<PrismaClient, 'fiiPropertyQuality'>,
  linhas: ReadonlyArray<QualidadeParaGravar & { id: string; versao: number }>,
  agora: Date,
): Promise<number> {
  if (linhas.length === 0) return 0;
  const r = await prisma.fiiPropertyQuality.createMany({
    data: linhas.map((q) => ({
      id: q.id,
      symbol: q.symbol,
      cnpj: q.cnpj,
      periodo: new Date(`${q.periodo}T00:00:00.000Z`),
      padAaaPct: q.padAaaPct ?? null,
      padAaPct: q.padAaPct ?? null,
      padAPct: q.padAPct ?? null,
      tenantsCount: q.tenantsCount ?? null,
      topTenantPct: q.topTenantPct ?? null,
      atypicalPct: q.atypicalPct ?? null,
      avgLeaseYears: q.avgLeaseYears ?? null,
      criCount: q.criCount ?? null,
      indexMix: (q.indexMix ?? undefined) as Prisma.InputJsonValue | undefined,
      avgRate: q.avgRate ?? null,
      ltvAvg: q.ltvAvg ?? null,
      defaultPct: q.defaultPct ?? null,
      highYieldPct: q.highYieldPct ?? null,
      durationYears: q.durationYears ?? null,
      sourcePdfUrl: q.sourcePdfUrl ?? null,
      sourcePage: (q.sourcePage ?? undefined) as Prisma.InputJsonValue | undefined,
      extractedBy: q.extractedBy,
      confianca: (q.confianca ?? undefined) as Prisma.InputJsonValue | undefined,
      reviewStatus: q.reviewStatus,
      fonte: q.fonte,
      sourceUrl: q.sourceUrl ?? null,
      fetchedAt: agora,
      versao: q.versao,
      incompleto: q.incompleto,
    })),
    skipDuplicates: true,
  });
  return r.count;
}

// ---------------------------------------------------------------------------
// Revisão: aprovar / rejeitar (só pela curadoria)
// ---------------------------------------------------------------------------

type TxRevisao = Pick<Tx, 'assetFundamentalsSerie' | 'fiiPropertyQuality'>;

async function revisarPonto(
  tx: TxRevisao,
  ref: ReferenciaPontoFonte,
  status: Extract<ReviewStatus, 'approved' | 'rejected'>,
  revisorId: string,
  agora: Date,
): Promise<number> {
  const data = { reviewStatus: status, reviewedBy: revisorId, reviewedAt: agora };
  const where = { id: ref.id, reviewStatus: 'pending' };
  const r =
    ref.tabela === 'fii_property_quality'
      ? await tx.fiiPropertyQuality.updateMany({ where, data })
      : await tx.assetFundamentalsSerie.updateMany({ where, data });
  return r.count;
}

/** 'pending' → 'approved' com quem aprovou e quando (0 = o ponto já não estava pendente). */
export function aprovarPonto(
  tx: TxRevisao,
  ref: ReferenciaPontoFonte,
  revisorId: string,
  agora: Date = new Date(),
): Promise<number> {
  return revisarPonto(tx, ref, 'approved', revisorId, agora);
}

/** 'pending' → 'rejected' (nunca aparece na tela; a CVM ou a versão aprovada anterior vale). */
export function rejeitarPonto(
  tx: TxRevisao,
  ref: ReferenciaPontoFonte,
  revisorId: string,
  agora: Date = new Date(),
): Promise<number> {
  return revisarPonto(tx, ref, 'rejected', revisorId, agora);
}

// ---------------------------------------------------------------------------
// Caso de curadoria 'fonte_externa'
// ---------------------------------------------------------------------------

export interface CasoFonteParaAbrir {
  symbol: string;
  cnpj: string | null;
  classe: string;
  /** série (ou 'qualidade_fii') */
  campo: string;
  /** fim do período 'AAAA-MM-DD' */
  periodo: string;
  contexto: ContextoCasoFonteExterna;
}

/**
 * Abre o caso do ponto 'pending' (grupo 'fonte_externa', origem 'regra', sem prazo) ou, se já há um
 * caso aberto para o mesmo ativo × série × período, aponta-o para o ponto novo. Devolve se abriu.
 */
export async function abrirCasoFonte(
  prisma: Pick<PrismaClient, '$transaction'>,
  c: CasoFonteParaAbrir,
  agora: Date,
): Promise<'aberto' | 'atualizado'> {
  const chave = chaveCaso({ symbol: c.symbol, campo: c.campo, periodo: c.periodo });
  const contexto = c.contexto as unknown as Prisma.InputJsonValue;
  return prisma.$transaction(async (tx) => {
    const existente = await tx.analiseCasoDado.findUnique({
      where: { chaveAberta: chave },
      select: { id: true },
    });
    if (existente) {
      await tx.analiseCasoDado.update({
        where: { id: existente.id },
        data: { contexto, ultimaDeteccaoEm: agora, regraAtiva: true },
      });
      await tx.analiseCasoEvento.create({
        data: {
          casoId: existente.id,
          autorId: null,
          tipo: 'regra_disparou',
          texto: c.contexto.motivos.join(','),
        },
      });
      return 'atualizado' as const;
    }
    const caso = await tx.analiseCasoDado.create({
      data: {
        symbol: c.symbol.toUpperCase(),
        cnpj: c.cnpj,
        classe: c.classe,
        grupo: GRUPO_CURADORIA_FONTE_EXTERNA,
        campo: c.campo,
        periodo: c.periodo,
        origem: 'regra',
        regraCodigo: REGRA_SANIDADE_FONTE,
        chaveDeteccao: `${c.contexto.referencia.tabela}:${c.contexto.referencia.id}`,
        chaveAberta: chave,
        status: 'aberto',
        emConferencia: false,
        regraAtiva: true,
        contexto,
        ultimaDeteccaoEm: agora,
      },
      select: { id: true },
    });
    await tx.analiseCasoEvento.create({
      data: {
        casoId: caso.id,
        autorId: null,
        tipo: 'aberto',
        para: 'aberto',
        texto: c.contexto.motivos.join(','),
      },
    });
    return 'aberto' as const;
  });
}
