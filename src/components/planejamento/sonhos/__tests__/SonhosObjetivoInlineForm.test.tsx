// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/wrappers';

const mockCsrfFetch = vi.fn();
vi.mock('@/hooks/useCsrf', () => ({
  useCsrf: () => ({ csrfFetch: mockCsrfFetch }),
}));

vi.mock('@/icons', () => ({
  DollarLineIcon: () => <svg />,
  ChevronDownIcon: () => <svg />,
}));

import SonhosObjetivoInlineForm from '@/components/planejamento/sonhos/SonhosObjetivoInlineForm';
import type { PlanejamentoObjetivoDTO } from '@/hooks/usePlanejamentoSonhos';

const mockDefaults = { rate: 0.0095, available: 12345.67 };

const renderForm = (objetivo: PlanejamentoObjetivoDTO | null = null) => {
  const queryClient = createTestQueryClient();
  const onCancel = vi.fn();
  const onSaved = vi.fn();
  const onDeleted = vi.fn();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <SonhosObjetivoInlineForm
        objetivo={objetivo}
        onCancel={onCancel}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onCancel, onSaved, onDeleted };
};

beforeEach(() => {
  vi.clearAllMocks();
  // global fetch mock pra /defaults — usado por usePlanejamentoDefaults
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.endsWith('/defaults')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockDefaults),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  }) as unknown as typeof fetch;
});

describe('SonhosObjetivoInlineForm', () => {
  it('renderiza com título "Novo objetivo" em modo criação', () => {
    renderForm(null);
    expect(screen.getByText(/Novo objetivo/i)).toBeInTheDocument();
  });

  it('aplica defaults (rate + saldo) quando endpoint retorna', async () => {
    renderForm(null);
    await waitFor(() => {
      const rateInput = screen.getByLabelText(/Rentab\. ao mês/i) as HTMLInputElement;
      expect(rateInput.value).toBe('0.95');
    });
    const availInput = screen.getByLabelText(/Saldo atual/i) as HTMLInputElement;
    expect(availInput.value).toBe('12345.67');
  });

  it('valida campos obrigatórios ao submeter', async () => {
    const { onSaved } = renderForm(null);
    // Aguarda defaults serem aplicados pra não interferir
    await waitFor(() =>
      expect((screen.getByLabelText(/Rentab\. ao mês/i) as HTMLInputElement).value).toBe('0.95'),
    );

    fireEvent.click(screen.getByRole('button', { name: /Criar objetivo/i }));
    expect(await screen.findByText(/Informe o nome/i)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('mostra aporte mensal sugerido quando meta + prazo preenchidos', async () => {
    renderForm(null);
    await waitFor(() =>
      expect((screen.getByLabelText(/Rentab\. ao mês/i) as HTMLInputElement).value).toBe('0.95'),
    );

    fireEvent.change(screen.getByLabelText(/Meta/i), { target: { value: '25000' } });
    fireEvent.change(screen.getByLabelText(/Prazo/i), { target: { value: '12' } });

    expect(await screen.findByText(/Aporte mensal:/i)).toBeInTheDocument();
    // Categoria auto = Curto Prazo (≤12 meses)
    expect(screen.getByText(/Curto Prazo/i)).toBeInTheDocument();
  });

  it('renderiza com nome + botão Excluir em modo edição', () => {
    const objetivo: PlanejamentoObjetivoDTO = {
      id: 'g1',
      name: 'Reserva Casa',
      target: 100000,
      months: 24,
      startDate: '2026-01',
      available: 5000,
      rate: 0.01,
      priority: 'Alta',
      category: 'm',
      status: 'Iniciado',
      notes: null,
      entries: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    renderForm(objetivo);
    expect(screen.getByText(/Editar — Reserva Casa/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Excluir/i })).toBeInTheDocument();
    // Em edit não aplica defaults: rate vem do objetivo (1.00%)
    expect((screen.getByLabelText(/Rentab\. ao mês/i) as HTMLInputElement).value).toBe('1.00');
  });

  it('cancelar chama onCancel', () => {
    const { onCancel } = renderForm(null);
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
