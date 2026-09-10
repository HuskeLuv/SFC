/**
 * Camada de fornecedor do assistente de IA — interface única sobre Anthropic,
 * OpenAI e Google, para que a escolha do modelo saia do teste de qualidade
 * (harness) e possa mudar sem tocar no resto do app.
 *
 * Tudo o que o app precisa saber de um modelo passa por aqui: texto, chamadas
 * de ferramenta, uso de tokens (com cache) e custo por mensagem.
 */

export type LlmProviderName = 'anthropic' | 'openai' | 'google';

/** Quanto o modelo "pensa" antes de responder. Chat curto = 'none' ou 'low'. */
export type LlmReasoning = 'none' | 'low' | 'medium';

export interface LlmToolCall {
  /** Id gerado pelo fornecedor; devolver no resultado da ferramenta. */
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LlmUserMessage {
  role: 'user';
  content: string;
}

export interface LlmAssistantMessage {
  role: 'assistant';
  content: string;
  toolCalls?: LlmToolCall[];
}

export interface LlmToolResultMessage {
  role: 'tool';
  toolCallId: string;
  /** Nome da ferramenta (o Google exige no functionResponse). */
  name: string;
  content: string;
  isError?: boolean;
}

export type LlmMessage = LlmUserMessage | LlmAssistantMessage | LlmToolResultMessage;

export interface LlmTool {
  name: string;
  description: string;
  /** JSON Schema do input (type: object). */
  inputSchema: Record<string, unknown>;
}

export interface LlmRequest {
  /** Prompt de sistema. Deve ser ESTÁVEL (sem data/hora, sem id) para o cache funcionar. */
  system: string;
  messages: LlmMessage[];
  tools?: LlmTool[];
  /** Teto de tokens de saída. Chat: 300–500. */
  maxOutputTokens: number;
  reasoning?: LlmReasoning;
  /** Marca o prompt de sistema (+ ferramentas) como prefixo cacheável. Padrão: true. */
  cacheSystem?: boolean;
  /** Chave de roteamento de cache (OpenAI). Ex.: 'assistente-v1'. */
  cacheKey?: string;
  temperature?: number;
}

export interface LlmUsage {
  /** Tokens de entrada cobrados a preço cheio (não cacheados). */
  inputTokens: number;
  /** Tokens de entrada lidos do cache (mais baratos). */
  cachedInputTokens: number;
  /** Tokens gravados no cache nesta chamada (Anthropic cobra 1,25×). */
  cacheWriteTokens: number;
  /** Tokens de saída, incluindo raciocínio quando o fornecedor o cobra como saída. */
  outputTokens: number;
  /** Parcela de outputTokens gasta em raciocínio (informativo). */
  reasoningTokens: number;
}

export type LlmStopReason = 'end' | 'tool_use' | 'max_tokens' | 'refusal' | 'other';

export interface LlmResponse {
  provider: LlmProviderName;
  model: string;
  text: string;
  toolCalls: LlmToolCall[];
  stopReason: LlmStopReason;
  usage: LlmUsage;
  costUsd: number;
  costBrl: number;
  latencyMs: number;
  requestId?: string;
}

export interface LlmProvider {
  readonly name: LlmProviderName;
  /** true quando a credencial do fornecedor está configurada no ambiente. */
  isConfigured(): boolean;
  complete(model: string, request: LlmRequest): Promise<LlmResponse>;
}

/** Erro normalizado: quem chama não precisa conhecer as exceções de cada SDK. */
export class LlmError extends Error {
  constructor(
    message: string,
    public readonly provider: LlmProviderName,
    public readonly status?: number,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}
