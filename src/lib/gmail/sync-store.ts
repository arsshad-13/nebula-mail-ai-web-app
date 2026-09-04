import fs from "fs/promises";
import path from "path";

/**
 * Sync state for a single Gmail mailbox (keyed by Gmail user ID).
 *
 * - historyId: The latest processed Gmail historyId. Used as startHistoryId
 *   when calling gmail.users.history.list after a Pub/Sub notification.
 * - watchExpiry: Unix timestamp (ms) when the current Gmail watch expires.
 * - watchRegistered: Whether a watch has been successfully registered.
 */
export interface MailboxSyncState {
  /** Gmail user ID (sub claim / Google account ID) */
  userId: string;
  /** Latest processed Gmail historyId (string per Gmail API) */
  historyId: string | null;
  /** Unix timestamp ms when the current watch expires (~7 days from registration) */
  watchExpiry: number | null;
  /** True if a Pub/Sub watch is currently registered */
  watchRegistered: boolean;
  /** ISO timestamp of last update */
  updatedAt: string;
}

const SYNC_DIR = path.join(process.cwd(), ".sync-state");
let dirEnsured = false;

/** In-memory cache so repeated reads within the same process avoid FS I/O */
const memCache = new Map<string, MailboxSyncState>();

async function ensureDir() {
  if (dirEnsured) return;
  try {
    await fs.mkdir(SYNC_DIR, { recursive: true });
    dirEnsured = true;
  } catch (err) {
    console.error("[sync-store] Failed to create .sync-state dir:", err);
  }
}

function stateFilePath(userId: string): string {
  // Sanitize to prevent path traversal
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(SYNC_DIR, `${safe}.json`);
}

/** Read sync state for a user. Returns null if not yet initialized. */
export async function getSyncState(userId: string): Promise<MailboxSyncState | null> {
  if (memCache.has(userId)) return memCache.get(userId)!;

  await ensureDir();
  try {
    const raw = await fs.readFile(stateFilePath(userId), "utf-8");
    const state: MailboxSyncState = JSON.parse(raw);
    memCache.set(userId, state);
    return state;
  } catch {
    return null;
  }
}

/** Persist updated sync state for a user (upsert). */
export async function saveSyncState(state: MailboxSyncState): Promise<void> {
  const updated: MailboxSyncState = { ...state, updatedAt: new Date().toISOString() };
  memCache.set(state.userId, updated);
  await ensureDir();
  try {
    await fs.writeFile(stateFilePath(state.userId), JSON.stringify(updated, null, 2), "utf-8");
  } catch (err) {
    console.error(`[sync-store] Failed to persist sync state for user ${state.userId}:`, err);
  }
}

/** Update only the historyId for a user. Creates a record if one doesn't exist. */
export async function updateHistoryId(userId: string, historyId: string): Promise<void> {
  const existing = await getSyncState(userId);
  await saveSyncState({
    userId,
    historyId,
    watchExpiry: existing?.watchExpiry ?? null,
    watchRegistered: existing?.watchRegistered ?? false,
    updatedAt: new Date().toISOString(),
  });
}

/** Update watch registration details for a user. */
export async function updateWatchState(
  userId: string,
  historyId: string,
  watchExpiry: number
): Promise<void> {
  const existing = await getSyncState(userId);
  await saveSyncState({
    userId,
    historyId,
    watchExpiry,
    watchRegistered: true,
    updatedAt: existing?.updatedAt ?? new Date().toISOString(),
  });
}

/** Mark the watch as unregistered (e.g., after expiry or error). */
export async function markWatchUnregistered(userId: string): Promise<void> {
  const existing = await getSyncState(userId);
  if (!existing) return;
  await saveSyncState({
    ...existing,
    watchRegistered: false,
    watchExpiry: null,
  });
}

/** Check if the watch is expired or not registered, requiring renewal. */
export async function isWatchExpired(userId: string): Promise<boolean> {
  const state = await getSyncState(userId);
  if (!state || !state.watchRegistered || !state.watchExpiry) return true;
  // Renew 12 hours before expiry to avoid gaps
  const renewThresholdMs = 12 * 60 * 60 * 1000;
  return Date.now() >= state.watchExpiry - renewThresholdMs;
}
