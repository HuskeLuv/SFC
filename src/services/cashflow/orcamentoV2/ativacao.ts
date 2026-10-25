/**
 * Ativação do Orçamento v2 por usuário (desenho técnico §4 e §3.3).
 *
 * A ativação é por usuário, no momento de liberar a flag (o rollout gradual é o próprio rollout
 * da migração). Roda em FASES, cada uma idempotente, porque `personalizeGroup` e
 * `getMergedCashflowGroups` usam o `prisma` global (e `personalizeGroup` abre a própria
 * transação): uma verificação "dentro da transação" leria por outra conexão.
 *
 *  0. Trava: `pg_advisory_xact_lock(hashtext('orcv2:' || userId))` numa transação aberta só para
 *     segurar a trava durante a ativação inteira (duas abas / remount chamando POST /ativar),
 *     atrás de uma fila do processo (uma ativação por vez: não esgota o pool).
 *  1. Pré-checagens: já ativado → só `garantirGerais`; valores em item-template ou orçados v2
 *     sem ativação → aborta sem escrever.
 *  2. Invariantes ANTES (real Lançado/Consolidado por categoria e mês; meta visível; orçado v2).
 *  3. Fase A (fora de transação): personaliza só as categorias VISÍVEIS que ainda são template,
 *     re-oculta qualquer grupo oculto que `personalizeGroup` tenha "ressuscitado", e
 *     `garantirGerais`.
 *  4. Fase B (uma `$transaction` curta, só com `tx`): copia as metas visíveis de
 *     `cashflow_orcamentos` para a Geral (12 meses por ano, % → valor), grava o prefs
 *     (`estruturaCriadaEm` = marca de ativação) e, se pedido/usuário novo, as sugestões (P4).
 *  5. Fase C (depois do commit): invariantes DEPOIS × ANTES. Divergiu ou falhou →
 *     `compensarAtivacao`.
 *
 * Metas antigas (§3.3/§4 passo 4a), resolvidas contra a árvore mesclada de ANTES da Fase A (é a
 * que a tela atual mostra):
 *  - id da categoria → copiada para a Geral da categoria;
 *  - id de subgrupo dela → copiada só se a categoria não tem linha própria no ano (a tela só
 *    mostra a da categoria; havendo as duas, a do subgrupo é 'duplicada'). Copiada, entra em
 *    `metasDeSubgrupo` (é orçado além da meta visível, relatado à parte);
 *  - id de template cujo override é visível: se há linha no override para o mesmo ano, vence a
 *    do override (a do template vai para `orcadosIgnorados`/'duplicada'); senão é ÓRFÃ (a tela
 *    não a mostra) e só é copiada com `adotarOrfas`;
 *  - grupo oculto/inexistente/fora das categorias e a linha de investimentos → ignoradas.
 *
 * Nada aqui grava em `cashflow_orcamentos` (a tabela antiga fica congelada para o ativado).
 */
import { randomUUID } from 'crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma';
import type { CashflowGroup, CashflowItem } from '@/types/cashflow';
import { getMergedCashflowGroups } from '@/services/cashflow/getCashflowTree';
import { buildOrcamentoVsReal, collectCategorias } from '@/services/cashflow/orcamentoVsReal';
import { CANONICAL_GROUPS, canonicalName, isCanonical } from '@/services/cashflow/groupMatchers';
import { personalizeGroup } from '@/utils/cashflowPersonalization';
import { NOME_GERAL, normalizarNome, sugestoesFaltantes } from '@/lib/orcamento/catalogo';
import { arred2 } from '@/lib/orcamento/regras';
import { RECURSO_ORCAMENTO_V2, limparCacheAcessoOrcamentoV2 } from './acesso';

type Db = PrismaClient | Prisma.TransactionClient;

const MESES = 12;
/** `orderIndex` da Geral criada: sempre por último (o merge já a põe no fim por `isGeral`). */
export const ORDEM_GERAL = 1_000_000;
/** Tolerância por categoria e ano no orçado (arredondamento das metas % convertidas). */
export const TOLERANCIA_ORCADO = 0.01;
/** Tolerância no real (os dois lados vêm das mesmas células, arredondadas a 2 casas). */
const TOLERANCIA_REAL = 0.005;
/** A trava segura a ativação inteira (fases A, B e C). */
const TIMEOUT_TRAVA_MS = 10 * 60_000;

// ---------------------------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------------------------

export type MotivoIgnorada =
  | 'orfa_template'
  | 'duplicada'
  | 'grupo_oculto'
  | 'grupo_inexistente'
  | 'fora_das_categorias'
  | 'investimentos';

/** Linha de `cashflow_orcamentos` com Decimal → number. */
export interface MetaAntiga {
  id: string;
  groupId: string | null;
  tipo: string;
  tipoMeta: string;
  year: number;
  valor: number;
}

/** Orçado mensal a gravar na Geral da categoria (resolvida pela chave na Fase B). */
export interface OrcadoPlanejado {
  /** `templateId ?? id` da categoria: estável antes e depois da personalização. */
  categoriaChave: string;
  ano: number;
  mes: number;
  valor: number;
}

export interface OrfaAdotavel {
  linhaId: string;
  /** Id mesclado da categoria (o override visível). */
  categoriaId: string;
  ano: number;
  /** Valor cru da linha (R$/mês ou %, conforme `tipoMeta`). */
  valor: number;
  tipoMeta: string;
  /** Os 12 meses já convertidos em valor, gravados só com `adotarOrfas`. */
  meses: OrcadoPlanejado[];
}

export interface PlanoAtivacao {
  userId: string;
  jaAtivado: boolean;
  totalCategorias: number;
  /** Categorias visíveis que ainda são template (só da árvore visível). */
  categoriasAPersonalizar: { templateGroupId: string; nome: string }[];
  /** `aposPersonalizar`: o grupo do usuário só existe depois da Fase A (`groupId` = template). */
  geraisACriar: { groupId: string; nome: string; aposPersonalizar: boolean }[];
  geraisAdotadas: { itemId: string; groupId: string }[];
  orcadosAInserir: OrcadoPlanejado[];
  orcadosIgnorados: { linhaId: string; motivo: MotivoIgnorada }[];
  orfasAdotaveis: OrfaAdotavel[];
  /**
   * Linhas de subgrupo copiadas para a Geral da categoria (a categoria não tinha linha própria
   * no ano): orçado ALÉM da meta visível, que a Fase C soma ao esperado. `total` = anual.
   */
  metasDeSubgrupo: { linhaId: string; categoriaChave: string; ano: number; total: number }[];
  /** Metas % em mês sem receita Lançado: gravadas como 0. */
  mesesSemReceita: { linhaId: string; ano: number; mes: number }[];
  /** Células do usuário em item-template nas despesas: somem ao personalizar. > 0 aborta. */
  valoresEmItemTemplate: number;
  /** Orçados v2 já gravados sem a marca de ativação (resto de falha). > 0 aborta. */
  orcadosV2Existentes: number;
  /** Itens soltos direto em "Despesas"/"Despesas Fixas", fora de qualquer categoria (Q15). */
  itensSoltos: { itemId: string; nome: string; total: number }[];
  /** Sem nenhuma célula nas despesas: recebe as sugestões do catálogo automaticamente (Q9). */
  usuarioNovo: boolean;
  sugestoesAAplicar: number;
  sugestoes: { categoriaChave: string; nomes: string[] }[];
}

