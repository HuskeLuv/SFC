/**
 * Salvos (bloco 1, fatia A): listas com nome, itens e o índice do botão Salvar. Tudo PESSOAL e
 * isolado por userId em TODA query (a rota passa sempre payload.id; o consultor agindo pelo
 * cliente nunca chega aqui: GET vazio e mutações 403 na rota).
 *
 * - Limites (LIMITES_SALVOS): conferidos DENTRO de uma transação serializada por usuário com
 *   pg_advisory_xact_lock (comTravaDoUsuario). Sem a trava, dois pedidos simultâneos (READ
 *   COMMITTED) leriam a mesma contagem e passariam juntos do limite — e dois cliques em Salvar
 *   com 0 listas criariam duas 'Salvos'. Excedeu ⇒ ApiError 409 com a mensagem de textosSalvos.
 * - Nome: normalizado pelo zod (NomeSchema); unicidade por nomeNormalizado (minúsculas, sem
 *   acento). A unique do banco segura o resto (P2002 ⇒ 409).
 * - Ordem das listas = createdAt (sem reordenar no bloco 1).
 * - NÃO é o Watchlist da Carteira (planejados/objetivo).
 */
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/apiErrorHandler';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';
import { obterLinhaQuadro } from '@/services/analiseAtivos/leitura/linhasQuadro';
import {
  ALERTAS_PADRAO_LISTA,
  LIMITES_SALVOS,
  MENSAGEM_LISTAS_PESSOAIS,
  TICKER_RE_POR_CLASSE,
  classesSalvosLigadas,
  ehTickerValido,
  normalizarTicker,
  paramsParaObjeto,
  MAX_ITENS_POR_LISTA,
  MAX_ITENS_POR_USUARIO,
  MAX_LISTAS_POR_USUARIO,
  ehSentinelaPadrao,
  nomeNormalizado,
  resolverSentinelaPadrao,
} from '@/services/analiseAtivos/salvos/contrato';
import type {
  AlertasLista,
  ClasseItemReservada,
  ContagemPorClasse,
  IndiceSalvosResposta,
  ItemPostResposta,
  PermissaoSalvos,
  ResumoLista,
  SalvosPutResposta,
} from '@/types/analiseAtivosSalvos';
import type { ClasseQuadro } from '@/types/analiseAtivosApi';

export type Tx = Prisma.TransactionClient;

const TS = TEXTOS_SALVOS.servidor;

/** Ativo já validado pela rota (formato + linha do Quadro); a classe vem da linha. */
export interface AtivoSalvo {
  symbol: string;
  classe: ClasseQuadro;
}

// ---------------------------------------------------------------------------
// Trava e erros
// ---------------------------------------------------------------------------

/** Chave da trava (uma só para listas, itens, filtros e comparações do usuário). */
export function chaveTravaSalvos(userId: string): string {
  return `analise_salvos:${userId}`;
}

/**
 * Executa `fn` numa transação serializada por usuário (pg_advisory_xact_lock, liberada no fim da
 * transação). Usada por toda mutação que confere limite ou cria a 1ª lista.
 */
