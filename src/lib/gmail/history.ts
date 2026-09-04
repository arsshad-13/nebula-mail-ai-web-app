import { getAuthenticatedGmailClient } from "./index";
import { EmailMessage } from "@/types/mail";
import { mapGmailMessageToEmailMessage } from "./history-mapper";

export interface HistoryProcessResult {
  /** New INBOX messages identified from history */
  newMessages: EmailMessage[];
  /** The latest historyId to store as the new checkpoint */
  latestHistoryId: string;
  /** True if Gmail indicated history was expired/invalid (full resync required) */
  historyExpired: boolean;
}

/**
 * Processes Gmail history changes starting from the given historyId.
 *
 * Algorithm:
 * 1. Call gmail.users.history.list with startHistoryId.
 * 2. Collect all messagesAdded events where the message has the INBOX label.
 * 3. For each new INBOX message, fetch metadata.
 * 4. Return new messages + the latest historyId seen (for checkpoint update).
 *
 * History expiry handling:
 * If Gmail returns an error indicating the historyId is too old
 * (HTTP 404 with "Start history ID too old"), we set historyExpired = true.
 * The caller should trigger a full inbox refresh and reset the checkpoint.
 *
 * This function is intentionally pure over the Gmail API — no file I/O.
 * State persistence is the caller's responsibility (sync-store.ts).
 */
export async function processGmailHistory(
  sessionId: string,
  startHistoryId: string
): Promise<HistoryProcessResult> {
  const auth = await getAuthenticatedGmailClient(sessionId);
  if (!auth) {
    throw new Error("[gmail-history] Failed to get authenticated Gmail client.");
  }

  const { gmail } = auth;

  let pageToken: string | undefined;
  const newMessageIds = new Set<string>();
  let latestHistoryId = startHistoryId;

  try {
    // Paginate through all history records since startHistoryId
    do {
      const res = await gmail.users.history.list({
        userId: "me",
        startHistoryId,
        labelId: "INBOX",
        historyTypes: ["messageAdded"],
        maxResults: 100,
        pageToken,
      });

      const records = res.data.history ?? [];
      for (const record of records) {
        // Update latestHistoryId to the most recent record seen
        if (record.id && BigInt(record.id) > BigInt(latestHistoryId)) {
          latestHistoryId = record.id;
        }

        // Collect newly added message IDs from INBOX
        for (const added of record.messagesAdded ?? []) {
          const msgId = added.message?.id;
          const labels = added.message?.labelIds ?? [];
          if (msgId && labels.includes("INBOX")) {
            newMessageIds.add(msgId);
          }
        }
      }

      // Also advance historyId from the response header if provided
      if (res.data.historyId) {
        if (BigInt(res.data.historyId) > BigInt(latestHistoryId)) {
          latestHistoryId = res.data.historyId;
        }
      }

      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
  } catch (err: unknown) {
    // Detect history-expired condition
    if (isHistoryExpiredError(err)) {
      console.warn(
        `[gmail-history] historyId ${startHistoryId} is expired. Full resync required.`
      );
      return {
        newMessages: [],
        latestHistoryId: startHistoryId,
        historyExpired: true,
      };
    }
    throw err;
  }

  if (newMessageIds.size === 0) {
    return { newMessages: [], latestHistoryId, historyExpired: false };
  }

  // Fetch metadata for each new message concurrently
  const newMessages: EmailMessage[] = [];
  await Promise.allSettled(
    Array.from(newMessageIds).map(async (msgId) => {
      try {
        const msgRes = await gmail.users.messages.get({
          userId: "me",
          id: msgId,
          format: "metadata",
          metadataHeaders: ["From", "To", "Cc", "Bcc", "Subject", "Date"],
        });
        newMessages.push(mapGmailMessageToEmailMessage(msgRes.data));
      } catch (err) {
        console.error(`[gmail-history] Failed to fetch metadata for message ${msgId}:`, err);
      }
    })
  );

  // Sort by internalDate descending (newest first) for consistent ordering
  newMessages.sort((a, b) => {
    const ta = a.internalDate ? parseInt(a.internalDate, 10) : 0;
    const tb = b.internalDate ? parseInt(b.internalDate, 10) : 0;
    return tb - ta;
  });

  return { newMessages, latestHistoryId, historyExpired: false };
}

/**
 * Detects the Gmail "Start history ID too old" error.
 * Gmail returns HTTP 404 with a specific message when the historyId has expired.
 */
export function isHistoryExpiredError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: number; message?: string; errors?: Array<{ reason?: string }> };

  // googleapis throws with code 404
  if (e.code === 404) return true;

  // Check message substring
  const msg = (e.message ?? "").toLowerCase();
  if (msg.includes("start history id too old") || msg.includes("invalid history id")) return true;

  // Check nested errors array
  const errors = e.errors ?? [];
  return errors.some((er) => er.reason === "notFound");
}

/**
 * Decodes a Pub/Sub push message payload.
 *
 * Google Pub/Sub push sends a JSON body:
 * {
 *   "message": {
 *     "data": "<base64-encoded JSON>",
 *     "messageId": "...",
 *     "publishTime": "..."
 *   },
 *   "subscription": "projects/.../subscriptions/..."
 * }
 *
 * The decoded `data` for Gmail notifications is:
 * { "emailAddress": "user@gmail.com", "historyId": <number> }
 */
export interface GmailPubSubPayload {
  emailAddress: string;
  historyId: number | string;
}

export interface DecodedPubSubMessage {
  payload: GmailPubSubPayload;
  messageId: string;
  publishTime: string;
  subscription: string;
}

export function decodePubSubMessage(body: unknown): DecodedPubSubMessage | null {
  try {
    if (!body || typeof body !== "object") return null;

    const b = body as Record<string, unknown>;
    const message = b.message as Record<string, unknown> | undefined;
    if (!message) return null;

    const dataB64 = message.data as string | undefined;
    if (!dataB64 || typeof dataB64 !== "string") return null;

    // Base64-decode the message data
    const decoded = Buffer.from(dataB64, "base64").toString("utf-8");
    const payload: GmailPubSubPayload = JSON.parse(decoded);

    if (!payload.emailAddress || !payload.historyId) return null;

    return {
      payload,
      messageId: (message.messageId as string) ?? "",
      publishTime: (message.publishTime as string) ?? "",
      subscription: (b.subscription as string) ?? "",
    };
  } catch (err) {
    console.error("[gmail-history] Failed to decode Pub/Sub message:", err);
    return null;
  }
}
