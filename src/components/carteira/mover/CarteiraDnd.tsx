'use client';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CAMPO_SECAO_NA_LINHA, type CategoriaMovivel } from '@/lib/carteiraMover';
import type { MoverAlvo } from '@/types/carteiraMover';
import { useMoverInvestimento } from '@/hooks/useMoverInvestimento';
import { MoverInvestimento } from '@/components/carteira/mover/MoverInvestimento';
import { EscolherSecaoPopover } from '@/components/carteira/mover/EscolherSecaoPopover';
import { criarTecladoCarteira } from './carteiraDndKeyboard';
import { BandejaOutraAba } from './AbaDropTarget';

/**
 * Mover investimentos na Carteira (out/2026, Fatia E): arrastar as linhas das abas movíveis pela
 * alça ⠿ (adaptado do `CashflowDnd`, sem tocar no Fluxo).
 *
 * - Soltar numa SEÇÃO da tabela: move para aquela seção (mesma aba). Na própria seção, cancela.
 * - Soltar numa aba da BANDEJA "Outra aba" (fixa no rodapé enquanto dura o arrasto — decisão 1 do
 *   Wellington; a barra de abas NÃO é alvo): abre o `EscolherSecaoPopover` acima do chip. Aba
 *   recusada: não faz nada, mostra o motivo num aviso e anuncia.
 * - Menu ⋯ da linha → "Mover para…" abre o `MoverInvestimento` (diálogo/sheet da Fatia D), que
 *   também é o caminho do celular (botão "Mover" no cartão; sem arrastar).
 *
 * A mutação, a atualização otimista, o toast com Desfazer e as invalidações são do
 * `useMoverInvestimento` (Fatia D). Aqui só se decide o destino.
 */

// ── Dados dos arrastáveis e alvos ───────────────────────────────────────────────────────────

export interface LinhaDragData {
  kind: 'linha';
  alvo: MoverAlvo;
  /** Id do alvo da seção onde a linha está (ponto de partida do teclado). */
  secaoDropId: string;
  secaoLabel: string;
}

export interface SecaoDropData {
  kind: 'secao';
  categoria: CategoriaMovivel;
  /** Chave da seção na tabela (getSectionKey). */
  sectionKey: string;
  /** Id do subgrupo (SUBGRUPOS_POR_CATEGORIA) que a seção representa. */
  subgrupo: string;
  label: string;
}

export interface AbaDropData {
  kind: 'aba';
  categoria: CategoriaMovivel;
  label: string;
  /** null = compatibilidade ainda carregando (o servidor valida de novo). */
  permitido: boolean | null;
  motivo?: string;
}

export type DropData = SecaoDropData | AbaDropData;

export const secaoDropId = (categoria: CategoriaMovivel, sectionKey: string) =>
  `secao:${categoria}:${sectionKey}`;
export const abaDropId = (categoria: CategoriaMovivel) => `aba:${categoria}`;
export const linhaDragId = (alvo: Pick<MoverAlvo, 'tipo' | 'id'>) =>
  `linha:${alvo.tipo}:${alvo.id}`;

const dataOf = <T,>(x: { data: { current?: unknown } } | null | undefined): T | undefined =>
  (x?.data.current as T | undefined) ?? undefined;

const isDrop = (d: unknown): d is DropData => {
  const k = (d as { kind?: unknown } | undefined)?.kind;
  return k === 'secao' || k === 'aba';
};

/**
 * Linha da rota da aba → alvo do mover. null = linha sem id ou marcada como não movível pela
 * rota (`naoMovivelMotivo`). `secaoParaSubgrupo` traduz o valor da linha para o id do subgrupo
 * (FII's: 'fof' → 'fofi').
 */
export function alvoDaLinha(
  categoria: CategoriaMovivel,
  linha: unknown,
  secaoParaSubgrupo?: (secao: string) => string | null,
): MoverAlvo | null {
  const r = (linha ?? {}) as Record<string, unknown>;
  if (r.naoMovivelMotivo) return null;
  const id = typeof r.id === 'string' ? r.id : null;
  if (!id) return null;
  const bruto = r[CAMPO_SECAO_NA_LINHA[categoria]];
  const secao = typeof bruto === 'string' ? (secaoParaSubgrupo?.(bruto) ?? bruto) : '';
  return {
    tipo: r.planejado ? 'planejado' : 'posicao',
    id,
    categoria,
    secaoAtual: secao,
    label: String(r.ticker || r.nome || '').trim(),
  };
}

