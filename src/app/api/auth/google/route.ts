import { NextResponse } from "next/server";
import crypto from "crypto";
import { getOAuth2Client, GMAIL_SCOPES } from "@/lib/gmail";
import { setOAuthStateCookie } from "@/lib/auth/cookies";

export async function GET() {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return NextResponse.json(
        {
          error: "CONFIGURATION_MISSING",
          message:
            "Google OAuth credentials are not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local.",
        },
        { status: 500 }
      );
    }

    const oauth2Client = getOAuth2Client();

    // Generate cryptographically secure random state to protect against OAuth CSRF
    const state = crypto.randomBytes(32).toString("hex");
    await setOAuthStateCookie(state);

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: GMAIL_SCOPES,
      state,
    });

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("Error generating Google OAuth URL:", error);
    return NextResponse.json(
      { error: "OAUTH_INITIATION_FAILED", message: (error as Error).message },
      { status: 500 }
    );
  }
}
