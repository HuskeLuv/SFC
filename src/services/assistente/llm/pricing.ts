import type { LlmProviderName, LlmUsage } from './types';

/**
 * Preços de lista por 1 milhão de tokens (US$), conferidos nas páginas oficiais
 * em 10/09/2026. Atualizar aqui quando mudarem — o custo por mensagem gravado
 * pelo app sai desta tabela.
 */
export interface ModelPricing {
  provider: LlmProviderName;
  inputUsdPerM: number;
  cachedInputUsdPerM: number;
  cacheWriteUsdPerM: number;
  outputUsdPerM: number;
  note?: string;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-haiku-4-5': {
    provider: 'anthropic',
    inputUsdPerM: 1,
    cachedInputUsdPerM: 0.1,
    cacheWriteUsdPerM: 1.25,
    outputUsdPerM: 5,
    note: 'Só cacheia prefixo ≥ 4.096 tokens.',
  },
  'claude-sonnet-5': {
    provider: 'anthropic',
    inputUsdPerM: 2,
    cachedInputUsdPerM: 0.2,
    cacheWriteUsdPerM: 2.5,
    outputUsdPerM: 10,
    note: 'Cacheia prefixo ≥ 1.024 tokens.',
  },
  'claude-opus-5': {
    provider: 'anthropic',
    inputUsdPerM: 5,
    cachedInputUsdPerM: 0.5,
    cacheWriteUsdPerM: 6.25,
    outputUsdPerM: 25,
    note: 'Cacheia prefixo ≥ 512 tokens.',
  },
  'gpt-5.6-luna': {
    provider: 'openai',
    inputUsdPerM: 0.2,
    cachedInputUsdPerM: 0.02,
    cacheWriteUsdPerM: 0.25,
    outputUsdPerM: 1.2,
    note: 'Cache automático de prefixo (≥ 1.024 tokens); gravação 1,25× só com breakpoint explícito.',
  },
  'gemini-3.8-flash': {
    provider: 'google',
    inputUsdPerM: 0.75,
    cachedInputUsdPerM: 0.1875,
    cacheWriteUsdPerM: 0,
    outputUsdPerM: 3.75,
    note: 'Preço promocional até 31/12/2026; dobra em 01/01/2027 (1,50 / 7,50). Cache implícito a 25% do preço de entrada.',
  },
};

/** Câmbio efetivo US$→R$ (cotação + IOF 3,5%). Sobrescrever via ASSISTENTE_CAMBIO_BRL. */
export function getCambioBrl(): number {
  const raw = process.env.ASSISTENTE_CAMBIO_BRL;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 5.39;
}

export function getModelPricing(model: string): ModelPricing | undefined {
  return MODEL_PRICING[model];
}

/** Custo em US$ de uma chamada. Modelo sem preço cadastrado → 0 (e fica visível no log). */
export function costUsd(model: string, usage: LlmUsage): number {
  const p = MODEL_PRICING[model];
  if (!p) return 0;
  const perToken = (usdPerM: number) => usdPerM / 1_000_000;
  return (
    usage.inputTokens * perToken(p.inputUsdPerM) +
    usage.cachedInputTokens * perToken(p.cachedInputUsdPerM) +
    usage.cacheWriteTokens * perToken(p.cacheWriteUsdPerM) +
    usage.outputTokens * perToken(p.outputUsdPerM)
  );
}

export function costBrl(model: string, usage: LlmUsage): number {
  return costUsd(model, usage) * getCambioBrl();
}
