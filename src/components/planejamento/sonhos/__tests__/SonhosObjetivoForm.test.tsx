// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/wrappers';
import { mockFetchResponse } from '@/test/mocks/fetch';

vi.mock('@/icons', () => ({
  ChevronDownIcon: () => <svg data-testid="chev-down" />,
}));

import SonhosObjetivoForm from '@/components/planejamento/sonhos/SonhosObjetivoForm';
import type { PlanejamentoObjetivoDTO } from '@/hooks/usePlanejamentoSonhos';

const mockCsrfFetch = vi.fn();

vi.mock('@/hooks/useCsrf', () => ({
  useCsrf: () => ({ csrfFetch: mockCsrfFetch, getCsrfToken: vi.fn() }),
}));

function renderForm(objetivo: PlanejamentoObjetivoDTO | null = null) {
  const queryClient = createTestQueryClient();
  const onCancel = vi.fn();
  const onSaved = vi.fn();
  const onDeleted = vi.fn();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <SonhosObjetivoForm
        objetivo={objetivo}
        onCancel={onCancel}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onCancel, onSaved, onDeleted };
}

const sample: PlanejamentoObjetivoDTO = {
  id: 'g1',
  name: 'Reserva',
  target: 25000,
  months: 12,
  startDate: '2026-01',
  available: 5000,
  rate: 0.01,
  priority: 'Alta',
  category: 'c',
  status: 'Iniciado',
  notes: 'cdb',
  entries: [],
  createdAt: '',
  updatedAt: '',
};

describe('SonhosObjetivoForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mostra "Novo Objetivo" no modo create', () => {
    renderForm(null);
    expect(screen.getByText(/Novo Objetivo/i)).toBeInTheDocument();
  });

  it('mostra título de edição quando recebe objetivo existente', () => {
    renderForm(sample);
    expect(screen.getByText(/Editar — Reserva/)).toBeInTheDocument();
  });

  it('valida campos obrigatórios e não chama API quando inválido', async () => {
    renderForm(null);
    fireEvent.click(screen.getByRole('button', { name: /Criar objetivo/i }));
    await waitFor(() => {
      expect(screen.getByText(/Informe o nome/i)).toBeInTheDocument();
    });
    expect(mockCsrfFetch).not.toHaveBeenCalled();
  });

  it('calcula aporte mensal automaticamente após preencher target+months+rate', async () => {
    renderForm(null);

    fireEvent.change(screen.getByLabelText(/Passo 1/), { target: { value: 'Carro' } });
    fireEvent.change(screen.getByLabelText(/Passo 2/), { target: { value: '12000' } });
    fireEvent.change(screen.getByLabelText(/Passo 3/), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText(/Passo 6/), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/Passo 7/), { target: { value: '0' } });

    // Sem juros: 12000 / 12 = 1000. Display "R$ 1.000,00".
    await waitFor(() => {
      expect(screen.getByText(/R\$ 1\.000,00/)).toBeInTheDocument();
    });
  });

  it('submete payload correto na criação', async () => {
    mockCsrfFetch.mockResolvedValueOnce(
      mockFetchResponse({ objetivo: { ...sample, id: 'new1' } }, 201),
    );
    const { onSaved } = renderForm(null);

    fireEvent.change(screen.getByLabelText(/Passo 1/), { target: { value: 'Reserva' } });
    fireEvent.change(screen.getByLabelText(/Passo 2/), { target: { value: '25000' } });
    fireEvent.change(screen.getByLabelText(/Passo 3/), { target: { value: '12' } });

    fireEvent.click(screen.getByRole('button', { name: /Criar objetivo/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('new1'));
    expect(mockCsrfFetch).toHaveBeenCalledWith(
      '/api/planejamento-sonhos',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('cancel chama onCancel', () => {
    const { onCancel } = renderForm(sample);
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