export type MotivoAborto = 'valores_em_item_template' | 'orcados_v2_sem_ativacao';

export type StatusAtivacao = 'planejado' | 'ja_ativado' | 'ativado' | 'abortado' | 'compensado';

export interface MudancasAtivacao {
  gruposPersonalizados: number;
  ocultosPreservados: number;
  geraisCriadas: number;
  geraisAdotadas: number;
  orcadosInseridos: number;
  sugestoesCriadas: number;
  prefsGravado: boolean;
}

export interface RelatorioAtivacao {
  userId: string;
  status: StatusAtivacao;
  dryRun: boolean;
  motivo: string | null;
  plano: PlanoAtivacao | null;
  mudancas: MudancasAtivacao;
  divergencias: DivergenciaInvariante[];
}

export interface OpcoesAtivacao {
  dryRun: boolean;
  adotarOrfas?: boolean;
  aplicarSugestoes?: boolean;
  hoje?: Date;
}

/** Por `${ano}|${categoriaChave}`. */
export interface InvariantesOrcamento {
  categorias: Record<
    string,
    {
      lancado: number[];
      consolidado: number[];
      metaMensal: number | null;
      /** Meta visível na tela atual × 12 (meta % convertida pela receita Lançado do ano). */
      metaAnual: number;
      orcadoV2: number;
    }
  >;
}

/** Orçado v2 anual esperado a mais (além da meta visível), por `${ano}|${categoriaChave}`. */
export type AjustesEsperados = Record<string, number>;

export interface DivergenciaInvariante {
  chave: string;
  tipo: 'real_lancado' | 'real_consolidado' | 'orcado' | 'categoria_sumiu' | 'categoria_nova';
  mes?: number;
  antes: number;
  depois: number;
}

export interface InseridosAtivacao {
  orcadoIds: string[];
  geraisCriadas: string[];
  geraisAdotadas?: string[];
  itensSugeridos?: string[];
  /** true = o prefs nasceu na ativação (apaga); false = já existia (só limpa a marca). */
  prefsCriado?: boolean;
}

// ---------------------------------------------------------------------------------------------
// Árvore → categorias (puro)
// ---------------------------------------------------------------------------------------------

export interface CategoriaAtivacao {
  chave: string;
  id: string;
  nome: string;
  nomeCanonico: string;
  /** O grupo mesclado é linha do usuário (override ou custom); template = precisa personalizar. */
  doUsuario: boolean;
  grupo: CashflowGroup;
}

const chaveDoGrupo = (g: CashflowGroup): string => g.templateId ?? g.id;
const chaveAnoCategoria = (ano: number, chave: string) => `${ano}|${chave}`;

function nosDaSubarvore(g: CashflowGroup): CashflowGroup[] {
  return [g, ...(g.children ?? []).flatMap(nosDaSubarvore)];
}

function itensDaSubarvore(g: CashflowGroup): CashflowItem[] {
  return nosDaSubarvore(g).flatMap((n) => n.items ?? []);
}

/** Categorias da partição de `orcamentoVsReal` (a mesma da tela atual), na ordem da árvore. */
export function categoriasDaArvore(arvore: CashflowGroup[]): CategoriaAtivacao[] {
  return collectCategorias(arvore).map(({ group }) => ({
    chave: chaveDoGrupo(group),
    id: group.id,
    nome: group.name,
    nomeCanonico: canonicalName(group),
    doUsuario: group.userId != null,
    grupo: group,
  }));
}

/** Itens direto em "Despesas" e em "Despesas Fixas" com subgrupos: fora das categorias (Q15). */
export function itensSoltosDaArvore(arvore: CashflowGroup[]): CashflowItem[] {
  const out: CashflowItem[] = [];
  for (const g of arvore) {
    if (!isCanonical(g, CANONICAL_GROUPS.DESPESAS)) continue;
    out.push(...(g.items ?? []));
    for (const c of g.children ?? []) {
      if (isCanonical(c, CANONICAL_GROUPS.DESPESAS_FIXAS) && c.children?.length) {
        out.push(...(c.items ?? []));
      }
    }
  }
  return out;
}

function idsDaArvore(arvore: CashflowGroup[]): Set<string> {
  return new Set(arvore.flatMap(nosDaSubarvore).map((g) => g.id));
}

/** Receita (Entradas) Lançado por mês do ano da árvore: base da conversão % → valor. */
export function receitaLancadaPorMes(arvore: CashflowGroup[]): number[] {
  return buildOrcamentoVsReal({ groups: arvore, metas: [], investimentosRealPorMes: [] })
    .investimentos.entradasPorMes.lancado;
}

// ---------------------------------------------------------------------------------------------
// Metas antigas (puro)
// ---------------------------------------------------------------------------------------------

export interface ResolucaoMetas {
  /** `deSubgrupo`: a linha está num subgrupo (a tela atual não a mostra). */
  copiar: { linha: MetaAntiga; categoria: CategoriaAtivacao; deSubgrupo: boolean }[];
  orfas: { linha: MetaAntiga; categoria: CategoriaAtivacao }[];
  ignoradas: { linhaId: string; motivo: MotivoIgnorada }[];
}

/**
 * Resolve cada linha de `cashflow_orcamentos` para a categoria mesclada VISÍVEL (desenho §4,
 * passo 4a). `gruposExistentes`: ids que existem no banco mas não estão na árvore (ocultos).
 */
