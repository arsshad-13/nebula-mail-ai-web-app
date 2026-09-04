import { NextResponse } from "next/server";
import { getSessionIdFromCookies } from "@/lib/auth/cookies";
import { getSession } from "@/lib/auth/session-store";

export async function GET() {
  try {
    const isConfigured = Boolean(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    );

    const sessionId = await getSessionIdFromCookies();
    if (!sessionId) {
      return NextResponse.json({
        isAuthenticated: false,
        user: null,
        isConfigured,
      });
    }

    const session = await getSession(sessionId);
    if (!session || !session.tokens?.access_token) {
      return NextResponse.json({
        isAuthenticated: false,
        user: null,
        isConfigured,
      });
    }

    // Return authenticated status and user profile. NEVER return tokens to the browser.
    return NextResponse.json({
      isAuthenticated: true,
      user: session.user,
      isConfigured,
    });
  } catch (error) {
    console.error("Failed to check session:", error);
    return NextResponse.json(
      {
        isAuthenticated: false,
        user: null,
        isConfigured: Boolean(
          process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        ),
      },
      { status: 200 }
    );
  }
}
