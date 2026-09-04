import { gmail_v1 } from "googleapis";
import { EmailMessage } from "@/types/mail";
import { parseEmailAddress, parseEmailAddressList } from "./service";
import sanitizeHtml from "sanitize-html";

/**
 * Maps a raw Gmail API Message (metadata format) to our EmailMessage domain type.
 * Used when processing history change events — we only need metadata for the list view.
 * Body content (bodyHtml/bodyText) is intentionally omitted here; the client fetches
 * full detail on demand via /api/gmail/[id] as it always has.
 */
export function mapGmailMessageToEmailMessage(msg: gmail_v1.Schema$Message): EmailMessage {
  const headers = msg.payload?.headers ?? [];
  const getHeader = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

  const subject = getHeader("Subject") || "(No Subject)";
  const dateRaw = getHeader("Date");
  const fromRaw = getHeader("From");
  const toRaw = getHeader("To");
  const ccRaw = getHeader("Cc");
  const bccRaw = getHeader("Bcc");

  const labelIds = msg.labelIds ?? [];
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
    id: msg.id ?? "",
    threadId: msg.threadId ?? "",
    from: parseEmailAddress(fromRaw),
    to: parseEmailAddressList(toRaw),
    cc: ccRaw ? parseEmailAddressList(ccRaw) : undefined,
    bcc: bccRaw ? parseEmailAddressList(bccRaw) : undefined,
    subject,
    snippet: msg.snippet ? sanitizeHtml(msg.snippet, { allowedTags: [] }) : "",
    date: formattedDate,
    internalDate: msg.internalDate ?? undefined,
    isUnread,
    isStarred,
    labelIds,
    // Body intentionally excluded — history events only need metadata for list view
  };
}
