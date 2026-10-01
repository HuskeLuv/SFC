/**
 * Contrato de UI do mover na Carteira (out/2026) — entre as fatias D (diálogo,
 * sheet, popover, selo, hooks) e E (DnD, bandeja "Outra aba", menu ⋯, cartões).
 * Regras e tipos de API: src/lib/carteiraMover.ts.
 *
 * Paths fixos dos módulos que implementam este contrato:
 *   '@/components/carteira/mover/MoverInvestimento'     → MoverInvestimento (MoverInvestimentoProps)
 *   '@/components/carteira/mover/EscolherSecaoPopover'  → EscolherSecaoPopover (EscolherSecaoPopoverProps)
 *   '@/components/carteira/mover/MovidoBadge'           → MovidoBadge (MovidoBadgeProps), SoltarAquiChip
 *   '@/hooks/useMoverInvestimento'                      → useMoverInvestimento(): UseMoverInvestimento
 *   '@/hooks/useMoverOpcoes'                            → useMoverOpcoes(tipo, id) (queryKeys.carteiraMover.opcoes)
 *
 * Arrastar para outra aba = bandeja "Outra aba" fixa no rodapé durante o
 * arrasto (decisão 1); o EscolherSecaoPopover abre ACIMA do chip da bandeja.
 */
import type { CategoriaMovivel, MoverResponse, TipoItemMover } from '@/lib/carteiraMover';

export type { CategoriaMovivel, MoverResponse, TipoItemMover } from '@/lib/carteiraMover';

/** Item da tabela/cartão que pode ser movido. */
export interface MoverAlvo {
  tipo: TipoItemMover;
  /** id do Portfolio (posição) ou da Watchlist (planejado). */
  id: string;
  /** Aba onde a linha está agora. */
  categoria: CategoriaMovivel;
  /** Subgrupo (seção) atual — valor de CAMPO_SECAO_NA_LINHA[categoria] da linha. */
  secaoAtual: string;
  /** Ticker ou nome exibido (toasts, anúncios, aria-label). */
  label: string;
}

/** Referência mínima (página do ativo): o diálogo busca o resto em useMoverOpcoes. */
export interface MoverAlvoRef {
  tipo: TipoItemMover;
  id: string;
}

/** Diálogo (lg+) / BottomSheet (mobile). */
export interface MoverInvestimentoProps {
  alvo: MoverAlvo | MoverAlvoRef;
  open: boolean;
  onClose: () => void;
  onMoved?: (resultado: MoverResponse) => void;
}

/** Popover de seção ao soltar na bandeja "Outra aba" (D5). */
export interface EscolherSecaoPopoverProps {
  alvo: MoverAlvo;
  destino: CategoriaMovivel;
  anchorEl: HTMLElement;
  onConfirm: (subgrupo: string) => void;
  onCancel: () => void;
  /** As opções chegaram depois de soltar e a aba recusa o item (motivo do servidor). */
  onRecusado?: (motivo: string | undefined) => void;
}

/** Selo "movido" (só troca de ABA — decisão 10). */
export interface MovidoBadgeProps {
  /** ISO do UserChangeLog. */
  movidoEm?: string;
  viaConsultor?: boolean;
  /** Linha planejada: selo tracejado. */
  planejado?: boolean;
}

export interface MoverParams {
  alvo: MoverAlvo | MoverAlvoRef;
  categoria: CategoriaMovivel;
  subgrupo: string;
}

/** Retorno de useMoverInvestimento (mutação otimista + toast com Desfazer). */
export interface UseMoverInvestimento {
  mover: (params: MoverParams) => Promise<MoverResponse>;
  restaurar: (alvo: MoverAlvo | MoverAlvoRef) => Promise<MoverResponse>;
  isPending: boolean;
  /** id do item com mutação em andamento (linha a 60% com "Movendo…"). */
  pendingId?: string;
}

export const isMoverAlvoCompleto = (alvo: MoverAlvo | MoverAlvoRef): alvo is MoverAlvo =>
  'categoria' in alvo && 'secaoAtual' in alvo;
