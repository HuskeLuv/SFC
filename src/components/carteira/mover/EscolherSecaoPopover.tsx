'use client';

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from '@/components/ui/button/Button';
import { useMoverOpcoes } from '@/hooks/useMoverOpcoes';
import {
  AVISO_OBJETIVO_ZERA,
  SUBGRUPOS_POR_CATEGORIA,
  rotuloCategoria,
  subgrupoPadrao,
} from '@/lib/carteiraMover';
import type { EscolherSecaoPopoverProps } from '@/types/carteiraMover';

export const POPOVER_LARGURA = 320;
const MARGEM = 8;
const DISTANCIA = 10;

interface Posicao {
  left: number;
  bottom: number;
  seta: number;
}

const calcularPosicao = (anchor: HTMLElement): Posicao => {
  const rect = anchor.getBoundingClientRect();
  const largura = Math.min(POPOVER_LARGURA, window.innerWidth - MARGEM * 2);
  const centro = rect.left + rect.width / 2;
  const left = Math.min(
    Math.max(centro - largura / 2, MARGEM),
    window.innerWidth - largura - MARGEM,
  );
  return {
    left,
    bottom: window.innerHeight - rect.top + DISTANCIA,
    seta: Math.min(Math.max(centro - left, 20), largura - 20),
  };
};

/**
 * Popover "em qual seção?" ao soltar um item numa aba da bandeja "Outra aba" (D5). 320px,
 * abre ACIMA do chip da bandeja, chips-rádio de 34px (44px no celular) com a seção sugerida
 * já marcada, a linha do objetivo antes de confirmar e o primário "Mover para <seção>".
 * Esc, Cancelar e clique fora chamam `onCancel` e devolvem o foco a quem o tinha (a alça).
 */
