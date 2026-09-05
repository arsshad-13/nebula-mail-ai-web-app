import { NextRequest, NextResponse } from "next/server";
import { getSessionIdFromCookies } from "@/lib/auth/cookies";
import { verifyAndConsumePendingSend, cancelPendingSend } from "@/lib/ai/pending-sends";
import { sendGmailMessage } from "@/lib/gmail/service";

/**
 * POST /api/ai/confirm-send
 *
 * Secure execution endpoint for AI-initiated, human-confirmed email sends.
 *
 * Security:
 * - Session ID is derived strictly from server-side httpOnly cookies.
 * - Requires a valid, unexpired, single-use pending-send token matching the session.
 * - Message payload (to, subject, body) is retrieved from the server-side authoritative record,
 *   never trusted from client request parameters.
 * - Atomically consumes the token to prevent duplicate dispatch or replay attacks.
 */
export async function POST(req: NextRequest) {
  const sessionId = await getSessionIdFromCookies();

  if (!sessionId) {
    return NextResponse.json(
      { error: "Unauthenticated: Please sign in to confirm this send." },
      { status: 401 }
    );
  }

  let body: { token?: unknown; cancel?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request: body must be valid JSON." },
      { status: 400 }
    );
  }

  const { token, cancel } = body;

  if (typeof token !== "string" || !token.trim()) {
    return NextResponse.json(
      { error: "Validation error: 'token' is required." },
      { status: 400 }
    );
  }

  const cleanToken = token.trim();

  // Handle explicit cancellation
  if (cancel === true) {
    const cancelled = cancelPendingSend(sessionId, cleanToken);
    return NextResponse.json(
      { success: true, cancelled },
      { status: 200 }
    );
  }

  // Atomically verify and consume the token
  const pending = verifyAndConsumePendingSend(sessionId, cleanToken);
  if (!pending) {
    return NextResponse.json(
      {
        error:
          "Authorization expired or invalid. Please request send confirmation again.",
      },
      { status: 400 }
    );
  }

  try {
    // Send via authoritative server-side message payload
    const result = await sendGmailMessage(sessionId, {
       to: pending.to,
       subject: pending.subject,
       body: pending.body,
       threadId: pending.threadId,
       inReplyTo: pending.inReplyTo,
     });

    return NextResponse.json({ success: true, ...result }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to send email.";
    console.error("[POST /api/ai/confirm-send] Error:", message);

    if (message.startsWith("VALIDATION_ERROR:")) {
      return NextResponse.json(
        { error: message.replace("VALIDATION_ERROR:", "").trim() },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to send email via Gmail. Please try again." },
      { status: 500 }
    );
  }
}
