/**
 * Stage 4A — AI Assistant Type Definitions
 *
 * Defines the typed UI-action protocol between the server-side AI route
 * and the client-side dispatch hook.
 *
 * ARCHITECTURE INVARIANT:
 * - The server returns UiAction[] objects (plain data).
 * - The client hook reads UiAction[] and dispatches to MailContext.
 * - The server NEVER calls React, MailContext, or browser APIs.
 * - No UiAction may trigger email sending.
 */

import type { EmailMessage } from "@/types/mail";

// ---------------------------------------------------------------------------
// UI Action Discriminated Union
// ---------------------------------------------------------------------------

/**
 * Open the compose modal, optionally pre-filling fields.
 * Does NOT send email — only opens the compose UI.
 */
export interface OpenComposeAction {
  type: "open_compose";
  payload: {
    to?: string;
    subject?: string;
    body?: string;
  };
}

/**
 * Update a single compose field after the compose window is already open.
 */
export interface SetComposeFieldAction {
  type: "set_compose_field";
  payload: {
    field: "to" | "subject" | "body";
    value: string;
  };
}

/**
 * Replace the mail list with a filtered set of real Gmail messages.
 * The messages array must contain real EmailMessage objects from the Gmail API.
 * Never contains fabricated or mock messages.
 */
export interface SetFilteredMessagesAction {
  type: "set_filtered_messages";
  payload: {
    messages: EmailMessage[];
    filterLabel: string; // e.g. "from: Sarah", "last 10 days"
  };
}

/**
 * Open a specific email in the detail pane.
 * messageId must pass alphanumeric/dash/underscore validation (max 64 chars).
 */
export interface SelectMessageAction {
  type: "select_message";
  payload: {
    messageId: string;
  };
}

/**
 * Switch the active mailbox folder and refresh the list.
 */
export interface NavigateMailboxAction {
  type: "navigate_mailbox";
  payload: {
    folder: "inbox" | "sent";
  };
}

/**
 * Clear any active AI filter and restore the full folder view.
 */
export interface ClearFilterAction {
  type: "clear_filter";
  payload: Record<string, never>;
}

/**
 * Request explicit human confirmation before sending an email.
 * Includes a server-generated single-use token bound to the authenticated session.
 * The full authoritative message remains on the server.
 */
export interface RequestSendConfirmationAction {
  type: "request_send_confirmation";
  payload: {
    token: string;
    to: string;
    subject: string;
    bodyPreview: string;
  };
}

/**
 * Discriminated union of all actions the server can instruct the client to perform.
 * Invalid action types are impossible to represent due to the discriminated union.
 */
export type UiAction =
  | OpenComposeAction
  | SetComposeFieldAction
  | SetFilteredMessagesAction
  | SelectMessageAction
  | NavigateMailboxAction
  | ClearFilterAction
  | RequestSendConfirmationAction;

// ---------------------------------------------------------------------------
// App Context — sent from client to /api/ai/chat with each request
// ---------------------------------------------------------------------------

/**
 * Snapshot of the application state sent to the AI route with every message.
 *
 * SECURITY — this schema MUST NEVER include:
 * - OAuth tokens (access_token, refresh_token)
 * - Session ID
 * - Google Client Secret
 * - AI API keys
 * - Email bodyHtml / bodyText (prompt injection + token size risk)
 * - Any ServerSession field
 */
export interface AppContext {
  /** Currently active mailbox folder */
  currentFolder: "inbox" | "sent";

  /** Number of messages currently visible in the mail list */
  messageCount: number;

  /**
   * Currently open/selected email metadata only.
   * bodyHtml and bodyText are intentionally excluded.
   * snippet is already sanitized server-side via sanitize-html.
   */
  selectedEmail: {
    id: string;
    subject: string;
    from: { name?: string; email: string };
    to: { name?: string; email: string }[];
    date: string;
    /** Short preview snippet (already sanitized). Max ~200 chars. */
    snippet: string;
  } | null;

  /** Whether the compose modal is currently open */
  composeIsOpen: boolean;

  /** Current value of the To field (empty string if compose not open) */
  composeTo: string;

  /** Current value of the Subject field (empty string if compose not open) */
  composeSubject: string;
  // compose body intentionally excluded — AI uses set_compose_field to write it

  /** Whether an AI-generated filter is currently active on the mail list */
  aiFilterActive: boolean;

  /** Human-readable label of the active filter, or null */
  aiFilterLabel: string | null;
}

// ---------------------------------------------------------------------------
// Search Parameters
// ---------------------------------------------------------------------------

/**
 * Structured search intent from the AI model.
 * The AI provides ONLY these typed fields — never a raw Gmail `q` string.
 * The server constructs the Gmail `q` parameter server-side from these fields.
 */
export interface AiSearchParams {
  /** Target mailbox folder */
  folder?: "inbox" | "sent";
  /** Sender name or email fragment */
  fromSender?: string;
  /** Subject/body keyword */
  keyword?: string;
  /** Number of days in the past from today (e.g., 10 for last 10 days) */
  relativeDays?: number;
  /** ISO 8601 date (YYYY-MM-DD) — messages after this date */
  afterDate?: string;
  /** ISO 8601 date (YYYY-MM-DD) — messages before this date */
  beforeDate?: string;
  /** Filter to unread messages only */
  isUnread?: boolean;
  /** Filter to read messages only */
  isRead?: boolean;
  /** Maximum results (1–50) */
  maxResults?: number;
}

// ---------------------------------------------------------------------------
// Chat Request / Response
// ---------------------------------------------------------------------------

/** A single message turn in the conversation */
export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Request body for POST /api/ai/chat.
 * Session ID is NEVER accepted from the request body — it is read
 * exclusively from the httpOnly session cookie server-side.
 */
export interface AiChatRequest {
  /** Conversation history (user + assistant turns) */
  messages: AiChatMessage[];
  /** Application state snapshot for AI context awareness */
  appContext: AppContext;
}

/**
 * Success response from POST /api/ai/chat.
 * Contains assistant text and any UI actions for the client hook to dispatch.
 */
export interface AiChatResponse {
  /** Assistant's natural-language response text */
  text: string;
  /**
   * Typed UI actions for the client hook to dispatch to MailContext.
   * Empty array if no UI changes are needed for this turn.
   */
  actions: UiAction[];
  /** Whether any tool calls were executed during this turn */
  toolsExecuted: boolean;
}

/** Error response from /api/ai/chat */
export interface AiChatErrorResponse {
  error: string;
}

/**
 * Message type used by AI context / UI components.
 * Included for seamless compatibility with client state.
 */
export interface AssistantMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  actions?: UiAction[];
}
