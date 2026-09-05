import { NextRequest, NextResponse } from "next/server";
import { generateText, stepCountIs } from "ai";
import { z } from "zod";
import { getSessionIdFromCookies } from "@/lib/auth/cookies";
import { getAiModel } from "@/lib/ai/provider";
import { buildSystemPrompt } from "@/lib/ai/prompts";
import { createAiTools } from "@/lib/ai/tools";
import { AiChatResponse, UiAction } from "@/types/ai";

/**
 * Request validation schema for POST /api/ai/chat.
 * Does NOT accept sessionId from body. Session is obtained strictly from HTTP-only cookie.
 */
export const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      })
    )
    .min(1),
  appContext: z.object({
    currentFolder: z.enum(["inbox", "sent"]),
    messageCount: z.number().int().nonnegative(),
    selectedEmail: z
      .object({
        id: z.string(),
        threadId: z.string().optional(),
        messageIdHeader: z.string().optional(),
        subject: z.string(),
        from: z.object({
          name: z.string().optional(),
          email: z.string(),
        }),
        to: z.array(
          z.object({
            name: z.string().optional(),
            email: z.string(),
          })
        ),
        date: z.string(),
        snippet: z.string(),
      })
      .nullable(),
    composeIsOpen: z.boolean(),
    composeTo: z.string(),
    composeSubject: z.string(),
    aiFilterActive: z.boolean(),
    aiFilterLabel: z.string().nullable(),
  }),
});

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate via secure server-side session cookie
    const sessionId = await getSessionIdFromCookies();
    if (!sessionId) {
      return NextResponse.json(
        { error: "Unauthenticated: Please sign in to use the AI co-pilot." },
        { status: 401 }
      );
    }

    // 2. Validate request body against schema
    let jsonBody: unknown;
    try {
      jsonBody = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body." },
        { status: 400 }
      );
    }

    const validationResult = chatRequestSchema.safeParse(jsonBody);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Malformed request payload.",
          details: validationResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        },
        { status: 400 }
      );
    }

    const { messages, appContext } = validationResult.data;

    // 3. Build system prompt with context and injection defenses
    const systemPrompt = buildSystemPrompt(appContext);

    // 4. Initialize action collector and typed server-side tools
    const recordedActions: UiAction[] = [];
    const recordAction = (action: UiAction) => {
      if (
        action.type === "navigate_mailbox" &&
        recordedActions.some(
          (a) => a.type === "navigate_mailbox" && a.payload.folder === action.payload.folder
        )
      ) {
        return;
      }
      if (
        action.type === "select_message" &&
        recordedActions.some(
          (a) => a.type === "select_message" && a.payload.messageId === action.payload.messageId
        )
      ) {
        return;
      }
      recordedActions.push(action);
    };

    const tools = createAiTools({
      sessionId,
      recordAction,
      appContext,
    });

    // 5. Initialize isolated AI provider
    const model = getAiModel();

    // 6. Execute AI model with tool-calling support
    const result = await generateText({
      model,
      system: systemPrompt,
      messages,
      tools,
      stopWhen: stepCountIs(5),
    });

    // 7. Assemble structured response for client hook consumption
    const response: AiChatResponse = {
      text: result.text || (recordedActions.length > 0 ? "Action completed." : ""),
      actions: recordedActions,
      toolsExecuted: recordedActions.length > 0,
    };

    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error("AI Chat Route Error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid tool arguments or validation error." },
        { status: 400 }
      );
    }

    const errMessage = error instanceof Error ? error.message : String(error);
    const lower = errMessage.toLowerCase();

    // Authentication failure
    if (
      lower.includes("unauthenticated") ||
      lower.includes("invalid_grant") ||
      lower.includes("credentials missing")
    ) {
      return NextResponse.json(
        { error: "Session expired or Gmail unauthenticated. Please reconnect your account." },
        { status: 401 }
      );
    }

    // Permission denied
    if (
      lower.includes("insufficient") ||
      lower.includes("forbidden") ||
      lower.includes("permission denied")
    ) {
      return NextResponse.json(
        { error: "Access denied. Insufficient permissions for requested Gmail operation." },
        { status: 403 }
      );
    }

    // Rate limiting
    if (
      lower.includes("rate limit") ||
      lower.includes("quota") ||
      lower.includes("429") ||
      lower.includes("resource has been exhausted")
    ) {
      return NextResponse.json(
        { error: "AI rate limit or quota exceeded. Please wait a moment before trying again." },
        { status: 429 }
      );
    }

    // AI Provider Authentication failure
    if (
      lower.includes("openrouter_api_key") ||
      (lower.includes("openrouter") &&
        (lower.includes("unauthorized") ||
          lower.includes("invalid api key") ||
          lower.includes("invalid key") ||
          lower.includes("user not found")))
    ) {
      return NextResponse.json(
        { error: "AI authentication failed. Check OPENROUTER_API_KEY server configuration." },
        { status: 401 }
      );
    }

    // AI Provider failure & unavailable model errors
    if (
      lower.includes("openrouter") ||
      lower.includes("gemini_api_key") ||
      lower.includes("ai provider") ||
      lower.includes("api key") ||
      lower.includes("model not found") ||
      lower.includes("no available model") ||
      lower.includes("no endpoints") ||
      lower.includes("free-model") ||
      lower.includes("temporarily unavailable") ||
      lower.includes("fetch failed")
    ) {
      return NextResponse.json(
        { error: "AI service is temporarily unavailable. Check provider configuration." },
        { status: 502 }
      );
    }

    // Internal server error
    return NextResponse.json(
      { error: "An unexpected error occurred while processing your AI request." },
      { status: 500 }
    );
  }
}
