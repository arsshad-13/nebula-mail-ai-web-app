import { createGoogleGenerativeAI } from "@ai-sdk/google";

/**
 * Isolated AI Provider Module
 *
 * Keeps all Gemini-specific configuration and initialization in one place.
 * The rest of the application interacts with the provider-agnostic model instance.
 *
 * ENV REQUIREMENTS:
 * - GEMINI_API_KEY: Server-side only secret
 * - AI_MODEL: Configurable model name (defaults to "gemini-3.6-flash")
 */

export function getAiModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured on the server. Please add GEMINI_API_KEY to your environment."
    );
  }

  const modelName = process.env.AI_MODEL || "gemini-3.6-flash";
  const google = createGoogleGenerativeAI({ apiKey });

  return google(modelName);
}
