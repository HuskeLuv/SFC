/**
 * Guardas de estrutura do Orçamento v2 (desenho técnico §6.2, PR 6; regras R-02, R-12, R-18).
 *
 * As rotas que mexem na estrutura do Fluxo (batch-update, update, items, item/move,
 * item/reorder) passam por aqui:
 *
 * - POR DADO, para qualquer usuário: a subcategoria "Geral" (`isGeral`) não é renomeada,
 *   excluída nem movida, e o reorder não a renumera. A Geral só existe para quem foi ativado;
 *   depois do `desativar --aplicar` ela deixa de ser Geral, então a regra não pega ninguém fora
 *   do v2.
 * - POR USUÁRIO, só quando `usuarioOrcamentoV2Ativo(targetUserId)` (liberada && ativado): nome
 *   de subcategoria único/não vazio/até 60 (422), categoria de sistema não excluível (409), sub
 *   nova antes da Geral, e nada de item solto direto em "Despesas"/"Despesas Fixas" (Q15, 409).
 *
 * Quem não está ativado não faz nenhuma consulta a mais (com a flag desligada nem o banco é
 * consultado) e vê as rotas exatamente como antes.
 *
 * Os papéis dos grupos seguem a mesma partição de `collectCategorias` (orcamentoVsReal.ts):
 * categoria = filhos de "Despesas Fixas" (Habitação…), os demais filhos de "Despesas" e os grupos
 * de despesa do usuário na raiz; "Despesas" e "Despesas Fixas" (com filhos) são o nível de item
 * solto.
 */
import type { Prisma } from '@prisma/client';
import { ApiError } from '@/utils/apiErrorHandler';
import { isReceitaGroupByType } from '@/utils/formatters';
import { validarNomeSubcategoria, NOME_MAX } from '@/lib/orcamento/regras';
import { categoriaDoCatalogo } from '@/lib/orcamento/catalogo';
import { CANONICAL_GROUPS, canonicalName, isCanonical } from '@/services/cashflow/groupMatchers';
import { getMergedCashflowGroups } from '@/services/cashflow/getCashflowTree';
import { estadoAcessoOrcamentoV2 } from '@/services/cashflow/orcamentoV2/acesso';
import type { CashflowGroup, CashflowItem } from '@/types/cashflow';

export type CodigoErroEstrutura =
  | 'geral'
  | 'categoria_sistema'
  | 'item_solto'
  | 'nome_vazio'
  | 'nome_longo'
  | 'nome_duplicado';

/** Erro de estrutura do Orçamento v2: 409 (regra de estrutura) ou 422 (nome inválido). */
export class ErroEstruturaOrcamento extends ApiError {
  constructor(
    statusCode: 409 | 422,
    message: string,
    public codigo: CodigoErroEstrutura,
  ) {
    super(statusCode, message);
    this.name = 'ErroEstruturaOrcamento';
  }
}

export type AcaoGeral = 'renomear' | 'excluir' | 'mover';

const VERBO_GERAL: Record<AcaoGeral, string> = {
  renomear: 'renomeada',
  excluir: 'excluída',
  mover: 'movida',
};

export const mensagemGeral = (acao: AcaoGeral): string =>
  `A subcategoria Geral não pode ser ${VERBO_GERAL[acao]}`;

export const MENSAGEM_CATEGORIA_SISTEMA =
  'Categoria padrão do orçamento não pode ser excluída, apenas renomeada';
export const MENSAGEM_ITEM_SOLTO =
  'Crie a linha dentro de uma categoria (ex.: Despesas Variáveis), não direto neste nível';

const MENSAGEM_NOME: Record<'vazio' | 'longo' | 'duplicado', string> = {
  vazio: 'Informe o nome da subcategoria',
  longo: `O nome da subcategoria pode ter até ${NOME_MAX} caracteres`,
  duplicado: 'Já existe uma subcategoria com esse nome nesta categoria',
};

/** liberada && ativado para o dono dos dados (targetUserId), com o cache de 60 s do gate. */
export async function usuarioOrcamentoV2Ativo(userId: string): Promise<boolean> {
  const { estado, ativado } = await estadoAcessoOrcamentoV2(userId);
  return estado === 'liberada' && ativado;
}

