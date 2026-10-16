'use client';

/**
 * AlertasDaLista (bloco 1) — STUB da fatia 0 com a assinatura FINAL; a fatia D preenche.
 *
 * O que a fatia D entrega aqui: modal (ModalAnalise) "Alertas da lista "<nome>"" com os 3
 * interruptores de TEXTOS_ALERTAS.tipos (Resultado entregue à CVM; Provento anunciado (data-com);
 * Mudança na contagem de critérios, 5 anos — este desligado por padrão), role=switch com área de
 * toque de 44 px no próprio elemento, PATCH /listas/[id] via useAtualizarAlertasLista, o literal
 * 'aviso-salvos-alertas' (data-texto-legal) + TEXTOS_ALERTAS.daLista.rodape, toast
 * "Alertas de X salvos/desligados" e onSalvo(lista). Só é montado com recursos.alertas (fatia C).
 */
import type { AlertasDaListaProps } from '@/types/analiseAtivosSalvos';

export type { AlertasDaListaProps };

export default function AlertasDaLista(_props: AlertasDaListaProps) {
  return null;
}
