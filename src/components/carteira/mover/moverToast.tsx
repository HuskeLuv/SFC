'use client';

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { twMerge } from 'tailwind-merge';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import MobileSaveToast from '@/components/ui/sheet/MobileSaveToast';

/**
 * Aviso do mover na Carteira (out/2026, protótipo D6-D8):
 * - sucesso (role=status): texto + "Ver em <aba>" (troca de aba) + "Desfazer"; 8s, pausa com
 *   hover ou foco; Ctrl/Cmd+Z fora de campos aciona o Desfazer;
 * - erro (role=alert): onde a linha ficou + "Tentar de novo";
 * - info: resultado do Desfazer.
 * No celular o sucesso usa o MobileSaveToast (Desfazer em 44px, acima da barra inferior).
 *
 * Estado global (uma mensagem por vez) para que quem move — tabela, arrasto, diálogo ou a página
 * do ativo — não precise montar nada: o primeiro aviso monta o host sozinho no body.
 */

export const MOVER_TOAST_MS = 8000;

export interface MoverToastAcao {
  label: string;
  onClick: () => void;
}

export interface MoverToastDados {
  tipo: 'ok' | 'erro' | 'info';
  mensagem: string;
  /** Desfazer (também Ctrl/Cmd+Z). */
  desfazer?: () => void;
  /** "Ver em <aba>" / "Ver na Carteira". */
  ver?: MoverToastAcao;
  /** Só no erro: "Tentar de novo". */
  tentarDeNovo?: () => void;
}

type ToastAtual = MoverToastDados & { id: number };

let atual: ToastAtual | null = null;
let seq = 0;
const ouvintes = new Set<() => void>();
const emitir = () => ouvintes.forEach((fn) => fn());

let hostsMontados = 0;
let raizAuto: Root | null = null;

function garantirHost() {
  if (hostsMontados > 0 || raizAuto || typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.setAttribute('data-mf-mover-toast-host', '');
  document.body.appendChild(el);
  raizAuto = createRoot(el);
  raizAuto.render(<MoverToastHost />);
}

export function mostrarToastMover(dados: MoverToastDados): number {
  seq += 1;
  atual = { ...dados, id: seq };
  emitir();
  garantirHost();
  return seq;
}

/** Fecha o aviso (o `id`, se informado, evita fechar um aviso mais novo). */
export function fecharToastMover(id?: number) {
  if (!atual || (id !== undefined && atual.id !== id)) return;
  atual = null;
  emitir();
}

const assinar = (fn: () => void) => {
  ouvintes.add(fn);
  return () => {
    ouvintes.delete(fn);
  };
};

export function useToastMover(): ToastAtual | null {
  return useSyncExternalStore(
    assinar,
    () => atual,
    () => null,
  );
}

const ehCampoDeTexto = (el: Element | null) =>
  !!el &&
  (el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el as HTMLElement).isContentEditable);

const BOTAO_DESKTOP =
  'min-h-8 shrink-0 rounded-md px-1.5 font-semibold whitespace-nowrap underline underline-offset-[3px] outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current';

/**
 * Host do aviso. Montado automaticamente no primeiro aviso; também pode ser montado à mão
 * (testes, layout) — com um host montado, o automático não é criado.
 */
