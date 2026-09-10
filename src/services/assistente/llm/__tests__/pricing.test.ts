import { afterEach, describe, expect, it } from 'vitest';
import { MODEL_PRICING, costBrl, costUsd, getCambioBrl, getModelPricing } from '../pricing';
import type { LlmUsage } from '../types';

const usage: LlmUsage = {
  inputTokens: 1_000_000,
  cachedInputTokens: 1_000_000,
  cacheWriteTokens: 1_000_000,
  outputTokens: 1_000_000,
  reasoningTokens: 0,
};

describe('pricing', () => {
  const original = process.env.ASSISTENTE_CAMBIO_BRL;
  afterEach(() => {
    if (original === undefined) delete process.env.ASSISTENTE_CAMBIO_BRL;
    else process.env.ASSISTENTE_CAMBIO_BRL = original;
  });

  it('soma entrada, cache lido, cache gravado e saída pelo preço do modelo', () => {
    const p = MODEL_PRICING['claude-haiku-4-5'];
    expect(costUsd('claude-haiku-4-5', usage)).toBeCloseTo(
      p.inputUsdPerM + p.cachedInputUsdPerM + p.cacheWriteUsdPerM + p.outputUsdPerM,
      6,
    );
  });

  it('modelo sem preço cadastrado custa 0 (fica visível no log em vez de quebrar)', () => {
    expect(costUsd('modelo-inexistente', usage)).toBe(0);
    expect(getModelPricing('modelo-inexistente')).toBeUndefined();
  });

  it('converte para reais com o câmbio padrão e com o câmbio do ambiente', () => {
    delete process.env.ASSISTENTE_CAMBIO_BRL;
    expect(getCambioBrl()).toBe(5.39);
    process.env.ASSISTENTE_CAMBIO_BRL = '6';
    expect(getCambioBrl()).toBe(6);
    expect(costBrl('claude-haiku-4-5', usage)).toBeCloseTo(
      costUsd('claude-haiku-4-5', usage) * 6,
      6,
    );
    process.env.ASSISTENTE_CAMBIO_BRL = 'abc';
    expect(getCambioBrl()).toBe(5.39);
  });

  it('cada candidato tem preço e fornecedor coerente com o prefixo do id', () => {
    for (const [model, p] of Object.entries(MODEL_PRICING)) {
      expect(p.inputUsdPerM).toBeGreaterThan(0);
      expect(p.outputUsdPerM).toBeGreaterThan(p.inputUsdPerM);
      if (model.startsWith('claude-')) expect(p.provider).toBe('anthropic');
      if (model.startsWith('gpt-')) expect(p.provider).toBe('openai');
      if (model.startsWith('gemini-')) expect(p.provider).toBe('google');
    }
  });
});
