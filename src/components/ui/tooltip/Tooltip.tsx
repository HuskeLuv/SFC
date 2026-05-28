'use client';

import React, { useState, useRef, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  /** Texto/HTML mostrado no tooltip. Strings simples são preferidas — renderizadas como text. */
  content: React.ReactNode;
  /** Trigger element (ícone, texto, badge etc.) */
  children: React.ReactElement;
  /** Posição preferida. Default 'top'. */
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /** Delay em ms antes do tooltip aparecer no hover. Default 200ms. */
  delay?: number;
  /** Largura máxima do tooltip. Default 280px. */
  maxWidth?: number;
}

/**
 * Componente único de tooltip do sistema (#13 do checklist mai/28).
 *
 * Usa portal pra evitar overflow:hidden de containers. Trigger por
 * mouseEnter/focusIn pra cobrir teclado e mouse. ESC fecha.
 *
 * Inspirado no CommentIndicator do cashflow mas extraído pra reuso —
 * migrar `<span title={...}>ⓘ</span>` que estavam dependendo do tooltip
 * nativo do browser (delay > 1s, visual feio).
 */
export default function Tooltip({
  content,
  children,
  placement = 'top',
  delay = 200,
  maxWidth = 280,
}: TooltipProps) {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();

  const computePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    // Ajusta conforme placement; portal renderiza em document.body, então
    // soma scroll pra coordenadas absolute funcionarem com scrollbar.
    switch (placement) {
      case 'bottom':
        setPosition({ top: rect.bottom + scrollY + 6, left: rect.left + scrollX + rect.width / 2 });
        break;
      case 'left':
        setPosition({ top: rect.top + scrollY + rect.height / 2, left: rect.left + scrollX - 6 });
        break;
      case 'right':
        setPosition({ top: rect.top + scrollY + rect.height / 2, left: rect.right + scrollX + 6 });
        break;
      case 'top':
      default:
        setPosition({ top: rect.top + scrollY - 6, left: rect.left + scrollX + rect.width / 2 });
        break;
    }
  };

  const open = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      computePosition();
      setShow(true);
    }, delay);
  };

  const close = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShow(false);
  };

  useEffect(() => {
    if (!show) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShow(false);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [show]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const transform =
    placement === 'top'
      ? 'translate(-50%, -100%)'
      : placement === 'bottom'
        ? 'translate(-50%, 0)'
        : placement === 'left'
          ? 'translate(-100%, -50%)'
          : 'translate(0, -50%)';

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
        aria-describedby={show ? tooltipId : undefined}
        className="inline-flex"
      >
        {children}
      </span>
      {show &&
        typeof window !== 'undefined' &&
        createPortal(
          <div
            id={tooltipId}
            role="tooltip"
            className="pointer-events-none fixed z-[9999] rounded-md bg-gray-900 px-3 py-1.5 text-xs leading-relaxed text-white shadow-lg dark:bg-gray-700"
            style={{
              top: position.top,
              left: position.left,
              transform,
              maxWidth,
              position: 'absolute',
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
