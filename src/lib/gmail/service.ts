import sanitizeHtml from "sanitize-html";
import { getAuthenticatedGmailClient } from "./index";
import { EmailAddress, EmailAttachment, EmailMessage, MailListResponse } from "@/types/mail";
import { gmail_v1 } from "googleapis";

/**
 * Parses an RFC 2822 email address string like "John Doe <john@example.com>"
 */
export function parseEmailAddress(raw?: string | null): EmailAddress {
  if (!raw) {
    return { email: "Unknown", name: "Unknown" };
  }

  const match = raw.match(/^(?:["']?([^"']*)["']?\s*)?<([^>]+)>$/);
  if (match) {
    const name = match[1]?.trim() || match[2].split("@")[0];
    return { name, email: match[2].trim() };
  }

  return { name: raw.split("@")[0], email: raw.trim() };
}

/**
 * Parses multiple comma-separated email addresses
 */
export function parseEmailAddressList(raw?: string | null): EmailAddress[] {
  if (!raw) return [];
  // Split on commas not enclosed in quotes
  const parts = raw.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
  return parts.map((p) => parseEmailAddress(p.trim())).filter((a) => a.email);
}

/**
 * Decodes Gmail's base64url encoded message payload
 */
function decodeBase64Url(data?: string | null): string {
  if (!data) return "";
  try {
    return Buffer.from(data, "base64url").toString("utf-8");
  } catch (err) {
    console.error("Failed to decode base64url content:", err);
    return "";
  }
}

/**
 * Recursively extracts plain text and HTML bodies, plus attachment metadata
 */
function extractBodyAndAttachments(payload?: gmail_v1.Schema$MessagePart): {
  bodyText: string;
  bodyHtml: string;
  attachments: EmailAttachment[];
} {
  let bodyText = "";
  let bodyHtml = "";
  const attachments: EmailAttachment[] = [];

  if (!payload) {
    return { bodyText, bodyHtml, attachments };
  }

  function traverse(part: gmail_v1.Schema$MessagePart) {
    const mimeType = part.mimeType || "";
    const filename = part.filename;

    if (filename && part.body?.attachmentId) {
      attachments.push({
        id: part.body.attachmentId,
        filename,
        mimeType,
        size: part.body.size || 0,
      });
      return;
    }

    if (mimeType === "text/plain" && part.body?.data && !bodyText) {
      bodyText = decodeBase64Url(part.body.data);
    } else if (mimeType === "text/html" && part.body?.data && !bodyHtml) {
      bodyHtml = decodeBase64Url(part.body.data);
    }

    if (part.parts && part.parts.length > 0) {
      for (const childPart of part.parts) {
        traverse(childPart);
      }
    }
  }

  traverse(payload);

  return { bodyText, bodyHtml, attachments };
}

/**
 * Sanitize email HTML content with defense-in-depth protection against script injection and XSS
 */
export function sanitizeEmailHtml(rawHtml: string): string {
  if (!rawHtml) return "";

  return sanitizeHtml(rawHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "span",
      "div",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "hr",
      "br",
      "pre",
      "code",
      "blockquote",
      "font",
      "center",
    ]),
    allowedAttributes: {
      "*": ["style", "class", "align", "valign", "width", "height", "dir"],
      a: ["href", "name", "target", "rel", "title"],
      img: ["src", "alt", "title", "width", "height", "style"],
      table: ["border", "cellpadding", "cellspacing", "width", "bgcolor"],
      td: ["colspan", "rowspan", "width", "height", "bgcolor", "align", "valign"],
      th: ["colspan", "rowspan", "width", "height", "bgcolor", "align", "valign"],
      font: ["color", "face", "size"],
    },
    allowedSchemes: ["http", "https", "mailto", "data", "cid"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        target: "_blank",
        rel: "noopener noreferrer nofollow",
      }),
    },
    exclusiveFilter: (frame) => {
      // Exclude script, object, iframe, embed, and form elements
      return ["script", "object", "iframe", "embed", "form", "input", "textarea"].includes(
        frame.tag
      );
    },
  });
}

/**
 * Maps a Gmail API Message to our clean EmailMessage domain interface
 */
function mapGmailMessageToDomain(
  msg: gmail_v1.Schema$Message,
  includeBody = false
): EmailMessage {
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

  let bodyHtml: string | undefined;
  let bodyText: string | undefined;
  let attachments: EmailAttachment[] | undefined;

  if (includeBody) {
    const extracted = extractBodyAndAttachments(msg.payload);
    bodyText = extracted.bodyText;
    bodyHtml = extracted.bodyHtml ? sanitizeEmailHtml(extracted.bodyHtml) : undefined;
    attachments = extracted.attachments.length > 0 ? extracted.attachments : undefined;
  }

  // Format date to ISO if possible or fallback to raw
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
    bodyHtml,
    bodyText,
    date: formattedDate,
    internalDate: msg.internalDate || undefined,
    isUnread,
    isStarred,
    labelIds,
    attachments,
  };
}

/**
 * Fetch messages list for a folder (INBOX or SENT)
 */
