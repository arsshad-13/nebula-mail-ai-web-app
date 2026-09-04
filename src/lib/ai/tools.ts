import { tool } from "ai";
import { z } from "zod";
import { UiAction } from "@/types/ai";
import { searchGmailMessages, buildGmailQuery, aiSearchParamsSchema } from "@/lib/gmail/search";

export interface ToolContext {
  sessionId: string;
  recordAction: (action: UiAction) => void;
}

/**
 * Server-side AI Tools Factory
 *
 * Implements the 5 typed tools available to the AI co-pilot.
 * CRITICAL INVARIANT:
 * - Server handlers never interact with React or MailContext.
 * - Handlers record typed UiAction objects into the action collector.
 * - No tool is capable of sending emails.
 */
export function createAiTools(ctx: ToolContext) {
  return {
    open_compose: tool({
      description:
        "Opens the email compose window with optional recipient, subject, and body fields populated. Does NOT send emails.",
      inputSchema: z.object({
        to: z.string().max(200).optional().describe("Recipient email address"),
        subject: z.string().max(300).optional().describe("Subject line"),
        body: z.string().max(10000).optional().describe("Draft email body text"),
      }),
      execute: async ({ to, subject, body }) => {
        ctx.recordAction({
          type: "open_compose",
          payload: { to, subject, body },
        });
        return {
          success: true,
          message: `Compose window opened${to ? ` to "${to}"` : ""}${
            subject ? ` with subject "${subject}"` : ""
          }.`,
        };
      },
    }),

    set_compose_field: tool({
      description:
        "Sets or updates a specific field ('to', 'subject', or 'body') in the currently open compose modal.",
      inputSchema: z.object({
        field: z.enum(["to", "subject", "body"]).describe("The field to update"),
        value: z.string().max(10000).describe("The text content to set"),
      }),
      execute: async ({ field, value }) => {
        ctx.recordAction({
          type: "set_compose_field",
          payload: { field, value },
        });
        return {
          success: true,
          message: `Set compose field "${field}".`,
        };
      },
    }),

    search_emails: tool({
      description:
        "Searches Gmail messages using structured parameters (never raw queries) and filters the visible mail list.",
      inputSchema: aiSearchParamsSchema,
      execute: async (params) => {
        const q = buildGmailQuery(params);
        const messages = await searchGmailMessages(ctx.sessionId, q, params.maxResults || 15);

        const labelParts: string[] = [];
        if (params.folder) labelParts.push(`in:${params.folder}`);
        if (params.fromSender) labelParts.push(`from:${params.fromSender}`);
        if (params.keyword) labelParts.push(`"${params.keyword}"`);
        if (params.afterDate) labelParts.push(`after:${params.afterDate}`);
        if (params.beforeDate) labelParts.push(`before:${params.beforeDate}`);
        if (params.isUnread) labelParts.push("unread");
        const filterLabel = labelParts.join(" ") || "Search Results";

        ctx.recordAction({
          type: "set_filtered_messages",
          payload: {
            messages,
            filterLabel,
          },
        });

        return {
          success: true,
          count: messages.length,
          filterLabel,
          messages: messages.map((m) => ({
            id: m.id,
            subject: m.subject,
            from: m.from.name ? `${m.from.name} <${m.from.email}>` : m.from.email,
            date: m.date,
            snippet: m.snippet,
            isUnread: m.isUnread,
          })),
        };
      },
    }),

    open_email: tool({
      description:
        "Selects and opens an email in the detail view by its validated Gmail message ID.",
      inputSchema: z.object({
        messageId: z
          .string()
          .min(1)
          .max(64)
          .regex(
            /^[a-zA-Z0-9_-]+$/,
            "Message ID must be alphanumeric characters, dashes, or underscores only"
          )
          .describe("The Gmail message ID to display in detail pane"),
      }),
      execute: async ({ messageId }) => {
        ctx.recordAction({
          type: "select_message",
          payload: { messageId },
        });
        return {
          success: true,
          message: `Opened email ${messageId}.`,
        };
      },
    }),

    navigate_mailbox: tool({
      description: "Navigates between mailbox folders ('inbox' or 'sent').",
      inputSchema: z.object({
        folder: z.enum(["inbox", "sent"]).describe("Target mailbox folder"),
      }),
      execute: async ({ folder }) => {
        ctx.recordAction({
          type: "navigate_mailbox",
          payload: { folder },
        });
        return {
          success: true,
          message: `Navigated to ${folder} mailbox.`,
        };
      },
    }),
  };
}