export function resolverMetas(
  metas: MetaAntiga[],
  arvore: CashflowGroup[],
  gruposExistentes: ReadonlySet<string>,
): ResolucaoMetas {
  const categorias = categoriasDaArvore(arvore);
  const porNo = new Map<string, CategoriaAtivacao>();
  const porTemplateSobreposto = new Map<
    string,
    { categoria: CategoriaAtivacao; idOverride: string }
  >();
  for (const categoria of categorias) {
    for (const no of nosDaSubarvore(categoria.grupo)) {
      porNo.set(no.id, categoria);
      if (no.userId != null && no.templateId) {
        porTemplateSobreposto.set(no.templateId, { categoria, idOverride: no.id });
      }
    }
  }
  const naArvore = idsDaArvore(arvore);
  const linhasPorAnoGrupo = new Set(
    metas
      .filter((m) => m.groupId && m.tipo !== 'investimentos')
      .map((m) => `${m.year}|${m.groupId}`),
  );
  // A tela atual só mostra a linha no id da categoria: havendo ela, a de subgrupo é duplicada.
  const categoriaTemLinha = (ano: number, categoria: CategoriaAtivacao) =>
    linhasPorAnoGrupo.has(`${ano}|${categoria.id}`);

  const out: ResolucaoMetas = { copiar: [], orfas: [], ignoradas: [] };
  for (const linha of metas) {
    if (linha.tipo === 'investimentos') {
      out.ignoradas.push({ linhaId: linha.id, motivo: 'investimentos' });
      continue;
    }
    if (!linha.groupId) {
      out.ignoradas.push({ linhaId: linha.id, motivo: 'grupo_inexistente' });
      continue;
    }
    const categoria = porNo.get(linha.groupId);
    if (categoria) {
      const deSubgrupo = linha.groupId !== categoria.id;
      if (deSubgrupo && categoriaTemLinha(linha.year, categoria)) {
        out.ignoradas.push({ linhaId: linha.id, motivo: 'duplicada' });
      } else {
        out.copiar.push({ linha, categoria, deSubgrupo });
      }
      continue;
    }
    const sobreposto = porTemplateSobreposto.get(linha.groupId);
    if (sobreposto) {
      if (
        linhasPorAnoGrupo.has(`${linha.year}|${sobreposto.idOverride}`) ||
        categoriaTemLinha(linha.year, sobreposto.categoria)
      ) {
        out.ignoradas.push({ linhaId: linha.id, motivo: 'duplicada' });
      } else {
        out.orfas.push({ linha, categoria: sobreposto.categoria });
      }
      continue;
    }
    if (naArvore.has(linha.groupId)) {
      out.ignoradas.push({ linhaId: linha.id, motivo: 'fora_das_categorias' });
    } else if (gruposExistentes.has(linha.groupId)) {
      out.ignoradas.push({ linhaId: linha.id, motivo: 'grupo_oculto' });
    } else {
      out.ignoradas.push({ linhaId: linha.id, motivo: 'grupo_inexistente' });
    }
  }
  return out;
}

/**
 * Meta antiga → 12 valores mensais. `valor` = R$/mês repetido; `percentual` (qualquer categoria,
 * inclusive Planejamento) = round(receita Lançado do mês × pct/100, 2); mês sem receita → 0.
 * A Geral nunca fica em modo % (T26).
 */
export function converterMeta(
  linha: Pick<MetaAntiga, 'tipoMeta' | 'valor'>,
  receitaLancado: readonly number[] | null,
): { valores: number[]; mesesSemReceita: number[] } {
  if (linha.tipoMeta !== 'percentual') {
    return { valores: Array(MESES).fill(arred2(linha.valor)), mesesSemReceita: [] };
  }
  const valores: number[] = [];
  const mesesSemReceita: number[] = [];
  for (let mes = 0; mes < MESES; mes++) {
    const receita = receitaLancado?.[mes] ?? 0;
    if (receita > 0) valores.push(arred2((receita * linha.valor) / 100));
    else {
      valores.push(0);
      mesesSemReceita.push(mes);
    }
  }
  return { valores, mesesSemReceita };
}

/** Soma orçados que caem na mesma Geral e mês (categoria + subgrupo, órfã adotada). */
export function agregarOrcados(orcados: OrcadoPlanejado[]): OrcadoPlanejado[] {
  const porChave = new Map<string, OrcadoPlanejado>();
  for (const o of orcados) {
    const k = `${o.categoriaChave}|${o.ano}|${o.mes}`;
    const atual = porChave.get(k);
    if (atual) atual.valor = arred2(atual.valor + o.valor);
    else porChave.set(k, { ...o });
  }
  return [...porChave.values()];
}

/** Orçado anual total que o plano grava por categoria (meta visível + subgrupos + órfãs). */
export function esperadoOrcado(plano: PlanoAtivacao, adotarOrfas = false): AjustesEsperados {
  const out: AjustesEsperados = {};
  const somar = (o: OrcadoPlanejado) => {
    const k = chaveAnoCategoria(o.ano, o.categoriaChave);
    out[k] = arred2((out[k] ?? 0) + o.valor);
  };
  plano.orcadosAInserir.forEach(somar);
  if (adotarOrfas) plano.orfasAdotaveis.forEach((o) => o.meses.forEach(somar));
  return out;
}

/**
 * O que o plano grava ALÉM da meta visível (Fase C, desenho §4 passo 5): linhas de subgrupo
 * copiadas e, com `adotarOrfas`, as órfãs. A meta visível vem das invariantes de ANTES (a mesma
 * conta da tela atual), não do plano: a verificação não é autorreferente.
 */
export function esperadoAlemDaMetaVisivel(
  plano: PlanoAtivacao,
  adotarOrfas = false,
): AjustesEsperados {
  const out: AjustesEsperados = {};
  const somar = (ano: number, categoriaChave: string, valor: number) => {
    const k = chaveAnoCategoria(ano, categoriaChave);
    out[k] = arred2((out[k] ?? 0) + valor);
  };
  plano.metasDeSubgrupo.forEach((m) => somar(m.ano, m.categoriaChave, m.total));
  if (adotarOrfas) {
    plano.orfasAdotaveis.forEach((o) =>
      o.meses.forEach((m) => somar(m.ano, m.categoriaChave, m.valor)),
    );
  }
  return out;
}

export function motivoAborto(plano: PlanoAtivacao): MotivoAborto | null {
  if (plano.valoresEmItemTemplate > 0) return 'valores_em_item_template';
  if (plano.orcadosV2Existentes > 0) return 'orcados_v2_sem_ativacao';
  return null;
}

// ---------------------------------------------------------------------------------------------
// Gerais
// ---------------------------------------------------------------------------------------------

interface ItemDoGrupo {
  id: string;
  groupId: string;
  name: string;
  isGeral: boolean;
}

const ehNomeGeral = (nome: string) => normalizarNome(nome) === normalizarNome(NOME_GERAL);

/**
 * Puro: por categoria do usuário sem Geral visível, adota um item do usuário chamado "Geral"
 * (normalizado) ou marca para criar. Categorias ainda template ficam em `pendentes` (a Geral só
 * pode morar no grupo do usuário).
 */
