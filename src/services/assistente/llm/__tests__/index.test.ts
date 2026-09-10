import { describe, expect, it } from 'vitest';
import { CANDIDATE_MODELS, getProvider, getProviderForModel, providerNameFor } from '..';
import { MODEL_PRICING } from '../pricing';

describe('registro de fornecedores', () => {
  it('resolve o fornecedor pela tabela de preços e pelo prefixo do id', () => {
    expect(providerNameFor('claude-haiku-4-5')).toBe('anthropic');
    expect(providerNameFor('gpt-5.6-luna')).toBe('openai');
    expect(providerNameFor('gemini-3.8-flash')).toBe('google');
    expect(providerNameFor('claude-modelo-novo')).toBe('anthropic');
    expect(providerNameFor('gemini-9-pro')).toBe('google');
    expect(() => providerNameFor('llama-4')).toThrow(/desconhecido/);
  });

  it('todos os candidatos têm preço cadastrado e fornecedor instanciado', () => {
    for (const m of CANDIDATE_MODELS) {
      expect(MODEL_PRICING[m]).toBeDefined();
      expect(getProviderForModel(m).name).toBe(MODEL_PRICING[m].provider);
    }
    expect(getProvider('anthropic').name).toBe('anthropic');
  });
});
