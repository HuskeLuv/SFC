/**
 * Comparações salvas (bloco 1, fatia A) + a cota por usuário do PDF do Comparador.
 *
 * Comparação salva = classe + tickers (1..4, na ordem dos slots) + janela + tipoFii + nome. Nunca
 * números: reabrir recalcula com os dados do dia. Dedupe por `chave` (chaveComparacao: tickers
 * ORDENADOS + janela + tipoFii): salvar de novo a mesma combinação ATUALIZA (200, atualizada=true).
 * Até MAX_COMPARACOES_POR_USUARIO (409), conferido na trava do usuário.
 *
 * Cota do PDF: MAX_PDF_POR_HORA por usuário (payload.id) em janela deslizante de 1 h, em memória
 * (getTtlCache): zera no restart — aceitável numa instância só (Lightsail), registrado no
 * ATIVACAO. Soma-se ao teto por IP do middleware (tier próprio em rateLimit.ts).
 */
import { prisma } from '@/lib/prisma';
import { deleteTtlCacheKeyPrefix, getTtlCache } from '@/lib/simpleTtlCache';
import { ApiError } from '@/utils/apiErrorHandler';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import {
  MAX_COMPARACOES_POR_USUARIO,
  MAX_PDF_POR_HORA,
  chaveComparacao,
  hrefComparacao,
  nomePadraoComparacao,
} from '@/services/analiseAtivos/salvos/contrato';
import {
  comTravaDoUsuario,
  erroLimite,
  ehViolacaoUnica,
} from '@/services/analiseAtivos/salvos/listasService';
import type { TipoFiiExibido } from '@/types/analiseAtivosApi';
import type { Janela } from '@/types/analiseAtivosCriterios';
import type {
  ClasseItemSalvo,
  ComparacaoPostResposta,
  ComparacaoSalvaApi,
} from '@/types/analiseAtivosSalvos';

const TS = TEXTOS_SALVOS.servidor;

interface ComparacaoRow {
  id: string;
  nome: string;
  classe: string;
  tickers: string[];
  janela: number;
  tipoFii: string | null;
  updatedAt: Date;
}

const SELECT_COMPARACAO = {
  id: true,
  nome: true,
  classe: true,
  tickers: true,
  janela: true,
  tipoFii: true,
  updatedAt: true,
} as const;

export function paraComparacaoApi(row: ComparacaoRow): ComparacaoSalvaApi {
  const tipoFii = (row.tipoFii as TipoFiiExibido | null) ?? null;
  return {
    id: row.id,
    nome: row.nome,
    classe: row.classe as ClasseItemSalvo,
    tickers: row.tickers,
    janela: row.janela as Janela,
    tipoFii,
    href: hrefComparacao(row.tickers, row.janela, tipoFii),
    atualizadoEm: row.updatedAt.toISOString(),
  };
}

/** GET /comparacoes?classe= (mais recentes primeiro). */
export async function listarComparacoes(
  userId: string,
  classe?: ClasseItemSalvo,
): Promise<ComparacaoSalvaApi[]> {
  const rows = await prisma.analiseComparacao.findMany({
    where: { userId, ...(classe ? { classe } : {}) },
    orderBy: { updatedAt: 'desc' },
    select: SELECT_COMPARACAO,
  });
  return rows.map(paraComparacaoApi);
}

/**
 * POST /comparacoes: tickers JÁ validados pela rota (todos da classe). Mesma chave ⇒ atualiza o
 * nome (quando veio) e a ordem dos slots (200); senão cria (201) dentro do limite.
 */
