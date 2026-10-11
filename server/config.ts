/** Server configuration, read once from the environment (never exposed to the browser). */
export interface ServerConfig {
  port: number;
  anthropicApiKey: string | undefined;
  model: string;
  /** 'auto': Claude when ANTHROPIC_API_KEY is set, otherwise a local Ollama model if it is installed. */
  aiProvider: 'auto' | 'anthropic' | 'ollama' | 'none';
  ollamaUrl: string;
  ollamaModel: string;
  /** Local models on a laptop CPU are much slower than the API (they run in the background in the studio). */
  localTimeoutMs: number;
  rateLimitPerMinute: number;
  requestTimeoutMs: number;
  maxBodyBytes: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const key = env.ANTHROPIC_API_KEY?.trim();
  return {
    port: Number(env.API_PORT ?? env.PORT ?? 8787),
    anthropicApiKey: key ? key : undefined,
    model: env.ANTHROPIC_MODEL?.trim() || 'claude-opus-5-5',
    aiProvider: parseProvider(env.AI_PROVIDER),
    ollamaUrl: env.OLLAMA_URL?.trim() || 'http://127.0.0.1:11434',
    ollamaModel: env.OLLAMA_MODEL?.trim() || 'qwen3-vl:4b-instruct',
    localTimeoutMs: 480_000,
    rateLimitPerMinute: Math.max(1, Number(env.AI_RATE_LIMIT_PER_MINUTE ?? 10)),
    requestTimeoutMs: 90_000,
    maxBodyBytes: 6 * 1024 * 1024,
  };
}

function parseProvider(v: string | undefined): ServerConfig['aiProvider'] {
  const p = v?.trim().toLowerCase();
  return p === 'anthropic' || p === 'ollama' || p === 'none' ? p : 'auto';
}
