// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockCsrfFetch = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useCsrf', () => ({ useCsrf: () => ({ csrfFetch: mockCsrfFetch }) }));

import SairTodosDispositivos from '../SairTodosDispositivos';

describe('SairTodosDispositivos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pede confirmação antes de chamar a API', () => {
    render(<SairTodosDispositivos />);
    fireEvent.click(screen.getByRole('button', { name: 'Sair de todos os dispositivos' }));

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    expect(mockCsrfFetch).not.toHaveBeenCalled();
  });

  it('Cancelar volta ao botão sem chamar a API', () => {
    render(<SairTodosDispositivos />);
    fireEvent.click(screen.getByRole('button', { name: 'Sair de todos os dispositivos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mockCsrfFetch).not.toHaveBeenCalled();
  });

  it('confirmado: DELETE /api/profile/sessoes', async () => {
    mockCsrfFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
    render(<SairTodosDispositivos />);
    fireEvent.click(screen.getByRole('button', { name: 'Sair de todos os dispositivos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim, sair de todos' }));

    await waitFor(() =>
      expect(mockCsrfFetch).toHaveBeenCalledWith('/api/profile/sessoes', { method: 'DELETE' }),
    );
  });

  it('mostra o erro da API', async () => {
    mockCsrfFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Sessão expirada' }),
    });
    render(<SairTodosDispositivos />);
    fireEvent.click(screen.getByRole('button', { name: 'Sair de todos os dispositivos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim, sair de todos' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Sessão expirada');
  });
});
