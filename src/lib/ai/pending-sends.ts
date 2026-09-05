import crypto from "crypto";

export interface PendingSendRecord {
  token: string;
  sessionId: string;
  to: string;
  subject: string;
  body: string;
  threadId?: string;
  inReplyTo?: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
}

/**
 * In-memory store for short-lived, session-bound pending send authorizations.
 * Authoritative email contents (to, subject, body, threadId) remain strictly on the server.
 */
const pendingSendsMap = new Map<string, PendingSendRecord>();

const TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Prunes expired or consumed send records from the cache.
 */
function pruneExpired() {
  const now = Date.now();
  for (const [token, record] of pendingSendsMap.entries()) {
    if (record.expiresAt < now || record.used) {
      pendingSendsMap.delete(token);
    }
  }
}

/**
 * Creates a short-lived pending-send authorization record.
 * Generates an opaque, cryptographically random token bound to the authenticated user's session.
 */
export function createPendingSend(
  sessionId: string,
  params: { to: string; subject: string; body: string; threadId?: string; inReplyTo?: string }
): PendingSendRecord {
  pruneExpired();

  const token = crypto.randomBytes(24).toString("hex");
  const now = Date.now();

  const record: PendingSendRecord = {
    token,
    sessionId,
    to: params.to.trim(),
    subject: params.subject.trim(),
    body: params.body,
    threadId: params.threadId,
    inReplyTo: params.inReplyTo,
    createdAt: now,
    expiresAt: now + TTL_MS,
    used: false,
  };

  pendingSendsMap.set(token, record);
  return record;
}

/**
 * Atomically verifies and consumes a pending send authorization.
 * Enforces session ownership, non-expiration, and single-use guarantees.
 * Returns the server-authoritative message payload or null if invalid.
 */
export function verifyAndConsumePendingSend(
  sessionId: string,
  token: string
): { to: string; subject: string; body: string; threadId?: string; inReplyTo?: string } | null {
  const record = pendingSendsMap.get(token);

  if (!record) {
    return null;
  }

  // 1. Session binding check
  if (record.sessionId !== sessionId) {
    return null;
  }

  // 2. Expiry check
  if (Date.now() > record.expiresAt) {
    pendingSendsMap.delete(token);
    return null;
  }

  // 3. Single-use check
  if (record.used) {
    pendingSendsMap.delete(token);
    return null;
  }

  // Atomically mark used and remove from store
  record.used = true;
  pendingSendsMap.delete(token);

  return {
    to: record.to,
    subject: record.subject,
    body: record.body,
    threadId: record.threadId,
    inReplyTo: record.inReplyTo,
  };
}

/**
 * Explicitly cancels an active pending send authorization.
 */
export function cancelPendingSend(sessionId: string, token: string): boolean {
  const record = pendingSendsMap.get(token);
  if (record && record.sessionId === sessionId) {
    pendingSendsMap.delete(token);
    return true;
  }
  return false;
}
