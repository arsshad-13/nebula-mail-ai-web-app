import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import { getAuthenticatedGmailClient } from "./index";
import { parseEmailAddress, parseEmailAddressList } from "./service";
import { EmailMessage } from "@/types/mail";
import { AiSearchParams } from "@/types/ai";
import { gmail_v1 } from "googleapis";

/**
 * Zod validation schema for structured AI search parameters.
 * Enforces strict typing so the LLM cannot supply arbitrary Gmail query syntax.
 */
export const aiSearchParamsSchema = z.object({
  folder: z.enum(["inbox", "sent"]).optional(),
  fromSender: z.string().max(100).optional(),
  keyword: z.string().max(200).optional(),
  afterDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must follow YYYY-MM-DD format")
    .optional(),
  beforeDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must follow YYYY-MM-DD format")
    .optional(),
  isUnread: z.boolean().optional(),
  maxResults: z.number().int().min(1).max(50).default(15).optional(),
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

  // Unread filter
  if (params.isUnread) {
    parts.push("is:unread");
  }

  // Sender filter: sanitize dangerous query punctuation
  if (params.fromSender) {
    const cleanSender = params.fromSender.replace(/[":()[\]{}<>]/g, " ").trim();
    if (cleanSender) {
      parts.push(`from:(${cleanSender})`);
    }
  }

  // Strict ISO date filters (YYYY-MM-DD)
  if (params.afterDate && /^\d{4}-\d{2}-\d{2}$/.test(params.afterDate)) {
    parts.push(`after:${params.afterDate}`);
  }

  if (params.beforeDate && /^\d{4}-\d{2}-\d{2}$/.test(params.beforeDate)) {
    parts.push(`before:${params.beforeDate}`);
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
