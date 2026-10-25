/**
 * Tons visuais do Orçamento (classes Tailwind), compartilhados entre a tela atual (Orçamento vs
 * Real: tabela e cartões do celular) e o Orçamento v2. Só a paleta de `brandColors.ts` mais os
 * tons semânticos já aprovados: azul `mf-outside` (#0079F2) no ok, âmbar e vermelho semântico nos
 * alertas, cinza no neutro. Nunca os hex da spec v.8 §10 (#2f80f6, #d97706 como texto, #dc2626).
 *
 * No v2 (desenho técnico §8): `ok` = dentro, `atencao` = à frente do ritmo (warn), `estourou` =
 * estouro (bad), `neutro` = sem orçado / previsto (none).
 */

export type TomOrcamento = 'ok' | 'atencao' | 'estourou' | 'neutro';

/** Texto do selo (AA nos dois temas). Âmbar #B45309/#D97706 e vermelho semântico #D92D20/#F97066. */
export const SELO_TEXTO: Record<TomOrcamento, string> = {
  ok: 'text-mf-patrimonio dark:text-mf-tranquilidade',
  atencao: 'text-[#B45309] dark:text-[#D97706]',
  estourou: 'text-[#D92D20] dark:text-[#F97066]',
  neutro: 'text-gray-500 dark:text-gray-400',
};

/** Ponto do selo e preenchimento do medidor (elementos não textuais). */
export const TOM_FUNDO: Record<TomOrcamento, string> = {
  ok: 'bg-[#0079F2]',
  atencao: 'bg-[#D97706]',
  estourou: 'bg-[#D92D20] dark:bg-[#F97066]',
  neutro: 'bg-gray-300 dark:bg-gray-600',
};
