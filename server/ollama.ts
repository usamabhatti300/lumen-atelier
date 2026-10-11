/**
 * Local vision-model style interpretation through Ollama (https://ollama.com),
 * e.g. Qwen3-VL 4B (Apache-2.0). Runs on this computer: the reference image is
 * sent only to an Ollama server on the loopback interface, never off the device.
 *
 * Same contract as the Anthropic path: the model must answer with JSON matching
 * StyleInterpretationModelSchema (Ollama structured outputs), which is then
 * validated with the stricter StyleInterpretationSchema.
 */
import { StyleInterpretationSchema, interpretationJsonSchema, type AnalyzeRequest, type StyleInterpretation } from '../shared/ai-schema.ts';
import { AnalysisError, SYSTEM_PROMPT, measuredPrompt } from './anthropic.ts';

export interface LocalInterpreter {
  provider: 'ollama';
  model: string;
  /** Whether the Ollama server is running and has the model (cached briefly). */
  available(): Promise<boolean>;
  interpret(request: AnalyzeRequest, signal: AbortSignal, timeoutMs: number): Promise<StyleInterpretation>;
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/** Only loopback Ollama servers are allowed, so the reference never leaves this machine. */
export function isLoopbackUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') && LOOPBACK.has(u.hostname);
  } catch {
    return false;
  }
}

export function createOllamaInterpreter(baseUrl: string, model: string, fetchImpl: typeof fetch = fetch): LocalInterpreter {
  if (!isLoopbackUrl(baseUrl)) throw new Error(`OLLAMA_URL must point to this computer (got ${baseUrl}).`);
  const base = baseUrl.replace(/\/+$/, '');
  let cache: { at: number; ok: boolean } | null = null;

  return {
    provider: 'ollama',
    model,
    async available() {
      if (cache && Date.now() - cache.at < 10_000) return cache.ok;
      let ok = false;
      try {
        const res = await fetchImpl(`${base}/api/tags`, { signal: AbortSignal.timeout(2_000) });
        if (res.ok) {
          const body = (await res.json()) as { models?: { name?: string; model?: string }[] };
          ok = (body.models ?? []).some((m) => m.name === model || m.model === model);
        }
      } catch {
        ok = false;
      }
      cache = { at: Date.now(), ok };
      return ok;
    },
    async interpret(request, signal, timeoutMs) {
      let res: Response;
      try {
        res = await fetchImpl(`${base}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
          body: JSON.stringify({
            model,
            stream: false,
            think: false,
            format: interpretationJsonSchema(),
            options: { temperature: 0 },
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              {
                role: 'user',
                content: `Describe the look of this reference photograph. Measured statistics: ${measuredPrompt(request)}. Answer only with JSON.`,
                images: [request.image.data],
              },
            ],
          }),
        });
      } catch (error) {
        if (signal.aborted) throw new AnalysisError('cancelled', 499, 'The analysis was cancelled.', true);
        if (error instanceof DOMException && error.name === 'TimeoutError') {
          throw new AnalysisError('upstream_timeout', 504, 'The local AI model took too long to answer.', true);
        }
        throw new AnalysisError('upstream_error', 502, 'Could not reach the local AI model (is Ollama running?).', true);
      }
      if (!res.ok) {
        throw new AnalysisError('upstream_error', 502, `The local AI model returned an error (${res.status}).`, res.status >= 500);
      }
      let json: unknown;
      try {
        const body = (await res.json()) as { message?: { content?: string } };
        json = JSON.parse(body.message?.content ?? '');
      } catch {
        throw new AnalysisError('invalid_model_output', 502, 'The local AI response was not valid JSON.', true);
      }
      const parsed = StyleInterpretationSchema.safeParse(json);
      if (!parsed.success) {
        throw new AnalysisError('invalid_model_output', 502, 'The local AI response did not match the expected structure.', true);
      }
      return parsed.data;
    },
  };
}