/** R-02: a Geral não é renomeada, excluída nem movida (409). */
export function assertNaoGeral(
  item: { isGeral?: boolean | null } | null | undefined,
  acao: AcaoGeral,
): void {
  if (item?.isGeral) throw new ErroEstruturaOrcamento(409, mensagemGeral(acao), 'geral');
}

/** Nome canônico do grupo e se ele veio de um template (template ou override de template). */
export interface CategoriaInfo {
  nomeCanonico: string;
  derivadaDeTemplate: boolean;
}

export const categoriaInfo = (grupo: CashflowGroup): CategoriaInfo => ({
  nomeCanonico: canonicalName(grupo),
  derivadaDeTemplate: Boolean(grupo.isTemplate || grupo.templateId),
});

const ESTRUTURAIS_DESPESA = new Set<string>([
  CANONICAL_GROUPS.DESPESAS,
  CANONICAL_GROUPS.DESPESAS_FIXAS,
]);

/**
 * Categoria de sistema: as 13 do catálogo vindas do template (R-12, is_system) e os dois níveis
 * estruturais que as contêm ("Despesas", "Despesas Fixas"), cuja exclusão ocultaria todas elas.
 * Grupo criado pelo usuário nunca é de sistema, mesmo com nome igual.
 */
export function ehCategoriaSistema(grupo: CategoriaInfo): boolean {
  if (!grupo.derivadaDeTemplate) return false;
  return (
    categoriaDoCatalogo(grupo.nomeCanonico) != null || ESTRUTURAIS_DESPESA.has(grupo.nomeCanonico)
  );
}

/** R-12: categoria de sistema não pode ser excluída (409). */
export function assertNaoCategoriaSistema(grupo: CategoriaInfo, _acao: 'excluir'): void {
  if (ehCategoriaSistema(grupo)) {
    throw new ErroEstruturaOrcamento(409, MENSAGEM_CATEGORIA_SISTEMA, 'categoria_sistema');
  }
}

/** R-12 + R-18: nome único (sem acento/caixa) na categoria, 1–60 com trim. Lança 422. */
export function validarNomeNaCategoria(nome: string, irmaos: string[]): string {
  const r = validarNomeSubcategoria(nome, irmaos);
  if (!r.ok) {
    throw new ErroEstruturaOrcamento(422, MENSAGEM_NOME[r.motivo], `nome_${r.motivo}`);
  }
  return r.nome;
}

/**
 * Só a unicidade (R-12), para quando a linha muda de categoria sem trocar de nome (mover): um
 * nome antigo fora do limite de R-18 não impede a mudança. Lança 422 'nome_duplicado'.
 */
export function assertNomeLivreNaCategoria(nome: string, irmaos: string[]): void {
  const r = validarNomeSubcategoria(nome, irmaos);
  if (!r.ok && r.motivo === 'duplicado') {
    throw new ErroEstruturaOrcamento(422, MENSAGEM_NOME.duplicado, 'nome_duplicado');
  }
}

/**
 * Exclusão de item de categoria de despesa de usuário v2 → fusão na Geral (R-12, D11). Stub até a
 * PR 7 (`excluirSubcategoria`): devolve sempre 'nao_aplica', e a rota segue o caminho de hoje.
 */
export async function delegarExclusaoItem(
  _tx: Prisma.TransactionClient,
  _userId: string,
  _itemId: string,
): Promise<'fundido' | 'nao_aplica'> {
  return 'nao_aplica';
}

// ─── Árvore mesclada: papel dos grupos ───────────────────────────────────────────────────────

/** 'categoria' = subcategorias valem (R-12); 'nivel_solto' = Despesas/Despesas Fixas (Q15). */
export type PapelGrupo = 'categoria' | 'nivel_solto' | 'outro';

export interface GrupoLocalizado {
  grupo: CashflowGroup;
  papel: PapelGrupo;
}

export interface ItemLocalizado extends GrupoLocalizado {
  item: CashflowItem;
}

