// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MobileSaveToast } from '../MobileSaveToast';

/** DOM da fase 1 (sem ação), gravado do componente ANTES da fase 2 — tem que continuar igual. */
const FASE1_DOM =
  '<div role="status" aria-live="polite" data-mf-save-toast="" class="pointer-events-none fixed inset-x-4 z-[99992] flex justify-center lg:hidden" style="bottom: calc(72px + env(safe-area-inset-bottom));"><button type="button" class="pointer-events-auto flex min-h-11 max-w-full items-center gap-2 rounded-xl bg-mf-potencia px-4 py-2.5 text-left text-sm font-medium text-white shadow-lg motion-safe:animate-[mf-fade-in_180ms_ease-out] dark:bg-mf-escolha dark:text-mf-potencia"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg><span class="min-w-0">Salvo</span></button></div>';

const toast = () => document.querySelector('[data-mf-save-toast]') as HTMLElement;

describe('MobileSaveToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('sem ação (fase 1)', () => {
    it('DOM idêntico ao da fase 1', () => {
      render(<MobileSaveToast message="Salvo" onDismiss={() => {}} />);
      expect(toast().outerHTML).toBe(FASE1_DOM);
    });

    it('some em 4s ou no toque', () => {
      const onDismiss = vi.fn();
      render(<MobileSaveToast message="Salvo" onDismiss={onDismiss} />);
      act(() => {
        vi.advanceTimersByTime(3999);
      });
      expect(onDismiss).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(onDismiss).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole('button', { name: 'Salvo' }));
      expect(onDismiss).toHaveBeenCalledTimes(2);
    });

    it('fechado (message null) deixa só a região viva vazia', () => {
      render(<MobileSaveToast message={null} onDismiss={() => {}} />);
      expect(toast()).toBeEmptyDOMElement();
    });
  });

  describe('com ação (fase 2)', () => {
    it('texto no status e botão separado com a cor da ação', () => {
      render(
        <MobileSaveToast
          message="Lançado em Supermercado"
          onDismiss={() => {}}
          action={{ label: 'Desfazer', onClick: () => {} }}
        />,
      );
      const status = screen.getByRole('status');
      expect(status).toHaveTextContent('Lançado em Supermercado');
      const button = screen.getByRole('button', { name: 'Desfazer' });
      expect(status).toContainElement(button);
      expect(button.className).toContain('min-h-11');
      expect(button.className).toContain('text-mf-tranquilidade');
      expect(button.className).toContain('dark:text-mf-seguranca');
      // O texto não é mais um botão (o toque é só na ação).
      expect(screen.queryByRole('button', { name: /Lançado/ })).not.toBeInTheDocument();
    });

    it('tocar na ação chama onClick e fecha', () => {
      const onClick = vi.fn();
      const onDismiss = vi.fn();
      render(
        <MobileSaveToast
          message="Lançado"
          onDismiss={onDismiss}
          action={{ label: 'Desfazer', onClick }}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('fica 6s na tela por padrão', () => {
      const onDismiss = vi.fn();
      render(
        <MobileSaveToast
          message="Lançado"
          onDismiss={onDismiss}
          action={{ label: 'Desfazer', onClick: () => {} }}
        />,
      );
      act(() => {
        vi.advanceTimersByTime(5999);
      });
      expect(onDismiss).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('durationMs explícito vale também com ação', () => {
      const onDismiss = vi.fn();
      render(
        <MobileSaveToast
          message="Lançado"
          durationMs={2000}
          onDismiss={onDismiss}
          action={{ label: 'Desfazer', onClick: () => {} }}
        />,
      );
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });
});
