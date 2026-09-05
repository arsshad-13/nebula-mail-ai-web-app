import { NextRequest, NextResponse } from "next/server";
import { getSessionIdFromCookies } from "@/lib/auth/cookies";
import { getThreadDetail } from "@/lib/gmail/service";

/**
 * GET /api/gmail/threads/[id]
 *
 * Retrieves a complete Gmail thread by threadId with all messages in chronological order.
 * All message bodies are sanitized with sanitizeEmailHtml server-side.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionId = await getSessionIdFromCookies();
    if (!sessionId) {
      return NextResponse.json(
        {
          error: "UNAUTHENTICATED",
          message: "No active session found. Please sign in with Google.",
        },
        { status: 401 }
      );
    }

    const { id } = await params;
    if (!id || typeof id !== "string" || !id.trim()) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "Thread ID is required." },
        { status: 400 }
      );
    }

    const thread = await getThreadDetail(sessionId, id.trim());

    return NextResponse.json({ thread });
  } catch (error) {
    console.error("Failed to fetch thread detail:", error);
    const message = (error as Error).message || "Failed to fetch thread detail";
    const isAuthError =
      message.toLowerCase().includes("unauthenticated") ||
      message.toLowerCase().includes("invalid_grant");
    const isNotFound =
      message.toLowerCase().includes("not found") ||
      (error as { code?: number })?.code === 404;

    return NextResponse.json(
      {
        error: isAuthError ? "AUTH_ERROR" : isNotFound ? "NOT_FOUND" : "GMAIL_API_ERROR",
        message: isAuthError
          ? "Unauthenticated session. Please sign in again."
          : isNotFound
          ? "Thread not found."
          : "Failed to fetch thread from Gmail.",
      },
      { status: isAuthError ? 401 : isNotFound ? 404 : 500 }
    );
  }
}
