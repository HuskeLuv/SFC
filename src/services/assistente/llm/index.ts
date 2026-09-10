import { AnthropicProvider } from './anthropic';
import { GoogleProvider } from './google';
import { OpenAiProvider } from './openai';
import { getModelPricing } from './pricing';
import type { LlmProvider, LlmProviderName, LlmRequest, LlmResponse } from './types';

export * from './types';
export { MODEL_PRICING, costBrl, costUsd, getCambioBrl, getModelPricing } from './pricing';

/** Candidatos do teste de qualidade (decisão de 04/09/2026: escolher pelo teste cego, preço desempata). */
export const CANDIDATE_MODELS = ['claude-haiku-4-5', 'gpt-5.6-luna', 'gemini-3.8-flash'] as const;

const providers: Record<LlmProviderName, LlmProvider> = {
  anthropic: new AnthropicProvider(),
  openai: new OpenAiProvider(),
  google: new GoogleProvider(),
};

/** Descobre o fornecedor pelo id do modelo (tabela de preços primeiro, prefixo como fallback). */
export function providerNameFor(model: string): LlmProviderName {
  const priced = getModelPricing(model);
  if (priced) return priced.provider;
  if (model.startsWith('claude-')) return 'anthropic';
  if (model.startsWith('gpt-') || model.startsWith('o')) return 'openai';
  if (model.startsWith('gemini-')) return 'google';
  throw new Error(`Modelo desconhecido: ${model}`);
}

export function getProvider(name: LlmProviderName): LlmProvider {
  return providers[name];
}

export function getProviderForModel(model: string): LlmProvider {
  return providers[providerNameFor(model)];
}

/** Ponto de entrada único: o app chama isto e nunca um SDK diretamente. */
export function complete(model: string, request: LlmRequest): Promise<LlmResponse> {
  return getProviderForModel(model).complete(model, request);
}
