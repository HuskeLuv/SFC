// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import type { CategoriaMovivel, MoverAlvo } from '@/types/carteiraMover';
import { opcoesKdif } from './fixtures';
import { EscolherSecaoPopover } from '../EscolherSecaoPopover';

const ALVO: MoverAlvo = {
  tipo: 'posicao',
  id: 'pf-kdif',
  categoria: 'fiis',
  secaoAtual: 'fofi',
  label: 'KDIF11',
};

function montar({
  comOpcoes = true,
  destino = 'fimFia',
}: { comOpcoes?: boolean; destino?: CategoriaMovivel } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  if (comOpcoes)
    queryClient.setQueryData(queryKeys.carteiraMover.opcoes('posicao', 'pf-kdif'), opcoesKdif());
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const onRecusado = vi.fn();
  const alca = document.createElement('button');
  alca.textContent = 'Arrastar KDIF11';
  document.body.appendChild(alca);
  const chip = document.createElement('div');
  document.body.appendChild(chip);
  alca.focus();
  render(
    <QueryClientProvider client={queryClient}>
      <EscolherSecaoPopover
        alvo={ALVO}
        destino={destino}
        anchorEl={chip}
        onConfirm={onConfirm}
        onCancel={onCancel}
        onRecusado={onRecusado}
      />
    </QueryClientProvider>,
  );
  return { onConfirm, onCancel, onRecusado, alca };
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(opcoesKdif())))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('EscolherSecaoPopover', () => {
  it('abre com a seção sugerida marcada e com o foco nela', () => {
    montar();
    const dialog = screen.getByRole('dialog', { name: 'Mover KDIF11 para Fundos' });
    const sugerida = within(dialog).getByRole('radio', { name: /FIP Infraestrutura/ });
    expect(sugerida).toBeChecked();
    expect(sugerida).toHaveFocus();
    expect(within(dialog).getByText('sugerida')).toBeInTheDocument();
  });

  it('mostra o aviso do objetivo antes de confirmar', () => {
    montar();
    expect(
      screen.getByText('O objetivo (%) volta para 0 na aba nova. Ajuste depois na aba.'),
    ).toBeInTheDocument();
  });

  it('confirma com a seção escolhida', () => {
    const { onConfirm } = montar();
    fireEvent.click(screen.getByRole('radio', { name: 'Fiagro' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mover para Fiagro' }));
    expect(onConfirm).toHaveBeenCalledWith('fiagro');
  });

  it('Esc cancela e devolve o foco à alça', () => {
    const { onCancel, alca } = montar();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(alca).toHaveFocus();
  });

  it('Cancelar também devolve o foco à alça', () => {
    const { onCancel, alca } = montar();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(alca).toHaveFocus();
  });

  it('sem as opções carregadas usa as seções da aba e o padrão', () => {
    montar({ comOpcoes: false });
    expect(screen.getAllByRole('radio')).toHaveLength(8);
    expect(screen.getByRole('radio', { name: /FIM/ })).toBeChecked();
  });

  it('enquanto as opções não chegam, "Mover" fica desabilitado em "Verificando…"', async () => {
    let responder: (r: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (responder = resolve))),
    );
    montar({ comOpcoes: false });
    expect(screen.getByRole('button', { name: 'Verificando…' })).toBeDisabled();
    responder(new Response(JSON.stringify(opcoesKdif())));
    expect(
      await screen.findByRole('button', { name: 'Mover para FIP Infraestrutura' }),
    ).toBeEnabled();
  });

  it('aba recusada quando as opções chegam: chama onRecusado com o motivo, sem confirmar', async () => {
    const { onRecusado, onConfirm } = montar({ comOpcoes: false, destino: 'stocks' });
    await waitFor(() => expect(onRecusado).toHaveBeenCalledWith('Em reais — esta aba é em dólar'));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
