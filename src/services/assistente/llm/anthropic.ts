import Anthropic from '@anthropic-ai/sdk';
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

/** Modelos que aceitam `output_config.effort` / `thinking` adaptativo (Sonnet 5, Opus 5, Fable). */
function supportsEffort(model: string): boolean {
  return /^claude-(sonnet-5|opus-5|opus-4-[678]|fable)/.test(model);
}

function mapStop(reason: Anthropic.Message['stop_reason']): LlmStopReason {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'end';
    case 'tool_use':
      return 'tool_use';
    case 'max_tokens':
      return 'max_tokens';
    case 'refusal':
      return 'refusal';
    default:
      return 'other';
  }
}

/**
 * Converte o histórico neutro para o formato da API. Resultados de ferramenta
 * consecutivos viram UM único turno `user` (regra da API para chamadas paralelas).
 */
export function toAnthropicMessages(messages: LlmMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const c of m.toolCalls ?? []) {
        blocks.push({ type: 'tool_use', id: c.id, name: c.name, input: c.input });
      }
      out.push({ role: 'assistant', content: blocks });
    } else {
      const block: Anthropic.ToolResultBlockParam = {
        type: 'tool_result',
        tool_use_id: m.toolCallId,
        content: m.content,
        ...(m.isError ? { is_error: true } : {}),
      };
      const last = out[out.length - 1];
      if (last && last.role === 'user' && Array.isArray(last.content)) {
        (last.content as Anthropic.ContentBlockParam[]).push(block);
      } else {
        out.push({ role: 'user', content: [block] });
      }
    }
  }
  return out;
}

export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic' as const;
  private client: Anthropic | null = null;

  isConfigured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  private getClient(): Anthropic {
    if (!this.client) {
      this.client = new Anthropic({ maxRetries: 2, timeout: 60_000 });
    }
    return this.client;
  }

  async complete(model: string, request: LlmRequest): Promise<LlmResponse> {
    const cache = request.cacheSystem !== false;
    const system: Anthropic.TextBlockParam[] = [
      {
        type: 'text',
        text: request.system,
        ...(cache ? { cache_control: { type: 'ephemeral' as const } } : {}),
      },
    ];

    const tools: Anthropic.Tool[] | undefined = request.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
    }));

    const reasoning = request.reasoning ?? 'none';
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: request.maxOutputTokens,
      system,
      messages: toAnthropicMessages(request.messages),
      ...(tools && tools.length > 0 ? { tools } : {}),
      ...(request.temperature !== undefined && !supportsEffort(model)
        ? { temperature: request.temperature }
        : {}),
    };
    if (supportsEffort(model)) {
      // Sonnet 5 / Opus 5 vêm com raciocínio adaptativo ligado; para chat curto
      // isso consome o max_tokens inteiro pensando. 'none' desliga; 'low' limita.
      if (reasoning === 'none') {
        params.thinking = { type: 'disabled' };
      } else {
        params.thinking = { type: 'adaptive' };
        params.output_config = { effort: reasoning === 'low' ? 'low' : 'medium' };
      }
    }
    // Haiku 4.5: sem thinking (só aceita budget_tokens ≥ 1024, incompatível com chat curto).

    const t0 = Date.now();
    try {
      const { data: res, response: http } = await this.getClient()
        .messages.create(params)
        .withResponse();
      const latencyMs = Date.now() - t0;

      let text = '';
      const toolCalls: LlmToolCall[] = [];
      for (const block of res.content) {
        if (block.type === 'text') text += block.text;
        else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            input: (block.input ?? {}) as Record<string, unknown>,
          });
        }
      }

      const usage: LlmUsage = {
        inputTokens: res.usage.input_tokens,
        cachedInputTokens: res.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
        outputTokens: res.usage.output_tokens,
        reasoningTokens:
          (res.usage as { output_tokens_details?: { thinking_tokens?: number } })
            .output_tokens_details?.thinking_tokens ?? 0,
      };

      return {
        provider: 'anthropic',
        model: res.model,
        text: text.trim(),
        toolCalls,
        stopReason: mapStop(res.stop_reason),
        usage,
        costUsd: costUsd(model, usage),
        costBrl: costBrl(model, usage),
        latencyMs,
        requestId: http.headers.get('request-id') ?? undefined,
      };
    } catch (error: unknown) {
      if (error instanceof Anthropic.RateLimitError) {
        throw new LlmError(error.message, 'anthropic', error.status, true);
      }
      if (error instanceof Anthropic.APIError) {
        const status = error.status;
        throw new LlmError(
          error.message,
          'anthropic',
          status,
          status !== undefined && status >= 500,
        );
      }
      if (error instanceof Anthropic.APIConnectionError) {
        throw new LlmError(error.message, 'anthropic', undefined, true);
      }
      throw error;
    }
  }
}
