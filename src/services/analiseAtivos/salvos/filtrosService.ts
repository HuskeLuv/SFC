/**
 * Filtros salvos do Quadro (bloco 1, fatia A). Guardam SÓ janela, critérios, setor (ou segmento)
 * e "Na minha carteira" (EstadoFiltroSalvoV1, sem modo/ordem/dir). Pessoais, isolados por userId.
 *
 * - Até MAX_FILTROS_POR_CLASSE por classe (409); mesmo nome na classe ⇒ 409 (o cliente oferece
 *   "Substituir", que vira PATCH). Conferidos na trava do usuário (comTravaDoUsuario).
 * - Critérios aceitos na gravação: só os chips HABILITADOS da classe (os mesmos que o Quadro aceita
 *   em ?criterios=); outro id ⇒ 400.
 * - Leitura: critério que deixou de existir na classe é retirado (lerEstadoFiltroSalvo) e o filtro
 *   volta com ajustado=true; estado ilegível é descartado da resposta.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/apiErrorHandler';
import { obterCriteriaParamsQuadro } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { definicoesQuadro, idsFiltraveis } from '@/services/analiseAtivos/quadro/consultaQuadro';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';
import {
  MAX_FILTROS_POR_CLASSE,
  VERSAO_SCHEMA_FILTRO,
  lerEstadoFiltroSalvo,
  nomeNormalizado,
} from '@/services/analiseAtivos/salvos/contrato';
import {
  comTravaDoUsuario,
  ehViolacaoUnica,
  erroLimite,
  type Tx,
} from '@/services/analiseAtivos/salvos/listasService';
import type { IdCriterio } from '@/types/analiseAtivosCriterios';
import type {
  ClasseItemSalvo,
  EstadoFiltroSalvoV1,
  FiltroSalvoApi,
} from '@/types/analiseAtivosSalvos';

const TS = TEXTOS_SALVOS.servidor;

interface FiltroRow {
  id: string;
  nome: string;
  classe: string;
  estado: Prisma.JsonValue;
  updatedAt: Date;
  ultimoUsoEm: Date | null;
}

const SELECT_FILTRO = {
  id: true,
  nome: true,
  classe: true,
  estado: true,
  updatedAt: true,
  ultimoUsoEm: true,
} as const;

/** Ids de critério que existem na classe (chips + equivalentes de papel nos FIIs). */
async function idsDaClasse(classe: ClasseItemSalvo): Promise<{
  existentes: IdCriterio[];
  habilitados: Set<IdCriterio>;
}> {
  const defs = definicoesQuadro(classe, await obterCriteriaParamsQuadro());
  const existentes = defs.flatMap((d) => (d.equivalente ? [d.id, d.equivalente.id] : [d.id]));
  return { existentes, habilitados: idsFiltraveis(defs) };
}

export function paraFiltroApi(
  row: FiltroRow,
  existentes: readonly IdCriterio[],
): FiltroSalvoApi | null {
  const lido = lerEstadoFiltroSalvo(row.estado, existentes);
  if (!lido) return null;
  return {
    id: row.id,
    nome: row.nome,
    classe: row.classe as ClasseItemSalvo,
    estado: lido.estado,
    ajustado: lido.ajustado,
    atualizadoEm: row.updatedAt.toISOString(),
    ultimoUsoEm: row.ultimoUsoEm ? row.ultimoUsoEm.toISOString() : null,
  };
}

async function conferirCriterios(classe: ClasseItemSalvo, estado: EstadoFiltroSalvoV1) {
  const { habilitados } = await idsDaClasse(classe);
  const fora = estado.criterios.filter((id) => !habilitados.has(id));
  if (fora.length > 0) {
    throw new ApiError(400, TS.dadosInvalidos, {
      criterios: [`critério indisponível para a classe: ${fora.join(', ')}`],
    });
  }
}

async function conferirNomeLivre(
  tx: Tx,
  userId: string,
  classe: string,
  nome: string,
  exceto?: string,
) {
  const igual = await tx.analiseFiltroSalvo.findFirst({
    where: {
      userId,
      classe,
      nomeNormalizado: nomeNormalizado(nome),
      ...(exceto ? { id: { not: exceto } } : {}),
    },
    select: { id: true },
  });
  if (igual) throw new ApiError(409, TS.filtroRepetido);
}

const estadoJson = (e: EstadoFiltroSalvoV1) => e as unknown as Prisma.InputJsonValue;

