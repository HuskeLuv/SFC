'use client';

import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import Button from '@/components/ui/button/Button';
import { lockBodyScroll } from '@/lib/ui/scrollLock';
import { DestinoAbaList, rotuloAtual } from './DestinoAbaList';
import type { FluxoMover } from './MoverInvestimento';
import { TEXTO_IMPACTO } from './MoverInvestimento';
import { EfeitosMoverList } from './EfeitosMoverList';

/** Rodapé do diálogo da fase 2 antes de escolher uma aba. */
export const TEXTO_ESCOLHA_ABA_CAIXA_RF =
  'Escolha uma aba para ver o efeito na Saúde Financeira, na Alocação e no Fluxo.';

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

export const SPINNER = (
  <svg
    className="h-4 w-4 motion-safe:animate-spin motion-reduce:animate-[spin_2s_linear_infinite]"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

/**
 * Diálogo "Mover <ativo>" do computador (D10): 600px, raio de 18px, rodapé fixo com o impacto
 * (`aria-live=polite`, para a linha do objetivo ser lida ao trocar de aba). `role=dialog`,
 * `aria-modal`, foco preso e devolvido ao gatilho; Esc e clique fora fecham (não durante a
 * gravação).
 */
export default function MoverInvestimentoDialog({
  open,
  fluxo,
}: {
  open: boolean;
  fluxo: FluxoMover;
}) {
  const painelRef = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  const descId = useId();
  const fecharRef = useRef(fluxo.fechar);
  useEffect(() => {
    fecharRef.current = fluxo.fechar;
  }, [fluxo.fechar]);

  useEffect(() => {
    if (!open) return;
    const gatilho = document.activeElement as HTMLElement | null;
    const liberar = lockBodyScroll();
    painelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        fecharRef.current();
        return;
      }
      if (event.key !== 'Tab' || !painelRef.current) return;
      const focaveis = Array.from(painelRef.current.querySelectorAll<HTMLElement>(FOCAVEIS));
      if (focaveis.length === 0) return;
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
      if (gatilho && document.contains(gatilho)) gatilho.focus();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;
  const { opcoes } = fluxo;

  let corpo: React.ReactNode;
  if (fluxo.carregando) {
    corpo = (
      <p className="flex items-center gap-2 py-6 text-sm text-gray-500 dark:text-gray-400">
        {SPINNER} Carregando opções…
      </p>
    );
  } else if (fluxo.erroCarregar || !opcoes) {
    corpo = (
      <div className="flex flex-col items-start gap-2 py-4 text-sm text-gray-600 dark:text-gray-300">
        <p role="alert">Não foi possível carregar as opções.</p>
        <button
          type="button"
          onClick={fluxo.recarregar}
          className="font-semibold text-mf-patrimonio underline underline-offset-[3px] dark:text-mf-tranquilidade"
        >
          Tentar de novo
        </button>
      </div>
    );
  } else if (!opcoes.movivel) {
    corpo = (
      <p className="py-4 text-sm text-gray-600 dark:text-gray-300">
        {opcoes.motivo ?? 'Este ativo ainda não pode ser movido para outra aba'}.
      </p>
    );
  } else {
    corpo = (
      <DestinoAbaList
        variante="dialog"
        opcoes={opcoes}
        escolha={fluxo.escolha}
        onEscolher={fluxo.escolher}
        disabled={fluxo.salvando}
      />
    );
  }

  const podeMover = !!opcoes?.movivel && !fluxo.carregando;

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 font-outfit"
      data-mf-mover-dialog=""
    >
      <div
        className="fixed inset-0 bg-mf-potencia/45"
        aria-hidden="true"
        onClick={() => fluxo.fechar()}
      />
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={opcoes ? descId : undefined}
        tabIndex={-1}
        className="relative flex max-h-[calc(100dvh-32px)] w-[min(600px,100%)] flex-col rounded-[18px] bg-white shadow-xl outline-none dark:bg-gray-900"
      >
        <div className="shrink-0 px-5 pt-5 pb-3">
          <h2 id={tituloId} className="text-lg font-semibold text-gray-900 dark:text-white">
            Mover {fluxo.rotulo}
          </h2>
          {opcoes && (
            <p id={descId} className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              Hoje em{' '}
              <b className="font-semibold text-gray-800 dark:text-white/90">
                {rotuloAtual(opcoes)}
              </b>
              .
              {podeMover &&
                (fluxo.caixaRf
                  ? ' Muda só onde ele aparece na Carteira.'
                  : ' Escolha a seção desta aba ou de outra aba compatível.')}
            </p>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3">{corpo}</div>
        <div className="flex shrink-0 flex-col gap-2.5 border-t border-gray-100 px-5 pt-3 pb-4 dark:border-gray-800">
          {podeMover && fluxo.caixaRf && (
            <div
              aria-live="polite"
              data-mf-mover-impacto="caixaRf"
              className="rounded-[10px] bg-gray-50 px-3 py-2.5 text-[13px] text-gray-600 dark:bg-white/[0.04] dark:text-gray-300"
            >
              {fluxo.efeitos.length > 0 ? (
                <EfeitosMoverList efeitos={fluxo.efeitos} />
              ) : (
                <p>{TEXTO_ESCOLHA_ABA_CAIXA_RF}</p>
              )}
              {fluxo.avisos.map((aviso) => (
                <p key={aviso} className="mt-1.5 text-gray-800 dark:text-white/90">
                  {aviso}
                </p>
              ))}
            </div>
          )}
          {podeMover && !fluxo.caixaRf && (
            <div
              aria-live="polite"
              className="rounded-[10px] bg-gray-50 px-3 py-2.5 text-[12.5px] text-gray-500 dark:bg-white/[0.04] dark:text-gray-400"
            >
              <p>
                <b className="font-semibold text-gray-800 dark:text-white/90">O que muda:</b>{' '}
                {TEXTO_IMPACTO.muda.replace('o ativo', fluxo.rotulo)}{' '}
                <b className="font-semibold text-gray-800 dark:text-white/90">Não muda:</b>{' '}
                {TEXTO_IMPACTO.naoMuda}
              </p>
              {fluxo.avisos.map((aviso) => (
                <p key={aviso} className="mt-1 text-gray-800 dark:text-white/90">
                  {aviso}
                </p>
              ))}
            </div>
          )}
          {fluxo.erro && (
            <p
              role="alert"
              className="rounded-[10px] border border-[#D92D20] bg-white px-3 py-2 text-[13px] text-[#D92D20] dark:border-[#F97066]/50 dark:bg-transparent dark:text-[#F97066]"
            >
              {fluxo.erro}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fluxo.fechar()}
              disabled={fluxo.salvando}
            >
              {podeMover ? 'Cancelar' : 'Fechar'}
            </Button>
            {podeMover && (
              <Button size="sm" onClick={fluxo.confirmar} disabled={!fluxo.mudou || fluxo.salvando}>
                {fluxo.salvando ? (
                  <>
                    {SPINNER}
                    Movendo…
                  </>
                ) : (
                  fluxo.rotuloPrimario
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
