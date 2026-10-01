import type { KeyboardCoordinateGetter, UniqueIdentifier } from '@dnd-kit/core';

/**
 * Arrasto por TECLADO na Carteira (mover investimentos, out/2026).
 *
 * Espaço pega a linha pela alça; as setas percorrem os destinos numa ordem fixa — as seções da
 * aba de cima para baixo e, depois, as abas da bandeja "Outra aba" da esquerda para a direita
 * (decisão 1: bandeja no rodapé, não a barra de abas); Espaço solta, Esc cancela.
 *
 * Sem geometria para escolher o alvo: o destino do teclado fica guardado aqui e a detecção de
 * colisão o devolve direto quando não há ponteiro. As coordenadas devolvidas só levam o fantasma
 * até o destino (e fazem a página rolar até ele).
 */

export type AlvoTecladoKind = 'secao' | 'aba';

export interface AlvoTeclado {
  id: string;
  kind: AlvoTecladoKind;
  rect: { top: number; left: number };
}

const SETAS_FRENTE = new Set(['ArrowDown', 'ArrowRight']);
const SETAS_TRAS = new Set(['ArrowUp', 'ArrowLeft']);

/** Ordem do teclado: seções por altura (topo → base), depois as abas por posição (esq. → dir.). */
export function ordemAlvosTeclado(alvos: readonly AlvoTeclado[]): string[] {
  const secoes = alvos
    .filter((a) => a.kind === 'secao')
    .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
  const abas = alvos
    .filter((a) => a.kind === 'aba')
    .sort((a, b) => a.rect.left - b.rect.left || a.rect.top - b.rect.top);
  return [...secoes, ...abas].map((a) => a.id);
}

/**
 * Próximo destino para a tecla. `atual` fora da lista (ou null) = parte do começo (seta para a
 * frente) ou do fim (seta para trás). Nas pontas, fica onde está. Outra tecla → null.
 */
export function proximoAlvoTeclado(
  ordem: readonly string[],
  atual: string | null,
  code: string,
): string | null {
  if (ordem.length === 0) return null;
  const frente = SETAS_FRENTE.has(code);
  const tras = SETAS_TRAS.has(code);
  if (!frente && !tras) return null;
  const idx = atual ? ordem.indexOf(atual) : -1;
  if (idx < 0) return frente ? ordem[0] : ordem[ordem.length - 1];
  const prox = frente ? Math.min(idx + 1, ordem.length - 1) : Math.max(idx - 1, 0);
  return ordem[prox];
}

type DataComKind = { kind?: unknown; secaoDropId?: unknown };

const kindDe = (data: unknown): AlvoTecladoKind | null => {
  const k = (data as DataComKind | undefined)?.kind;
  return k === 'secao' || k === 'aba' ? k : null;
};

export interface TecladoCarteira {
  coordinateGetter: KeyboardCoordinateGetter;
  /** Destino escolhido pelo teclado no arrasto atual (null fora do teclado). */
  alvoAtual: () => string | null;
  /** Zera no início e no fim de cada arrasto. */
  reset: () => void;
}

/**
 * Estado do teclado de UM provider. O ponto de partida é a seção da própria linha
 * (`active.data.secaoDropId`): a primeira seta já vai para a vizinha.
 */
export function criarTecladoCarteira(): TecladoCarteira {
  let alvo: string | null = null;

  const coordinateGetter: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
    if (!SETAS_FRENTE.has(event.code) && !SETAS_TRAS.has(event.code)) return undefined;
    event.preventDefault();
    const alvos: AlvoTeclado[] = [];
    context.droppableContainers.getEnabled().forEach((entry) => {
      if (!entry || entry.disabled) return;
      const kind = kindDe(entry.data.current);
      const rect = context.droppableRects.get(entry.id);
      if (!kind || !rect) return;
      alvos.push({ id: String(entry.id), kind, rect });
    });
    const ordem = ordemAlvosTeclado(alvos);
    const origem = (context.active?.data.current as DataComKind | undefined)?.secaoDropId;
    const atual = alvo ?? (typeof origem === 'string' ? origem : null);
    const prox = proximoAlvoTeclado(ordem, atual, event.code);
    if (!prox) return undefined;
    alvo = prox;
    const rect = context.droppableRects.get(prox as UniqueIdentifier);
    if (!rect) return currentCoordinates;
    // +1px em x: a coordenada sempre muda e a colisão é recalculada mesmo quando o sensor só rola.
    return { x: rect.left + (rect.left === currentCoordinates.x ? 1 : 0), y: rect.top };
  };

  return {
    coordinateGetter,
    alvoAtual: () => alvo,
    reset: () => {
      alvo = null;
    },
  };
}