export function planejarGerais(
  categorias: CategoriaAtivacao[],
  itens: ItemDoGrupo[],
): {
  aCriar: CategoriaAtivacao[];
  aAdotar: { itemId: string; groupId: string }[];
  pendentes: CategoriaAtivacao[];
} {
  const aCriar: CategoriaAtivacao[] = [];
  const aAdotar: { itemId: string; groupId: string }[] = [];
  const pendentes: CategoriaAtivacao[] = [];
  for (const categoria of categorias) {
    if (!categoria.doUsuario) {
      pendentes.push(categoria);
      continue;
    }
    const doGrupo = itens.filter((i) => i.groupId === categoria.id);
    if (doGrupo.some((i) => i.isGeral)) continue;
    const homonima = doGrupo.find((i) => ehNomeGeral(i.name));
    if (homonima) aAdotar.push({ itemId: homonima.id, groupId: categoria.id });
    else aCriar.push(categoria);
  }
  return { aCriar, aAdotar, pendentes };
}

const ehP2002 = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002';

/**
 * Garante uma Geral visível em cada categoria do usuário (idempotente e barato: só escreve se
 * faltar). Chamada na ativação e, de forma preguiçosa, no GET/PUT/criação de grupo/FLC/excluir.
 *
 * Corrida: o índice único parcial `CashflowItem_geral_por_grupo` é a trava; um P2002 é capturado
 * e relido (outra execução criou a mesma Geral). Com `client` = transação, o P2002 aborta a
 * transação inteira no Postgres e por isso é relançado (o chamador repete fora dela).
 * Categorias que ainda são template ficam de fora (a ativação as personaliza antes).
 */
export async function garantirGerais(
  userId: string,
  client: Db = prisma,
): Promise<{ criadas: string[]; adotadas: string[] }> {
  const arvore = await getMergedCashflowGroups(userId, new Date().getFullYear(), client);
  const categorias = categoriasDaArvore(arvore).filter((c) => c.doUsuario);
  const criadas: string[] = [];
  const adotadas: string[] = [];
  if (categorias.length === 0) return { criadas, adotadas };

  const itens = await client.cashflowItem.findMany({
    where: { userId, groupId: { in: categorias.map((c) => c.id) }, hidden: false },
    select: { id: true, groupId: true, name: true, isGeral: true },
  });
  const { aCriar, aAdotar } = planejarGerais(categorias, itens);

  const tolerarCorrida = async (groupId: string, e: unknown) => {
    if (!ehP2002(e) || client !== prisma) throw e;
    const existente = await client.cashflowItem.findFirst({
      where: { groupId, isGeral: true, hidden: false },
      select: { id: true },
    });
    if (!existente) throw e;
  };

  for (const { itemId, groupId } of aAdotar) {
    try {
      await client.cashflowItem.update({ where: { id: itemId }, data: { isGeral: true } });
      adotadas.push(itemId);
    } catch (e) {
      await tolerarCorrida(groupId, e);
    }
  }
  for (const categoria of aCriar) {
    try {
      const criada = await client.cashflowItem.create({
        data: {
          userId,
          groupId: categoria.id,
          name: NOME_GERAL,
          isGeral: true,
          orderIndex: ORDEM_GERAL,
        },
        select: { id: true },
      });
      criadas.push(criada.id);
    } catch (e) {
      await tolerarCorrida(categoria.id, e);
    }
  }
  return { criadas, adotadas };
}

// ---------------------------------------------------------------------------------------------
// Plano (só leitura)
// ---------------------------------------------------------------------------------------------

/**
 * Plano da ativação, SÓ LEITURA (é o dry-run). Lê a árvore mesclada de antes da Fase A, as metas
 * antigas, os orçados v2 e as células nas despesas.
 */
