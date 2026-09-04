import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { AuthUser, GoogleTokens, ServerSession } from "@/types/auth";

const SESSIONS_DIR = path.join(process.cwd(), ".sessions");

// In-memory cache for fast lookups
const memoryStore = new Map<string, ServerSession>();
let dirEnsured = false;

async function ensureSessionsDirectory() {
  if (dirEnsured) return;
  try {
    await fs.mkdir(SESSIONS_DIR, { recursive: true });
    dirEnsured = true;
  } catch (error) {
    console.error("Failed to create sessions directory:", error);
  }
}

function getSessionFilePath(sessionId: string): string {
  // Sanitize session ID to prevent path traversal
  const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(SESSIONS_DIR, `${safeId}.json`);
}

export async function createSession(
  user: AuthUser,
  tokens: GoogleTokens
): Promise<ServerSession> {
  await ensureSessionsDirectory();

  const id = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  const session: ServerSession = {
    id,
    user,
    tokens,
    createdAt: now,
    updatedAt: now,
  };

  memoryStore.set(id, session);

  try {
    await fs.writeFile(
      getSessionFilePath(id),
      JSON.stringify(session, null, 2),
      "utf-8"
    );
  } catch (error) {
    console.error("Failed to persist session to disk:", error);
  }

  return session;
}

export async function getSession(
  sessionId: string | undefined | null
): Promise<ServerSession | null> {
  if (!sessionId) return null;

  if (memoryStore.has(sessionId)) {
    return memoryStore.get(sessionId)!;
  }

  await ensureSessionsDirectory();
  try {
    const filePath = getSessionFilePath(sessionId);
    const content = await fs.readFile(filePath, "utf-8");
    const session: ServerSession = JSON.parse(content);
    memoryStore.set(sessionId, session);
    return session;
  } catch {
    return null;
  }
}

export async function updateSessionTokens(
  sessionId: string,
  newTokens: Partial<GoogleTokens>
): Promise<ServerSession | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  session.tokens = {
    ...session.tokens,
    ...newTokens,
  };
  session.updatedAt = Date.now();

  memoryStore.set(sessionId, session);

  try {
    await fs.writeFile(
      getSessionFilePath(sessionId),
      JSON.stringify(session, null, 2),
      "utf-8"
    );
  } catch (error) {
    console.error("Failed to update session file:", error);
  }

  return session;
}

export async function deleteSession(sessionId: string): Promise<void> {
  memoryStore.delete(sessionId);
  try {
    const filePath = getSessionFilePath(sessionId);
    await fs.unlink(filePath);
  } catch {
    // File might already be deleted or not present
  }
}
