/**
 * Gravação de AssetEvento (escritor único = fatia E) por diferença: lê o que existe para os emissores
 * do universo, cria o que falta (createMany skipDuplicates, lotes de 1.000), atualiza só o que mudou
 * e remove assembleias que o próprio IPE deixou de sustentar (protocolo remarcado para outra data).
 * Idempotente: rodar duas vezes seguidas não escreve nada na segunda. No Neon/Lightsail, upsert
 * linha a linha de ~3 mil eventos custaria minutos; o diff custa 1 leitura + poucos lotes.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { deData, paraData } from '@/services/analiseAtivos/repositorio/conversao';
import type { TipoAssetEvento } from '@/services/analiseAtivos/eventos/textosEventos';

const LOTE_CRIACAO = 1_000;
const LOTE_ATUALIZACAO = 200;
const LOTE_CONSULTA = 1_000;

export interface EventoDesejado {
  cnpj: string;
  tipo: TipoAssetEvento;
  subtipo: string;
  periodoRef: string | null;
  chave: string;
  data: string;
  estimado: boolean;
  assunto: string | null;
  sourceUrl: string | null;
  sourceDocId: string | null;
  versao: number | null;
}

export interface ContagemGravacao {
  criados: number;
  atualizados: number;
  removidos: number;
  substituidos: number;
  inalterados: number;
}

interface Existente {
  id: string;
  cnpj: string;
  tipo: string;
  subtipo: string;
  periodoRef: string | null;
  chave: string;
  data: Date;
  estimado: boolean;
  substituidoEm: Date | null;
  assunto: string | null;
  sourceUrl: string | null;
  sourceDocId: string | null;
  versao: number | null;
}

export const chaveEvento = (e: { cnpj: string; tipo: string; chave: string }) =>
  `${e.cnpj}|${e.tipo}|${e.chave}`;

function lotes<T>(itens: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < itens.length; i += n) out.push(itens.slice(i, i + n));
  return out;
}

async function lerExistentes(
  prisma: PrismaClient,
  tipos: TipoAssetEvento[],
  cnpjs: string[],
): Promise<Existente[]> {
  const out: Existente[] = [];
  for (const lote of lotes(cnpjs, LOTE_CONSULTA)) {
    const linhas = await prisma.assetEvento.findMany({
      where: { tipo: { in: tipos }, cnpj: { in: lote } },
      select: {
        id: true,
        cnpj: true,
        tipo: true,
        subtipo: true,
        periodoRef: true,
        chave: true,
        data: true,
        estimado: true,
        substituidoEm: true,
        assunto: true,
        sourceUrl: true,
        sourceDocId: true,
        versao: true,
      },
    });
    out.push(...linhas);
  }
  return out;
}

function mudou(ex: Existente, d: EventoDesejado): boolean {
  return (
    paraData(ex.data) !== d.data ||
    ex.subtipo !== d.subtipo ||
    ex.periodoRef !== d.periodoRef ||
    ex.estimado !== d.estimado ||
    ex.assunto !== d.assunto ||
    ex.sourceUrl !== d.sourceUrl ||
    ex.sourceDocId !== d.sourceDocId ||
    ex.versao !== d.versao
  );
}

function paraCriacao(d: EventoDesejado, agora: Date): Prisma.AssetEventoCreateManyInput {
  return {
    cnpj: d.cnpj,
    tipo: d.tipo,
    subtipo: d.subtipo,
    periodoRef: d.periodoRef,
    chave: d.chave,
    data: deData(d.data),
    estimado: d.estimado,
    assunto: d.assunto,
    sourceUrl: d.sourceUrl,
    sourceDocId: d.sourceDocId,
    versao: d.versao,
    fetchedAt: agora,
  };
}

interface PlanoGravacao {
  criar: EventoDesejado[];
  atualizar: Array<{ id: string; d: EventoDesejado }>;
  remover: string[];
  substituir: string[];
  inalterados: number;
}

async function aplicarPlano(
  prisma: PrismaClient,
  plano: PlanoGravacao,
  agora: Date,
  aplicar: boolean,
): Promise<ContagemGravacao> {
  if (aplicar) {
    for (const lote of lotes(plano.criar, LOTE_CRIACAO)) {
      await prisma.assetEvento.createMany({
        data: lote.map((d) => paraCriacao(d, agora)),
        skipDuplicates: true,
      });
    }
    for (const lote of lotes(plano.atualizar, LOTE_ATUALIZACAO)) {
      await prisma.$transaction(
        lote.map(({ id, d }) =>
          prisma.assetEvento.update({
            where: { id },
            data: {
              subtipo: d.subtipo,
              periodoRef: d.periodoRef,
              data: deData(d.data),
              estimado: d.estimado,
              assunto: d.assunto,
              sourceUrl: d.sourceUrl,
              sourceDocId: d.sourceDocId,
              versao: d.versao,
              fetchedAt: agora,
            },
          }),
        ),
      );
    }
    for (const lote of lotes(plano.remover, LOTE_CONSULTA)) {
      await prisma.assetEvento.deleteMany({ where: { id: { in: lote } } });
    }
    for (const lote of lotes(plano.substituir, LOTE_CONSULTA)) {
      await prisma.assetEvento.updateMany({
        where: { id: { in: lote }, substituidoEm: null },
        data: { substituidoEm: agora },
      });
    }
  }
  return {
    criados: plano.criar.length,
    atualizados: plano.atualizar.length,
    removidos: plano.remover.length,
    substituidos: plano.substituir.length,
    inalterados: plano.inalterados,
  };
}

/**
 * Assembleias de um arquivo do IPE. Evento já existente cujo documento-base é de OUTRO arquivo fica
 * como está (a mesma assembleia aparece no IPE de dois anos quando a Ata sai no ano seguinte).
 * `protocolosDoArquivo` = todos os protocolos de assembleia lidos
 * (inclusive de emissores fora do universo): um evento existente cujo documento-base está no
 * arquivo mas cuja chave não é mais produzida (versão nova remarcou a data) é removido. Eventos
 * sustentados por protocolos de outros anos ficam intactos.
 */
