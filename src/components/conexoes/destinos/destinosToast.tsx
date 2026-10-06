'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type { ResultadoDesfazer } from '@/hooks/useDestinosImportacao';
import { plural } from './destinosEstado';

/**
 * Aviso da revisão de destinos (protótipo D8): "N investimentos mudaram de lugar · Desfazer",
 * 8s (pausa com hover/foco), Desfazer e X de 44×44. Depois do Desfazer, o resultado ("Pronto…"
 * ou o parcial "Desfeito em N; M foram mudados de novo"). `role=status`.
 *
 * Estado global (uma mensagem por vez), como o aviso do mover: a revisão fecha ao salvar e o
 * aviso continua; o primeiro aviso monta o host sozinho no body.
 *
 * Camada acima do Modal (z-99999): ao salvar pela "Conexão realizada", o resumo reabre na mesma
 * hora e o aviso com Desfazer precisa ficar visível e clicável por cima dele (decisão 6).
 */

export const DESTINOS_TOAST_MS = 8000;

export interface DestinosToastDados {
  mensagem: string;
  /** Desfazer (some depois de acionado). */
  desfazer?: () => Promise<ResultadoDesfazer>;
}

type ToastAtual = DestinosToastDados & { id: number };

let atual: ToastAtual | null = null;
let seq = 0;
const ouvintes = new Set<() => void>();
const emitir = () => ouvintes.forEach((fn) => fn());
let hostsMontados = 0;
let raizAuto: Root | null = null;

function garantirHost() {
  if (hostsMontados > 0 || raizAuto || typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.setAttribute('data-mf-destinos-toast-host', '');
  document.body.appendChild(el);
  raizAuto = createRoot(el);
  raizAuto.render(<DestinosToastHost />);
}

export function mostrarToastDestinos(dados: DestinosToastDados): number {
  seq += 1;
  atual = { ...dados, id: seq };
  emitir();
  garantirHost();
  return seq;
}

export function fecharToastDestinos(id?: number) {
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

export const useToastDestinos = (): ToastAtual | null =>
  useSyncExternalStore(
    assinar,
    () => atual,
    () => null,
  );

/** Texto do resultado do Desfazer. */
export function mensagemDesfazer(r: ResultadoDesfazer): string {
  const voltaram = r.desfeitos;
  const naoVoltaram = r.conflitos + r.falhas;
  if (naoVoltaram === 0) {
    return voltaram === 1
      ? 'Pronto: o investimento voltou ao lugar sugerido.'
      : `Pronto: ${voltaram} investimentos voltaram ao lugar sugerido.`;
  }
  if (voltaram === 0) {
    return r.conflitos > 0
      ? 'Não deu para desfazer: eles foram mudados de novo depois. Veja no Histórico.'
      : 'Não foi possível desfazer agora. Tente pelo Histórico.';
  }
  return r.conflitos > 0
    ? `Desfeito em ${voltaram}; ${plural(naoVoltaram, 'foi mudado', 'foram mudados')} de novo.`
    : `Desfeito em ${voltaram}; ${naoVoltaram} não ${naoVoltaram === 1 ? 'pôde' : 'puderam'} voltar. Tente pelo Histórico.`;
}

/** "N investimentos mudaram de lugar". */
export const mensagemSalvo = (aplicados: number): string =>
  aplicados === 1 ? '1 investimento mudou de lugar' : `${aplicados} investimentos mudaram de lugar`;

export function DestinosToastHost() {
  const toast = useToastDestinos();
  const [pausado, setPausado] = useState(false);
  const [desfazendo, setDesfazendo] = useState(false);
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
    setDesfazendo(false);
  }, [toast]);

  useEffect(() => {
    if (!toast || pausado || desfazendo) return;
    const id = toast.id;
    const timer = window.setTimeout(() => fecharToastDestinos(id), DESTINOS_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast, pausado, desfazendo]);

  if (!toast || typeof document === 'undefined') return null;

  const onDesfazer = async () => {
    const t = toastRef.current;
    if (!t?.desfazer || desfazendo) return;
    setDesfazendo(true);
    try {
      const r = await t.desfazer();
      mostrarToastDestinos({ mensagem: mensagemDesfazer(r) });
    } catch {
      mostrarToastDestinos({ mensagem: 'Não foi possível desfazer agora. Tente pelo Histórico.' });
    }
  };

  return createPortal(
    <div
      data-mf-destinos-toast-camada=""
      className="pointer-events-none fixed inset-x-0 z-[100000] flex justify-center px-4 font-outfit max-lg:bottom-[calc(var(--mf-bottom-nav-h,0px)+8px)] lg:bottom-[18px]"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPausado(false);
      }}
    >
      <div
        role="status"
        aria-live="polite"
        data-mf-destinos-toast=""
        className="pointer-events-auto flex max-w-[min(640px,100%)] items-center gap-1 rounded-xl bg-mf-seguranca py-0.5 pr-0.5 pl-4 text-sm text-white shadow-lg dark:bg-[#26262A] dark:text-mf-escolha"
      >
        <span className="min-w-0 flex-1 py-2.5">{toast.mensagem}</span>
        {toast.desfazer && (
          <button
            type="button"
            onClick={() => void onDesfazer()}
            disabled={desfazendo}
            aria-busy={desfazendo || undefined}
            className="min-h-11 shrink-0 rounded-lg px-3 font-semibold whitespace-nowrap text-mf-escolha underline underline-offset-[3px] outline-none focus-visible:ring-[3px] focus-visible:ring-mf-tranquilidade disabled:opacity-70 dark:text-mf-tranquilidade"
          >
            {desfazendo ? 'Desfazendo…' : 'Desfazer'}
          </button>
        )}
        <button
          type="button"
          aria-label="Fechar aviso"
          onClick={() => fecharToastDestinos(toast.id)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg opacity-85 outline-none hover:opacity-100 focus-visible:ring-[3px] focus-visible:ring-mf-tranquilidade"
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

export default DestinosToastHost;