export async function comTravaDoUsuario<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${chaveTravaSalvos(userId)}::text))`;
    return fn(tx);
  });
}

export function erroLimite(modelo: string, max: number): ApiError {
  return new ApiError(409, formatarTexto(modelo, { max }));
}

/** P2002 (unique) ⇒ 409 com a mensagem dada; o resto sobe. */
export function ehViolacaoUnica(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

// ---------------------------------------------------------------------------
// Conversão
// ---------------------------------------------------------------------------

export interface ListaRow {
  id: string;
  nome: string;
  alertaResultado: boolean;
  alertaProvento: boolean;
  alertaCriterios: boolean;
  createdAt: Date;
}

const SELECT_LISTA = {
  id: true,
  nome: true,
  alertaResultado: true,
  alertaProvento: true,
  alertaCriterios: true,
  createdAt: true,
} as const;

/** acao/fii sempre; stock/reit (EUA, fatia D) só quando a lista tem itens deles. */
export function contagemDe(itens: ReadonlyArray<{ classe: string }>): ContagemPorClasse {
  const c: ContagemPorClasse = { acao: 0, fii: 0 };
  for (const i of itens) {
    if (i.classe === 'acao' || i.classe === 'fii') c[i.classe] += 1;
    else if (i.classe === 'stock' || i.classe === 'reit') c[i.classe] = (c[i.classe] ?? 0) + 1;
  }
  return c;
}

export function paraResumoLista(row: ListaRow, contagem: ContagemPorClasse): ResumoLista {
  return {
    id: row.id,
    nome: row.nome,
    contagem,
    alertas: {
      resultado: row.alertaResultado,
      provento: row.alertaProvento,
      criterios: row.alertaCriterios,
    },
    criadaEm: row.createdAt.toISOString(),
  };
}

function colunasAlertas(a: Partial<AlertasLista>): Partial<{
  alertaResultado: boolean;
  alertaProvento: boolean;
  alertaCriterios: boolean;
}> {
  const out: Partial<Record<'alertaResultado' | 'alertaProvento' | 'alertaCriterios', boolean>> =
    {};
  if (a.resultado !== undefined) out.alertaResultado = a.resultado;
  if (a.provento !== undefined) out.alertaProvento = a.provento;
  if (a.criterios !== undefined) out.alertaCriterios = a.criterios;
  return out;
}

async function resumoDe(tx: Tx, row: ListaRow, userId: string): Promise<ResumoLista> {
  const itens = await tx.analiseListaItem.findMany({
    where: { listaId: row.id, userId },
    select: { classe: true },
  });
  return paraResumoLista(row, contagemDe(itens));
}

// ---------------------------------------------------------------------------
// Listas
// ---------------------------------------------------------------------------

/** GET /listas: as listas do usuário em ordem de criação, com a contagem por classe. */
export async function listarListas(userId: string): Promise<ResumoLista[]> {
  const rows = await prisma.analiseLista.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { ...SELECT_LISTA, itens: { where: { userId }, select: { classe: true } } },
  });
  return rows.map((r) => paraResumoLista(r, contagemDe(r.itens)));
}

/** Lista do usuário (null se não existe ou é de outro usuário). */
export async function obterLista(
  userId: string,
  id: string,
  db: Tx | typeof prisma = prisma,
): Promise<ListaRow | null> {
  return db.analiseLista.findFirst({ where: { id, userId }, select: SELECT_LISTA });
}

async function conferirNomeLivre(tx: Tx, userId: string, nome: string, exceto?: string) {
  const igual = await tx.analiseLista.findFirst({
    where: {
      userId,
      nomeNormalizado: nomeNormalizado(nome),
      ...(exceto ? { id: { not: exceto } } : {}),
    },
    select: { id: true },
  });
  if (igual) throw new ApiError(409, TS.listaRepetida);
}

async function conferirLimiteUsuario(tx: Tx, userId: string, novos: number) {
  if (novos <= 0) return;
  const total = await tx.analiseListaItem.count({ where: { userId } });
  if (total + novos > MAX_ITENS_POR_USUARIO) {
    throw erroLimite(TS.limiteItensUsuario, MAX_ITENS_POR_USUARIO);
  }
}

async function criarListaNaTrava(
  tx: Tx,
  userId: string,
  nome: string,
  alertas: AlertasLista,
  item?: AtivoSalvo,
): Promise<ListaRow> {
  const total = await tx.analiseLista.count({ where: { userId } });
  if (total >= MAX_LISTAS_POR_USUARIO) throw erroLimite(TS.limiteListas, MAX_LISTAS_POR_USUARIO);
  await conferirNomeLivre(tx, userId, nome);
  if (item) await conferirLimiteUsuario(tx, userId, 1);
  return tx.analiseLista.create({
    data: {
      userId,
      nome,
      nomeNormalizado: nomeNormalizado(nome),
      ...colunasAlertas(alertas),
      ...(item
        ? { itens: { create: [{ userId, symbol: item.symbol, classe: item.classe }] } }
        : {}),
    },
    select: SELECT_LISTA,
  });
}

/**
 * POST /listas → ResumoLista. `alertas` só vale com o recurso alertas ligado (`alertasLigados`);
 * sem ele, a lista nasce com o padrão (resultado e provento ligados, critérios desligado).
 */
export async function criarLista(
  userId: string,
  entrada: { nome: string; alertas?: Partial<AlertasLista>; item?: AtivoSalvo },
  alertasLigados: boolean,
): Promise<ResumoLista> {
  const alertas: AlertasLista = {
    ...ALERTAS_PADRAO_LISTA,
    ...(alertasLigados ? (entrada.alertas ?? {}) : {}),
  };
  try {
    return await comTravaDoUsuario(userId, async (tx) => {
      const row = await criarListaNaTrava(tx, userId, entrada.nome, alertas, entrada.item);
      return paraResumoLista(row, contagemDe(entrada.item ? [entrada.item] : []));
    });
  } catch (error: unknown) {
    if (ehViolacaoUnica(error)) throw new ApiError(409, TS.listaRepetida);
    throw error;
  }
}

/** PATCH /listas/[id] → ResumoLista (nome e/ou avisos). 404 fora do usuário. */
export async function atualizarLista(
  userId: string,
  id: string,
  mudanca: { nome?: string; alertas?: Partial<AlertasLista> },
): Promise<ResumoLista> {
  try {
    return await comTravaDoUsuario(userId, async (tx) => {
      const atual = await obterLista(userId, id, tx);
      if (!atual) throw new ApiError(404, TS.listaNaoEncontrada);
      if (mudanca.nome !== undefined) await conferirNomeLivre(tx, userId, mudanca.nome, id);
      const { count } = await tx.analiseLista.updateMany({
        where: { id, userId },
        data: {
          ...(mudanca.nome !== undefined
            ? { nome: mudanca.nome, nomeNormalizado: nomeNormalizado(mudanca.nome) }
            : {}),
          ...colunasAlertas(mudanca.alertas ?? {}),
        },
      });
      if (count === 0) throw new ApiError(404, TS.listaNaoEncontrada);
      const row = await obterLista(userId, id, tx);
      if (!row) throw new ApiError(404, TS.listaNaoEncontrada);
      return resumoDe(tx, row, userId);
    });
  } catch (error: unknown) {
    if (ehViolacaoUnica(error)) throw new ApiError(409, TS.listaRepetida);
    throw error;
  }
}

/** DELETE /listas/[id]: apaga a lista e os itens (cascade + deleteMany explícito). */
export async function apagarLista(userId: string, id: string): Promise<void> {
  const r = await prisma.$transaction(async (tx) => {
    await tx.analiseListaItem.deleteMany({ where: { listaId: id, userId } });
    return tx.analiseLista.deleteMany({ where: { id, userId } });
  });
  if (r.count === 0) throw new ApiError(404, TS.listaNaoEncontrada);
}

// ---------------------------------------------------------------------------
// Itens
// ---------------------------------------------------------------------------

/**
 * POST /listas/[id]/itens: 201 (novo) ou 200 (já estava — o Desfazer reenvia). Limites 200 por
 * lista e 500 por usuário (409).
 */
export async function adicionarItem(
  userId: string,
  listaId: string,
  ativo: AtivoSalvo,
): Promise<{ criado: boolean; item: ItemPostResposta }> {
  return comTravaDoUsuario(userId, async (tx) => {
    const lista = await obterLista(userId, listaId, tx);
    if (!lista) throw new ApiError(404, TS.listaNaoEncontrada);
    const existente = await tx.analiseListaItem.findFirst({
      where: { listaId, userId, symbol: ativo.symbol },
      select: { classe: true, createdAt: true },
    });
    if (existente) {
      return {
        criado: false,
        item: {
          ticker: ativo.symbol,
          classe: ativo.classe,
          adicionadoEm: existente.createdAt.toISOString(),
        },
      };
    }
    const naLista = await tx.analiseListaItem.count({ where: { listaId, userId } });
    if (naLista >= MAX_ITENS_POR_LISTA) throw erroLimite(TS.limiteItensLista, MAX_ITENS_POR_LISTA);
    await conferirLimiteUsuario(tx, userId, 1);
    const novo = await tx.analiseListaItem.create({
      data: { listaId, userId, symbol: ativo.symbol, classe: ativo.classe },
      select: { createdAt: true },
    });
    return {
      criado: true,
      item: {
        ticker: ativo.symbol,
        classe: ativo.classe,
        adicionadoEm: novo.createdAt.toISOString(),
      },
    };
  });
}

/** DELETE /listas/[id]/itens/[ticker]: idempotente; 404 só se a lista não for do usuário. */
export async function removerItem(userId: string, listaId: string, symbol: string): Promise<void> {
  const lista = await obterLista(userId, listaId);
  if (!lista) throw new ApiError(404, TS.listaNaoEncontrada);
  await prisma.analiseListaItem.deleteMany({ where: { listaId, userId, symbol } });
}

/** Itens de uma lista (todas as classes), mais antigos primeiro. */
export async function itensDaLista(
  userId: string,
  listaId: string,
): Promise<Array<{ symbol: string; classe: ClasseItemReservada; createdAt: Date }>> {
  const rows = await prisma.analiseListaItem.findMany({
    where: { listaId, userId },
    orderBy: { createdAt: 'asc' },
    select: { symbol: true, classe: true, createdAt: true },
  });
  return rows.map((r) => ({ ...r, classe: r.classe as ClasseItemReservada }));
}

// ---------------------------------------------------------------------------
// Índice do botão Salvar
// ---------------------------------------------------------------------------

/** GET /salvos: ticker → ids das listas (só tickers salvos; no máximo 500 itens por usuário). */
export async function indiceSalvos(
  userId: string,
): Promise<Pick<IndiceSalvosResposta, 'porTicker' | 'listas'>> {
  const [listas, itens] = await Promise.all([
    prisma.analiseLista.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, nome: true },
    }),
    prisma.analiseListaItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      take: MAX_ITENS_POR_USUARIO,
      select: { symbol: true, listaId: true },
    }),
  ]);
  const ordem = new Map(listas.map((l, i) => [l.id, i]));
  const porTicker: Record<string, string[]> = {};
  for (const i of itens) {
    if (!ordem.has(i.listaId)) continue;
    (porTicker[i.symbol] ??= []).push(i.listaId);
  }
  for (const ids of Object.values(porTicker)) {
    ids.sort((a, b) => (ordem.get(a) ?? 0) - (ordem.get(b) ?? 0));
  }
  return { porTicker, listas };
}

/**
 * PUT /salvos/[ticker]: define em quais listas o ativo está. ['padrao'] resolve pelo número de
 * listas (0 → cria 'Salvos' com o ativo; 1 → essa; 2+ → 400). [] remove de todas. Lista de outro
 * usuário → 404. Uma transação com a trava do usuário (dois cliques não criam duas 'Salvos').
 */
export async function definirSalvo(
  userId: string,
  ativo: AtivoSalvo,
  listaIdsPedidos: readonly string[],
): Promise<SalvosPutResposta> {
  try {
    return await comTravaDoUsuario(userId, async (tx) => {
      const listas = await tx.analiseLista.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { id: true, nome: true },
      });
      let desejadas: string[];
      if (ehSentinelaPadrao(listaIdsPedidos)) {
        const r = resolverSentinelaPadrao(listas.map((l) => l.id));
        if (r.acao === 'invalido') throw new ApiError(400, TS.escolherListas);
        if (r.acao === 'criar') {
          const criada = await criarListaNaTrava(tx, userId, r.nome, ALERTAS_PADRAO_LISTA, ativo);
          return {
            ticker: ativo.symbol,
            listaIds: [criada.id],
            salvo: true,
            listaCriada: { id: criada.id, nome: criada.nome },
          };
        }
        desejadas = [r.listaId];
      } else {
        const doUsuario = new Set(listas.map((l) => l.id));
        if (listaIdsPedidos.some((id) => !doUsuario.has(id))) {
          throw new ApiError(404, TS.listaNaoEncontrada);
        }
        desejadas = [...listaIdsPedidos];
      }

      const atuais = (
        await tx.analiseListaItem.findMany({
          where: { userId, symbol: ativo.symbol },
          select: { listaId: true },
        })
      ).map((i) => i.listaId);
      const remover = atuais.filter((id) => !desejadas.includes(id));
      const adicionar = desejadas.filter((id) => !atuais.includes(id));

      for (const listaId of adicionar) {
        const naLista = await tx.analiseListaItem.count({ where: { listaId, userId } });
        if (naLista >= MAX_ITENS_POR_LISTA) {
          throw erroLimite(TS.limiteItensLista, MAX_ITENS_POR_LISTA);
        }
      }
      await conferirLimiteUsuario(tx, userId, adicionar.length - remover.length);

      if (remover.length > 0) {
        await tx.analiseListaItem.deleteMany({
          where: { userId, symbol: ativo.symbol, listaId: { in: remover } },
        });
      }
      if (adicionar.length > 0) {
        await tx.analiseListaItem.createMany({
          data: adicionar.map((listaId) => ({
            listaId,
            userId,
            symbol: ativo.symbol,
            classe: ativo.classe,
          })),
          skipDuplicates: true,
        });
      }
      const ordem = new Map(listas.map((l, i) => [l.id, i]));
      const listaIds = [...desejadas].sort((a, b) => (ordem.get(a) ?? 0) - (ordem.get(b) ?? 0));
      return { ticker: ativo.symbol, listaIds, salvo: listaIds.length > 0 };
    });
  } catch (error: unknown) {
    if (ehViolacaoUnica(error)) throw new ApiError(409, TS.listaRepetida);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Apoio às rotas (listas, salvos, filtros, comparações)
// ---------------------------------------------------------------------------

export const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/** Campos de permissão das leituras: consultor agindo ⇒ podeSalvar=false ('consultor'). */
export function permissaoSalvos(consultor: boolean): PermissaoSalvos {
  return {
    limites: LIMITES_SALVOS,
    podeSalvar: !consultor,
    motivoSemSalvar: consultor ? 'consultor' : null,
  };
}

/** Mutações no modo consultor ⇒ 403 'As listas são pessoais'. */
export function exigirPessoal(actingClient: unknown): void {
  if (actingClient) throw new ApiError(403, MENSAGEM_LISTAS_PESSOAIS);
}

function detalhesZod(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const i of error.issues) {
    const k = i.path.map(String).join('.') || 'corpo';
    (out[k] ??= []).push(i.message);
  }
  return out;
}

/** Corpo JSON validado pelo schema strict do contrato; inválido ⇒ 400 com os detalhes. */
export async function lerCorpo<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.output<S>> {
  const bruto: unknown = await request.json().catch(() => null);
  const r = schema.safeParse(bruto);
  if (!r.success) throw new ApiError(400, TS.dadosInvalidos, detalhesZod(r.error));
  return r.data;
}

/** Query validada (strict: parâmetro desconhecido ⇒ 400). */
export function lerQuery<S extends z.ZodType>(
  searchParams: URLSearchParams,
  schema: S,
): z.output<S> {
  const r = schema.safeParse(paramsParaObjeto(searchParams));
  if (!r.success) throw new ApiError(400, TS.dadosInvalidos, detalhesZod(r.error));
  return r.data;
}

/** O Next já entrega o segmento decodificado; decodificar de novo um '%' solto lança URIError. */
function decodificarSegmento(bruto: string | undefined): string | null {
  try {
    return decodeURIComponent(bruto ?? '');
  } catch {
    return null;
  }
}

/** Id de lista/filtro/comparação do caminho: não-uuid ⇒ 404 com a mensagem do recurso. */
export function lerId(bruto: string | undefined, mensagem404: string): string {
  const id = (decodificarSegmento(bruto) ?? '').trim();
  if (!z.uuid().safeParse(id).success) throw new ApiError(404, mensagem404);
  return id;
}

/** Ticker do caminho/corpo no formato do bloco 1 (ação/FII); inválido ⇒ 400. */
export function lerTicker(bruto: string | undefined): string {
  const symbol = normalizarTicker(decodificarSegmento(bruto) ?? '');
  if (!ehTickerValido(symbol)) {
    throw new ApiError(400, TS.dadosInvalidos, { ticker: ['Ticker inválido'] });
  }
  return symbol;
}

/**
 * Ativo do Quadro: a classe vem da LINHA (obterLinhaQuadro, inclusive fora do Quadro). Sem linha
 * ou de classe desligada (stock/reit sem ANALISE_ATIVOS_EUA_HABILITADO) ⇒ 404 'Ativo não
 * encontrado'.
 */
export async function resolverAtivo(symbol: string): Promise<AtivoSalvo> {
  const linha = await obterLinhaQuadro(symbol);
  const classe = linha?.classe as ClasseQuadro | undefined;
  if (!linha || !classe || !(classesSalvosLigadas() as readonly string[]).includes(classe)) {
    throw new ApiError(404, TS.ativoNaoEncontrado);
  }
  if (!TICKER_RE_POR_CLASSE[classe].test(symbol)) throw new ApiError(400, TS.dadosInvalidos);
  return { symbol: linha.symbol, classe };
}