export async function gravarAssembleias(
  prisma: PrismaClient,
  args: {
    desejados: EventoDesejado[];
    cnpjsUniverso: string[];
    protocolosDoArquivo: Set<string>;
    agora: Date;
    aplicar: boolean;
  },
): Promise<ContagemGravacao> {
  const existentes = await lerExistentes(prisma, ['assembleia'], args.cnpjsUniverso);
  const porChave = new Map(existentes.map((e) => [chaveEvento(e), e]));
  const desejadas = new Set(args.desejados.map(chaveEvento));
  const plano: PlanoGravacao = {
    criar: [],
    atualizar: [],
    remover: [],
    substituir: [],
    inalterados: 0,
  };

  for (const d of args.desejados) {
    const ex = porChave.get(chaveEvento(d));
    if (!ex) plano.criar.push(d);
    else if (ex.sourceDocId !== null && !args.protocolosDoArquivo.has(ex.sourceDocId)) {
      // sustentado por documento de outro arquivo (ex.: Edital no IPE de 2025, Ata no de 2026):
      // não troca o documento-base a cada arquivo processado (idempotência entre anos)
      plano.inalterados++;
    } else if (mudou(ex, d)) plano.atualizar.push({ id: ex.id, d });
    else plano.inalterados++;
  }
  for (const ex of existentes) {
    if (
      ex.sourceDocId !== null &&
      args.protocolosDoArquivo.has(ex.sourceDocId) &&
      !desejadas.has(chaveEvento(ex))
    ) {
      plano.remover.push(ex.id);
    }
  }
  return aplicarPlano(prisma, plano, args.agora, args.aplicar);
}

/**
 * Resultados reais (entregas de ITR/DFP) e estimados. Estimado cuja entrega real existe (no banco ou
 * nesta rodada) ganha substituidoEm e não é mais alterado; estimado nunca é apagado (trilha do erro
 * da estimativa).
 */
export async function gravarResultados(
  prisma: PrismaClient,
  args: {
    reais: EventoDesejado[];
    estimados: EventoDesejado[];
    cnpjsUniverso: string[];
    agora: Date;
    aplicar: boolean;
  },
): Promise<ContagemGravacao> {
  const existentes = await lerExistentes(
    prisma,
    ['resultado', 'resultado_estimado'],
    args.cnpjsUniverso,
  );
  const porChave = new Map(existentes.map((e) => [chaveEvento(e), e]));
  const plano: PlanoGravacao = {
    criar: [],
    atualizar: [],
    remover: [],
    substituir: [],
    inalterados: 0,
  };

  const reaisPorPeriodo = new Set<string>();
  for (const e of existentes)
    if (e.tipo === 'resultado') reaisPorPeriodo.add(`${e.cnpj}|${e.chave}`);
  for (const d of args.reais) reaisPorPeriodo.add(`${d.cnpj}|${d.chave}`);

  for (const d of args.reais) {
    const ex = porChave.get(chaveEvento(d));
    if (!ex) plano.criar.push(d);
    else if (mudou(ex, d)) plano.atualizar.push({ id: ex.id, d });
    else plano.inalterados++;
  }
  for (const d of args.estimados) {
    if (reaisPorPeriodo.has(`${d.cnpj}|${d.chave}`)) continue;
    const ex = porChave.get(chaveEvento(d));
    if (!ex) plano.criar.push(d);
    else if (ex.substituidoEm === null && mudou(ex, d)) plano.atualizar.push({ id: ex.id, d });
    else plano.inalterados++;
  }
  for (const ex of existentes) {
    if (
      ex.tipo === 'resultado_estimado' &&
      ex.substituidoEm === null &&
      reaisPorPeriodo.has(`${ex.cnpj}|${ex.chave}`)
    ) {
      plano.substituir.push(ex.id);
    }
  }
  return aplicarPlano(prisma, plano, args.agora, args.aplicar);
}
