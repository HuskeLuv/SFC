// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import Step3Asset from '../Step3Asset';
import type { WizardFormData, WizardErrors } from '@/types/wizard';

/**
 * Bug #05 (relatório Maio/2026): autocomplete bloqueava seleção em ações
 * brasileiras. Três regressões a defender:
 *  1. Quando uma busca retorna resultados, o erro "Nenhum encontrado" de
 *     uma busca anterior precisa ser limpo.
 *  2. Respostas chegando fora de ordem não podem sobrescrever resultados
 *     mais recentes (`searchSeqRef` counter).
 *  3. Fetch é debounced — keystrokes rápidos disparam apenas 1 fetch (segundo
 *     passe Maio/2026).
 */

const baseFormData = (): WizardFormData =>
  ({
    operacao: 'novo-ativo',
    tipoAtivo: 'acoes-brasil',
    ativo: '',
    assetId: '',
    instituicaoId: 'inst-1',
  }) as unknown as WizardFormData;

const renderStep3 = (initialErrors: WizardErrors = {}) => {
  let formData = baseFormData();
  let errors: WizardErrors = initialErrors;
  const handleForm = vi.fn((patch: Partial<WizardFormData>) => {
    formData = { ...formData, ...patch } as WizardFormData;
  });
  const handleErrors = vi.fn((patch: Partial<WizardErrors>) => {
    errors = { ...errors, ...patch };
  });
  const utils = render(
    <Step3Asset
      formData={formData}
      errors={errors}
      onFormDataChange={handleForm}
      onErrorsChange={handleErrors}
    />,
  );
  return {
    ...utils,
    handleForm,
    handleErrors,
    rerender: (newErrors?: WizardErrors) =>
      utils.rerender(
        <Step3Asset
          formData={formData}
          errors={newErrors ?? errors}
          onFormDataChange={handleForm}
          onErrorsChange={handleErrors}
        />,
      ),
    getInput: () => screen.getByLabelText(/Ativo \*/i) as HTMLInputElement,
  };
};

const makeFetchResponse = (body: unknown) =>
  ({
    ok: true,
    json: () => Promise.resolve(body),
  }) as Response;

describe('Step3Asset autocomplete — Bug #05', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('limpa erro "Nenhum encontrado" quando a busca subsequente retorna resultados', async () => {
    let resolveFirst: (r: Response) => void = () => {};
    let resolveSecond: (r: Response) => void = () => {};

    global.fetch = vi
      .fn()
      .mockImplementationOnce(() => new Promise<Response>((res) => (resolveFirst = res)))
      .mockImplementationOnce(() => new Promise<Response>((res) => (resolveSecond = res)));

    const { handleErrors, getInput } = renderStep3();

    // 1ª busca: "CSM" — debounce + fetch + resposta vazia
    fireEvent.change(getInput(), { target: { value: 'CSM' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(260);
    });
    await act(async () => {
      resolveFirst(makeFetchResponse({ assets: [] }));
    });

    // 2ª busca: "CSMG3" — debounce + fetch + resposta com 1 resultado
    fireEvent.change(getInput(), { target: { value: 'CSMG3' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(260);
    });
    await act(async () => {
      resolveSecond(
        makeFetchResponse({
          assets: [
            {
              id: 'acao:abc',
              symbol: 'CSMG3',
              name: 'Copasa',
              type: 'acao',
            },
          ],
        }),
      );
    });

    // O último onErrorsChange precisa ser `undefined`, não 'Nenhum encontrado'.
    await waitFor(() => {
      const ativoErrorCalls = handleErrors.mock.calls.map((c) => c[0]?.ativo);
      const lastWithAtivo = ativoErrorCalls[ativoErrorCalls.length - 1];
      expect(lastWithAtivo).toBeUndefined();
    });
  });

  it('searchSeqRef ignora resposta tardia de busca obsoleta', async () => {
    // Cenário: 2 fetches separados (debounce passou entre eles), a resposta
    // da 1ª chega DEPOIS da 2ª. Sem `searchSeqRef`, options=[] da 1ª
    // sobrescreveria options=[CSMG3] da 2ª.
    let resolveFirst: (r: Response) => void = () => {};
    let resolveSecond: (r: Response) => void = () => {};

    global.fetch = vi
      .fn()
      .mockImplementationOnce(() => new Promise<Response>((res) => (resolveFirst = res)))
      .mockImplementationOnce(() => new Promise<Response>((res) => (resolveSecond = res)));

    const { getInput } = renderStep3();

    // 1ª busca dispara, mas resposta fica pendente
    fireEvent.change(getInput(), { target: { value: 'CS' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(260);
    });

    // 2ª busca dispara antes da 1ª completar
    fireEvent.change(getInput(), { target: { value: 'CSMG3' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(260);
    });

    // 2ª resolve PRIMEIRO (mais nova) e popula o dropdown
    await act(async () => {
      resolveSecond(
        makeFetchResponse({
          assets: [
            { id: 'acao:csmg3', symbol: 'CSMG3', name: 'Companhia de Saneamento', type: 'acao' },
          ],
        }),
      );
    });

    // 1ª resolve DEPOIS com array vazio — searchSeqRef deve ignorar
    await act(async () => {
      resolveFirst(makeFetchResponse({ assets: [] }));
    });

    // Estado final: dropdown ainda mostra CSMG3 (não foi reset por resposta obsoleta).
    fireEvent.focus(getInput());
    await waitFor(() => {
      expect(screen.getByText(/CSMG3 - Companhia de Saneamento/)).toBeInTheDocument();
    });
  });

  it('busca curta (< 2 chars) não dispara fetch', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;

    const { getInput } = renderStep3();
    fireEvent.change(getInput(), { target: { value: 'A' } });

    // Mesmo após avançar o debounce, fetch nunca deve ser chamado.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('busca com 0 resultados (search >= 2) seta erro "Nenhum encontrado"', async () => {
    global.fetch = vi.fn().mockResolvedValue(makeFetchResponse({ assets: [] }));

    const { handleErrors, getInput } = renderStep3();
    fireEvent.change(getInput(), { target: { value: 'XYZ' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(260);
    });

    await waitFor(() => {
      const calls = handleErrors.mock.calls
        .map((c) => c[0]?.ativo)
        .filter((v): v is string => typeof v === 'string');
      expect(calls.some((m) => m.includes('Nenhum ativo'))).toBe(true);
    });
  });

  it('debounce: keystrokes rápidos disparam apenas 1 fetch', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(makeFetchResponse({ assets: [] }));
    global.fetch = fetchSpy;

    const { getInput } = renderStep3();

    // Simula digitação rápida de "PETR4" — 4 keystrokes com >= 2 chars cada.
    // Sem debounce isso geraria 4 requests. Com debounce, só 1 fetch firado.
    fireEvent.change(getInput(), { target: { value: 'PE' } });
    fireEvent.change(getInput(), { target: { value: 'PET' } });
    fireEvent.change(getInput(), { target: { value: 'PETR' } });
    fireEvent.change(getInput(), { target: { value: 'PETR4' } });

    // Antes do debounce expirar — nenhum fetch
    expect(fetchSpy).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(260);
    });

    // Após debounce, exatamente 1 fetch com o valor final
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('search=PETR4');
  });
});
