import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getOAuth2Client } from "@/lib/gmail";
import {
  clearOAuthStateCookie,
  getOAuthStateFromCookies,
  setSessionIdCookie,
} from "@/lib/auth/cookies";
import { createSession } from "@/lib/auth/session-store";
import { AuthUser } from "@/types/auth";

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const searchParams = request.nextUrl.searchParams;

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  if (oauthError) {
    console.warn("Google OAuth returned error:", oauthError);
    return NextResponse.redirect(`${appUrl}/?auth_error=${encodeURIComponent(oauthError)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${appUrl}/?auth_error=missing_code_or_state`
    );
  }

  // 1. Verify OAuth state parameter against HTTP-only cookie for CSRF defense
  const expectedState = await getOAuthStateFromCookies();
  await clearOAuthStateCookie();

  if (!expectedState || expectedState !== state) {
    console.error("OAuth state mismatch. Expected:", expectedState, "Received:", state);
    return NextResponse.redirect(
      `${appUrl}/?auth_error=invalid_state_csrf`
    );
  }

  try {
    const oauth2Client = getOAuth2Client();

    // 2. Exchange authorization code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // 3. Fetch user profile from Google OAuth2 userinfo
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const userinfo = await oauth2.userinfo.get();

    const user: AuthUser = {
      id: userinfo.data.id || "unknown",
      email: userinfo.data.email || "",
      name: userinfo.data.name || undefined,
      avatarUrl: userinfo.data.picture || undefined,
    };

    // 4. Store tokens securely on server, obtain opaque session ID
    const session = await createSession(user, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      token_type: tokens.token_type,
      scope: tokens.scope,
    });

    // 5. Set opaque session identifier in HTTP-only cookie (no tokens exposed in cookie)
    await setSessionIdCookie(session.id);

    return NextResponse.redirect(`${appUrl}/`);
  } catch (err) {
    console.error("Error exchanging OAuth code:", err);
    return NextResponse.redirect(
      `${appUrl}/?auth_error=${encodeURIComponent((err as Error).message || "exchange_failed")}`
    );
  }
}
