import { EventEmitter } from "events";

/**
 * Server-Sent Events emitter for real-time mailbox change notifications.
 *
 * Architecture:
 * - A singleton Node.js EventEmitter is used to broadcast "mail:new" events
 *   from the Pub/Sub webhook handler to all active SSE connections.
 * - Each authenticated user's browser tab opens an EventSource to /api/mail/stream.
 * - The SSE route registers a listener on this emitter keyed by userId.
 * - When the webhook processes a Gmail notification, it emits on the userId.
 *
 * Security:
 * - Events are keyed by Gmail userId (Google sub claim), NOT by session ID or email.
 *   This prevents one user's events from reaching another user's tab.
 * - The userId is derived server-side from the authenticated session — never from
 *   client-provided data.
 *
 * Scalability limitations (documented):
 * - This is an in-memory emitter local to a single Node.js process.
 * - In a horizontally scaled deployment (multiple instances), events would only
 *   reach clients connected to the same instance that received the webhook.
 * - For production horizontal scaling, replace this with a Redis pub/sub or
 *   Vercel KV-backed broadcast. The interface is designed to be swappable.
 *
 * Multi-tab behavior:
 * - Multiple tabs for the same user each register a separate listener.
 * - Emitting once broadcasts to all tabs (each listener fires independently).
 * - Listeners are removed when the SSE connection closes (AbortSignal).
 */

export interface MailChangeEvent {
  /** Type of change */
  type: "mail:new" | "mail:refresh";
  /** Number of new messages detected (informational — client always re-fetches) */
  count?: number;
  /** Timestamp of the notification */
  timestamp: string;
}

// Singleton emitter — lives for the lifetime of the Node.js process
const mailEmitter = new EventEmitter();
// Increase max listeners to avoid Node.js warning for many concurrent tabs
mailEmitter.setMaxListeners(100);

/** Event channel name for a given user's mailbox changes */
function channelName(userId: string): string {
  return `mail:${userId}`;
}

/**
 * Subscribe to mailbox change events for a specific user.
 * The returned unsubscribe function must be called when the SSE connection closes.
 */
export function subscribeToMailChanges(
  userId: string,
  listener: (event: MailChangeEvent) => void
): () => void {
  const channel = channelName(userId);
  mailEmitter.on(channel, listener);
  return () => {
    mailEmitter.off(channel, listener);
  };
}

/**
 * Emit a mailbox change event for a specific user.
 * Called by the Pub/Sub webhook handler after processing Gmail history.
 * All active SSE connections for this userId will receive the event.
 */
export function emitMailChange(userId: string, event: MailChangeEvent): void {
  const channel = channelName(userId);
  const listenerCount = mailEmitter.listenerCount(channel);
  console.log(
    `[sse-emitter] Emitting ${event.type} for userId=${userId} (${listenerCount} active connections)`
  );
  mailEmitter.emit(channel, event);
}

/**
 * Returns the number of active SSE connections for a user (useful for diagnostics).
 */
export function activeConnectionCount(userId: string): number {
  return mailEmitter.listenerCount(channelName(userId));
}