export function MoverToastHost() {
  const toast = useToastMover();
  const isBelowLg = useIsBelowLg();
  const [pausado, setPausado] = useState(false);
  const toastRef = useRef(toast);

  useEffect(() => {
    hostsMontados += 1;
    return () => {
      hostsMontados -= 1;
    };
  }, []);

  useEffect(() => {
    toastRef.current = toast;
    setPausado(false);
  }, [toast]);

  // 8s na tela; o tempo recomeça ao sair o hover/foco.
  useEffect(() => {
    if (!toast || pausado) return;
    const id = toast.id;
    const timer = window.setTimeout(() => fecharToastMover(id), MOVER_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast, pausado]);

  // Ctrl/Cmd+Z fora de campos = Desfazer.
  useEffect(() => {
    if (!toast?.desfazer) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.key.toLowerCase() !== 'z')
        return;
      if (ehCampoDeTexto(document.activeElement)) return;
      const t = toastRef.current;
      if (!t?.desfazer) return;
      event.preventDefault();
      fecharToastMover(t.id);
      t.desfazer();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [toast]);

  const acionar = useCallback((fn: (() => void) | undefined) => {
    const t = toastRef.current;
    if (t) fecharToastMover(t.id);
    fn?.();
  }, []);

  if (typeof document === 'undefined') return null;

  if (isBelowLg) {
    if (!toast) return null;
    if (toast.tipo !== 'erro') {
      return (
        <MobileSaveToast
          message={toast.mensagem}
          durationMs={MOVER_TOAST_MS}
          onDismiss={() => fecharToastMover(toast.id)}
          action={
            toast.desfazer ? { label: 'Desfazer', onClick: () => toast.desfazer?.() } : undefined
          }
        />
      );
    }
    return createPortal(
      <div
        className="pointer-events-none fixed inset-x-4 z-[99992] flex justify-center lg:hidden"
        style={{ bottom: 'calc(64px + env(safe-area-inset-bottom) + 8px)' }}
      >
        <div
          role="alert"
          data-mf-mover-toast="erro"
          className="pointer-events-auto flex min-h-11 max-w-full items-center gap-2 rounded-xl border border-[#D92D20] bg-[#D92D20] py-1 pr-1 pl-4 text-sm font-medium text-white shadow-lg dark:border-[#F97066] dark:bg-[#26262A] dark:text-[#F97066]"
        >
          <span className="min-w-0 flex-1 py-1.5">{toast.mensagem}</span>
          {toast.tentarDeNovo && (
            <button
              type="button"
              onClick={() => acionar(toast.tentarDeNovo)}
              className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold text-white underline underline-offset-[3px] dark:text-mf-escolha"
            >
              Tentar de novo
            </button>
          )}
        </div>
      </div>,
      document.body,
    );
  }

  if (!toast) return null;
  const erro = toast.tipo === 'erro';
  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[18px] z-[99992] flex justify-center px-4 max-lg:hidden"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPausado(false);
      }}
    >
      <div
        role={erro ? 'alert' : 'status'}
        aria-live={erro ? 'assertive' : 'polite'}
        data-mf-mover-toast={toast.tipo}
        className={twMerge(
          'pointer-events-auto flex max-w-[min(640px,100%)] items-center gap-3.5 rounded-xl py-2.5 pr-3 pl-4 font-outfit text-sm shadow-lg',
          erro
            ? 'border border-[#D92D20] bg-[#D92D20] text-white dark:border-[#F97066] dark:bg-[#26262A] dark:text-[#F97066]'
            : 'bg-mf-seguranca text-white dark:bg-[#26262A] dark:text-mf-escolha',
        )}
      >
        <span className="min-w-0">{toast.mensagem}</span>
        {erro ? (
          toast.tentarDeNovo && (
            <button
              type="button"
              onClick={() => acionar(toast.tentarDeNovo)}
              className={twMerge(BOTAO_DESKTOP, 'text-white dark:text-mf-escolha')}
            >
              Tentar de novo
            </button>
          )
        ) : (
          <>
            {toast.ver && (
              <button
                type="button"
                onClick={() => acionar(toast.ver?.onClick)}
                className={twMerge(BOTAO_DESKTOP, 'text-mf-escolha dark:text-mf-tranquilidade')}
              >
                {toast.ver.label}
              </button>
            )}
            {toast.desfazer && (
              <button
                type="button"
                onClick={() => acionar(toast.desfazer)}
                className={twMerge(BOTAO_DESKTOP, 'text-mf-escolha dark:text-mf-tranquilidade')}
              >
                Desfazer
              </button>
            )}
          </>
        )}
        <button
          type="button"
          aria-label="Fechar aviso"
          onClick={() => fecharToastMover(toast.id)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md opacity-80 outline-none hover:opacity-100 focus-visible:outline-2 focus-visible:outline-current"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" />
          </svg>
        </button>
      </div>
    </div>,
    document.body,
  );
}

export default MoverToastHost;
