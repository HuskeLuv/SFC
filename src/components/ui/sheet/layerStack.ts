'use client';

import { useEffect, useId, useRef, useSyncExternalStore } from 'react';

/**
 * Pilha de camadas dos overlays do celular (PWA fase 2): com sheets empilhados (ex.: o sheet da
 * célula por cima da grade do ano, ou "Mover" aberto a partir do sheet da linha), só a camada do
 * TOPO responde ao Esc e prende o Tab. Sem empilhamento o comportamento é o de sempre.
 *
 * Estado em módulo (sem Provider): cada camada entra com um número de ordem tirado no RENDER em
 * que abriu — assim, quando pai e filho abrem no mesmo commit (os efeitos do filho rodam antes), o
 * que foi renderizado depois (o filho) fica por cima.
 *
 * Um mesmo evento de teclado só é tratado por UMA camada (`claimLayerEvent`): depois que o topo
 * fecha, o React pode desmontar a camada antes do próximo listener do document rodar, e a camada
 * de baixo viraria topo no meio do mesmo Esc.
 */

interface Layer {
  id: string;
  seq: number;
}

let layers: Layer[] = [];
let counter = 0;
const listeners = new Set<() => void>();
const claimedEvents = new WeakSet<Event>();

function notify() {
  listeners.forEach((cb) => cb());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Próximo número de ordem (quem abre depois fica por cima). */
export function nextLayerSeq(): number {
  counter += 1;
  return counter;
}

/** Coloca a camada na pilha (ou atualiza a ordem, se já estiver). */
export function pushLayer(id: string, seq: number = nextLayerSeq()): void {
  layers = [...layers.filter((l) => l.id !== id), { id, seq }].sort((a, b) => a.seq - b.seq);
  notify();
}

export function popLayer(id: string): void {
  if (!layers.some((l) => l.id === id)) return;
  layers = layers.filter((l) => l.id !== id);
  notify();
}

export function isTopLayer(id: string): boolean {
  return layers.length > 0 && layers[layers.length - 1].id === id;
}

/** Quantas camadas estão abertas (para testes/depuração). */
export function layerCount(): number {
  return layers.length;
}

/**
 * Marca o evento como tratado por uma camada. `false` = outra camada já tratou este evento.
 */
export function claimLayerEvent(event: Event): boolean {
  if (claimedEvents.has(event)) return false;
  claimedEvents.add(event);
  return true;
}

/** A camada é o topo e o evento ainda não foi tratado por outra (e passa a ser desta). */
export function shouldHandleLayerEvent(id: string, event: Event): boolean {
  return isTopLayer(id) && claimLayerEvent(event);
}

/**
 * Registra o overlay na pilha enquanto `isOpen`. `isTop` re-renderiza quando a pilha muda;
 * `layerId` serve para `isTopLayer`/`shouldHandleLayerEvent` dentro de listeners.
 */
export function useTopLayer(isOpen: boolean): { isTop: boolean; layerId: string } {
  const layerId = useId();
  const seqRef = useRef(0);
  const wasOpenRef = useRef(false);
  if (isOpen && !wasOpenRef.current) seqRef.current = nextLayerSeq();
  wasOpenRef.current = isOpen;

  useEffect(() => {
    if (!isOpen) return;
    pushLayer(layerId, seqRef.current);
    return () => popLayer(layerId);
  }, [isOpen, layerId]);

  const isTop = useSyncExternalStore(
    subscribe,
    () => isOpen && isTopLayer(layerId),
    () => false,
  );
  return { isTop, layerId };
}
