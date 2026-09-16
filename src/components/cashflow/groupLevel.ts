import { CashflowGroup } from '@/types/cashflow';
import { CANONICAL_GROUPS, canonicalName } from '@/services/cashflow/groupMatchers';

/**
 * Nível hierárquico de um grupo da planilha, usado pelo visual (escada de
 * azuis em `SECTION_CLASS`) e pelo espaçamento (respiro antes de níveis 1 e 2).
 *
 * Identificação pelo nome CANÔNICO do template (sobrevive a renomeações);
 * grupos criados pelo usuário caem na regra estrutural (raiz → 1, com filhos
 * → 2, folha → 3).
 */
export type GroupLevel = 1 | 2 | 3;

const LEVEL_2 = new Set<string>([
  CANONICAL_GROUPS.ENTRADAS_FIXAS,
  CANONICAL_GROUPS.ENTRADAS_VARIAVEIS,
  CANONICAL_GROUPS.DESPESAS_FIXAS,
  CANONICAL_GROUPS.DESPESAS_VARIAVEIS,
  'Despesas Empresa',
  'Planejamento Financeiro',
]);

const LEVEL_3 = new Set<string>([
  'Sem Tributação',
  'Com Tributação',
  'Habitação',
  'Transporte',
  'Saúde',
  'Educação',
  'Animais de Estimação',
  'Despesas Pessoais',
  'Lazer',
  'Impostos',
  'Despesas com Dependentes',
  'Despesas Financeiras',
  'Dívidas',
]);

export function groupLevel(group: CashflowGroup): GroupLevel {
  const canonical = canonicalName(group);
  if (!group.parentId) return 1;
  if (LEVEL_2.has(canonical)) return 2;
  if (LEVEL_3.has(canonical)) return 3;
  return group.children?.length ? 2 : 3;
}
