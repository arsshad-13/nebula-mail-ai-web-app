import { createOpenRouter } from "@openrouter/ai-sdk-provider";

/**
 * Isolated AI Provider Module
 *
 * Keeps all OpenRouter-specific configuration and initialization in one place.
 * The rest of the application interacts with the provider-agnostic model instance.
 *
 * ENV REQUIREMENTS:
 * - OPENROUTER_API_KEY: Server-side only secret
 * - AI_MODEL: Configurable model name (defaults to "openrouter/free")
 */

export function getAiModel() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured on the server. Please add OPENROUTER_API_KEY to your environment."
    );
  }

  const modelName = process.env.AI_MODEL || "openrouter/free";
  const openrouter = createOpenRouter({ apiKey });

  return openrouter(modelName);
}