// ── Detecção de colisão ─────────────────────────────────────────────────────────────────────

/**
 * Com ponteiro: a bandeja (fixa, por cima da tabela) vence; senão, a seção sob o ponteiro.
 * Teclado (sem ponteiro): o destino escolhido pelas setas (`carteiraDndKeyboard`).
 */
export function criarColisaoCarteira(alvoTeclado: () => string | null): CollisionDetection {
  return (args) => {
    const alvos = args.droppableContainers.filter((c) => isDrop(c.data.current));
    if (args.pointerCoordinates) {
      const abas = alvos.filter((c) => dataOf<DropData>(c)?.kind === 'aba');
      const naAba = pointerWithin({ ...args, droppableContainers: abas });
      if (naAba.length > 0) return naAba.slice(0, 1);
      const secoes = alvos.filter((c) => dataOf<DropData>(c)?.kind === 'secao');
      return pointerWithin({ ...args, droppableContainers: secoes }).slice(0, 1);
    }
    const id = alvoTeclado();
    const alvo = id ? alvos.find((c) => String(c.id) === id) : undefined;
    return alvo ? [{ id: alvo.id, data: { droppableContainer: alvo, value: 0 } }] : [];
  };
}

// ── Textos (fantasma, anúncios, aviso) ──────────────────────────────────────────────────────

/** Fantasma: '→ Infra' numa seção, '→ Fundos' numa aba aceita, '✕ Stocks: motivo' na recusa. */
export function destinoDoFantasma(
  linha: LinhaDragData,
  over: DropData | null | undefined,
): { texto: string; recusado: boolean } | null {
  if (!over) return null;
  if (over.kind === 'secao') {
    if (secaoDropId(over.categoria, over.sectionKey) === linha.secaoDropId) return null;
    return { texto: over.label, recusado: false };
  }
  if (over.permitido === false) {
    return { texto: `${over.label}: ${over.motivo ?? 'indisponível'}`, recusado: true };
  }
  return { texto: over.label, recusado: false };
}

export const avisoAbaRecusada = (aba: AbaDropData, label: string) =>
  `${aba.label} não aceita ${label}: ${aba.motivo ?? 'indisponível'}.`;

const anuncioSobre = (over: DropData | undefined): string => {
  if (!over) return 'Fora de um destino.';
  if (over.kind === 'secao') return `Sobre a seção ${over.label}.`;
  if (over.permitido === false) {
    return `Aba ${over.label}, indisponível: ${over.motivo ?? 'não aceita este ativo'}.`;
  }
  return `Sobre a aba ${over.label}, na bandeja.`;
};

export const INSTRUCOES_TECLADO =
  'Para mover, pressione espaço na alça da linha. Use as setas para escolher a seção desta aba ou, depois delas, uma aba da bandeja "Outra aba", e pressione espaço para soltar. Esc cancela. O menu Ações da linha também tem a opção Mover para.';

// ── Contexto ────────────────────────────────────────────────────────────────────────────────

export interface CarteiraMoverContextValue {
  categoria: CategoriaMovivel;
  /** Arrastar ligado (desktop). No celular só o botão "Mover". */
  dnd: boolean;
  /** Linha sendo arrastada. */
  ativo: LinhaDragData | null;
  /** id do item com mutação em andamento (linha a 60% com "Movendo…"). */
  pendingId?: string;
  abrirMover: (alvo: MoverAlvo) => void;
  restaurar: (alvo: MoverAlvo) => void;
}

const CarteiraMoverContext = createContext<CarteiraMoverContextValue | null>(null);

/** null fora de uma aba movível (as abas fixas não montam o provider). */
export const useCarteiraMover = () => useContext(CarteiraMoverContext);

const focarAlca = (id: string) => {
  if (typeof window === 'undefined') return;
  window.requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(`[data-mover-alca="${CSS.escape(id)}"]`);
    el?.focus();
  });
};

interface PopState {
  alvo: MoverAlvo;
  destino: CategoriaMovivel;
  anchorEl: HTMLElement;
}

interface CarteiraDndProviderProps {
  categoria: CategoriaMovivel;
  /** false = celular: sem sensores, sem bandeja (só o diálogo/sheet do "Mover"). */
  dnd?: boolean;
  children: React.ReactNode;
}

