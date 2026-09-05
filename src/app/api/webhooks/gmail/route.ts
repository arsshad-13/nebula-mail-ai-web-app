import { NextRequest, NextResponse } from "next/server";
import { decodePubSubMessage } from "@/lib/gmail/history";
import { processGmailHistory } from "@/lib/gmail/history";
import { getSyncState, updateHistoryId, markWatchUnregistered } from "@/lib/gmail/sync-store";
import { emitMailChange } from "@/lib/sync/emitter";
import { getCurrentHistoryId } from "@/lib/gmail/watch";

/**
 * POST /api/webhooks/gmail
 *
 * Receives Google Cloud Pub/Sub push notifications for Gmail mailbox changes.
 *
 * Security model:
 * - Google Pub/Sub push sends a Bearer token (OIDC JWT) in the Authorization header.
 * - For this hiring-task implementation we use a simpler shared-secret approach:
 *   The Pub/Sub push subscription URL includes a ?token= query parameter.
 *   This token is a random secret set in PUBSUB_WEBHOOK_SECRET env var.
 *   The subscription URL is: https://your-domain/api/webhooks/gmail?token=<secret>
 * - An attacker without the secret cannot trigger a sync for arbitrary users.
 *
 * > Production upgrade path: replace the shared-secret check with full OIDC JWT
 *   verification against Google's public JWKS endpoint, verifying `aud` = webhook URL
 *   and `email` = the configured Pub/Sub service account. This is documented in
 *   Google's Pub/Sub push authentication guide.
 *
 * User identity resolution:
 * - The Pub/Sub payload contains the emailAddress of the Gmail account that changed.
 * - We look up the session by matching user.email in the session store.
 *   NOTE: The session store is file-backed and iterated — acceptable for a single-user
 *   hiring-task scenario. A production system would use an indexed store (e.g., Redis)
 *   mapping email → sessionId.
 *
 * Idempotency:
 * - We store the latest processed historyId. If a duplicate notification arrives with
 *   the same or lower historyId, we skip processing.
 * - Pub/Sub guarantees at-least-once delivery so duplicates are expected and handled.
 *
 * HTTP responses:
 * - 200: Processed successfully (including ignored duplicates / no-ops).
 * - 400: Invalid or missing Pub/Sub payload.
 * - 401: Missing or invalid webhook secret token.
 * - 500: Internal processing error (Pub/Sub will retry on non-2xx responses).
 */
