import { tool } from "ai";
import { z } from "zod";
import { UiAction, AppContext } from "@/types/ai";
import { searchGmailMessages, buildGmailQuery, aiSearchParamsSchema } from "@/lib/gmail/search";
import { getMessageDetail } from "@/lib/gmail/service";
import { createPendingSend } from "@/lib/ai/pending-sends";

export interface ToolContext {
  sessionId: string;
  recordAction: (action: UiAction) => void;
  appContext?: AppContext;
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
        "Searches Gmail messages using structured parameters (never raw queries) and filters the main mailbox list. Use for date ranges ('last 10 days'), senders ('Sarah', 'LinkedIn'), unread/read filters, or keyword queries.",
      inputSchema: aiSearchParamsSchema,
      execute: async (params) => {
        try {
          const q = buildGmailQuery(params);
          const messages = await searchGmailMessages(ctx.sessionId, q, params.maxResults || 20);

          // Build clean, human-readable filter label for the UI banner
          const labelParts: string[] = [];
          if (params.relativeDays) {
            labelParts.push(`Last ${params.relativeDays} days`);
          } else if (params.afterDate) {
            labelParts.push(`After ${params.afterDate}`);
          }
          if (params.beforeDate) {
            labelParts.push(`Before ${params.beforeDate}`);
          }
          if (params.fromSender) {
            labelParts.push(`From: ${params.fromSender}`);
          }
          if (params.keyword) {
            labelParts.push(`"${params.keyword}"`);
          }
          if (params.isUnread) {
            labelParts.push("Unread");
          } else if (params.isRead) {
            labelParts.push("Read");
          }
          if (params.folder) {
            labelParts.push(`in ${params.folder}`);
          }
          const filterLabel = labelParts.length > 0 ? labelParts.join(", ") : "Search Results";

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
        } catch (err: unknown) {
          console.error("Gmail search tool error:", err);
          return {
            success: false,
            error: err instanceof Error ? err.message : "Failed to search Gmail messages",
            count: 0,
          };
        }
      },
    }),

    clear_filter: tool({
      description:
        "Clears any active search or mailbox filter, restoring the normal full mailbox view. Call when the user requests to clear filter, reset search, or show all emails again.",
      inputSchema: z.object({}),
      execute: async () => {
        ctx.recordAction({
          type: "clear_filter",
          payload: {},
        });
        return {
          success: true,
          message: "Filter cleared. All mailbox emails are now shown in the main view.",
        };
      },
    }),

    open_latest_email: tool({
      description:
        "Finds and opens the latest matching real Gmail email in the detail view. Searches Gmail deterministically server-side, selects the newest message using trusted Gmail timestamps, and opens it. Use for requests like 'Open the latest email', 'Open the latest email from David', 'Open the email from Sarah', 'Open the latest email in Sent'.",
      inputSchema: z.object({
        fromSender: z
          .string()
          .max(100)
          .optional()
          .describe("Sender name or email address (e.g. 'David', 'LinkedIn', 'Sarah')"),
        keyword: z
          .string()
          .max(200)
          .optional()
          .describe("Subject or body keyword to match"),
        folder: z
          .enum(["inbox", "sent"])
          .optional()
          .describe("Mailbox folder ('inbox' or 'sent'). If omitted, defaults to the currently active folder."),
      }),
      execute: async ({ fromSender, keyword, folder }) => {
        try {
          const targetFolder = folder || ctx.appContext?.currentFolder || "inbox";
          const query = buildGmailQuery({
            folder: targetFolder,
            fromSender,
            keyword,
          });

          const messages = await searchGmailMessages(ctx.sessionId, query, 10);
          if (!messages || messages.length === 0) {
            return {
              success: false,
              found: false,
              message: `No matching email found${fromSender ? ` from "${fromSender}"` : ""}${keyword ? ` with keyword "${keyword}"` : ""} in ${targetFolder}.`,
            };
          }

          // Deterministic newest-first selection based on trusted Gmail internalDate timestamps
          const sorted = [...messages].sort((a, b) => {
            const timeA = a.internalDate ? parseInt(a.internalDate, 10) : 0;
            const timeB = b.internalDate ? parseInt(b.internalDate, 10) : 0;
            return timeB - timeA;
          });
          const newest = sorted[0];

          // If navigating to a different folder is required, record navigation first
          if (ctx.appContext && ctx.appContext.currentFolder !== targetFolder) {
            ctx.recordAction({
              type: "navigate_mailbox",
              payload: { folder: targetFolder },
            });
          }

          // Only record selection if not already selected
          if (ctx.appContext?.selectedEmail?.id !== newest.id) {
            ctx.recordAction({
              type: "select_message",
              payload: { messageId: newest.id },
            });
          }

          return {
            success: true,
            found: true,
            messageId: newest.id,
            subject: newest.subject,
            from: newest.from.name ? `${newest.from.name} <${newest.from.email}>` : newest.from.email,
            date: newest.date,
            folder: targetFolder,
            message: `Opened latest email: "${newest.subject}" from ${newest.from.name || newest.from.email}.`,
          };
        } catch (err: unknown) {
          console.error("open_latest_email error:", err);
          return {
            success: false,
            found: false,
            error: err instanceof Error ? err.message : "Failed to retrieve the latest email.",
          };
        }
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
        try {
          // If already selected, do not emit redundant select action
          if (ctx.appContext?.selectedEmail?.id === messageId) {
            return {
              success: true,
              message: `Email ${messageId} is already open in the detail pane.`,
            };
          }

          // Validate server-side that the message actually exists in Gmail
          await getMessageDetail(ctx.sessionId, messageId);

          ctx.recordAction({
            type: "select_message",
            payload: { messageId },
          });
          return {
            success: true,
            message: `Opened email ${messageId}.`,
          };
        } catch (err: unknown) {
          console.error(`Validation failed for messageId "${messageId}":`, err);
          return {
            success: false,
            error: "Email not found or invalid message ID. Cannot open email.",
          };
        }
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

    prepare_reply: tool({
      description:
        "Prepares a reply draft to the currently selected email. Opens the Compose modal with the recipient, Re: subject, and reply body populated for user review. Does NOT send the email and does NOT authorize sending.",
      inputSchema: z.object({
        body: z.string().max(10000).describe("The reply message body to draft"),
      }),
      execute: async ({ body }) => {
        const selected = ctx.appContext?.selectedEmail;
        if (!selected) {
          return {
            success: false,
            message:
              "No email is currently selected. Please open or select an email before preparing a reply.",
          };
        }

        // Determine recipient: if currently in Sent folder, reply to the recipient; otherwise reply to the sender
        const replyTo =
          ctx.appContext?.currentFolder === "sent" &&
          selected.to &&
          selected.to.length > 0
            ? selected.to[0].email
            : selected.from.email;

        // Determine subject avoiding duplicate Re: prefixes
        const rawSubject = selected.subject || "(No Subject)";
        const replySubject = /^re:\s*/i.test(rawSubject)
          ? rawSubject
          : `Re: ${rawSubject}`;

        // Format conventional quoted reference block
        const quoteHeader = `\n\nOn ${selected.date}, ${
          selected.from.name || selected.from.email
        } wrote:\n> ${selected.snippet}`;
        const fullReplyBody = `${body.trim()}${quoteHeader}`;

        // Populate Compose modal for user review (NO send authorization)
        ctx.recordAction({
          type: "open_compose",
          payload: {
            to: replyTo,
            subject: replySubject,
            body: fullReplyBody,
          },
        });

        return {
          success: true,
          to: replyTo,
          subject: replySubject,
          message: `Prepared reply draft to ${replyTo} with subject "${replySubject}". The Compose window is open for your review. You can edit it, send it manually, or tell me 'Send it' when ready.`,
        };
      },
    }),

    prepare_forward: tool({
      description:
        "Prepares a forward draft of the currently selected email to a designated recipient. Opens the Compose modal with the destination, Fwd: subject, and original email context populated for user review. Does NOT send the email and does NOT authorize sending.",
      inputSchema: z.object({
        to: z
          .string()
          .max(320)
          .describe("Destination recipient email address (e.g. 'colleague@example.com')"),
        comments: z
          .string()
          .max(10000)
          .optional()
          .describe("Optional introductory remarks or note to place above the forwarded message"),
      }),
      execute: async ({ to, comments }) => {
        const selected = ctx.appContext?.selectedEmail;
        if (!selected) {
          return {
            success: false,
            message:
              "No email is currently selected. Please open or select an email before preparing a forward.",
          };
        }

        const cleanTo = to.trim();
        // Validation: reject CRLF injection
        if (cleanTo.includes("\r") || cleanTo.includes("\n")) {
          return {
            success: false,
            message: "Recipient address contains invalid characters (CR/LF not allowed).",
          };
        }
        // Basic RFC email format check
        if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(cleanTo)) {
          return {
            success: false,
            message: `"${cleanTo}" is not a valid email address.`,
          };
        }

        // Determine subject avoiding duplicate Fwd: prefixes
        const rawSubject = selected.subject || "(No Subject)";
        const fwdSubject = /^fwd:\s*/i.test(rawSubject)
          ? rawSubject
          : `Fwd: ${rawSubject}`;

        // Retrieve original message body from Gmail service if available, or fallback to snippet
        let originalBody = selected.snippet;
        try {
          const detail = await getMessageDetail(ctx.sessionId, selected.id);
          if (detail.bodyText) {
            originalBody = detail.bodyText;
          }
        } catch {
          // Fallback to sanitized snippet
        }

        const fwdBlock = [
          `---------- Forwarded message ---------`,
          `From: ${
            selected.from.name
              ? `${selected.from.name} <${selected.from.email}>`
              : selected.from.email
          }`,
          `Date: ${selected.date}`,
          `Subject: ${selected.subject}`,
          `To: ${selected.to
            .map((t) => (t.name ? `${t.name} <${t.email}>` : t.email))
            .join(", ")}`,
          ``,
          originalBody,
        ].join("\n");

        const fullFwdBody =
          comments && comments.trim()
            ? `${comments.trim()}\n\n${fwdBlock}`
            : fwdBlock;

        // Populate Compose modal for user review (NO send authorization)
        ctx.recordAction({
          type: "open_compose",
          payload: {
            to: cleanTo,
            subject: fwdSubject,
            body: fullFwdBody,
          },
        });

        return {
          success: true,
          to: cleanTo,
          subject: fwdSubject,
          message: `Prepared forward draft to ${cleanTo} with subject "${fwdSubject}". The Compose window is open for your review. You can edit it, send it manually, or tell me 'Send it' when ready.`,
        };
      },
    }),

    request_send_confirmation: tool({
      description:
        "Requests explicit human confirmation to send an email. MUST ONLY be called when the user explicitly instructs the AI to send the draft (e.g. 'Send it', 'Send the email', 'Yes, send it now'). Never call this during draft preparation.",
      inputSchema: z.object({
        to: z
          .string()
          .max(320)
          .optional()
          .describe("Recipient address (defaults to current compose To if omitted)"),
        subject: z
          .string()
          .max(998)
          .optional()
          .describe("Subject line (defaults to current compose Subject if omitted)"),
        body: z
          .string()
          .max(100000)
          .optional()
          .describe("Email body text (defaults to current compose draft if omitted)"),
      }),
      execute: async ({ to, subject, body }) => {
        const effectiveTo = to?.trim() || ctx.appContext?.composeTo?.trim() || "";
        const effectiveSubject =
          subject?.trim() || ctx.appContext?.composeSubject?.trim() || "";
        const effectiveBody = body || "";

        if (!effectiveTo) {
          return {
            success: false,
            message: "Cannot request send confirmation: Recipient ('To') address is missing.",
          };
        }
        if (!effectiveSubject) {
          return {
            success: false,
            message: "Cannot request send confirmation: Subject line is missing.",
          };
        }

        // Reject CRLF injection
        if (effectiveTo.includes("\r") || effectiveTo.includes("\n")) {
          return {
            success: false,
            message: "Recipient address contains invalid characters (CR/LF not allowed).",
          };
        }
        if (effectiveSubject.includes("\r") || effectiveSubject.includes("\n")) {
          return {
            success: false,
            message: "Subject line contains invalid characters (CR/LF not allowed).",
          };
        }

        // Validate recipient format
        if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(effectiveTo)) {
          return {
            success: false,
            message: `"${effectiveTo}" is not a valid email address.`,
          };
        }

        // Create server-side pending send authorization (session-bound, 5-minute TTL, single-use)
        const pending = createPendingSend(ctx.sessionId, {
          to: effectiveTo,
          subject: effectiveSubject,
          body: effectiveBody,
        });

        // Record UI action to display confirmation prompt
        ctx.recordAction({
          type: "request_send_confirmation",
          payload: {
            token: pending.token,
            to: effectiveTo,
            subject: effectiveSubject,
            bodyPreview: effectiveBody.slice(0, 160),
          },
        });

        return {
          success: true,
          to: effectiveTo,
          subject: effectiveSubject,
          message: `Ready to send this email to ${effectiveTo} with subject "${effectiveSubject}". Please click 'Confirm & Send' in the confirmation prompt to send, or 'Cancel' to discard.`,
        };
      },
    }),
  };
}
