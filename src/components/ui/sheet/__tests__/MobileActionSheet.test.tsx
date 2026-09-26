// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MobileActionSheet, MobileMoreButton } from '../MobileActionSheet';
import BottomSheet from '../BottomSheet';

function stubMatchMedia(mobile: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: mobile,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

describe('MobileActionSheet', () => {
  beforeEach(() => stubMatchMedia(true));
  afterEach(() => {
    // @ts-expect-error — remove o stub
    delete window.matchMedia;
  });

  it('fecha e SÓ DEPOIS chama onSelect (próximo microtask)', async () => {
    const calls: string[] = [];
    const onClose = vi.fn(() => calls.push('close'));
    const onSelect = vi.fn(() => calls.push('select'));
    render(
      <MobileActionSheet
        isOpen
        onClose={onClose}
        title="Ações"
        subject="Financiamento"
        actions={[{ id: 'pdf', label: 'Exportar PDF', onSelect }]}
      />,
    );
    expect(document.querySelector('[data-mf-action-sheet]')).not.toBeNull();
    expect(screen.getByText('Financiamento')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar PDF' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
    await act(async () => {
      await Promise.resolve();
    });
    expect(calls).toEqual(['close', 'select']);
  });

  it('ação desabilitada não fecha nem chama onSelect', async () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    render(
      <MobileActionSheet
        isOpen
        onClose={onClose}
        title="Ações"
        actions={[{ id: 'x', label: 'Excluir', onSelect, disabled: true, hint: 'Sem permissão' }]}
      />,
    );
    const btn = screen.getByRole('button', { name: /Excluir/ });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    await act(async () => {
      await Promise.resolve();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('danger em vermelho da paleta', () => {
    render(
      <MobileActionSheet
        isOpen
        onClose={() => {}}
        title="Ações"
        actions={[{ id: 'del', label: 'Excluir dívida', onSelect: () => {}, danger: true }]}
      />,
    );
    const cls = screen.getByRole('button', { name: 'Excluir dívida' }).className;
    expect(cls).toContain('text-[#D92D20]');
    expect(cls).toContain('dark:text-[#F97066]');
  });

  it('Esc só fecha o sheet do topo', () => {
    const onCloseMenu = vi.fn();
    const onCloseTop = vi.fn();
    render(
      <>
        <MobileActionSheet
          isOpen
          onClose={onCloseMenu}
          title="Ações"
          actions={[{ id: 'a', label: 'A', onSelect: () => {} }]}
        />
        <BottomSheet isOpen onClose={onCloseTop} title="Confirmar">
          topo
        </BottomSheet>
      </>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCloseTop).toHaveBeenCalledTimes(1);
    expect(onCloseMenu).not.toHaveBeenCalled();
  });

  it('MobileMoreButton: 44x44, nome "Mais ações" e aria-haspopup', () => {
    const onClick = vi.fn();
    render(<MobileMoreButton onClick={onClick} />);
    const btn = screen.getByRole('button', { name: 'Mais ações' });
    expect(btn).toHaveAttribute('aria-haspopup', 'dialog');
    expect(btn.className).toContain('h-11');
    expect(btn.className).toContain('w-11');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalled();
  });
});
