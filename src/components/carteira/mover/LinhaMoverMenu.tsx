'use client';
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { rotuloCategoria } from '@/lib/carteiraMover';
import type { MoverAlvo } from '@/types/carteiraMover';
import { useMoverOpcoes } from '@/hooks/useMoverOpcoes';
import { useCarteiraMover } from './CarteiraDnd';

/**
 * Menu ⋯ de uma linha movível (botão 32×32 no fim da linha): "Abrir ativo" (só posição — o
 * planejado não tem página), "Mover para…" (diálogo da Fatia D; é o caminho principal sem mouse)
 * e, se a linha está em outra aba por escolha manual, "Voltar para <aba original>".
 *
 * O menu vai num portal com posição fixa: o wrapper da tabela tem overflow e cortaria um menu
 * absoluto. Esc devolve o foco ao botão; setas/Home/End percorrem os itens; Tab ou clique fora
 * fecham; rolar ou redimensionar fecha.
 */
interface LinhaMoverMenuProps {
  alvo: MoverAlvo;
  /** Linha fora da aba base (selo "movido") → oferece "Voltar para…". */
  movido?: boolean;
  movidoEm?: string;
  movidoViaConsultor?: boolean;
  disabled?: boolean;
  /**
   * Fase 2 (Reservas e Renda Fixa — protótipo D9): no item movido, "Voltar para <aba>" vem
   * PRIMEIRO, antes de "Mover para…" e "Abrir ativo"; "Mover para…" diz só "Outra aba" (não há
   * seção para escolher). Padrão false: a fase 1 fica como está.
   */
  voltarPrimeiro?: boolean;
}

const ITEM_CLASS =
  'flex min-h-10 w-full flex-col items-start gap-px rounded-lg px-2.5 py-2 text-left text-sm text-gray-800 hover:bg-gray-100 focus-visible:bg-gray-100 focus-visible:outline-none dark:text-gray-100 dark:hover:bg-white/[0.06] dark:focus-visible:bg-white/[0.06]';
const ITEM_SMALL_CLASS = 'text-xs text-gray-500 dark:text-gray-400';

const dataBR = (iso?: string) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('pt-BR');
};

/** Item "Voltar para…": o rótulo da aba original vem das opções do item (Fatia D). */
function VoltarItem({
  alvo,
  detalhe,
  onClick,
}: {
  alvo: MoverAlvo;
  detalhe: string | null;
  onClick: () => void;
}) {
  const { data } = useMoverOpcoes(alvo.tipo, alvo.id);
  const original = data?.original;
  const titulo = original
    ? `Voltar para ${rotuloCategoria(original.categoria)}`
    : 'Voltar ao original';
  const sub = [original?.label, detalhe].filter(Boolean).join(' · ');
  return (
    <button type="button" role="menuitem" className={ITEM_CLASS} onClick={onClick}>
      {titulo}
      {sub ? <small className={ITEM_SMALL_CLASS}>{sub}</small> : null}
    </button>
  );
}

export function LinhaMoverMenu({
  alvo,
  movido,
  movidoEm,
  movidoViaConsultor,
  disabled,
  voltarPrimeiro = false,
}: LinhaMoverMenuProps) {
  const mover = useCarteiraMover();
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState<React.CSSProperties>({});
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const fechar = useCallback((devolverFoco = true) => {
    setAberto(false);
    if (devolverFoco) btnRef.current?.focus();
  }, []);

  const abrir = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const right = Math.max(8, window.innerWidth - r.right);
    // Sem espaço embaixo (~ 3 itens), abre para cima.
    setPos(
      r.bottom + 200 > window.innerHeight
        ? { right, bottom: window.innerHeight - r.top + 4 }
        : { right, top: r.bottom + 4 },
    );
    setAberto(true);
  };

  useEffect(() => {
    if (!aberto) return;
    const itens = () =>
      Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    itens()[0]?.focus();
    // Rolagem que já estava em curso ao abrir (ex.: o botão foi trazido à vista) não fecha.
    const abertoEm = performance.now();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      fechar(false);
    };
    const onKey = (e: KeyboardEvent) => {
      const lista = itens();
      const idx = lista.indexOf(document.activeElement as HTMLElement);
      if (e.key === 'Escape') {
        e.preventDefault();
        fechar();
      } else if (e.key === 'Tab') {
        fechar(false);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const passo = e.key === 'ArrowDown' ? 1 : -1;
        lista[(idx + passo + lista.length) % lista.length]?.focus();
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        lista[e.key === 'Home' ? 0 : lista.length - 1]?.focus();
      }
    };
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (performance.now() - abertoEm < 300) return;
      fechar(false);
    };
    const onResize = () => fechar(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [aberto, fechar]);

  if (!mover) return null;

  const quando = dataBR(movidoEm);
  const detalheMovido = quando
    ? `movido ${movidoViaConsultor ? 'pelo consultor' : 'por você'} em ${quando}`
    : null;

  const voltar = (
    <VoltarItem
      alvo={alvo}
      detalhe={detalheMovido}
      onClick={() => {
        fechar();
        mover.restaurar(alvo);
      }}
    />
  );
  // Só posição: o planejado não tem página.
  const abrirAtivo =
    alvo.tipo === 'posicao' ? (
      <Link
        role="menuitem"
        href={`/ativos/${alvo.id}`}
        className={ITEM_CLASS}
        onClick={() => fechar(false)}
      >
        Abrir ativo
      </Link>
    ) : null;
  const separador = <hr className="my-1 border-gray-200 dark:border-gray-800" />;
  const comVoltarNoTopo = !!movido && voltarPrimeiro;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? menuId : undefined}
        aria-label={`Ações de ${alvo.label}`}
        disabled={disabled}
        data-mover-menu={alvo.id}
        onClick={() => (aberto ? fechar(false) : abrir())}
        className="inline-grid h-8 w-8 place-items-center rounded-lg text-base leading-none text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus-visible:ring-[3px] focus-visible:ring-[#0079F2] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-100 dark:focus-visible:ring-mf-tranquilidade"
      >
        <span aria-hidden>⋯</span>
      </button>
      {aberto && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label={`Ações de ${alvo.label}`}
              className="fixed z-[95] flex min-w-[260px] flex-col rounded-xl border border-gray-200 bg-white p-1.5 shadow-[0_12px_32px_rgba(45,45,45,0.18)] dark:border-gray-800 dark:bg-gray-900 dark:shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
              style={pos}
            >
              {comVoltarNoTopo ? (
                <>
                  {voltar}
                  {separador}
                </>
              ) : null}
              {comVoltarNoTopo ? null : abrirAtivo}
              <button
                type="button"
                role="menuitem"
                className={ITEM_CLASS}
                onClick={() => {
                  fechar(false);
                  mover.abrirMover(alvo);
                }}
              >
                Mover para…
                <small className={ITEM_SMALL_CLASS}>
                  {voltarPrimeiro ? 'Outra aba' : 'Outra seção ou outra aba'}
                </small>
              </button>
              {comVoltarNoTopo ? abrirAtivo : null}
              {movido && !comVoltarNoTopo ? (
                <>
                  {separador}
                  {voltar}
                </>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