export function EscolherSecaoPopover({
  alvo,
  destino,
  anchorEl,
  onConfirm,
  onCancel,
  onRecusado,
}: EscolherSecaoPopoverProps) {
  const baseId = useId();
  const tituloId = `${baseId}-titulo`;
  const painelRef = useRef<HTMLDivElement>(null);
  const focoAnteriorRef = useRef<HTMLElement | null>(
    typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null,
  );
  const { data: opcoes, isPending: verificando } = useMoverOpcoes(alvo.tipo, alvo.id);
  const opcaoDestino = opcoes?.destinos.find((d) => d.categoria === destino);
  const recusado = opcaoDestino?.permitido === false;
  const secoes =
    opcaoDestino?.subgrupos ??
    SUBGRUPOS_POR_CATEGORIA[destino].map((s) => ({ ...s, atual: false }));
  const sugerido = opcaoDestino?.subgrupoSugerido ?? subgrupoPadrao(destino);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const secao = escolhido ?? sugerido;
  const [posicao, setPosicao] = useState<Posicao | null>(null);

  const trocaAba = destino !== alvo.categoria;
  const avisos = trocaAba
    ? (opcaoDestino?.avisos ?? (alvo.tipo === 'posicao' ? [AVISO_OBJETIVO_ZERA] : []))
    : [];
  const aba = rotuloCategoria(destino);
  const rotuloSecao = secoes.find((s) => s.id === secao)?.label ?? secao;

  const devolverFoco = useCallback(() => {
    const anterior = focoAnteriorRef.current;
    if (anterior && document.contains(anterior)) anterior.focus();
  }, []);

  const cancelar = useCallback(() => {
    onCancel();
    devolverFoco();
  }, [devolverFoco, onCancel]);

  useLayoutEffect(() => {
    const atualizar = () => setPosicao(calcularPosicao(anchorEl));
    atualizar();
    window.addEventListener('resize', atualizar);
    window.addEventListener('scroll', atualizar, true);
    return () => {
      window.removeEventListener('resize', atualizar);
      window.removeEventListener('scroll', atualizar, true);
    };
  }, [anchorEl]);

  // Soltou no chip enquanto as opções ainda chegavam e a aba é recusada: fecha e avisa,
  // sem POST (o servidor recusaria do mesmo jeito).
  const motivoRecusa = recusado ? (opcaoDestino?.motivo ?? null) : undefined;
  useEffect(() => {
    if (motivoRecusa === undefined) return;
    onRecusado?.(motivoRecusa ?? undefined);
  }, [motivoRecusa, onRecusado]);

  // Foco na seção marcada ao abrir.
  useEffect(() => {
    const marcado = painelRef.current?.querySelector<HTMLInputElement>('input:checked');
    (marcado ?? painelRef.current)?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      cancelar();
    };
    const onPointerDown = (event: PointerEvent) => {
      const alvoEvento = event.target as Node | null;
      if (!alvoEvento) return;
      if (painelRef.current?.contains(alvoEvento) || anchorEl.contains(alvoEvento)) return;
      cancelar();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [anchorEl, cancelar]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={painelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={tituloId}
      tabIndex={-1}
      data-mf-escolher-secao=""
      style={{
        left: posicao?.left ?? 0,
        bottom: posicao?.bottom ?? 0,
        visibility: posicao ? 'visible' : 'hidden',
      }}
      className="fixed z-[99993] flex w-[min(320px,calc(100vw-16px))] flex-col gap-2.5 rounded-[14px] border border-gray-200 bg-white p-3.5 font-outfit shadow-xl outline-none dark:border-gray-700 dark:bg-gray-900"
    >
      <span
        aria-hidden="true"
        style={{ left: (posicao?.seta ?? 28) - 6 }}
        className="absolute -bottom-[7px] h-3 w-3 rotate-45 border-r border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
      />
      <h4 id={tituloId} className="text-[15px] font-semibold text-gray-900 dark:text-white">
        Mover {alvo.label} para {aba}
      </h4>
      <fieldset aria-label={`Seção em ${aba}`} className="m-0 flex flex-wrap gap-1.5 border-0 p-0">
        {secoes.map((s) => {
          const ehAtual = !trocaAba && s.id === alvo.secaoAtual;
          return (
            <label key={s.id} className="relative">
              <input
                type="radio"
                name={`${baseId}-secao`}
                value={s.id}
                checked={secao === s.id}
                disabled={ehAtual}
                onChange={() => setEscolhido(s.id)}
                className="peer absolute inset-0 m-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
              />
              <span className="inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 text-[13.5px] text-gray-700 peer-checked:border-mf-seguranca peer-checked:bg-mf-seguranca peer-checked:text-white peer-focus-visible:ring-[3px] peer-focus-visible:ring-mf-outside peer-disabled:cursor-not-allowed peer-disabled:border-dashed peer-disabled:opacity-60 max-lg:min-h-11 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:peer-checked:border-mf-patrimonio dark:peer-checked:bg-mf-patrimonio dark:peer-focus-visible:ring-mf-tranquilidade">
                {s.label}
                {s.id === sugerido && !ehAtual && (
                  <em className="text-[10.5px] font-semibold tracking-[.04em] uppercase not-italic opacity-80">
                    sugerida
                  </em>
                )}
              </span>
            </label>
          );
        })}
      </fieldset>
      {avisos.map((aviso) => (
        <p
          key={aviso}
          className="rounded-lg bg-gray-50 px-2 py-1.5 text-[12.5px] text-gray-800 dark:bg-white/[0.04] dark:text-white/90"
        >
          {/[.!?]$/.test(aviso) ? aviso : `${aviso}.`}
          {/objetivo/i.test(aviso) && ' Ajuste depois na aba.'}
        </p>
      ))}
      <p className="text-[12.5px] text-gray-500 dark:text-gray-400">
        Valores e rentabilidade não mudam. Alocação e relatórios passam a contar {alvo.label} em{' '}
        {aba}.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={cancelar}>
          Cancelar
        </Button>
        <Button
          size="sm"
          onClick={() => onConfirm(secao)}
          disabled={verificando || recusado || (!trocaAba && secao === alvo.secaoAtual)}
        >
          {verificando ? 'Verificando…' : `Mover para ${rotuloSecao}`}
        </Button>
      </div>
    </div>,
    document.body,
  );
}

export default EscolherSecaoPopover;
