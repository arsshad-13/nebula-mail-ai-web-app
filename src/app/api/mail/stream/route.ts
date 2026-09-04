import { NextRequest } from "next/server";
import { getSessionIdFromCookies } from "@/lib/auth/cookies";
import { getSession } from "@/lib/auth/session-store";
import { subscribeToMailChanges, MailChangeEvent } from "@/lib/sync/emitter";

/**
 * GET /api/mail/stream
 *
 * Server-Sent Events (SSE) endpoint for real-time inbox change notifications.
 *
 * Connection lifecycle:
 * 1. Browser opens EventSource("/api/mail/stream").
 * 2. Session cookie is validated server-side.
 * 3. A listener is registered on the in-memory emitter for this user's Gmail ID.
 * 4. When the Pub/Sub webhook emits a "mail:new" or "mail:refresh" event,
 *    this handler forwards it as an SSE event to the browser.
 * 5. When the connection closes (tab/browser closed, navigation), the listener
 *    is unsubscribed via AbortSignal.
 *
 * SSE event format:
 *   event: mail:new\n
 *   data: {"type":"mail:new","count":2,"timestamp":"..."}\n\n
 *
 *   event: mail:refresh\n
 *   data: {"type":"mail:refresh","timestamp":"..."}\n\n
 *
 * Security:
 * - Only authenticated sessions (valid httpOnly session cookie) can connect.
 * - The userId is derived from the server-side session, not client-provided data.
 * - Events are scoped to the userId — no cross-user leakage.
 *
 * Next.js App Router note:
 * - We use the Web Streams ReadableStream API, which Next.js App Router
 *   route handlers support natively.
 * - The dynamic = "force-dynamic" export is required to prevent static caching.
 */

export const dynamic = "force-dynamic";

const HEARTBEAT_INTERVAL_MS = 25 * 1000; // 25s heartbeat to keep connection alive

export async function GET(request: NextRequest) {
  // 1. Authenticate
  const sessionId = await getSessionIdFromCookies();
  if (!sessionId) {
    return new Response("Unauthorized: No active session.", {
      status: 401,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const session = await getSession(sessionId);
  if (!session) {
    return new Response("Unauthorized: Session not found.", {
      status: 401,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const userId = session.user.id;
  const signal = request.signal; // AbortSignal — fires when client disconnects

  const encoder = new TextEncoder();

  // 2. Build SSE ReadableStream
  const stream = new ReadableStream({
    start(controller) {
      // Helper: format a standard SSE message
      function sendEvent(eventType: string, data: object) {
        try {
          const payload =
            `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Controller may be closed if client disconnected
        }
      }

      // Send initial connection confirmation
      sendEvent("connected", {
        type: "connected",
        timestamp: new Date().toISOString(),
        userId,
      });

      // 3. Subscribe to mail change events for this user
      const unsubscribe = subscribeToMailChanges(userId, (event: MailChangeEvent) => {
        sendEvent(event.type, event);
      });

      // 4. Heartbeat to prevent proxy/firewall idle-connection termination
      const heartbeatTimer = setInterval(() => {
        try {
          // SSE comment lines keep the connection alive without triggering onmessage
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeatTimer);
        }
      }, HEARTBEAT_INTERVAL_MS);

      // 5. Clean up when client disconnects
      signal.addEventListener("abort", () => {
        clearInterval(heartbeatTimer);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed
        }
        console.log(`[sse-stream] Client disconnected: userId=${userId}`);
      });

      console.log(`[sse-stream] Client connected: userId=${userId}`);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Security headers
      "X-Content-Type-Options": "nosniff",
    },
  });
}