export async function salvarComparacao(
  userId: string,
  entrada: {
    classe: ClasseItemSalvo;
    tickers: string[];
    janela: Janela;
    tipoFii: TipoFiiExibido | null;
    nome?: string;
  },
): Promise<ComparacaoPostResposta> {
  const chave = chaveComparacao(entrada.tickers, entrada.janela, entrada.tipoFii);
  const nome = entrada.nome ?? nomePadraoComparacao(entrada.tickers);
  try {
    return await comTravaDoUsuario(userId, async (tx) => {
      const existente = await tx.analiseComparacao.findFirst({
        where: { userId, chave },
        select: { id: true },
      });
      if (existente) {
        await tx.analiseComparacao.updateMany({
          where: { id: existente.id, userId },
          data: { tickers: entrada.tickers, ...(entrada.nome ? { nome: entrada.nome } : {}) },
        });
        const row = await tx.analiseComparacao.findFirst({
          where: { id: existente.id, userId },
          select: SELECT_COMPARACAO,
        });
        if (!row) throw new ApiError(404, TS.comparacaoNaoEncontrada);
        return { comparacao: paraComparacaoApi(row), atualizada: true };
      }
      const total = await tx.analiseComparacao.count({ where: { userId } });
      if (total >= MAX_COMPARACOES_POR_USUARIO) {
        throw erroLimite(TS.limiteComparacoes, MAX_COMPARACOES_POR_USUARIO);
      }
      const row = await tx.analiseComparacao.create({
        data: {
          userId,
          nome,
          classe: entrada.classe,
          tickers: entrada.tickers,
          janela: entrada.janela,
          tipoFii: entrada.tipoFii,
          chave,
        },
        select: SELECT_COMPARACAO,
      });
      return { comparacao: paraComparacaoApi(row), atualizada: false };
    });
  } catch (error: unknown) {
    // corrida rara entre a leitura e o create (a trava já serializa o mesmo usuário)
    if (ehViolacaoUnica(error)) throw new ApiError(409, TS.limiteComparacoes);
    throw error;
  }
}

/** PATCH /comparacoes/[id] {nome}. */
export async function renomearComparacao(
  userId: string,
  id: string,
  nome: string,
): Promise<ComparacaoSalvaApi> {
  const { count } = await prisma.analiseComparacao.updateMany({
    where: { id, userId },
    data: { nome },
  });
  if (count === 0) throw new ApiError(404, TS.comparacaoNaoEncontrada);
  const row = await prisma.analiseComparacao.findFirst({
    where: { id, userId },
    select: SELECT_COMPARACAO,
  });
  if (!row) throw new ApiError(404, TS.comparacaoNaoEncontrada);
  return paraComparacaoApi(row);
}

/** DELETE /comparacoes/[id]. */
export async function apagarComparacao(userId: string, id: string): Promise<void> {
  const { count } = await prisma.analiseComparacao.deleteMany({ where: { id, userId } });
  if (count === 0) throw new ApiError(404, TS.comparacaoNaoEncontrada);
}

// ---------------------------------------------------------------------------
// Cota do PDF (10 por hora por usuário)
// ---------------------------------------------------------------------------

export const JANELA_COTA_PDF_MS = 60 * 60 * 1000;
const NS_COTA_PDF = 'analisePdfComparacao';
const cotaPdf = getTtlCache<number[]>(NS_COTA_PDF);

/**
 * Consome 1 PDF da hora do usuário. Passou do limite ⇒ ApiError 429 (o detalhe `liberaEm` traz o
 * ISO de quando a 1ª geração da janela sai dela, para a cópia "a partir das {hora}").
 */
export function consumirCotaPdf(userId: string, agora: number = Date.now()): void {
  const desde = agora - JANELA_COTA_PDF_MS;
  const marcas = (cotaPdf.get(userId) ?? []).filter((t) => t > desde);
  if (marcas.length >= MAX_PDF_POR_HORA) {
    const liberaEm = new Date(marcas[0] + JANELA_COTA_PDF_MS).toISOString();
    cotaPdf.set(userId, marcas, JANELA_COTA_PDF_MS);
    throw new ApiError(429, formatarTexto(TS.limitePdf, { max: MAX_PDF_POR_HORA }), {
      liberaEm: [liberaEm],
    });
  }
  marcas.push(agora);
  cotaPdf.set(userId, marcas, JANELA_COTA_PDF_MS);
}

/** Devolve a última unidade consumida (a geração falhou depois de consumir). */
export function devolverCotaPdf(userId: string): void {
  const marcas = cotaPdf.get(userId);
  if (!marcas || marcas.length === 0) return;
  marcas.pop();
  cotaPdf.set(userId, marcas, JANELA_COTA_PDF_MS);
}

/** Só para testes: zera a cota de um usuário (ou de todos). */
export function _limparCotaPdf(userId?: string): void {
  if (userId) cotaPdf.del(userId);
  else deleteTtlCacheKeyPrefix(NS_COTA_PDF, '');
}
