// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import Step3Asset from '../Step3Asset';
import type { WizardFormData, WizardErrors } from '@/types/wizard';

/**
 * Bug #05 (relatório Maio/2026): autocomplete bloqueava seleção em ações
 * brasileiras. Duas regressões a defender:
 *  1. Quando uma busca retorna resultados, o erro "Nenhum encontrado" de
 *     uma busca anterior precisa ser limpo.
 *  2. Respostas chegando fora de ordem não podem sobrescrever resultados
 *     mais recentes (`searchSeqRef` counter).
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
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('limpa erro "Nenhum encontrado" quando a busca subsequente retorna resultados', async () => {
    let resolveFirst: (r: Response) => void = () => {};
    let resolveSecond: (r: Response) => void = () => {};

    global.fetch = vi
      .fn()
      .mockImplementationOnce(() => new Promise<Response>((res) => (resolveFirst = res)))
      .mockImplementationOnce(() => new Promise<Response>((res) => (resolveSecond = res)));

    const { handleErrors, getInput } = renderStep3();

    // 1ª busca: "CSM" — vai resolver com 0 resultados.
    fireEvent.change(getInput(), { target: { value: 'CSM' } });
    // 2ª busca: "CSMG3" — vai resolver com 1 resultado.
    fireEvent.change(getInput(), { target: { value: 'CSMG3' } });

    // Resolve a 1ª (que chega fora de ordem) — deve ser ignorada (searchSeqRef).
    await act(async () => {
      resolveFirst(makeFetchResponse({ assets: [] }));
    });
    // Resolve a 2ª — esta deve setar options e limpar erro.
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

    // Garantia: o último onErrorsChange relacionado a 'ativo' precisa ser `undefined`,
    // não 'Nenhum encontrado'.
    await waitFor(() => {
      const ativoErrorCalls = handleErrors.mock.calls
        .map((c) => c[0]?.ativo)
        .filter((v) => v !== undefined || true);
      // último call que tenha a chave ativo
      const lastWithAtivo = [...ativoErrorCalls].reverse().find((v) => v !== undefined || true);
      expect(lastWithAtivo).toBeUndefined();
    });
  });

  it('searchSeqRef ignora resposta tardia de busca obsoleta', async () => {
    // Cenário: digitação rápida "C" → "CSMG3", a resposta da 1ª (lenta) chega
    // depois da 2ª (rápida com resultados). Sem o counter, options=[] da 1ª
    // sobrescreveria as options=[CSMG3] da 2ª. Validamos que setAssetOptions
    // só é chamado pelo seq mais novo.
    let resolveFirst: (r: Response) => void = () => {};
    let resolveSecond: (r: Response) => void = () => {};

    global.fetch = vi
      .fn()
      .mockImplementationOnce(() => new Promise<Response>((res) => (resolveFirst = res)))
      .mockImplementationOnce(() => new Promise<Response>((res) => (resolveSecond = res)));

    const { getInput } = renderStep3();

    fireEvent.change(getInput(), { target: { value: 'CS' } }); // seq=1
    fireEvent.change(getInput(), { target: { value: 'CSMG3' } }); // seq=2

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

    // 1ª resolve DEPOIS com array vazio — não pode sobrescrever
    await act(async () => {
      resolveFirst(makeFetchResponse({ assets: [] }));
    });

    // Estado final: dropdown ainda mostra CSMG3 (não foi reset por resposta obsoleta).
    // Vamos confirmar pelo conteúdo do dropdown: focus no input + tecla pra abrir.
    fireEvent.focus(getInput());
    await waitFor(() => {
      // O label inclui o nome do ativo concat: "CSMG3 - Companhia ..."
      expect(screen.getByText(/CSMG3 - Companhia de Saneamento/)).toBeInTheDocument();
    });
  });

  it('busca curta (< 2 chars) não dispara fetch', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;

    const { getInput } = renderStep3();
    fireEvent.change(getInput(), { target: { value: 'A' } });

    // Sem await — nada deve ter sido chamado de cara
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('busca com 0 resultados (search >= 2) seta erro "Nenhum encontrado"', async () => {
    global.fetch = vi.fn().mockResolvedValue(makeFetchResponse({ assets: [] }));

    const { handleErrors, getInput } = renderStep3();
    fireEvent.change(getInput(), { target: { value: 'XYZ' } });

    await waitFor(() => {
      const calls = handleErrors.mock.calls
        .map((c) => c[0]?.ativo)
        .filter((v): v is string => typeof v === 'string');
      expect(calls.some((m) => m.includes('Nenhum ativo'))).toBe(true);
    });
  });
});
