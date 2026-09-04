import { NextResponse } from "next/server";
import { getSessionIdFromCookies } from "@/lib/auth/cookies";
import { getSession } from "@/lib/auth/session-store";
import { registerGmailWatch } from "@/lib/gmail/watch";
import {
  getSyncState,
  updateWatchState,
  markWatchUnregistered,
  isWatchExpired,
} from "@/lib/gmail/sync-store";

/**
 * POST /api/gmail/watch
 *
 * Registers (or renews) a Gmail Pub/Sub watch for the authenticated user's INBOX.
 *
 * Must be called:
 * 1. After the user successfully authenticates (to start real-time sync).
 * 2. Periodically before the watch expires (~7 days) — can be triggered by
 *    a Vercel Cron Job or an external scheduler POSTing to this endpoint.
 *
 * Prerequisites (must be configured in Google Cloud before calling):
 * - Pub/Sub topic created: projects/{PROJECT_ID}/topics/{TOPIC_NAME}
 * - Topic grants publish access to: gmail-api-push@system.gserviceaccount.com
 * - Pub/Sub push subscription created pointing to: {APP_URL}/api/webhooks/gmail?token={PUBSUB_WEBHOOK_SECRET}
 * - PUBSUB_TOPIC_NAME set in .env.local
 *
 * GET /api/gmail/watch
 *
 * Returns the current watch status and sync state for the authenticated user.
 * Useful for diagnostics and to check if renewal is needed.
 */

export async function POST() {
  const sessionId = await getSessionIdFromCookies();
  if (!sessionId) {
    return NextResponse.json(
      { error: "Unauthenticated: Please sign in." },
      { status: 401 }
    );
  }

  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.json(
      { error: "Session not found. Please sign in again." },
      { status: 401 }
    );
  }

  const userId = session.user.id;

  try {
    const result = await registerGmailWatch(sessionId);

    if (!result) {
      return NextResponse.json(
        {
          error:
            "Failed to register Gmail watch. Ensure PUBSUB_TOPIC_NAME is set and the Pub/Sub topic is correctly configured.",
        },
        { status: 500 }
      );
    }

    // Persist the new watch state (historyId + expiry)
    await updateWatchState(userId, result.historyId, result.expiration);

    return NextResponse.json({
      success: true,
      historyId: result.historyId,
      expiresAt: new Date(result.expiration).toISOString(),
      userId,
    });
  } catch (err: unknown) {
    console.error("[POST /api/gmail/watch] Error:", err);
    await markWatchUnregistered(userId);
    return NextResponse.json(
      { error: "Failed to register Gmail watch. Check server logs." },
      { status: 500 }
    );
  }
}

export async function GET() {
  const sessionId = await getSessionIdFromCookies();
  if (!sessionId) {
    return NextResponse.json(
      { error: "Unauthenticated: Please sign in." },
      { status: 401 }
    );
  }

  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.json(
      { error: "Session not found." },
      { status: 401 }
    );
  }

  const userId = session.user.id;
  const syncState = await getSyncState(userId);
  const needsRenewal = await isWatchExpired(userId);

  return NextResponse.json({
    userId,
    email: session.user.email,
    watchRegistered: syncState?.watchRegistered ?? false,
    watchExpiresAt: syncState?.watchExpiry
      ? new Date(syncState.watchExpiry).toISOString()
      : null,
    historyId: syncState?.historyId ?? null,
    needsRenewal,
    updatedAt: syncState?.updatedAt ?? null,
    pubsubTopicConfigured: !!process.env.PUBSUB_TOPIC_NAME,
    webhookSecretConfigured: !!process.env.PUBSUB_WEBHOOK_SECRET,
  });
}