/** GET /filtros?classe= (ordem de criação). */
export async function listarFiltros(
  userId: string,
  classe: ClasseItemSalvo,
): Promise<FiltroSalvoApi[]> {
  const [rows, { existentes }] = await Promise.all([
    prisma.analiseFiltroSalvo.findMany({
      where: { userId, classe },
      orderBy: { createdAt: 'asc' },
      select: SELECT_FILTRO,
    }),
    idsDaClasse(classe),
  ]);
  return rows.flatMap((r) => {
    const f = paraFiltroApi(r, existentes);
    return f ? [f] : [];
  });
}

/** POST /filtros → 201 FiltroSalvoApi. */
export async function criarFiltro(
  userId: string,
  entrada: { nome: string; classe: ClasseItemSalvo; estado: EstadoFiltroSalvoV1 },
): Promise<FiltroSalvoApi> {
  await conferirCriterios(entrada.classe, entrada.estado);
  const { existentes } = await idsDaClasse(entrada.classe);
  try {
    const row = await comTravaDoUsuario(userId, async (tx) => {
      const total = await tx.analiseFiltroSalvo.count({
        where: { userId, classe: entrada.classe },
      });
      if (total >= MAX_FILTROS_POR_CLASSE) {
        throw erroLimite(TS.limiteFiltros, MAX_FILTROS_POR_CLASSE);
      }
      await conferirNomeLivre(tx, userId, entrada.classe, entrada.nome);
      return tx.analiseFiltroSalvo.create({
        data: {
          userId,
          nome: entrada.nome,
          nomeNormalizado: nomeNormalizado(entrada.nome),
          classe: entrada.classe,
          estado: estadoJson(entrada.estado),
          versaoSchema: VERSAO_SCHEMA_FILTRO,
        },
        select: SELECT_FILTRO,
      });
    });
    const api = paraFiltroApi(row, existentes);
    if (!api) throw new ApiError(400, TS.dadosInvalidos);
    return api;
  } catch (error: unknown) {
    if (ehViolacaoUnica(error)) throw new ApiError(409, TS.filtroRepetido);
    throw error;
  }
}

/** PATCH /filtros/[id]: nome, estado ("Salvar alterações") e/ou usado (marca ultimoUsoEm). */
export async function atualizarFiltro(
  userId: string,
  id: string,
  mudanca: { nome?: string; estado?: EstadoFiltroSalvoV1; usado?: true },
): Promise<FiltroSalvoApi> {
  try {
    const row = await comTravaDoUsuario(userId, async (tx) => {
      const atual = await tx.analiseFiltroSalvo.findFirst({
        where: { id, userId },
        select: { classe: true },
      });
      if (!atual) throw new ApiError(404, TS.filtroNaoEncontrado);
      const classe = atual.classe as ClasseItemSalvo;
      if (mudanca.estado) await conferirCriterios(classe, mudanca.estado);
      if (mudanca.nome !== undefined) await conferirNomeLivre(tx, userId, classe, mudanca.nome, id);
      await tx.analiseFiltroSalvo.updateMany({
        where: { id, userId },
        data: {
          ...(mudanca.nome !== undefined
            ? { nome: mudanca.nome, nomeNormalizado: nomeNormalizado(mudanca.nome) }
            : {}),
          ...(mudanca.estado
            ? { estado: estadoJson(mudanca.estado), versaoSchema: VERSAO_SCHEMA_FILTRO }
            : {}),
          ...(mudanca.usado ? { ultimoUsoEm: new Date() } : {}),
        },
      });
      const novo = await tx.analiseFiltroSalvo.findFirst({
        where: { id, userId },
        select: SELECT_FILTRO,
      });
      if (!novo) throw new ApiError(404, TS.filtroNaoEncontrado);
      return novo;
    });
    const { existentes } = await idsDaClasse(row.classe as ClasseItemSalvo);
    const api = paraFiltroApi(row, existentes);
    if (!api) throw new ApiError(404, TS.filtroNaoEncontrado);
    return api;
  } catch (error: unknown) {
    if (ehViolacaoUnica(error)) throw new ApiError(409, TS.filtroRepetido);
    throw error;
  }
}

/** DELETE /filtros/[id]. */
export async function apagarFiltro(userId: string, id: string): Promise<void> {
  const { count } = await prisma.analiseFiltroSalvo.deleteMany({ where: { id, userId } });
  if (count === 0) throw new ApiError(404, TS.filtroNaoEncontrado);
}
