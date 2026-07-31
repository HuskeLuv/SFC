// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/wrappers';
import { ImportPlanilhaModal } from '../ImportPlanilhaModal';
import type { FlcImportPlan } from '@/services/cashflow/import/mapFlcToCashflow';

const mockCsrfFetch = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useCsrf', () => ({
  useCsrf: () => ({ csrfFetch: mockCsrfFetch }),
}));

const plan: FlcImportPlan = {
  grupos: [
    {
      chave: 'habitacao',
      nomePlanilha: 'Habitação',
      destino: { groupId: 'g-1', nome: 'Habitação' },
      itens: [
        {
          linha: 10,
          label: 'Aluguel',
          destino: { tipo: 'existente', itemId: 'i-1', nome: 'Aluguel' },
          escritas: [{ mes: 0, valor: 1500 }],
          conflitos: [{ mes: 1, valorPlanilha: 200, valorApp: 100 }],
          jaIguais: [],
        },
      ],
    },
  ],
  ignorados: [{ linha: 60, label: 'Inflação Pessoal', motivo: 'calculada no app' }],
  avisos: ['um aviso qualquer'],
  resumo: { itensNovos: 0, celulas: 1, conflitos: 1, jaIguais: 0, ignorados: 1 },
};

const previewResponse = { ano: 2026, arquivo: 'flc.xlsx', plan };
const commitResponse = {
  success: true,
  relatorio: {
    itensCriados: 0,
    celulasGravadas: 2,
    conflitosSobrescritos: 1,
    conflitosMantidos: 0,
    erros: [],
  },
  groups: [{ id: 'g-1' }],
};

const jsonResponse = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

const renderModal = (props: Partial<React.ComponentProps<typeof ImportPlanilhaModal>> = {}) => {
  const queryClient = createTestQueryClient();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ImportPlanilhaModal isOpen onClose={vi.fn()} year={2026} {...props} />
    </QueryClientProvider>,
  );
  return { queryClient, ...utils };
};

const escolherArquivo = () => {
  const file = new File(['fake'], 'flc.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
};

describe('ImportPlanilhaModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passo upload: botão de prévia só habilita com arquivo escolhido', async () => {
    renderModal();

    const gerar = screen.getByRole('button', { name: /gerar prévia/i });
    expect(gerar).toBeDisabled();
    escolherArquivo();
    expect(gerar).toBeEnabled();
  });

  it('fluxo completo: prévia (resumo + conflitos + política) → commit → resultado', async () => {
    mockCsrfFetch
      .mockResolvedValueOnce(jsonResponse(previewResponse))
      .mockResolvedValueOnce(jsonResponse(commitResponse));
    const { queryClient } = renderModal();
    const setQueryData = vi.spyOn(queryClient, 'setQueryData');

    escolherArquivo();
    fireEvent.click(screen.getByRole('button', { name: /gerar prévia/i }));

    // prévia: resumo, aviso e conflito visíveis
    await waitFor(() => expect(screen.getByText(/nada foi gravado ainda/i)).toBeInTheDocument());
    expect(screen.getByText('células a gravar')).toBeInTheDocument();
    expect(screen.getByText(/um aviso qualquer/)).toBeInTheDocument();
    expect(screen.getByText(/Habitação › Aluguel/)).toBeInTheDocument();

    // muda a política de conflito e importa
    fireEvent.click(screen.getByLabelText(/manter valores do app/i));
    fireEvent.click(screen.getByRole('button', { name: /importar no ano 2026/i }));

    await waitFor(() => expect(screen.getByText(/concluída com sucesso/i)).toBeInTheDocument());
    expect(screen.getByText('células gravadas')).toBeInTheDocument();

    // commit levou a política escolhida e o cache do ano foi atualizado
    const commitForm = mockCsrfFetch.mock.calls[1][1].body as FormData;
    expect(commitForm.get('politicaConflito')).toBe('manter');
    expect(commitForm.get('ano')).toBe('2026');
    expect(setQueryData).toHaveBeenCalledWith(['cashflow', 2026], commitResponse.groups);
  });

  it('erro da API aparece no modal sem sair do passo de upload', async () => {
    mockCsrfFetch.mockResolvedValueOnce(jsonResponse({ error: 'Aba não encontrada' }, 400));
    renderModal();

    escolherArquivo();
    fireEvent.click(screen.getByRole('button', { name: /gerar prévia/i }));

    await waitFor(() => expect(screen.getByText('Aba não encontrada')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /gerar prévia/i })).toBeInTheDocument();
  });

  it('fechado não renderiza nada', () => {
    renderModal({ isOpen: false });
    expect(screen.queryByText(/importar planilha flc/i)).not.toBeInTheDocument();
  });
});
