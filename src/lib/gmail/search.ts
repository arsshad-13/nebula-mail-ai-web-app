import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import { getAuthenticatedGmailClient } from "./index";
import { parseEmailAddress, parseEmailAddressList } from "./service";
import { EmailMessage } from "@/types/mail";
import { AiSearchParams } from "@/types/ai";
import { gmail_v1 } from "googleapis";

/**
 * Resolves a relative number of days from the current date into an ISO YYYY-MM-DD date string.
 * Deterministic server-side calculation based on real system date.
 */
export function resolveRelativeDate(daysAgo: number): string {
  const target = new Date();
  target.setDate(target.getDate() - daysAgo);
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const day = String(target.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Zod validation schema for structured AI search parameters.
 * Enforces strict typing so the LLM cannot supply arbitrary Gmail query syntax.
 */
export const aiSearchParamsSchema = z.object({
  folder: z.enum(["inbox", "sent"]).optional().describe("Mailbox folder to search in ('inbox' or 'sent')"),
  fromSender: z.string().max(100).optional().describe("Sender name or email address (e.g. 'Sarah', 'LinkedIn')"),
  keyword: z.string().max(200).optional().describe("Subject or content search keyword"),
  relativeDays: z.number().int().min(1).max(365).optional().describe("Number of days in the past from today (e.g. 10 for 'last 10 days', 7 for 'last 7 days', 30 for 'last 30 days')"),
  afterDate: z
    .string()
    .regex(/^\d{4}[-/]\d{2}[-/]\d{2}$/, "Date must follow YYYY-MM-DD format")
    .optional()
    .describe("ISO date (YYYY-MM-DD) threshold. Use relativeDays instead when user mentions relative days."),
  beforeDate: z
    .string()
    .regex(/^\d{4}[-/]\d{2}[-/]\d{2}$/, "Date must follow YYYY-MM-DD format")
    .optional()
    .describe("ISO date (YYYY-MM-DD) threshold"),
  isUnread: z.boolean().optional().describe("Filter to unread emails only"),
  isRead: z.boolean().optional().describe("Filter to read emails only"),
  maxResults: z.number().int().min(1).max(50).default(20).optional().describe("Maximum number of results (default 20, max 50)"),
});

/**
 * Constructs a safe, sanitized Gmail `q` parameter from structured parameters.
 * Strips out special characters and query operators to prevent operator injection.
 */
export function buildGmailQuery(params: AiSearchParams): string {
  const parts: string[] = [];

  // Folder scope
  if (params.folder === "sent") {
    parts.push("in:sent");
  } else if (params.folder === "inbox") {
    parts.push("in:inbox");
  }

  // Read / Unread filter
  if (params.isUnread) {
    parts.push("is:unread");
  } else if (params.isRead) {
    parts.push("is:read");
  }

  // Sender filter: sanitize dangerous query punctuation
  if (params.fromSender) {
    const cleanSender = params.fromSender.replace(/[":()[\]{}<>]/g, " ").trim();
    if (cleanSender) {
      parts.push(`from:(${cleanSender})`);
    }
  }

  // Date filters: resolve relativeDays if provided, or use afterDate
  let effectiveAfterDate = params.afterDate;
  if (params.relativeDays && params.relativeDays > 0) {
    effectiveAfterDate = resolveRelativeDate(params.relativeDays);
  }

  if (effectiveAfterDate && /^\d{4}[-/]\d{2}[-/]\d{2}$/.test(effectiveAfterDate)) {
    parts.push(`after:${effectiveAfterDate.replace(/\//g, "-")}`);
  }

  if (params.beforeDate && /^\d{4}[-/]\d{2}[-/]\d{2}$/.test(params.beforeDate)) {
    parts.push(`before:${params.beforeDate.replace(/\//g, "-")}`);
  }

  // Keyword / search term: sanitize to prevent operator breakouts
  if (params.keyword) {
    const cleanKeyword = params.keyword.replace(/[":()[\]{}]/g, " ").trim();
    if (cleanKeyword) {
      parts.push(`(${cleanKeyword})`);
    }
  }

  return parts.join(" ").trim();
}

/**
 * Maps a Gmail metadata-only message to the application EmailMessage domain object.
 */
function mapGmailSearchMessageToDomain(msg: gmail_v1.Schema$Message): EmailMessage {
  const headers = msg.payload?.headers || [];

  const getHeader = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";

  const fromRaw = getHeader("From");
  const toRaw = getHeader("To");
  const ccRaw = getHeader("Cc");
  const bccRaw = getHeader("Bcc");
  const subject = getHeader("Subject") || "(No Subject)";
  const dateRaw = getHeader("Date");

  const labelIds = msg.labelIds || [];
  const isUnread = labelIds.includes("UNREAD");
  const isStarred = labelIds.includes("STARRED");

  let formattedDate = dateRaw;
  if (msg.internalDate) {
    try {
      formattedDate = new Date(parseInt(msg.internalDate, 10)).toISOString();
    } catch {
      formattedDate = dateRaw;
    }
  }

  return {
    id: msg.id || "",
    threadId: msg.threadId || "",
    from: parseEmailAddress(fromRaw),
    to: parseEmailAddressList(toRaw),
    cc: ccRaw ? parseEmailAddressList(ccRaw) : undefined,
    bcc: bccRaw ? parseEmailAddressList(bccRaw) : undefined,
    subject,
    snippet: msg.snippet ? sanitizeHtml(msg.snippet, { allowedTags: [] }) : "",
    date: formattedDate,
    internalDate: msg.internalDate || undefined,
    isUnread,
    isStarred,
    labelIds,
  };
}

/**
 * Searches Gmail messages for an authenticated user session using a server-constructed query.
 */
export async function searchGmailMessages(
  sessionId: string | null,
  q: string,
  maxResults = 15
): Promise<EmailMessage[]> {
  const auth = await getAuthenticatedGmailClient(sessionId);
  if (!auth) {
    throw new Error("Unauthenticated: Please connect your Gmail account.");
  }

  const { gmail } = auth;
  const clampedMax = Math.min(Math.max(1, maxResults), 50);

  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: q || undefined,
    maxResults: clampedMax,
  });

  const messageItems = listRes.data.messages || [];
  if (messageItems.length === 0) {
    return [];
  }

  // Fetch headers & metadata for matching messages concurrently
  const detailedMessages = await Promise.all(
    messageItems.map(async (item) => {
      try {
        const msgRes = await gmail.users.messages.get({
          userId: "me",
          id: item.id!,
          format: "metadata",
          metadataHeaders: ["From", "To", "Cc", "Bcc", "Subject", "Date"],
        });
        return mapGmailSearchMessageToDomain(msgRes.data);
      } catch (err) {
        console.error(`Failed to fetch metadata for message ${item.id}:`, err);
        return null;
      }
    })
  );

  return detailedMessages.filter((m): m is EmailMessage => m !== null);
}
