import { costBrl, costUsd } from './pricing';
import {
  LlmError,
  type LlmMessage,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
  type LlmStopReason,
  type LlmToolCall,
  type LlmUsage,
} from './types';

/**
 * OpenAI — Responses API (`POST /v1/responses`) via fetch, sem SDK.
 * Cache de prefixo é automático (≥ 1.024 tokens); `prompt_cache_key` melhora o
 * roteamento. Raciocínio controlado por `reasoning.effort`.
 *
 * ⚠️ Escrito sem chave em 10/09/2026 — ainda NÃO exercitado contra a API real.
 */

const OPENAI_URL = 'https://api.openai.com/v1/responses';

type InputItem =
  | { role: 'user' | 'assistant'; content: string }
  | { type: 'function_call'; call_id: string; name: string; arguments: string }
  | { type: 'function_call_output'; call_id: string; output: string };

interface OpenAiResponse {
  id?: string;
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: Array<
    | { type: 'message'; content?: Array<{ type: string; text?: string; refusal?: string }> }
    | { type: 'function_call'; call_id: string; name: string; arguments: string }
    | { type: string }
  >;
  usage?: {
    input_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens?: number;
    output_tokens_details?: { reasoning_tokens?: number };
  };
  error?: { message?: string; type?: string };
}

export function toOpenAiInput(messages: LlmMessage[]): InputItem[] {
  const out: InputItem[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      if (m.content) out.push({ role: 'assistant', content: m.content });
      for (const c of m.toolCalls ?? []) {
        out.push({
          type: 'function_call',
          call_id: c.id,
          name: c.name,
          arguments: JSON.stringify(c.input),
        });
      }
    } else {
      out.push({
        type: 'function_call_output',
        call_id: m.toolCallId,
        output: m.isError ? `ERRO: ${m.content}` : m.content,
      });
    }
  }
  return out;
}

export class OpenAiProvider implements LlmProvider {
  readonly name = 'openai' as const;

  isConfigured(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  async complete(model: string, request: LlmRequest): Promise<LlmResponse> {
    const reasoning = request.reasoning ?? 'none';
    const body: Record<string, unknown> = {
      model,
      instructions: request.system,
      input: toOpenAiInput(request.messages),
      max_output_tokens: request.maxOutputTokens,
      store: false,
      reasoning: { effort: reasoning === 'none' ? 'none' : reasoning },
      ...(request.cacheKey ? { prompt_cache_key: request.cacheKey } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    };
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        type: 'function',
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
        strict: false,
      }));
    }

    const t0 = Date.now();
    let http: Response;
    try {
      http = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ''}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new LlmError(`OpenAI: falha de rede (${msg})`, 'openai', undefined, true);
    }
    const latencyMs = Date.now() - t0;
    const json = (await http.json().catch(() => ({}))) as OpenAiResponse;
    if (!http.ok) {
      throw new LlmError(
        `OpenAI ${http.status}: ${json.error?.message ?? http.statusText}`,
        'openai',
        http.status,
        http.status === 429 || http.status >= 500,
      );
    }

    let text = '';
    let refused = false;
    const toolCalls: LlmToolCall[] = [];
    for (const item of json.output ?? []) {
      if (item.type === 'message' && 'content' in item) {
        for (const part of item.content ?? []) {
          if (part.type === 'output_text' && part.text) text += part.text;
          if (part.type === 'refusal') refused = true;
        }
      } else if (item.type === 'function_call' && 'call_id' in item) {
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(item.arguments) as Record<string, unknown>;
        } catch {
          input = { _raw: item.arguments };
        }
        toolCalls.push({ id: item.call_id, name: item.name, input });
      }
    }

    const u = json.usage ?? {};
    const cached = u.input_tokens_details?.cached_tokens ?? 0;
    const usage: LlmUsage = {
      inputTokens: Math.max(0, (u.input_tokens ?? 0) - cached),
      cachedInputTokens: cached,
      cacheWriteTokens: 0,
      outputTokens: u.output_tokens ?? 0,
      reasoningTokens: u.output_tokens_details?.reasoning_tokens ?? 0,
    };

    let stopReason: LlmStopReason = 'end';
    if (toolCalls.length > 0) stopReason = 'tool_use';
    else if (refused) stopReason = 'refusal';
    else if (json.incomplete_details?.reason === 'max_output_tokens') stopReason = 'max_tokens';
    else if (json.status && json.status !== 'completed') stopReason = 'other';

    return {
      provider: 'openai',
      model,
      text: text.trim(),
      toolCalls,
      stopReason,
      usage,
      costUsd: costUsd(model, usage),
      costBrl: costBrl(model, usage),
      latencyMs,
      requestId: json.id,
    };
  }
}