export async function POST(request: NextRequest) {
  // 1. Validate shared-secret webhook token
  const expectedToken = process.env.PUBSUB_WEBHOOK_SECRET;
  if (!expectedToken) {
    console.error(
      "[webhook/gmail] PUBSUB_WEBHOOK_SECRET env var not set. Rejecting all webhook requests."
    );
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const urlToken = request.nextUrl.searchParams.get("token");
  if (!urlToken || urlToken !== expectedToken) {
    console.warn("[webhook/gmail] Rejected webhook request: invalid or missing token.");
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // 2. Parse and decode the Pub/Sub push message
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    console.warn("[webhook/gmail] Failed to parse request body as JSON.");
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const decoded = decodePubSubMessage(rawBody);
  if (!decoded) {
    console.warn("[webhook/gmail] Could not decode Pub/Sub message payload:", rawBody);
    // Return 200 to prevent Pub/Sub from retrying a malformed message indefinitely
    return NextResponse.json({ error: "Malformed Pub/Sub payload. Acknowledged." }, { status: 200 });
  }

  const { emailAddress, historyId: notifiedHistoryId } = decoded.payload;
  console.log(
    `[webhook/gmail] Received notification for ${emailAddress}, historyId=${notifiedHistoryId}, msgId=${decoded.messageId}`
  );

  // 3. Resolve session for this Gmail emailAddress
  // We scan the session files to find the session whose user.email matches.
  // This is acceptable for a single-user/hiring-task scenario.
  const session = await findSessionByEmail(emailAddress);
  if (!session) {
    // Unknown email — could be a stale watch from a previous user. Acknowledge and skip.
    console.warn(`[webhook/gmail] No active session found for email: ${emailAddress}. Skipping.`);
    return NextResponse.json({ skipped: true, reason: "No session for email." }, { status: 200 });
  }

  const userId = session.user.id;
  const sessionId = session.id;

  // 4. Idempotency check — skip if we've already processed this historyId or newer
  const syncState = await getSyncState(userId);
  const knownHistoryId = syncState?.historyId;

  if (knownHistoryId && BigInt(notifiedHistoryId) <= BigInt(knownHistoryId)) {
    console.log(
      `[webhook/gmail] Duplicate or stale notification for ${emailAddress}: notified=${notifiedHistoryId}, known=${knownHistoryId}. Skipping.`
    );
    return NextResponse.json({ skipped: true, reason: "Already processed." }, { status: 200 });
  }

  // 5. Process Gmail history from the last known checkpoint
  const startHistoryId =
    knownHistoryId ?? (BigInt(notifiedHistoryId) - BigInt(1)).toString();

  try {
    const result = await processGmailHistory(sessionId, startHistoryId);

    if (result.historyExpired) {
      // Full resync: fetch current historyId from profile, mark watch as needing renewal
      console.warn(
        `[webhook/gmail] History expired for ${emailAddress}. Triggering full resync.`
      );
      const currentHistoryId = await getCurrentHistoryId(sessionId);
      if (currentHistoryId) {
        await updateHistoryId(userId, currentHistoryId);
      }
      await markWatchUnregistered(userId);

      // Emit a "mail:refresh" event so the client re-fetches the full inbox
      emitMailChange(userId, {
        type: "mail:refresh",
        timestamp: new Date().toISOString(),
      });

      return NextResponse.json({ refreshed: true }, { status: 200 });
    }

    // 6. Persist the new historyId checkpoint
    await updateHistoryId(userId, result.latestHistoryId);

    // 7. Emit SSE event to all active browser connections for this user
    if (result.newMessages.length > 0) {
      console.log(
        `[webhook/gmail] ${result.newMessages.length} new INBOX message(s) for ${emailAddress}. Emitting mail:new.`
      );
      emitMailChange(userId, {
        type: "mail:new",
        count: result.newMessages.length,
        timestamp: new Date().toISOString(),
      });
    } else {
      console.log(`[webhook/gmail] No new INBOX messages for ${emailAddress} in this notification.`);
    }

    return NextResponse.json({ processed: true, newMessages: result.newMessages.length }, { status: 200 });
  } catch (err: unknown) {
    console.error(`[webhook/gmail] Error processing history for ${emailAddress}:`, err);
    // Return 500 so Pub/Sub retries
    return NextResponse.json(
      { error: "Internal processing error." },
      { status: 500 }
    );
  }
}

/**
 * Finds a server session by matching user.email.
 * Searches memory store first (O(n) on active sessions), then disk.
 *
 * This is a targeted scan — acceptable for a single-user hiring-task deployment.
 * In production, maintain an email→sessionId index in Redis or a DB.
 */
async function findSessionByEmail(email: string) {
  // Try common session IDs from the file system
  const fs = await import("fs/promises");
  const path = await import("path");
  const SESSIONS_DIR = process.env.DATA_DIR
    ? path.join(process.env.DATA_DIR, ".sessions")
    : path.join(process.cwd(), ".sessions");

  try {
    const files = await fs.readdir(SESSIONS_DIR);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const content = await fs.readFile(path.join(SESSIONS_DIR, file), "utf-8");
        const session = JSON.parse(content);
        if (session?.user?.email === email) {
          return session as { id: string; user: { id: string; email: string }; tokens: unknown };
        }
      } catch {
        // Skip unreadable/malformed files
      }
    }
  } catch {
    // Sessions dir doesn't exist yet
  }

  return null;
}
