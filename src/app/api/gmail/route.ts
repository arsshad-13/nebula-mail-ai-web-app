import { NextRequest, NextResponse } from "next/server";
import { getSessionIdFromCookies } from "@/lib/auth/cookies";
import { getFolderMessages } from "@/lib/gmail/service";
import { MailFolder } from "@/types/mail";

export async function GET(request: NextRequest) {
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

    const { searchParams } = request.nextUrl;
    const folderParam = searchParams.get("folder")?.toLowerCase();
    const folder: MailFolder = folderParam === "sent" ? "sent" : "inbox";
    const pageToken = searchParams.get("pageToken") || undefined;
    const maxResults = searchParams.get("maxResults")
      ? parseInt(searchParams.get("maxResults")!, 10)
      : 25;

    const result = await getFolderMessages(sessionId, folder, {
      maxResults,
      pageToken,
    });

    return NextResponse.json({
      folder,
      messages: result.messages,
      nextPageToken: result.nextPageToken,
      resultSizeEstimate: result.resultSizeEstimate,
    });
  } catch (error) {
    console.error("Failed to fetch Gmail messages:", error);
    const message = (error as Error).message || "Failed to fetch messages";
    const isAuthError =
      message.toLowerCase().includes("unauthenticated") ||
      message.toLowerCase().includes("invalid_grant") ||
      message.toLowerCase().includes("credentials");

    return NextResponse.json(
      {
        error: isAuthError ? "AUTH_ERROR" : "GMAIL_API_ERROR",
        message,
      },
      { status: isAuthError ? 401 : 500 }
    );
  }
}