/** Percorre a árvore mesclada atribuindo o papel de cada grupo (partição de collectCategorias). */
function percorrer(arvore: CashflowGroup[], visitar: (g: GrupoLocalizado) => boolean): boolean {
  const descer = (grupos: CashflowGroup[], papelDe: (g: CashflowGroup) => PapelGrupo): boolean => {
    for (const g of grupos) {
      const papel = papelDe(g);
      if (visitar({ grupo: g, papel })) return true;
      const filhos = g.children ?? [];
      if (filhos.length === 0) continue;
      let papelFilho: (c: CashflowGroup) => PapelGrupo;
      if (papel === 'nivel_solto' && isCanonical(g, CANONICAL_GROUPS.DESPESAS)) {
        papelFilho = (c) =>
          isCanonical(c, CANONICAL_GROUPS.DESPESAS_FIXAS) && (c.children?.length ?? 0) > 0
            ? 'nivel_solto'
            : 'categoria';
      } else if (papel === 'nivel_solto') {
        papelFilho = () => 'categoria';
      } else {
        papelFilho = () => 'outro';
      }
      if (descer(filhos, papelFilho)) return true;
    }
    return false;
  };
  return descer(arvore, (g) => {
    if (isReceitaGroupByType(g.type) || g.type === 'investimento' || g.type === 'saldo') {
      return 'outro';
    }
    return isCanonical(g, CANONICAL_GROUPS.DESPESAS) ? 'nivel_solto' : 'categoria';
  });
}

/** Grupo pelo id mesclado (ou pelo id do template que ele personaliza). */
export function localizarGrupo(arvore: CashflowGroup[], groupId: string): GrupoLocalizado | null {
  let achado: GrupoLocalizado | null = null;
  percorrer(arvore, (g) => {
    if (g.grupo.id === groupId || g.grupo.templateId === groupId) {
      achado = g;
      return true;
    }
    return false;
  });
  return achado as GrupoLocalizado | null;
}

/** Item pelo id mesclado (ou pelo id do template que ele personaliza), com o grupo e o papel. */
export function localizarItem(arvore: CashflowGroup[], itemId: string): ItemLocalizado | null {
  let achado: ItemLocalizado | null = null;
  percorrer(arvore, (g) => {
    const item = (g.grupo.items ?? []).find((i) => i.id === itemId || i.templateId === itemId);
    if (item) {
      achado = { ...g, item };
      return true;
    }
    return false;
  });
  return achado as ItemLocalizado | null;
}

/** Nomes das linhas do grupo (exceto `excluirItemId`), para a unicidade dentro da categoria. */
export function nomesIrmaos(grupo: CashflowGroup, excluirItemId?: string): string[] {
  return (grupo.items ?? []).filter((i) => i.id !== excluirItemId).map((i) => i.name);
}

/** Q15: usuário v2 não cria (nem move) linha solta direto em "Despesas"/"Despesas Fixas". */
export function assertNaoNivelSolto(papel: PapelGrupo): void {
  if (papel === 'nivel_solto') {
    throw new ErroEstruturaOrcamento(409, MENSAGEM_ITEM_SOLTO, 'item_solto');
  }
}

/** Sub nova entra no fim das subs comuns, antes da Geral: max(orderIndex não Geral) + 1. */
export function orderIndexNovaSub(grupo: CashflowGroup): number {
  const ordens = (grupo.items ?? []).filter((i) => !i.isGeral).map((i) => i.orderIndex ?? 0);
  return ordens.length > 0 ? Math.max(...ordens) + 1 : 1;
}

/** Árvore mesclada do ano corrente (só para usuários v2: as guardas leem nomes e papéis dela). */
export function carregarArvoreEstrutura(userId: string): Promise<CashflowGroup[]> {
  return getMergedCashflowGroups(userId, new Date().getFullYear());
}

/**
 * Validação de criação de linha em `groupId` para usuário v2 (POST items e update create):
 * nível solto → 409; categoria → nome validado (422) e orderIndex antes da Geral. Fora de
 * categoria (Entradas, subgrupos internos) ou grupo fora da árvore → sem mudança.
 */
export async function guardarCriacaoItemV2(
  userId: string,
  groupId: string,
  nome: string,
): Promise<{ nome: string; orderIndex?: number }> {
  const arvore = await carregarArvoreEstrutura(userId);
  const local = localizarGrupo(arvore, groupId);
  if (!local) return { nome };
  assertNaoNivelSolto(local.papel);
  if (local.papel !== 'categoria') return { nome };
  return {
    nome: validarNomeNaCategoria(nome, nomesIrmaos(local.grupo)),
    orderIndex: orderIndexNovaSub(local.grupo),
  };
}
