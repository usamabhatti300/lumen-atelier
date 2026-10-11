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
            // Streamed so the response starts at once: Node's fetch gives up after 5 minutes without
            // response headers, and a laptop CPU can take longer than that to finish the answer.
            stream: true,
            think: false,
            // No grammar-constrained `format`: with long instructions Qwen3-VL wants to open a code fence,
            // the grammar only allows whitespace, and it emits whitespace until the token limit
            // (measured: 5+ minutes of blanks). A template plus strict Zod validation is reliable.
            // The output cap bounds the time if the model rambles.
            options: { temperature: 0, num_predict: 800 },
            messages: [
              {
                role: 'user',
                content: localPrompt(request),
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
      let content: string;
      try {
        content = await readChatContent(res);
      } catch (error) {
        if (signal.aborted) throw new AnalysisError('cancelled', 499, 'The analysis was cancelled.', true);
        if (error instanceof DOMException && error.name === 'TimeoutError') {
          throw new AnalysisError('upstream_timeout', 504, 'The local AI model took too long to answer.', true);
        }
        throw new AnalysisError('invalid_model_output', 502, 'The local AI response could not be read.', true);
      }
      let json: unknown;
      try {
        json = JSON.parse(extractJsonObject(content));
      } catch {
        throw new AnalysisError('invalid_model_output', 502, 'The local AI response was not valid JSON.', true);
      }
      const parsed = StyleInterpretationSchema.safeParse(json);
      if (!parsed.success) {
        throw new AnalysisError('invalid_model_output', 502, 'The local AI response did not match the expected structure.', true);
      }
      // Small local models flag ordinary photos as screenshots or renders; the app detects those from
      // the pixels itself, so only the warnings this model judges reliably are kept.
      return { ...parsed.data, contentWarnings: parsed.data.contentWarnings.filter((w) => LOCAL_TRUSTED_WARNINGS.has(w)) };
    },
  };
}

/** Joins the message content of an Ollama /api/chat response (NDJSON stream, or a single JSON object). */
export async function readChatContent(res: Response): Promise<string> {
  if (!res.body) return '';
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  const take = (line: string) => {
    if (!line.trim()) return;
    const chunk = JSON.parse(line) as { message?: { content?: string }; error?: string };
    if (chunk.error) throw new Error(chunk.error);
    content += chunk.message?.content ?? '';
  };
  for await (const part of res.body) {
    buffer += decoder.decode(part, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      take(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
    }
  }
  take(buffer + decoder.decode());
  return content;
}

type JsonSchema = { type?: string; enum?: string[]; properties?: Record<string, JsonSchema>; items?: JsonSchema };

/**
 * A compact answer template from the JSON schema, e.g.
 * {"tone": {"contrast": "very_low|low|medium|high|very_high"}, "moodTags": ["<string>"]}.
 * Small local models handle this far better than grammar-constrained output, which
 * can make them emit whitespace forever when they want to open a code fence.
 */
export function schemaTemplate(schema: JsonSchema): string {
  if (schema.enum) return JSON.stringify(schema.enum.join('|'));
  if (schema.type === 'array') return `[${schema.items ? schemaTemplate(schema.items) : ''}]`;
  if (schema.type === 'object' && schema.properties) {
    return `{${Object.entries(schema.properties)
      .map(([k, v]) => `${JSON.stringify(k)}: ${schemaTemplate(v)}`)
      .join(', ')}}`;
  }
  return JSON.stringify(`<${schema.type ?? 'value'}>`);
}

/** The first balanced {...} object in a model answer (tolerates code fences and prose around it). */
export function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  if (start < 0) return text;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return text.slice(start);
}

const LOCAL_TRUSTED_WARNINGS = new Set(['monochrome', 'night_or_neon', 'mixed_lighting']);

/** Instructions, the measured statistics and the answer template in one user message. */
export function localPrompt(request: AnalyzeRequest): string {
  return [
    SYSTEM_PROMPT,
    '',
    `Measured statistics: ${measuredPrompt(request)}.`,
    '',
    'Describe the look of this reference photograph. Reply with one JSON object and nothing else, following this template',
    '(for "a|b|c" pick exactly one value; use [] for lists that do not apply):',
    schemaTemplate(interpretationJsonSchema() as JsonSchema),
  ].join('\n');
}
