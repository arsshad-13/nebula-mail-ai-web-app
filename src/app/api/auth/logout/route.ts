import { NextResponse } from "next/server";
import { clearSessionCookie, getSessionIdFromCookies } from "@/lib/auth/cookies";
import { deleteSession } from "@/lib/auth/session-store";

export async function POST() {
  try {
    const sessionId = await getSessionIdFromCookies();
    if (sessionId) {
      await deleteSession(sessionId);
    }
    await clearSessionCookie();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Logout error:", error);
    await clearSessionCookie();
    return NextResponse.json({ success: true });
  }
}
