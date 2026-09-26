// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  useResponsiveConfirm,
  type ConfirmOptions,
  type ResponsiveConfirm,
} from '../useResponsiveConfirm';

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

let api: ResponsiveConfirm;
function Harness() {
  api = useResponsiveConfirm();
  const [n] = useState(0);
  return <div data-n={n}>{api.confirmSheet}</div>;
}

const OPTS: ConfirmOptions = {
  desktopMessage: 'Desfazer esta alteração?\n\nEditou o objetivo',
  title: 'Desfazer alteração?',
  message: 'Editou o objetivo',
  confirmLabel: 'Desfazer',
  busyLabel: 'Desfazendo…',
  danger: true,
};

describe('useResponsiveConfirm — desktop', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error — remove o stub
    delete window.matchMedia;
  });

  it('window.confirm com a string EXATA', async () => {
    stubMatchMedia(false);
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Harness />);
    await expect(api.confirm(OPTS)).resolves.toBe(false);
    expect(spy).toHaveBeenCalledWith('Desfazer esta alteração?\n\nEditou o objetivo');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sem desktopMessage resolve true sem chamar confirm', async () => {
    stubMatchMedia(false);
    const spy = vi.spyOn(window, 'confirm');
    render(<Harness />);
    await expect(api.confirm({ ...OPTS, desktopMessage: undefined })).resolves.toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('confirmAndRun: confirma, executa e o erro propaga ao chamador', async () => {
    stubMatchMedia(false);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Harness />);
    const action = vi.fn().mockRejectedValue(new Error('falhou'));
    await expect(api.confirmAndRun(OPTS, action)).rejects.toThrow('falhou');
    expect(action).toHaveBeenCalledTimes(1);
  });
});

describe('useResponsiveConfirm — celular', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error — remove o stub
    delete window.matchMedia;
  });

  it('sheet alertdialog, foco no Cancelar; Cancelar resolve false', async () => {
    stubMatchMedia(true);
    const spy = vi.spyOn(window, 'confirm');
    render(<Harness />);
    let result: Promise<boolean>;
    act(() => {
      result = api.confirm(OPTS);
    });
    const alert = await screen.findByRole('alertdialog', { name: 'Desfazer alteração?' });
    expect(alert).toBeInTheDocument();
    const cancelar = screen.getByRole('button', { name: 'Cancelar' });
    expect(document.activeElement).toBe(cancelar);
    fireEvent.click(cancelar);
    await expect(result!).resolves.toBe(false);
    expect(spy).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('Esc resolve false', async () => {
    stubMatchMedia(true);
    render(<Harness />);
    let result: Promise<boolean>;
    act(() => {
      result = api.confirm(OPTS);
    });
    await screen.findByRole('alertdialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    await expect(result!).resolves.toBe(false);
  });

  it('confirmAndRun com erro: sheet aberto, alert, "Tentar de novo" → true', async () => {
    stubMatchMedia(true);
    render(<Harness />);
    const action = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('Sem conexão'))
      .mockResolvedValueOnce(undefined);
    let result: Promise<boolean>;
    act(() => {
      result = api.confirmAndRun(OPTS, action);
    });
    const desfazer = await screen.findByRole('button', { name: 'Desfazer' });
    await act(async () => fireEvent.click(desfazer));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'Tentar de novo' });
    await act(async () => fireEvent.click(retry));
    await expect(result!).resolves.toBe(true);
    expect(action).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('enquanto roda, Cancelar e Esc ficam bloqueados', async () => {
    stubMatchMedia(true);
    render(<Harness />);
    let finish!: () => void;
    const action = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    let result: Promise<boolean>;
    act(() => {
      result = api.confirmAndRun(OPTS, action);
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Desfazer' }));
    expect(await screen.findByRole('button', { name: /Desfazendo/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await act(async () => finish());
    await expect(result!).resolves.toBe(true);
  });
});