export const CarteiraDndProvider: React.FC<CarteiraDndProviderProps> = ({
  categoria,
  dnd = true,
  children,
}) => {
  const { mover, restaurar, pendingId } = useMoverInvestimento();
  const teclado = useMemo(() => criarTecladoCarteira(), []);
  const collision = useMemo(() => criarColisaoCarteira(teclado.alvoAtual), [teclado]);
  const areaRef = useRef<HTMLDivElement>(null);

  const [ativo, setAtivo] = useState<LinhaDragData | null>(null);
  const [over, setOver] = useState<DropData | null>(null);
  const [pop, setPop] = useState<PopState | null>(null);
  const [dialogo, setDialogo] = useState<MoverAlvo | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [centroX, setCentroX] = useState<number | null>(null);

  // Mouse: 4px (clique continua clique). Toque: segurar 250ms (não briga com a rolagem).
  // Teclado: espaço pega, setas escolhem o destino (seções e depois a bandeja), espaço solta.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: teclado.coordinateGetter }),
  );

  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(null), 6000);
    return () => window.clearTimeout(t);
  }, [aviso]);

  const executarMover = useCallback(
    async (alvo: MoverAlvo, destino: CategoriaMovivel, subgrupo: string) => {
      try {
        await mover({ alvo, categoria: destino, subgrupo });
      } catch {
        // O toast de erro ("continua em …" + Tentar de novo) é do useMoverInvestimento.
      }
      // Foco: na alça da linha no destino (mesma aba) ou de volta à origem (erro).
      focarAlca(alvo.id);
    },
    [mover],
  );

  const restaurarAlvo = useCallback(
    (alvo: MoverAlvo) => {
      restaurar(alvo).catch(() => {
        // toast de erro é do hook
      });
    },
    [restaurar],
  );

  const fim = useCallback(() => {
    teclado.reset();
    setAtivo(null);
    setOver(null);
  }, [teclado]);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      teclado.reset();
      const linha = dataOf<LinhaDragData>(event.active);
      if (!linha) return;
      const rect = areaRef.current?.getBoundingClientRect();
      setCentroX(rect ? rect.left + rect.width / 2 : null);
      setAviso(null);
      setPop(null);
      setAtivo(linha);
    },
    [teclado],
  );

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const d = event.over ? dataOf<DropData>(event.over) : undefined;
    setOver((prev) => (prev === (d ?? null) ? prev : (d ?? null)));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const linha = dataOf<LinhaDragData>(event.active);
      const destino = event.over ? dataOf<DropData>(event.over) : undefined;
      fim();
      if (!linha || !destino) {
        if (linha) focarAlca(linha.alvo.id);
        return;
      }
      if (destino.kind === 'secao') {
        if (secaoDropId(destino.categoria, destino.sectionKey) === linha.secaoDropId) {
          focarAlca(linha.alvo.id);
          return;
        }
        void executarMover(linha.alvo, destino.categoria, destino.subgrupo);
        return;
      }
      if (destino.permitido === false) {
        setAviso(avisoAbaRecusada(destino, linha.alvo.label));
        focarAlca(linha.alvo.id);
        return;
      }
      const anchorEl = document.querySelector<HTMLElement>(
        `[data-aba-drop="${destino.categoria}"]`,
      );
      if (!anchorEl) return;
      setPop({ alvo: linha.alvo, destino: destino.categoria, anchorEl });
    },
    [executarMover, fim],
  );

  const handleDragCancel = useCallback(
    (event: { active: { data: { current?: unknown } } }) => {
      const linha = dataOf<LinhaDragData>(event.active);
      fim();
      if (linha) focarAlca(linha.alvo.id);
    },
    [fim],
  );

  const announcements = useMemo<Announcements>(
    () => ({
      onDragStart: ({ active }) => {
        const l = dataOf<LinhaDragData>(active);
        return l ? `${l.alvo.label} selecionado, na seção ${l.secaoLabel}.` : undefined;
      },
      onDragOver: ({ over: o }) => anuncioSobre(o ? dataOf<DropData>(o) : undefined),
      onDragMove: () => undefined,
      onDragEnd: ({ active, over: o }) => {
        const l = dataOf<LinhaDragData>(active);
        const d = o ? dataOf<DropData>(o) : undefined;
        if (!l) return undefined;
        if (!d) return `${l.alvo.label} continua em ${l.secaoLabel}.`;
        if (d.kind === 'secao') {
          return secaoDropId(d.categoria, d.sectionKey) === l.secaoDropId
            ? `${l.alvo.label} continua em ${l.secaoLabel}.`
            : `${l.alvo.label} solto em ${d.label}.`;
        }
        if (d.permitido === false) return avisoAbaRecusada(d, l.alvo.label);
        return `Escolha a seção de ${l.alvo.label} em ${d.label}.`;
      },
      onDragCancel: ({ active }) => {
        const l = dataOf<LinhaDragData>(active);
        return l
          ? `Movimento cancelado. ${l.alvo.label} continua em ${l.secaoLabel}.`
          : 'Movimento cancelado.';
      },
    }),
    [],
  );

  const ctx = useMemo<CarteiraMoverContextValue>(
    () => ({
      categoria,
      dnd,
      ativo,
      pendingId,
      abrirMover: setDialogo,
      restaurar: restaurarAlvo,
    }),
    [categoria, dnd, ativo, pendingId, restaurarAlvo],
  );

  const fecharPop = useCallback(() => {
    if (pop) focarAlca(pop.alvo.id);
    setPop(null);
  }, [pop]);

  const extras = (
    <>
      {dialogo ? (
        <MoverInvestimento
          alvo={dialogo}
          open
          onClose={() => {
            focarAlca(dialogo.id);
            setDialogo(null);
          }}
        />
      ) : null}
      {aviso ? (
        <div
          role="status"
          className="fixed bottom-[calc(18px+env(safe-area-inset-bottom))] left-1/2 z-[95] flex max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-3.5 rounded-xl bg-mf-seguranca py-2.5 pr-3 pl-4 text-sm text-white shadow-lg dark:bg-[#26262A] dark:text-mf-escolha"
        >
          <span>{aviso}</span>
          <button
            type="button"
            onClick={() => setAviso(null)}
            aria-label="Fechar aviso"
            className="inline-grid min-h-8 min-w-8 place-items-center rounded-md opacity-80 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-current"
          >
            ✕
          </button>
        </div>
      ) : null}
    </>
  );

  if (!dnd) {
    return (
      <CarteiraMoverContext.Provider value={ctx}>
        {children}
        {extras}
      </CarteiraMoverContext.Provider>
    );
  }

  const fantasma = ativo ? destinoDoFantasma(ativo, over) : null;
  const alvoBandeja = ativo?.alvo ?? pop?.alvo ?? null;

  return (
    <CarteiraMoverContext.Provider value={ctx}>
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        // Sem auto-rolagem sobre a bandeja (ela fica no rodapé, na zona de rolagem).
        autoScroll={{ enabled: over?.kind !== 'aba', threshold: { x: 0.2, y: 0.1 } }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: INSTRUCOES_TECLADO },
        }}
      >
        <div ref={areaRef} data-carteira-dnd="">
          {children}
        </div>
        {alvoBandeja ? (
          <BandejaOutraAba alvo={alvoBandeja} centroX={centroX} arrastando={!!ativo} />
        ) : null}
        <DragOverlay dropAnimation={null}>
          {ativo ? (
            <div className="pointer-events-none inline-flex max-w-[420px] translate-x-3 -translate-y-[calc(100%+6px)] items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[12.5px] font-medium whitespace-nowrap text-gray-800 shadow-lg dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
              {fantasma?.recusado ? (
                <>
                  <span aria-hidden className="text-[#D92D20] dark:text-[#F97066]">
                    ✕
                  </span>
                  <span className="truncate text-[#D92D20] dark:text-[#F97066]">
                    {fantasma.texto}
                  </span>
                </>
              ) : (
                <>
                  <span aria-hidden className="text-gray-400">
                    ⠿
                  </span>
                  <span className="truncate">{ativo.alvo.label}</span>
                  {fantasma ? (
                    <span className="shrink-0 truncate text-mf-patrimonio dark:text-mf-tranquilidade">
                      → {fantasma.texto}
                    </span>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {pop ? (
        <EscolherSecaoPopover
          alvo={pop.alvo}
          destino={pop.destino}
          anchorEl={pop.anchorEl}
          onConfirm={(subgrupo) => {
            const { alvo, destino } = pop;
            setPop(null);
            void executarMover(alvo, destino, subgrupo);
          }}
          onCancel={fecharPop}
        />
      ) : null}
      {extras}
    </CarteiraMoverContext.Provider>
  );
};
