import { NextRequest, NextResponse } from "next/server";
import { getSessionIdFromCookies } from "@/lib/auth/cookies";
import { getMessageDetail } from "@/lib/gmail/service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionId = await getSessionIdFromCookies();
    if (!sessionId) {
      return NextResponse.json(
        {
          error: "UNAUTHENTICATED",
          message: "No active session found. Please sign in with Google.",
        },
        { status: 401 }
      );
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "Message ID is required." },
        { status: 400 }
      );
    }

    const message = await getMessageDetail(sessionId, id);

    return NextResponse.json({ message });
  } catch (error) {
    console.error("Failed to fetch message detail:", error);
    const message = (error as Error).message || "Failed to fetch message detail";
    const isAuthError =
      message.toLowerCase().includes("unauthenticated") ||
      message.toLowerCase().includes("invalid_grant");

    return NextResponse.json(
      {
        error: isAuthError ? "AUTH_ERROR" : "GMAIL_API_ERROR",
        message,
      },
      { status: isAuthError ? 401 : 500 }
    );
  }
}
