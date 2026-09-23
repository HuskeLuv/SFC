// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '../index';

beforeEach(() => {
  document.body.style.overflow = '';
});

describe('Modal', () => {
  it('não renderiza nada fechado', () => {
    render(
      <Modal isOpen={false} onClose={vi.fn()}>
        conteúdo
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('expõe role=dialog e aria-modal=true no conteúdo', () => {
    render(
      <Modal isOpen onClose={vi.fn()}>
        conteúdo
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent('conteúdo');
  });

  it('Esc chama onClose', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose}>
        conteúdo
      </Modal>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clique no overlay chama onClose; clique dentro não', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal isOpen onClose={onClose}>
        <p>dentro</p>
      </Modal>,
    );
    fireEvent.click(screen.getByText('dentro'));
    expect(onClose).not.toHaveBeenCalled();

    const overlay = container.querySelector('.backdrop-blur-\\[32px\\]') as HTMLElement;
    expect(overlay).not.toBeNull();
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('botão X tem aria-label "Fechar" e chama onClose', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose}>
        conteúdo
      </Modal>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('showCloseButton=false esconde o X', () => {
    render(
      <Modal isOpen onClose={vi.fn()} showCloseButton={false}>
        conteúdo
      </Modal>,
    );
    expect(screen.queryByRole('button', { name: 'Fechar' })).toBeNull();
  });

  it('mantém as classes do desktop e só acrescenta variantes max-lg/lg', () => {
    render(
      <Modal isOpen onClose={vi.fn()} className="max-w-[600px] p-6">
        conteúdo
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    const wrapper = dialog.parentElement as HTMLElement;

    for (const cls of ['fixed', 'inset-0', 'flex', 'items-center', 'justify-center', 'z-99999']) {
      expect(wrapper).toHaveClass(cls);
    }
    expect(wrapper).toHaveClass('max-lg:items-end', 'max-lg:overflow-hidden');

    for (const cls of ['relative', 'w-full', 'rounded-3xl', 'bg-white', 'max-w-[600px]', 'p-6']) {
      expect(dialog).toHaveClass(cls);
    }
    expect(dialog).toHaveClass('max-lg:rounded-b-none', 'max-lg:overflow-y-auto');
    expect(dialog).toHaveAttribute('data-mf-sheet');

    // Toda classe nova é max-lg:* ou lg:hidden — nenhuma vale no desktop.
    const handle = dialog.querySelector('[aria-hidden]') as HTMLElement;
    expect(handle).toHaveClass('lg:hidden');
  });

  it('fullscreen: sem overlay, sem alça, h-dvh só abaixo de lg', () => {
    render(
      <Modal isOpen onClose={vi.fn()} isFullscreen>
        conteúdo
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('w-full', 'h-full', 'max-lg:h-dvh');
    expect(dialog).not.toHaveAttribute('data-mf-sheet');
    expect(dialog.parentElement).not.toHaveClass('max-lg:items-end');
    expect(dialog.querySelector('.lg\\:hidden')).toBeNull();
  });

  it('trava o body enquanto aberto e restaura ao fechar', () => {
    document.body.style.overflow = 'auto';
    const { rerender } = render(
      <Modal isOpen onClose={vi.fn()}>
        conteúdo
      </Modal>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    rerender(
      <Modal isOpen={false} onClose={vi.fn()}>
        conteúdo
      </Modal>,
    );
    expect(document.body.style.overflow).toBe('auto');
  });

  it('dois modais aninhados: fechar o de dentro mantém o body travado', () => {
    const Harness = ({ inner }: { inner: boolean }) => (
      <>
        <Modal isOpen onClose={vi.fn()}>
          externo
        </Modal>
        <Modal isOpen={inner} onClose={vi.fn()}>
          interno
        </Modal>
      </>
    );
    const { rerender, unmount } = render(<Harness inner />);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<Harness inner={false} />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
