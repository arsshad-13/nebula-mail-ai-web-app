/**
 * Mail Data Types and Interfaces
 * Represents email messages, threads, labels, and mail state.
 */

export interface EmailAddress {
  name?: string;
  email: string;
}

export interface EmailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  messageIdHeader?: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  snippet: string;
  bodyHtml?: string;
  bodyText?: string;
  date: string;
  internalDate?: string;
  isUnread: boolean;
  isStarred: boolean;
  labelIds: string[];
  attachments?: EmailAttachment[];
}

export interface EmailThread {
  id: string;
  snippet: string;
  historyId?: string;
  messages: EmailMessage[];
}

export interface MailLabel {
  id: string;
  name: string;
  type?: "system" | "user";
  unreadCount?: number;
  totalCount?: number;
}

export interface ComposeDraft {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  threadId?: string;
}

export type MailFolder = "inbox" | "sent";

export interface MailListResponse {
  messages: EmailMessage[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

// ---------------------------------------------------------------------------
// Stage 3: Compose / Send types
// ---------------------------------------------------------------------------

/**
 * Request payload for POST /api/gmail/send.
 * The client never provides a From field — it is derived server-side.
 */
export interface SendMailRequest {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
  inReplyTo?: string;
}

/** Successful response from POST /api/gmail/send */
export interface SendMailResponse {
  success: true;
  messageId: string;
  threadId: string;
}

/**
 * UI state for the Compose modal.
 * Each field tracks value + dirty flag for future AI pre-fill interaction.
 * Stable field ids (compose-to, compose-subject, compose-body) are exposed
 * on the DOM elements so Stage 4 AI can target them programmatically.
 */
export interface ComposeField<T = string> {
  value: T;
  /** True once the user has manually edited the field (prevents AI overwrite of user edits). */
  dirty: boolean;
}

export interface ComposeState {
  isOpen: boolean;
  to: ComposeField;
  subject: ComposeField;
  body: ComposeField;
  threadId?: string;
  inReplyTo?: string;
  isSending: boolean;
  sendError: string | null;
  sendSuccess: boolean;
}

