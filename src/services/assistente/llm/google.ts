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
 * Google Gemini — `generateContent` via fetch, sem SDK.
 * Cache implícito é automático nos modelos Flash (≥ 1.024 tokens de prefixo).
 * Raciocínio controlado por `generationConfig.thinkingConfig`.
 *
 * ⚠️ Escrito sem chave em 10/09/2026 — ainda NÃO exercitado contra a API real.
 * Ponto a conferir na 1ª chamada: nome do campo de nível de raciocínio nos
 * modelos 3.x (`thinkingLevel`) e se `thinkingBudget: 0` continua aceito.
 */

const GOOGLE_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

type Part =
  | { text: string }
  | { functionCall: { name: string; args?: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

interface Content {
  role: 'user' | 'model';
  parts: Part[];
}

interface GoogleResponse {
  responseId?: string;
  candidates?: Array<{
    content?: { parts?: Array<Part & { thought?: boolean }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    cachedContentTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
  error?: { message?: string; status?: string };
}

export function toGoogleContents(messages: LlmMessage[]): Content[] {
  const out: Content[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', parts: [{ text: m.content }] });
    } else if (m.role === 'assistant') {
      const parts: Part[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const c of m.toolCalls ?? []) {
        parts.push({ functionCall: { name: c.name, args: c.input } });
      }
      if (parts.length > 0) out.push({ role: 'model', parts });
    } else {
      const part: Part = {
        functionResponse: {
          name: m.name,
          response: m.isError ? { error: m.content } : { result: m.content },
        },
      };
      const last = out[out.length - 1];
      if (last && last.role === 'user' && 'functionResponse' in (last.parts[0] ?? {})) {
        last.parts.push(part);
      } else {
        out.push({ role: 'user', parts: [part] });
      }
    }
  }
  return out;
}

export class GoogleProvider implements LlmProvider {
  readonly name = 'google' as const;

  isConfigured(): boolean {
    return Boolean(process.env.GOOGLE_API_KEY);
  }

  async complete(model: string, request: LlmRequest): Promise<LlmResponse> {
    const reasoning = request.reasoning ?? 'none';
    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: request.maxOutputTokens,
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      thinkingConfig:
        reasoning === 'none'
          ? { thinkingBudget: 0 }
          : { thinkingLevel: reasoning === 'low' ? 'low' : 'medium' },
    };
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: request.system }] },
      contents: toGoogleContents(request.messages),
      generationConfig,
    };
    if (request.tools && request.tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: request.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.inputSchema,
          })),
        },
      ];
    }

    const t0 = Date.now();
    let http: Response;
    try {
      http = await fetch(`${GOOGLE_BASE}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GOOGLE_API_KEY ?? '',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new LlmError(`Google: falha de rede (${msg})`, 'google', undefined, true);
    }
    const latencyMs = Date.now() - t0;
    const json = (await http.json().catch(() => ({}))) as GoogleResponse;
    if (!http.ok) {
      throw new LlmError(
        `Google ${http.status}: ${json.error?.message ?? http.statusText}`,
        'google',
        http.status,
        http.status === 429 || http.status >= 500,
      );
    }

    const candidate = json.candidates?.[0];
    let text = '';
    const toolCalls: LlmToolCall[] = [];
    let i = 0;
    for (const part of candidate?.content?.parts ?? []) {
      if ('thought' in part && part.thought) continue;
      if ('text' in part) text += part.text;
      else if ('functionCall' in part) {
        i += 1;
        toolCalls.push({
          id: `gemini-call-${i}`,
          name: part.functionCall.name,
          input: part.functionCall.args ?? {},
        });
      }
    }

    const u = json.usageMetadata ?? {};
    const cached = u.cachedContentTokenCount ?? 0;
    const thoughts = u.thoughtsTokenCount ?? 0;
    const usage: LlmUsage = {
      inputTokens: Math.max(0, (u.promptTokenCount ?? 0) - cached),
      cachedInputTokens: cached,
      cacheWriteTokens: 0,
      outputTokens: (u.candidatesTokenCount ?? 0) + thoughts,
      reasoningTokens: thoughts,
    };

    let stopReason: LlmStopReason = 'end';
    if (toolCalls.length > 0) stopReason = 'tool_use';
    else if (json.promptFeedback?.blockReason || candidate?.finishReason === 'SAFETY') {
      stopReason = 'refusal';
    } else if (candidate?.finishReason === 'MAX_TOKENS') stopReason = 'max_tokens';
    else if (candidate?.finishReason && candidate.finishReason !== 'STOP') stopReason = 'other';

    return {
      provider: 'google',
      model,
      text: text.trim(),
      toolCalls,
      stopReason,
      usage,
      costUsd: costUsd(model, usage),
      costBrl: costBrl(model, usage),
      latencyMs,
      requestId: json.responseId,
    };
  }
}
