import { getAuthenticatedGmailClient } from "./index";
import { EmailMessage } from "@/types/mail";
import { mapGmailMessageToEmailMessage } from "./history-mapper";

/**
 * Registers or renews a Gmail watch for the INBOX of the authenticated user.
 *
 * Gmail watches expire in ~7 days. This function should be called:
 *   1. Immediately after successful OAuth login to start the watch.
 *   2. Periodically (at least every 6 days) to renew before expiry.
 *   3. After receiving a watch expiry error during history processing.
 *
 * Requires Pub/Sub topic: projects/{PROJECT_ID}/topics/{TOPIC_NAME}
 * The topic must grant publish access to:
 *   gmail-api-push@system.gserviceaccount.com
 *
 * Returns: { historyId, expiration } on success, null on failure.
 */
export async function registerGmailWatch(
  sessionId: string
): Promise<{ historyId: string; expiration: number } | null> {
  const topicName = process.env.PUBSUB_TOPIC_NAME;
  if (!topicName) {
    console.error("[gmail-watch] PUBSUB_TOPIC_NAME env var is not set. Cannot register watch.");
    return null;
  }

  const auth = await getAuthenticatedGmailClient(sessionId);
  if (!auth) {
    console.error("[gmail-watch] Failed to get authenticated Gmail client.");
    return null;
  }

  const { gmail } = auth;

  try {
    const res = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName,
        labelIds: ["INBOX"],
        labelFilterBehavior: "INCLUDE",
      },
    });

    const { historyId, expiration } = res.data;
    if (!historyId || !expiration) {
      console.error("[gmail-watch] Watch response missing historyId or expiration:", res.data);
      return null;
    }

    console.log(
      `[gmail-watch] Watch registered. historyId=${historyId}, expires=${new Date(Number(expiration)).toISOString()}`
    );

    return {
      historyId,
      expiration: Number(expiration),
    };
  } catch (err: unknown) {
    console.error("[gmail-watch] Failed to register Gmail watch:", err);
    return null;
  }
}

/**
 * Stops an active Gmail watch for the authenticated user.
 * Gracefully handles errors (e.g., no active watch).
 */
export async function stopGmailWatch(sessionId: string): Promise<boolean> {
  const auth = await getAuthenticatedGmailClient(sessionId);
  if (!auth) return false;

  try {
    await auth.gmail.users.stop({ userId: "me" });
    console.log("[gmail-watch] Watch stopped for user:", auth.user.email);
    return true;
  } catch (err) {
    console.warn("[gmail-watch] Could not stop Gmail watch (may not be active):", err);
    return false;
  }
}

/**
 * Fetches the current Gmail profile historyId.
 * Used to bootstrap the historyId when no prior checkpoint exists,
 * or to recover after a historyId expiry.
 */
export async function getCurrentHistoryId(sessionId: string): Promise<string | null> {
  const auth = await getAuthenticatedGmailClient(sessionId);
  if (!auth) return null;

  try {
    const res = await auth.gmail.users.getProfile({ userId: "me" });
    return res.data.historyId ?? null;
  } catch (err) {
    console.error("[gmail-watch] Failed to fetch profile historyId:", err);
    return null;
  }
}

// Re-export for use in watch route
export { mapGmailMessageToEmailMessage };
export type { EmailMessage };
