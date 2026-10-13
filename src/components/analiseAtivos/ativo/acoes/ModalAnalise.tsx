'use client';

/**
 * Moldura dos 4 modais da linha de ações do cabeçalho do ativo (fatia C1).
 * - Computador (≥ lg): diálogo central (role=dialog, aria-modal), 500 px (padrão) ou 660 px
 *   ('larga'), rodapé fixo; Esc e clique no fundo fecham; foco preso e devolvido a quem abriu.
 * - Celular (< lg): BottomSheet + useMobileHistoryLayer (o "voltar" do sistema fecha o painel).
 * O × e todos os botões têm 44 px ou mais. O conteúdo rola; o rodapé fica fixo.
 */
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import { useAuth } from '@/hooks/useAuth';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { useMobileHistoryLayer } from '@/hooks/useMobileHistoryLayer';
import { lockBodyScroll } from '@/lib/ui/scrollLock';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_ACOES_CARTEIRA } from '@/services/analiseAtivos/textosAcoesCarteira';
import type { ModalAnaliseProps } from '@/types/analiseAtivosCriterios';

export type { ModalAnaliseProps };

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const FOCO_MODAL =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]';

const BASE_BOTAO_MODAL = `inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${FOCO_MODAL}`;
/** Primário dos modais (ação que grava): patrimônio, hover segurança. */
export const BOTAO_MODAL_PRIMARIO = `${BASE_BOTAO_MODAL} bg-[#396CAA] text-white hover:bg-[#314666] dark:bg-[#396CAA] dark:hover:bg-[#6E9DC4] dark:hover:text-gray-900`;
export const BOTAO_MODAL_SECUNDARIO = `${BASE_BOTAO_MODAL} border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:bg-transparent dark:text-white/90 dark:hover:bg-white/5`;
/** Dica à esquerda do rodapé (ocupa a linha inteira no celular). */
export const DICA_RODAPE =
  'min-w-0 flex-[1_1_180px] basis-full text-[13px] text-gray-500 lg:basis-auto dark:text-gray-400';
/** Subtítulo do modal (abaixo do título, dentro do corpo). */
export const SUBTITULO_MODAL = 'mb-3 text-[13.5px] leading-[1.45] text-gray-500 dark:text-gray-400';

function DialogoComputador({
  aberto,
  onFechar,
  titulo,
  largura = 'padrao',
  children,
  rodape,
}: ModalAnaliseProps) {
  const painelRef = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  const fecharRef = useRef(onFechar);
  // Gatilho guardado no render da abertura (o autoFocus do conteúdo roda antes do efeito).
  const gatilhoRef = useRef<HTMLElement | null>(null);
  const estavaAbertoRef = useRef(false);
  if (aberto && !estavaAbertoRef.current && typeof document !== 'undefined') {
    gatilhoRef.current = document.activeElement as HTMLElement | null;
  }
  estavaAbertoRef.current = aberto;

  useEffect(() => {
    fecharRef.current = onFechar;
  }, [onFechar]);

  useEffect(() => {
    if (!aberto) return;
    const gatilho = gatilhoRef.current;
    const liberar = lockBodyScroll();
    const painel = painelRef.current;
    if (painel && !painel.contains(document.activeElement)) {
      const auto = painel.querySelector<HTMLElement>('[data-autofocus]');
      (auto ?? painel).focus();
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        fecharRef.current();
        return;
      }
      if (event.key !== 'Tab' || !painelRef.current) return;
      const focaveis = Array.from(painelRef.current.querySelectorAll<HTMLElement>(FOCAVEIS)).filter(
        (el) => el.getAttribute('aria-disabled') !== 'true',
      );
      if (focaveis.length === 0) {
        event.preventDefault();
        return;
      }
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      const ativo = document.activeElement;
      if (event.shiftKey && (ativo === primeiro || ativo === painelRef.current)) {
        event.preventDefault();
        ultimo.focus();
      } else if (!event.shiftKey && ativo === ultimo) {
        event.preventDefault();
        primeiro.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      liberar();
      if (gatilho && typeof gatilho.focus === 'function' && document.contains(gatilho)) {
        gatilho.focus();
      }
    };
  }, [aberto]);

  if (!aberto || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 font-outfit"
      data-modal-analise=""
    >
      <div
        className="fixed inset-0 bg-mf-potencia/45"
        aria-hidden="true"
        onClick={() => fecharRef.current()}
      />
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        className={`relative flex max-h-[calc(100dvh-32px)] flex-col rounded-[14px] border border-gray-200 bg-white text-gray-800 shadow-xl outline-none dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 ${
          largura === 'larga' ? 'w-[min(660px,100%)]' : 'w-[min(500px,100%)]'
        }`}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-[18px] pb-3">
          <h2 id={tituloId} className="pt-2 text-[17px] font-semibold">
            {titulo}
          </h2>
          <button
            type="button"
            onClick={() => fecharRef.current()}
            aria-label={TEXTOS_ACOES_CARTEIRA.modal.fechar}
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5 ${FOCO_MODAL}`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3">{children}</div>
        {rodape ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2.5 border-t border-gray-200 px-5 pt-3 pb-[18px] dark:border-gray-800">
            {rodape}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function PainelCelular({ aberto, onFechar, titulo, children, rodape }: ModalAnaliseProps) {
  useMobileHistoryLayer(aberto, onFechar, true);
  return (
    <BottomSheet
      isOpen={aberto}
      onClose={onFechar}
      title={titulo}
      footer={
        rodape ? <div className="flex flex-wrap gap-2 [&>*]:flex-1">{rodape}</div> : undefined
      }
    >
      <div data-modal-analise="" className="flex flex-col pt-1 pb-4">
        {children}
      </div>
    </BottomSheet>
  );
}

export default function ModalAnalise(props: ModalAnaliseProps) {
  const celular = useIsBelowLg();
  return celular ? <PainelCelular {...props} /> : <DialogoComputador {...props} />;
}

/**
 * Aviso fixo do consultor agindo pelo cliente (rec. 9): Ver, Planejar e Registrar continuam
 * disponíveis, mas gravam na carteira do cliente.
 */
export function AvisoConsultor({ className = '' }: { className?: string }) {
  const { actingClient } = useAuth();
  if (!actingClient) return null;
  const t = TEXTOS_ACOES_CARTEIRA.consultor;
  return (
    <p
      role="note"
      data-aviso-consultor=""
      className={`rounded-lg border-l-[3px] border-[#396CAA] bg-[#EDF2F8] px-3 py-2 text-[13px] text-gray-700 dark:border-[#6E9DC4] dark:bg-white/5 dark:text-gray-300 ${className}`}
    >
      {formatarTexto(t.aviso, { cliente: actingClient.name || t.clientePadrao })}
    </p>
  );
}