export async function planejarAtivacao(
  userId: string,
  hoje: Date = new Date(),
  opts: { aplicarSugestoes?: boolean } = {},
): Promise<PlanoAtivacao> {
  const ano = hoje.getFullYear();
  const [prefs, arvore, metasDb, orcadosV2Existentes] = await Promise.all([
    prisma.cashflowOrcamentoPrefs.findUnique({
      where: { userId },
      select: { estruturaCriadaEm: true },
    }),
    getMergedCashflowGroups(userId, ano),
    prisma.cashflowOrcamento.findMany({
      where: { userId },
      select: { id: true, groupId: true, tipo: true, tipoMeta: true, year: true, valor: true },
    }),
    prisma.cashflowOrcamentoItem.count({ where: { userId } }),
  ]);
  const metas: MetaAntiga[] = metasDb.map((m) => ({ ...m, valor: Number(m.valor) }));
  const categorias = categoriasDaArvore(arvore);

  // Metas antigas → categoria visível.
  const naArvore = idsDaArvore(arvore);
  const foraDaArvore = [
    ...new Set(metas.flatMap((m) => (m.groupId && !naArvore.has(m.groupId) ? [m.groupId] : []))),
  ];
  const existentes = new Set(
    foraDaArvore.length
      ? (
          await prisma.cashflowGroup.findMany({
            where: { id: { in: foraDaArvore } },
            select: { id: true },
          })
        ).map((g) => g.id)
      : [],
  );
  const resolucao = resolverMetas(metas, arvore, existentes);

  // Receita Lançado por ano, só onde há meta %.
  const receitaPorAno = new Map<number, number[]>();
  const anosPct = new Set(
    [...resolucao.copiar, ...resolucao.orfas]
      .filter(({ linha }) => linha.tipoMeta === 'percentual')
      .map(({ linha }) => linha.year),
  );
  for (const a of anosPct) {
    const arvoreAno = a === ano ? arvore : await getMergedCashflowGroups(userId, a);
    receitaPorAno.set(a, receitaLancadaPorMes(arvoreAno));
  }

  const mesesSemReceita: PlanoAtivacao['mesesSemReceita'] = [];
  const converter = (linha: MetaAntiga, categoriaChave: string): OrcadoPlanejado[] => {
    const { valores, mesesSemReceita: semReceita } = converterMeta(
      linha,
      receitaPorAno.get(linha.year) ?? null,
    );
    semReceita.forEach((mes) => mesesSemReceita.push({ linhaId: linha.id, ano: linha.year, mes }));
    return valores.map((valor, mes) => ({ categoriaChave, ano: linha.year, mes, valor }));
  };
  const metasDeSubgrupo: PlanoAtivacao['metasDeSubgrupo'] = [];
  const orcadosAInserir = agregarOrcados(
    resolucao.copiar.flatMap(({ linha, categoria, deSubgrupo }) => {
      const meses = converter(linha, categoria.chave);
      if (deSubgrupo) {
        metasDeSubgrupo.push({
          linhaId: linha.id,
          categoriaChave: categoria.chave,
          ano: linha.year,
          total: arred2(meses.reduce((t, m) => t + m.valor, 0)),
        });
      }
      return meses;
    }),
  );
  const orfasAdotaveis: OrfaAdotavel[] = resolucao.orfas.map(({ linha, categoria }) => ({
    linhaId: linha.id,
    categoriaId: categoria.id,
    ano: linha.year,
    valor: linha.valor,
    tipoMeta: linha.tipoMeta,
    meses: converter(linha, categoria.chave),
  }));

  // Gerais.
  const doUsuario = categorias.filter((c) => c.doUsuario);
  const itensDb = doUsuario.length
    ? await prisma.cashflowItem.findMany({
        where: { userId, groupId: { in: doUsuario.map((c) => c.id) }, hidden: false },
        select: { id: true, groupId: true, name: true, isGeral: true },
      })
    : [];
  const gerais = planejarGerais(categorias, itensDb);

  // Células nas despesas (todas as categorias e os itens soltos), em qualquer ano.
  const soltos = itensSoltosDaArvore(arvore);
  const itensDespesa = [...categorias.flatMap((c) => itensDaSubarvore(c.grupo)), ...soltos];
  const idsTemplate = itensDespesa.filter((i) => i.userId == null).map((i) => i.id);
  const [valoresEmItemTemplate, valoresEmDespesas] = await Promise.all([
    idsTemplate.length
      ? prisma.cashflowValue.count({ where: { userId, itemId: { in: idsTemplate } } })
      : 0,
    itensDespesa.length
      ? prisma.cashflowValue.count({
          where: { userId, itemId: { in: itensDespesa.map((i) => i.id) } },
        })
      : 0,
  ]);

  // Sugestões do catálogo (P4/Q9): só com a opção ou para usuário sem despesas.
  const usuarioNovo = valoresEmDespesas === 0;
  const nomesPorCategoria = new Map(
    categorias.map((c) => [c.chave, itensDaSubarvore(c.grupo).map((i) => i.name)]),
  );
  const sugestoes = categorias
    .map((c) => ({
      categoriaChave: c.chave,
      nomes: sugestoesFaltantes(
        c.nomeCanonico,
        nomesPorCategoria.get(c.chave) ?? [],
        categorias.filter((o) => o !== c).flatMap((o) => nomesPorCategoria.get(o.chave) ?? []),
      ).map((s) => s.nome),
    }))
    .filter((s) => s.nomes.length > 0);
  const aplicarSugestoes = opts.aplicarSugestoes === true || usuarioNovo;

  return {
    userId,
    jaAtivado: prefs?.estruturaCriadaEm != null,
    totalCategorias: categorias.length,
    categoriasAPersonalizar: gerais.pendentes.map((c) => ({ templateGroupId: c.id, nome: c.nome })),
    geraisACriar: [
      ...gerais.aCriar.map((c) => ({ groupId: c.id, nome: c.nome, aposPersonalizar: false })),
      ...gerais.pendentes.map((c) => ({ groupId: c.id, nome: c.nome, aposPersonalizar: true })),
    ],
    geraisAdotadas: gerais.aAdotar,
    orcadosAInserir,
    orcadosIgnorados: resolucao.ignoradas,
    orfasAdotaveis,
    metasDeSubgrupo,
    mesesSemReceita,
    valoresEmItemTemplate,
    orcadosV2Existentes,
    itensSoltos: soltos.map((i) => ({
      itemId: i.id,
      nome: i.name,
      total: arred2((i.values ?? []).reduce((s, v) => s + Number(v.value ?? 0), 0)),
    })),
    usuarioNovo,
    sugestoesAAplicar: aplicarSugestoes ? sugestoes.reduce((s, x) => s + x.nomes.length, 0) : 0,
    sugestoes: aplicarSugestoes ? sugestoes : [],
  };
}

// ---------------------------------------------------------------------------------------------
// Invariantes
// ---------------------------------------------------------------------------------------------

/**
 * Por ano (com células, metas antigas ou orçado v2) e categoria: real Lançado e Consolidado por
 * mês (`buildOrcamentoVsReal`, a mesma conta da tela atual), meta visível e orçado v2 anual.
 * A chave da categoria é `templateId ?? id`, igual antes e depois da personalização.
 */
export async function capturarInvariantes(userId: string): Promise<InvariantesOrcamento> {
  const [anosValores, metasDb, orcados] = await Promise.all([
    prisma.cashflowValue.findMany({
      where: { userId },
      distinct: ['year'],
      select: { year: true },
    }),
    prisma.cashflowOrcamento.findMany({
      where: { userId },
      select: { groupId: true, tipo: true, tipoMeta: true, year: true, valor: true },
    }),
    prisma.cashflowOrcamentoItem.findMany({
      where: { userId },
      select: { itemId: true, ano: true, valor: true },
    }),
  ]);
  const anos = [
    ...new Set([
      ...anosValores.map((v) => v.year),
      ...metasDb.map((m) => m.year),
      ...orcados.map((o) => o.ano),
    ]),
  ].sort((a, b) => a - b);

  const out: InvariantesOrcamento = { categorias: {} };
  for (const ano of anos) {
    const arvore = await getMergedCashflowGroups(userId, ano);
    const categorias = categoriasDaArvore(arvore);
    const porId = new Map(categorias.map((c) => [c.id, c]));
    const metasDoAno = metasDb
      .filter((m) => m.year === ano)
      .map((m) => ({
        groupId: m.groupId,
        tipo: m.tipo,
        tipoMeta: m.tipoMeta,
        valor: Number(m.valor),
      }));
    const r = buildOrcamentoVsReal({
      groups: arvore,
      metas: metasDoAno,
      investimentosRealPorMes: [],
    });
    // Meta visível × 12 (a linha no id mesclado da categoria; % → valor como na Fase B).
    const linhaVisivel = new Map(
      metasDoAno.filter((m) => m.tipo !== 'investimentos' && m.groupId).map((m) => [m.groupId, m]),
    );
    let receita: number[] | null = null;
    const metaAnualDe = (groupId: string): number => {
      const linha = linhaVisivel.get(groupId);
      if (!linha) return 0;
      if (linha.tipoMeta === 'percentual') receita ??= receitaLancadaPorMes(arvore);
      return arred2(converterMeta(linha, receita).valores.reduce((t, v) => t + v, 0));
    };
    const chavePorItem = new Map<string, string>();
    for (const c of categorias) {
      for (const item of itensDaSubarvore(c.grupo)) chavePorItem.set(item.id, c.chave);
    }
    const orcadoPorChave = new Map<string, number>();
    for (const o of orcados) {
      if (o.ano !== ano) continue;
      const chave = chavePorItem.get(o.itemId);
      if (!chave) continue;
      orcadoPorChave.set(chave, (orcadoPorChave.get(chave) ?? 0) + Number(o.valor ?? 0));
    }
    for (const cat of r.categorias) {
      const categoria = porId.get(cat.groupId);
      if (!categoria) continue;
      out.categorias[chaveAnoCategoria(ano, categoria.chave)] = {
        lancado: cat.realPorMes.lancado,
        consolidado: cat.realPorMes.consolidado,
        metaMensal: cat.metaMensal,
        metaAnual: metaAnualDe(cat.groupId),
        orcadoV2: arred2(orcadoPorChave.get(categoria.chave) ?? 0),
      };
    }
  }
  return out;
}

