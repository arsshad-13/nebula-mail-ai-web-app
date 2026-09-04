import { google } from "googleapis";
import { getSession, updateSessionTokens } from "@/lib/auth/session-store";

/**
 * STAGE 3 SCOPES:
 * Read-only access for Inbox/Sent/Email Detail (Stage 2) PLUS gmail.send for Compose/Send (Stage 3).
 *
 * NOTE: Future stages may expand permissions further (e.g. gmail.modify) for
 * AI-driven labeling, archiving, or read-state management.
 */
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

/**
 * Backwards-compatible alias (Stage 2). Kept for reference — all new routes
 * should use GMAIL_SCOPES which includes the send permission.
 */
export const GMAIL_READONLY_SCOPES = GMAIL_SCOPES;

export function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/callback`;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Google OAuth credentials missing. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local"
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export async function getAuthenticatedGmailClient(sessionId: string | null) {
  if (!sessionId) {
    return null;
  }

  const session = await getSession(sessionId);
  if (!session || !session.tokens) {
    return null;
  }

  const oauth2Client = getOAuth2Client();

  oauth2Client.setCredentials({
    access_token: session.tokens.access_token,
    refresh_token: session.tokens.refresh_token,
    expiry_date: session.tokens.expiry_date,
    token_type: session.tokens.token_type || "Bearer",
    scope: session.tokens.scope || undefined,
  });

  // Automatically persist renewed tokens to server session store when refreshed
  oauth2Client.on("tokens", async (tokens) => {
    try {
      await updateSessionTokens(sessionId, {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || session.tokens.refresh_token,
        expiry_date: tokens.expiry_date,
        token_type: tokens.token_type,
        scope: tokens.scope,
      });
    } catch (err) {
      console.error("Failed to update refreshed session tokens:", err);
    }
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  return {
    gmail,
    user: session.user,
    oauth2Client,
    sessionId,
  };
}