export async function getFolderMessages(
  sessionId: string | null,
  folder: "inbox" | "sent",
  options: { maxResults?: number; pageToken?: string } = {}
): Promise<MailListResponse> {
  const auth = await getAuthenticatedGmailClient(sessionId);
  if (!auth) {
    throw new Error("Unauthenticated: Please connect your Gmail account.");
  }

  const { gmail } = auth;
  const labelIds = folder === "sent" ? ["SENT"] : ["INBOX"];
  const maxResults = options.maxResults || 25;

  const listRes = await gmail.users.messages.list({
    userId: "me",
    labelIds,
    maxResults,
    pageToken: options.pageToken,
  });

  const messageItems = listRes.data.messages || [];
  if (messageItems.length === 0) {
    return {
      messages: [],
      nextPageToken: listRes.data.nextPageToken || undefined,
      resultSizeEstimate: listRes.data.resultSizeEstimate || 0,
    };
  }

  // Fetch metadata details for each message concurrently
  const detailedMessages = await Promise.all(
    messageItems.map(async (item) => {
      try {
        const msgRes = await gmail.users.messages.get({
          userId: "me",
          id: item.id!,
          format: "metadata",
          metadataHeaders: ["From", "To", "Subject", "Date"],
        });
        return mapGmailMessageToDomain(msgRes.data, false);
      } catch (err) {
        console.error(`Failed to load message header for ${item.id}:`, err);
        return null;
      }
    })
  );

  return {
    messages: detailedMessages.filter((m): m is EmailMessage => m !== null),
    nextPageToken: listRes.data.nextPageToken || undefined,
    resultSizeEstimate: listRes.data.resultSizeEstimate || 0,
  };
}

/**
 * Fetch full message detail with sanitized body content and attachments
 */
export async function getMessageDetail(
  sessionId: string | null,
  messageId: string
): Promise<EmailMessage> {
  const auth = await getAuthenticatedGmailClient(sessionId);
  if (!auth) {
    throw new Error("Unauthenticated: Please connect your Gmail account.");
  }

  const { gmail } = auth;
  const res = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  return mapGmailMessageToDomain(res.data, true);
}

/**
 * Validates that a string contains no CRLF characters.
 * Returns true if the value is safe, false if it contains \r or \n.
 */
function isFreeCRLF(value: string): boolean {
  return !value.includes("\r") && !value.includes("\n");
}

/**
 * Validates a basic email address format.
 */
function isValidEmail(email: string): boolean {
  // Basic RFC 5322 compatible check (no CRLF allowed)
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email.trim());
}

/**
 * Encodes a UTF-8 string as RFC 2047 Base64 encoded word for use in email headers.
 * E.g. "Hello World" -> "=?UTF-8?B?SGVsbG8gV29ybGQ=?="
 */
function encodeRFC2047(value: string): string {
  const encoded = Buffer.from(value, "utf-8").toString("base64");
  return `=?UTF-8?B?${encoded}?=`;
}

export interface SendGmailParams {
  to: string;
  subject: string;
  body: string;
}

export interface SendGmailResult {
  messageId: string;
  threadId: string;
}

/**
 * Sends a real email via the Gmail API using the authenticated user's session.
 * The From address is strictly derived from the server-side authenticated session identity.
 * Client must never provide a From field.
 *
 * Security:
 * - Rejects any request where `to` or `subject` contain CRLF characters (no stripping — reject).
 * - Validates recipient email format.
 * - Derives sender strictly from server-side session user identity.
 * - Never logs or exposes OAuth tokens or secrets.
 */
export async function sendGmailMessage(
  sessionId: string | null,
  params: SendGmailParams
): Promise<SendGmailResult> {
  const auth = await getAuthenticatedGmailClient(sessionId);
  if (!auth) {
    throw new Error("Unauthenticated: Please connect your Gmail account.");
  }

  const { gmail, user } = auth;
  const { to, subject, body } = params;

  // CRLF Injection Defense: Reject (do NOT strip) any value containing \r or \n
  if (!isFreeCRLF(to)) {
    throw new Error(
      "VALIDATION_ERROR: Recipient address contains invalid characters (CR/LF not allowed)."
    );
  }
  if (!isFreeCRLF(subject)) {
    throw new Error(
      "VALIDATION_ERROR: Subject contains invalid characters (CR/LF not allowed)."
    );
  }

  // Validate recipient email format
  if (!isValidEmail(to)) {
    throw new Error(`VALIDATION_ERROR: "${to}" is not a valid email address.`);
  }

  // Derive sender strictly from server-side authenticated session identity
  const fromEmail = user.email;
  const fromName = user.name || user.email;
  const fromHeader = `${fromName} <${fromEmail}>`;

  // Construct RFC 2822 MIME message
  const mimeLines = [
    `From: ${fromHeader}`,
    `To: ${to.trim()}`,
    `Subject: ${encodeRFC2047(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    body,
  ];
  const rawMessage = mimeLines.join("\r\n");

  // Encode to base64url as required by the Gmail API
  const encodedMessage = Buffer.from(rawMessage, "utf-8").toString("base64url");

  const sendRes = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedMessage,
    },
  });

  return {
    messageId: sendRes.data.id || "",
    threadId: sendRes.data.threadId || "",
  };
}
