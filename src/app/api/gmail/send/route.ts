import { NextRequest, NextResponse } from "next/server";
import { getSessionIdFromCookies } from "@/lib/auth/cookies";
import { sendGmailMessage } from "@/lib/gmail/service";

/**
 * POST /api/gmail/send
 *
 * Sends an email via the authenticated user's Gmail account.
 *
 * Security:
 * - Session ID is read from the httpOnly session cookie via Next.js headers(); never from client request body.
 * - The From address is strictly derived from the server-side authenticated session.
 * - Client-provided To and Subject are validated for CRLF injection before sending.
 * - No sensitive token or session data is ever returned to the client.
 */
export async function POST(req: NextRequest) {
  const sessionId = await getSessionIdFromCookies();

  if (!sessionId) {
    return NextResponse.json(
      { error: "Unauthenticated: No session found." },
      { status: 401 }
    );
  }

  let body: {
    to?: unknown;
    subject?: unknown;
    body?: unknown;
    threadId?: unknown;
    inReplyTo?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request: body must be valid JSON." },
      { status: 400 }
    );
  }

  const { to, subject, body: emailBody, threadId: rawThreadId, inReplyTo: rawInReplyTo } = body;

  // Validate presence of required fields
  if (typeof to !== "string" || to.trim() === "") {
    return NextResponse.json(
      { error: "Validation error: 'to' is required." },
      { status: 400 }
    );
  }
  if (typeof subject !== "string" || subject.trim() === "") {
    return NextResponse.json(
      { error: "Validation error: 'subject' is required." },
      { status: 400 }
    );
  }
  if (typeof emailBody !== "string") {
    return NextResponse.json(
      { error: "Validation error: 'body' is required." },
      { status: 400 }
    );
  }

  // Length guards (conservative limits to avoid accidental misuse)
  if (to.length > 320) {
    return NextResponse.json(
      { error: "Validation error: 'to' address is too long." },
      { status: 400 }
    );
  }
  if (subject.length > 998) {
    return NextResponse.json(
      { error: "Validation error: 'subject' is too long (max 998 chars)." },
      { status: 400 }
    );
  }
  if (emailBody.length > 1_000_000) {
    return NextResponse.json(
      { error: "Validation error: email body is too large." },
      { status: 400 }
    );
  }

  const threadId =
    typeof rawThreadId === "string" && rawThreadId.trim() !== ""
      ? rawThreadId.trim()
      : undefined;

  const inReplyTo =
    typeof rawInReplyTo === "string" && rawInReplyTo.trim() !== ""
      ? rawInReplyTo.trim()
      : undefined;

  if (inReplyTo && inReplyTo.length > 998) {
    return NextResponse.json(
      { error: "Validation error: 'inReplyTo' header is too long." },
      { status: 400 }
    );
  }

  try {
    const result = await sendGmailMessage(sessionId, {
      to: to.trim(),
      subject: subject.trim(),
      body: emailBody,
      threadId,
      inReplyTo,
    });

    return NextResponse.json({ success: true, ...result }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to send email.";

    // Surface clean validation errors as 400; everything else as 500
    if (message.startsWith("VALIDATION_ERROR:")) {
      return NextResponse.json(
        { error: message.replace("VALIDATION_ERROR:", "").trim() },
        { status: 400 }
      );
    }

    console.error("[POST /api/gmail/send] Error:", message);
    return NextResponse.json(
      { error: "Failed to send email. Please try again." },
      { status: 500 }
    );
  }
}
