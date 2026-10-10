/**
 * Vision-model style interpretation via the Anthropic Messages API.
 *
 * The model receives a downscaled copy of the reference image plus a compact
 * set of measured statistics, and must answer with JSON matching
 * StyleInterpretationModelSchema (structured outputs). The response is then
 * validated with the stricter StyleInterpretationSchema. Anything malformed is
 * rejected — the browser falls back to statistics-only analysis.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessage, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import {
  StyleInterpretationSchema,
  interpretationJsonSchema,
  type AnalyzeRequest,
  type ApiErrorCode,
  type StyleInterpretation,
} from '../shared/ai-schema.ts';

export class AnalysisError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly retryable: boolean;

  constructor(code: ApiErrorCode, status: number, message: string, retryable: boolean) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export type CreateMessage = (
  params: MessageCreateParamsNonStreaming,
  options: { signal: AbortSignal; timeout: number },
) => Promise<BetaMessage>;

export function createAnthropicCaller(apiKey: string): CreateMessage {
  const client = new Anthropic({ apiKey, maxRetries: 1 });
  return (params, options) => client.beta.messages.create(params, options);
}

const SYSTEM_PROMPT = `You are a senior photo editor and colorist. You describe the visual style ("look") of a reference photograph so that a separate, deterministic program can build an editable preset from your description combined with its own pixel measurements.

Rules:
- Describe only what is visible in the image. Do not guess the camera, the software, or the original editing settings, and do not claim the look can be reproduced exactly.
- Judge the grade, not the scene: separate intentional color grading (tinted shadows, muted greens, lifted blacks) from the subject's own colors where you can, and say in notes when you cannot.
- Grain and vignette: report them only when the evidence is clear; use "uncertain" when they could be JPEG noise or natural scene falloff.
- If the image is a screenshot with interface elements, contains several photos, is an illustration or render, or is very low quality, list that in contentWarnings and lower your confidence.
- The measured statistics are computed from the full image and are reliable for overall brightness and contrast; use your eyes for everything they cannot capture.
- Keep styleSummary to one or two plain sentences a photographer would write. Keep notes short.`;

export async function interpretStyle(
  create: CreateMessage,
  model: string,
  request: AnalyzeRequest,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<StyleInterpretation> {
  const m = request.measured;
  const measuredText = [
    `mean luminance ${m.meanLuminance.toFixed(3)} (0 black, 1 white)`,
    `contrast (luminance spread) ${m.contrast.toFixed(3)}`,
    `black floor ${m.blackFloor.toFixed(3)}, white ceiling ${m.whiteCeiling.toFixed(3)}`,
    `mean chroma ${m.meanChroma.toFixed(3)}`,
    `warmth ${m.warmth.toFixed(3)} (negative cool, positive warm)`,
    `dominant colors ${m.dominantColors.join(', ')}`,
  ].join('; ');

  const params: MessageCreateParamsNonStreaming = {
    model,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM_PROMPT,
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: interpretationJsonSchema() },
    },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: request.image.mediaType, data: request.image.data },
          },
          {
            type: 'text',
            text: `Describe the look of this reference photograph. Measured statistics: ${measuredText}.`,
          },
        ],
      },
    ],
  };

  let message: BetaMessage;
  try {
    message = await create(params, { signal, timeout: timeoutMs });
  } catch (error) {
    throw mapUpstreamError(error, signal);
  }

  if (message.stop_reason === 'refusal') {
    throw new AnalysisError('refused', 422, 'The AI model declined to analyze this image.', false);
  }
  if (message.stop_reason === 'max_tokens') {
    throw new AnalysisError('invalid_model_output', 502, 'The AI response was cut off.', true);
  }

  const text = message.content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AnalysisError('invalid_model_output', 502, 'The AI response was not valid JSON.', true);
  }
  const parsed = StyleInterpretationSchema.safeParse(json);
  if (!parsed.success) {
    throw new AnalysisError(
      'invalid_model_output',
      502,
      'The AI response did not match the expected structure.',
      true,
    );
  }
  return parsed.data;
}

function mapUpstreamError(error: unknown, signal: AbortSignal): AnalysisError {
  if (signal.aborted || error instanceof Anthropic.APIUserAbortError) {
    return new AnalysisError('cancelled', 499, 'The analysis was cancelled.', true);
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AnalysisError('upstream_timeout', 504, 'The AI provider timed out.', true);
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new AnalysisError(
      'upstream_auth',
      502,
      'The server’s Anthropic API key was rejected. Check ANTHROPIC_API_KEY.',
      false,
    );
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AnalysisError('upstream_rate_limited', 503, 'The AI provider is rate limiting requests.', true);
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new AnalysisError('upstream_error', 502, 'The AI provider rejected the request.', false);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AnalysisError('upstream_error', 502, 'Could not reach the AI provider.', true);
  }
  if (error instanceof Anthropic.APIError) {
    return new AnalysisError('upstream_error', 502, `The AI provider returned an error (${error.status}).`, true);
  }
  return new AnalysisError('internal', 500, 'Unexpected error during analysis.', true);
}
