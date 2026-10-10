/** Server configuration, read once from the environment (never exposed to the browser). */
export interface ServerConfig {
  port: number;
  anthropicApiKey: string | undefined;
  model: string;
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
    rateLimitPerMinute: Math.max(1, Number(env.AI_RATE_LIMIT_PER_MINUTE ?? 10)),
    requestTimeoutMs: 90_000,
    maxBodyBytes: 6 * 1024 * 1024,
  };
}