const temAlgo = (c: { lancado: number[]; consolidado: number[]; orcadoV2: number }) =>
  c.orcadoV2 !== 0 || c.lancado.some((v) => v !== 0) || c.consolidado.some((v) => v !== 0);

/**
 * Exige (T34): real por categoria e mês igual nos dois modos, e (§4 passo 5) orçado v2 anual =
 * antes + meta visível de ANTES × 12 (metas % convertidas) + `alemDaMeta` (subgrupos copiados,
 * órfãs adotadas), com R$ 0,01 de tolerância. A meta visível vem das invariantes, não do plano.
 */
export function compararInvariantes(
  antes: InvariantesOrcamento,
  depois: InvariantesOrcamento,
  alemDaMeta: AjustesEsperados,
): DivergenciaInvariante[] {
  const out: DivergenciaInvariante[] = [];
  const chaves = new Set([
    ...Object.keys(antes.categorias),
    ...Object.keys(depois.categorias),
    ...Object.keys(alemDaMeta),
  ]);
  for (const chave of chaves) {
    const a = antes.categorias[chave];
    const d = depois.categorias[chave];
    if (a && !d && temAlgo(a)) {
      out.push({ chave, tipo: 'categoria_sumiu', antes: 0, depois: 0 });
    }
    if (!a && d && d.lancado.some((v) => v !== 0)) {
      out.push({ chave, tipo: 'categoria_nova', antes: 0, depois: 0 });
    }
    if (a && d) {
      for (let mes = 0; mes < MESES; mes++) {
        const pares: ['real_lancado' | 'real_consolidado', number, number][] = [
          ['real_lancado', a.lancado[mes] ?? 0, d.lancado[mes] ?? 0],
          ['real_consolidado', a.consolidado[mes] ?? 0, d.consolidado[mes] ?? 0],
        ];
        for (const [tipo, va, vd] of pares) {
          if (Math.abs(va - vd) > TOLERANCIA_REAL) {
            out.push({ chave, tipo, mes, antes: va, depois: vd });
          }
        }
      }
    }
    const alvo = arred2((a?.orcadoV2 ?? 0) + (a?.metaAnual ?? 0) + (alemDaMeta[chave] ?? 0));
    const obtido = d?.orcadoV2 ?? 0;
    if (Math.abs(alvo - obtido) > TOLERANCIA_ORCADO) {
      out.push({ chave, tipo: 'orcado', antes: alvo, depois: obtido });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------------------------

const semMudancas = (): MudancasAtivacao => ({
  gruposPersonalizados: 0,
  ocultosPreservados: 0,
  geraisCriadas: 0,
  geraisAdotadas: 0,
  orcadosInseridos: 0,
  sugestoesCriadas: 0,
  prefsGravado: false,
});

/** Fila do processo: uma ativação/desativação por vez (ver `comTravaDoUsuario`). */
let filaDoProcesso: Promise<unknown> = Promise.resolve();

function naFilaDoProcesso<T>(fn: () => Promise<T>): Promise<T> {
  const minha = filaDoProcesso.then(fn);
  filaDoProcesso = minha.catch(() => undefined);
  return minha;
}

/**
 * Segura `pg_advisory_xact_lock(hashtext('orcv2:' || userId))` numa transação aberta só para
 * isso enquanto `fn` roda (as fases usam outras conexões). Uma segunda chamada simultânea espera
 * e, ao entrar, já encontra o usuário ativado.
 *
 * Custo no pool: a transação da trava prende 1 conexão ociosa durante a ativação inteira, e as
 * fases usam outras (até 4 em paralelo no `Promise.all` do plano). Com `connection_limit=5` em
 * prod, N ativações simultâneas (ACESSO=todos, várias abas, remount) esgotariam o pool e o app
 * inteiro ficaria sem banco (P2024). Por isso as ativações do MESMO processo (a app roda numa
 * instância só) passam por uma fila e nunca seguram mais de uma trava por vez: quem espera na fila
 * não ocupa conexão. A trava no banco continua valendo entre processos (script × rota).
 */
export async function comTravaDoUsuario<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return naFilaDoProcesso(() =>
    prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`orcv2:${userId}`}))`;
        return fn();
      },
      { timeout: TIMEOUT_TRAVA_MS, maxWait: 30_000 },
    ),
  );
}

/**
 * Ativa o Orçamento v2 do usuário. `dryRun` = só `planejarAtivacao` (nenhuma escrita, sem trava).
 * Idempotente: com o usuário já ativado só roda `garantirGerais` (0 mudanças se nada faltar).
 */
export async function ativarOrcamentoV2(
  userId: string,
  opts: OpcoesAtivacao,
): Promise<RelatorioAtivacao> {
  const hoje = opts.hoje ?? new Date();
  const base = { userId, dryRun: opts.dryRun, divergencias: [] as DivergenciaInvariante[] };

  if (opts.dryRun) {
    const plano = await planejarAtivacao(userId, hoje, opts);
    const aborto = plano.jaAtivado ? null : motivoAborto(plano);
    return {
      ...base,
      status: plano.jaAtivado ? 'ja_ativado' : aborto ? 'abortado' : 'planejado',
      motivo: aborto,
      plano,
      mudancas: semMudancas(),
    };
  }

  return comTravaDoUsuario(userId, async (): Promise<RelatorioAtivacao> => {
    const mudancas = semMudancas();
    const prefs = await prisma.cashflowOrcamentoPrefs.findUnique({
      where: { userId },
      select: { estruturaCriadaEm: true },
    });
    if (prefs?.estruturaCriadaEm) {
      const g = await garantirGerais(userId);
      mudancas.geraisCriadas = g.criadas.length;
      mudancas.geraisAdotadas = g.adotadas.length;
      return { ...base, status: 'ja_ativado', motivo: null, plano: null, mudancas };
    }

    const plano = await planejarAtivacao(userId, hoje, opts);
    const aborto = motivoAborto(plano);
    if (aborto) return { ...base, status: 'abortado', motivo: aborto, plano, mudancas };

    const antes = await capturarInvariantes(userId);
    const inseridos: InseridosAtivacao = { orcadoIds: [], geraisCriadas: [] };

    try {
      // Fase A — estrutura (fora de transação; os helpers usam o prisma global).
      const ocultos = await prisma.cashflowGroup.findMany({
        where: { userId, hidden: true },
        select: { id: true },
      });
      for (const c of plano.categoriasAPersonalizar) {
        await personalizeGroup(c.templateGroupId, userId);
        mudancas.gruposPersonalizados++;
      }
      if (ocultos.length > 0 && plano.categoriasAPersonalizar.length > 0) {
        // personalizeGroup "ressuscita" override oculto ao recriar os filhos de um pai novo.
        const r = await prisma.cashflowGroup.updateMany({
          where: { id: { in: ocultos.map((o) => o.id) }, hidden: false },
          data: { hidden: true },
        });
        mudancas.ocultosPreservados = r.count;
      }
      const gerais = await garantirGerais(userId);
      inseridos.geraisCriadas = gerais.criadas;
      inseridos.geraisAdotadas = gerais.adotadas;
      mudancas.geraisCriadas = gerais.criadas.length;
      mudancas.geraisAdotadas = gerais.adotadas.length;

      // Fase B — orçados, prefs e sugestões (uma transação curta, só com tx).
      const arvore = await getMergedCashflowGroups(userId, hoje.getFullYear());
      const faseB = await gravarFaseB(userId, plano, arvore, opts.adotarOrfas === true);
      inseridos.orcadoIds = faseB.orcadoIds;
      inseridos.itensSugeridos = faseB.itensSugeridos;
      inseridos.prefsCriado = faseB.prefsCriado;
      mudancas.orcadosInseridos = faseB.orcadoIds.length;
      mudancas.sugestoesCriadas = faseB.itensSugeridos.length;
      mudancas.prefsGravado = true;
    } catch (error: unknown) {
      await compensarAtivacao(userId, inseridos);
      const msg = error instanceof Error ? error.message : String(error);
      return { ...base, status: 'compensado', motivo: `erro: ${msg}`, plano, mudancas };
    }

    // Fase C — verificação depois do commit. Um erro aqui (P2024, timeout) também compensa: a
    // Fase B já gravou a marca, e sem compensar a próxima chamada diria 'ja_ativado' sem verificar.
    let divergencias: DivergenciaInvariante[];
    try {
      const depois = await capturarInvariantes(userId);
      divergencias = compararInvariantes(
        antes,
        depois,
        esperadoAlemDaMetaVisivel(plano, opts.adotarOrfas === true),
      );
    } catch (error: unknown) {
      await compensarAtivacao(userId, inseridos);
      const msg = error instanceof Error ? error.message : String(error);
      return { ...base, status: 'compensado', motivo: `erro_verificacao: ${msg}`, plano, mudancas };
    }
    if (divergencias.length > 0) {
      await compensarAtivacao(userId, inseridos);
      return {
        ...base,
        status: 'compensado',
        motivo: 'verificacao_divergiu',
        plano,
        mudancas,
        divergencias,
      };
    }
    limparCacheAcessoOrcamentoV2(userId);
    return { ...base, status: 'ativado', motivo: null, plano, mudancas };
  });
}

async function gravarFaseB(
  userId: string,
  plano: PlanoAtivacao,
  arvore: CashflowGroup[],
  adotarOrfas: boolean,
): Promise<{ orcadoIds: string[]; itensSugeridos: string[]; prefsCriado: boolean }> {
  const porChave = new Map(categoriasDaArvore(arvore).map((c) => [c.chave, c]));
  const orcados = agregarOrcados([
    ...plano.orcadosAInserir,
    ...(adotarOrfas ? plano.orfasAdotaveis.flatMap((o) => o.meses) : []),
  ]);
  const gruposDoUsuario = [...porChave.values()].filter((c) => c.doUsuario).map((c) => c.id);

  return prisma.$transaction(
    async (tx) => {
      const gerais = await tx.cashflowItem.findMany({
        where: { userId, isGeral: true, hidden: false, groupId: { in: gruposDoUsuario } },
        select: { id: true, groupId: true },
      });
      const geralPorGrupo = new Map(gerais.map((g) => [g.groupId, g.id]));
      const geralDa = (categoriaChave: string): string => {
        const c = porChave.get(categoriaChave);
        const id = c?.doUsuario ? geralPorGrupo.get(c.id) : undefined;
        if (!id) throw new Error(`Categoria sem Geral depois da Fase A (${categoriaChave})`);
        return id;
      };

      const linhas = orcados.map((o) => ({
        id: randomUUID(),
        userId,
        itemId: geralDa(o.categoriaChave),
        ano: o.ano,
        mes: o.mes,
        valor: o.valor,
      }));
      if (linhas.length > 0) {
        // As duplicadas já foram resolvidas no plano: skipDuplicates só cobre a reexecução.
        await tx.cashflowOrcamentoItem.createMany({ data: linhas, skipDuplicates: true });
      }

      const prefsAntes = await tx.cashflowOrcamentoPrefs.findUnique({
        where: { userId },
        select: { userId: true },
      });
      const agora = new Date();
      await tx.cashflowOrcamentoPrefs.upsert({
        where: { userId },
        create: { userId, estruturaCriadaEm: agora, fonte: 'lancado' },
        update: { estruturaCriadaEm: agora, fonte: 'lancado' },
      });

      const itensSugeridos: string[] = [];
      for (const s of plano.sugestoes) {
        const c = porChave.get(s.categoriaChave);
        if (!c?.doUsuario) continue;
        const maxOrdem = Math.max(
          -1,
          ...(c.grupo.items ?? []).filter((i) => !i.isGeral).map((i) => i.orderIndex ?? 0),
        );
        const novos = s.nomes.map((name, i) => ({
          id: randomUUID(),
          userId,
          groupId: c.id,
          name,
          orderIndex: maxOrdem + 1 + i,
        }));
        await tx.cashflowItem.createMany({ data: novos });
        itensSugeridos.push(...novos.map((n) => n.id));
      }

      return {
        orcadoIds: linhas.map((l) => l.id),
        itensSugeridos,
        prefsCriado: !prefsAntes,
      };
    },
    { timeout: 60_000 },
  );
}

/** Itens (entre `ids`) com células, transações do banco ou orçados: não podem ser apagados. */
async function itensComDados(db: Db, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const [valores, transacoes, orcados] = await Promise.all([
    db.cashflowValue.findMany({
      where: { itemId: { in: ids } },
      distinct: ['itemId'],
      select: { itemId: true },
    }),
    db.bankTransaction.findMany({
      where: { cashflowItemId: { in: ids } },
      distinct: ['cashflowItemId'],
      select: { cashflowItemId: true },
    }),
    db.cashflowOrcamentoItem.findMany({
      where: { itemId: { in: ids } },
      distinct: ['itemId'],
      select: { itemId: true },
    }),
  ]);
  return new Set([
    ...valores.map((v) => v.itemId),
    ...transacoes.flatMap((t) => (t.cashflowItemId ? [t.cashflowItemId] : [])),
    ...orcados.map((o) => o.itemId),
  ]);
}

/**
 * Desfaz o que a ativação gravou quando a verificação diverge (ou uma fase falha): apaga os
 * orçados inseridos e o prefs (ou só limpa a marca, se ele já existia), apaga as Gerais e
 * sugestões criadas que continuam sem dados (com dados viram item comum) e devolve as Gerais
 * adotadas a item comum. Os overrides da Fase A ficam (inofensivos, iguais a ter editado).
 */
export async function compensarAtivacao(
  userId: string,
  inseridos: InseridosAtivacao,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (inseridos.orcadoIds.length > 0) {
      await tx.cashflowOrcamentoItem.deleteMany({
        where: { userId, id: { in: inseridos.orcadoIds } },
      });
    }
    if (inseridos.prefsCriado === true) {
      await tx.cashflowOrcamentoPrefs.deleteMany({ where: { userId } });
    } else if (inseridos.prefsCriado === false) {
      await tx.cashflowOrcamentoPrefs.updateMany({
        where: { userId },
        data: { estruturaCriadaEm: null },
      });
    }
    const criados = [...inseridos.geraisCriadas, ...(inseridos.itensSugeridos ?? [])];
    const comDados = await itensComDados(tx, criados);
    const apagar = criados.filter((id) => !comDados.has(id));
    if (apagar.length > 0) {
      await tx.cashflowItem.deleteMany({ where: { userId, id: { in: apagar } } });
    }
    const voltarAComum = [
      ...(inseridos.geraisAdotadas ?? []),
      ...inseridos.geraisCriadas.filter((id) => comDados.has(id)),
    ];
    if (voltarAComum.length > 0) {
      await tx.cashflowItem.updateMany({
        where: { userId, id: { in: voltarAComum } },
        data: { isGeral: false },
      });
    }
  });
  limparCacheAcessoOrcamentoV2(userId);
}

// ---------------------------------------------------------------------------------------------
// Desativação (desenho §4 "Reversão")
// ---------------------------------------------------------------------------------------------

export interface PlanoDesativacao {
  userId: string;
  noBeta: boolean;
  ativado: boolean;
  orcados: number;
  temPrefs: boolean;
  /** Gerais sem células, transações (e, depois de apagar os orçados, sem orçado): apagadas. */
  geraisAApagar: string[];
  /** Gerais com células ou transações: viram item comum (`isGeral = false`). */
  geraisAConverter: string[];
}

export async function planejarDesativacao(
  userId: string,
  db: Db = prisma,
): Promise<PlanoDesativacao> {
  const [beta, prefs, orcados, gerais] = await Promise.all([
    db.featureBetaUser.findFirst({
      where: { recurso: RECURSO_ORCAMENTO_V2, userId },
      select: { id: true },
    }),
    db.cashflowOrcamentoPrefs.findUnique({
      where: { userId },
      select: { estruturaCriadaEm: true },
    }),
    db.cashflowOrcamentoItem.count({ where: { userId } }),
    db.cashflowItem.findMany({ where: { userId, isGeral: true }, select: { id: true } }),
  ]);
  const ids = gerais.map((g) => g.id);
  const [valores, transacoes] = ids.length
    ? await Promise.all([
        db.cashflowValue.findMany({
          where: { itemId: { in: ids } },
          distinct: ['itemId'],
          select: { itemId: true },
        }),
        db.bankTransaction.findMany({
          where: { cashflowItemId: { in: ids } },
          distinct: ['cashflowItemId'],
          select: { cashflowItemId: true },
        }),
      ])
    : [[], []];
  const comDados = new Set([
    ...valores.map((v) => v.itemId),
    ...transacoes.flatMap((t) => (t.cashflowItemId ? [t.cashflowItemId] : [])),
  ]);
  return {
    userId,
    noBeta: beta != null,
    ativado: prefs?.estruturaCriadaEm != null,
    orcados,
    temPrefs: prefs != null,
    geraisAApagar: ids.filter((id) => !comDados.has(id)),
    geraisAConverter: ids.filter((id) => comDados.has(id)),
  };
}

/**
 * Reversão: tira do beta, apaga orçados v2 e prefs, apaga as Gerais sem dados e converte as com
 * dados em item comum, numa transação só. `dryRun` (padrão do script) só planeja. Os overrides de
 * grupo da Fase A ficam. Idempotente (a 2ª execução não encontra nada).
 */
export async function desativarOrcamentoV2(
  userId: string,
  opts: { dryRun: boolean },
): Promise<{ plano: PlanoDesativacao; aplicado: boolean }> {
  if (opts.dryRun) return { plano: await planejarDesativacao(userId), aplicado: false };
  const plano = await comTravaDoUsuario(userId, () =>
    prisma.$transaction(async (tx) => {
      const p = await planejarDesativacao(userId, tx);
      await tx.featureBetaUser.deleteMany({ where: { recurso: RECURSO_ORCAMENTO_V2, userId } });
      // Orçados antes das Gerais: o FK do item é NO ACTION.
      await tx.cashflowOrcamentoItem.deleteMany({ where: { userId } });
      await tx.cashflowOrcamentoPrefs.deleteMany({ where: { userId } });
      if (p.geraisAApagar.length > 0) {
        await tx.cashflowItem.deleteMany({ where: { userId, id: { in: p.geraisAApagar } } });
      }
      if (p.geraisAConverter.length > 0) {
        await tx.cashflowItem.updateMany({
          where: { userId, id: { in: p.geraisAConverter } },
          data: { isGeral: false },
        });
      }
      return p;
    }),
  );
  limparCacheAcessoOrcamentoV2(userId);
  return { plano, aplicado: true };
}
