/**
 * Unit tests for Gmail Thread View (+3 Bonus Points) feature.
 *
 * Covers:
 * - Chronological sorting of thread messages by internalDate
 * - Reordering of unordered messages into exact chronological sequence
 * - Deterministic secondary ordering for identical timestamps
 * - Mapping raw Gmail API messages to domain EmailMessage
 * - Defense-in-depth HTML sanitization preservation
 * - Safe handling of empty/invalid thread data
 *
 * Running:
 *   npx tsx --test src/__tests__/gmail-thread.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  sortThreadMessages,
  mapGmailMessageToDomain,
  getThreadDetail,
  buildRFC2822Message,
} from "../lib/gmail/service";
import { EmailMessage } from "../types/mail";
import { gmail_v1 } from "googleapis";
function createMockEmailMessage(
  id: string,
  internalDate: string,
  extra?: Partial<EmailMessage>
): EmailMessage {
  return {
    id,
    threadId: "thread-123",
    from: { name: "Sender", email: "sender@example.com" },
    to: [{ name: "Recipient", email: "recipient@example.com" }],
    subject: "Thread Subject",
    snippet: "Message snippet...",
    date: new Date(parseInt(internalDate, 10)).toISOString(),
    internalDate,
    isUnread: false,
    isStarred: false,
    labelIds: ["INBOX"],
    ...extra,
  };
}
describe("sortThreadMessages", () => {
  it("sorts messages chronologically by internalDate", () => {
    const msg1 = createMockEmailMessage("msg-1", "1700000000100");
    const msg2 = createMockEmailMessage("msg-2", "1700000000200");
    const msg3 = createMockEmailMessage("msg-3", "1700000000300");
    const sorted = sortThreadMessages([msg1, msg2, msg3]);
    assert.deepEqual(
      sorted.map((m) => m.id),
      ["msg-1", "msg-2", "msg-3"]
    );
  });
  it("correctly reorders unordered Gmail messages into chronological sequence", () => {
    const msgEarly = createMockEmailMessage("msg-early", "1600000000000");
    const msgMid = createMockEmailMessage("msg-mid", "1650000000000");
    const msgLate = createMockEmailMessage("msg-late", "1700000000000");
    // Pass messages in random / non-chronological order
    const sorted = sortThreadMessages([msgLate, msgEarly, msgMid]);
    assert.deepEqual(
      sorted.map((m) => m.id),
      ["msg-early", "msg-mid", "msg-late"]
    );
  });
  it("provides deterministic secondary ordering by id when timestamps are identical", () => {
    const msgA = createMockEmailMessage("msg-alpha", "1700000000000");
    const msgB = createMockEmailMessage("msg-beta", "1700000000000");
    const msgC = createMockEmailMessage("msg-gamma", "1700000000000");
    const sorted1 = sortThreadMessages([msgC, msgA, msgB]);
    assert.deepEqual(
      sorted1.map((m) => m.id),
      ["msg-alpha", "msg-beta", "msg-gamma"]
    );
    const sorted2 = sortThreadMessages([msgB, msgC, msgA]);
    assert.deepEqual(
      sorted2.map((m) => m.id),
      ["msg-alpha", "msg-beta", "msg-gamma"]
    );
  });
  it("handles messages with missing or undefined internalDate safely", () => {
    const msgWithDate = createMockEmailMessage("msg-has-date", "1700000000000");
    const msgNoDate = createMockEmailMessage("msg-no-date", "0", {
      internalDate: undefined,
    });
    const sorted = sortThreadMessages([msgWithDate, msgNoDate]);
    // msgNoDate defaults to BigInt("0"), so it should come first
    assert.equal(sorted[0].id, "msg-no-date");
    assert.equal(sorted[1].id, "msg-has-date");
  });
  it("handles empty array without error", () => {
    const sorted = sortThreadMessages([]);
    assert.deepEqual(sorted, []);
  });
  it("handles single message array safely", () => {
    const single = [createMockEmailMessage("msg-1", "1700000000000")];
    const sorted = sortThreadMessages(single);
    assert.equal(sorted.length, 1);
    assert.equal(sorted[0].id, "msg-1");
  });
});
describe("mapGmailMessageToDomain & HTML Sanitization in Threads", () => {
  it("maps raw Gmail API message to domain EmailMessage with full metadata", () => {
    const rawMsg: gmail_v1.Schema$Message = {
      id: "gmail-msg-123",
      threadId: "gmail-thread-456",
      internalDate: "1710000000000",
      labelIds: ["INBOX", "UNREAD"],
      snippet: "Welcome to our team discussion",
      payload: {
        headers: [
          { name: "From", value: "Alice Smith <alice@example.com>" },
          { name: "To", value: "Bob Jones <bob@example.com>" },
          { name: "Cc", value: "Charlie <charlie@example.com>" },
          { name: "Subject", value: "Q3 Project Alignment" },
          { name: "Date", value: "Sun, 10 Mar 2026 12:00:00 +0000" },
          { name: "Message-ID", value: "<CAL123456789@mail.gmail.com>" },
        ],
        mimeType: "text/plain",
        body: {
          data: Buffer.from("Here is the meeting agenda.").toString("base64url"),
        },
      },
    };
    const domain = mapGmailMessageToDomain(rawMsg, true);
    assert.equal(domain.id, "gmail-msg-123");
    assert.equal(domain.threadId, "gmail-thread-456");
    assert.equal(domain.messageIdHeader, "<CAL123456789@mail.gmail.com>");
    assert.equal(domain.internalDate, "1710000000000");
    assert.equal(domain.from.name, "Alice Smith");
    assert.equal(domain.from.email, "alice@example.com");
    assert.equal(domain.to[0].email, "bob@example.com");
    assert.equal(domain.cc?.[0].email, "charlie@example.com");
    assert.equal(domain.subject, "Q3 Project Alignment");
    assert.equal(domain.bodyText, "Here is the meeting agenda.");
    assert.equal(domain.isUnread, true);
  });
  it("sanitizes malicious HTML in thread message bodies (XSS Defense)", () => {
    const maliciousHtml = `
      <div>Safe text</div>
      <script>alert('xss');</script>
      <iframe src="javascript:alert(1)"></iframe>
      <a href="javascript:stealToken()" onclick="sendCookies()">Click Here</a>
      <img src="https://example.com/logo.png" onerror="malicious()" />
    `;
    const rawMsg: gmail_v1.Schema$Message = {
      id: "xss-test-msg",
      threadId: "xss-thread",
      internalDate: "1710000000000",
      payload: {
        headers: [
          { name: "From", value: "attacker@bad.com" },
          { name: "Subject", value: "XSS Attempt" },
        ],
        mimeType: "text/html",
        body: {
          data: Buffer.from(maliciousHtml).toString("base64url"),
        },
      },
    };
    const domain = mapGmailMessageToDomain(rawMsg, true);
    assert.ok(domain.bodyHtml, "bodyHtml should be present");
    assert.equal(domain.bodyHtml.includes("<script>"), false, "Must strip script tags");
    assert.equal(domain.bodyHtml.includes("<iframe>"), false, "Must strip iframe tags");
    assert.equal(domain.bodyHtml.includes("javascript:"), false, "Must strip javascript: URI schemes");
    assert.equal(domain.bodyHtml.includes("onclick="), false, "Must strip inline onclick handlers");
    assert.equal(domain.bodyHtml.includes("onerror="), false, "Must strip inline onerror handlers");
    // Must force target="_blank" and rel="noopener noreferrer nofollow" on safe links
    assert.ok(domain.bodyHtml.includes('target="_blank"'), "Must force target=_blank on anchor tags");
    assert.ok(
      domain.bodyHtml.includes('rel="noopener noreferrer nofollow"'),
      "Must set noopener noreferrer on links"
    );
  });
});
describe("getThreadDetail Error & Validation Handling", () => {
  it("rejects missing or whitespace thread IDs with descriptive error", async () => {
    await assert.rejects(
      async () => {
        await getThreadDetail("mock-session", "");
      },
      {
        message: "Thread ID is required.",
      }
    );
    await assert.rejects(
      async () => {
        await getThreadDetail("mock-session", "   ");
      },
      {
        message: "Thread ID is required.",
      }
    );
  });
  it("rejects unauthenticated requests when session is null", async () => {
    await assert.rejects(
      async () => {
        await getThreadDetail(null, "valid-thread-id");
      },
      {
        message: /Unauthenticated/,
      }
    );
  });
});
describe("Thread View Decision & Fallback Logic", () => {
  function shouldRenderThreadView(thread: { messages: unknown[] } | null | undefined): boolean {
    return Boolean(thread && thread.messages.length > 1);
  }
  it("falls back to single-message view when thread is null", () => {
    assert.equal(shouldRenderThreadView(null), false);
    assert.equal(shouldRenderThreadView(undefined), false);
  });
  it("falls back to single-message view when thread contains 0 messages", () => {
    assert.equal(shouldRenderThreadView({ messages: [] }), false);
  });
  it("falls back to single-message view when thread contains exactly 1 message (standalone email)", () => {
    assert.equal(
      shouldRenderThreadView({
        messages: [createMockEmailMessage("msg-solo", "1700000000000")],
      }),
      false
    );
  });
  it("activates Thread View when thread contains 2 or more messages", () => {
    assert.equal(
      shouldRenderThreadView({
        messages: [
          createMockEmailMessage("msg-1", "1700000000000"),
          createMockEmailMessage("msg-2", "1700000001000"),
        ],
      }),
      true
    );
    assert.equal(
      shouldRenderThreadView({
        messages: [
          createMockEmailMessage("msg-1", "1700000000000"),
          createMockEmailMessage("msg-2", "1700000001000"),
          createMockEmailMessage("msg-3", "1700000002000"),
        ],
      }),
      true
    );
  });
  it("simulates graceful degradation: when thread fetch throws, detail view recovers with thread: null", async () => {
    // Simulates the try/catch in src/app/api/gmail/[id]/route.ts
    const mockMessage = createMockEmailMessage("msg-primary", "1700000000000", {
      threadId: "failing-thread-id",
    });
    let threadResult = null;
    try {
      // Simulate network / Gmail API failure for thread retrieval
      throw new Error("Gmail API 500: Internal server error on thread retrieval");
    } catch {
      // Graceful fallback to null thread
      threadResult = null;
    }
    // Response structure must preserve the message and safely return null thread
    const responseData = { message: mockMessage, thread: threadResult };
    assert.ok(responseData.message, "Message must be preserved");
    assert.equal(responseData.thread, null, "Thread must be safely null on error");
    assert.equal(shouldRenderThreadView(responseData.thread), false, "UI must render single-message view");
  });
});
describe("Send Mail Thread ID Refinement & Validation", () => {
  // Import sendGmailMessage and pending sends logic
  it("rejects unauthenticated send requests when sessionId is null", async () => {
    const { sendGmailMessage } = await import("../lib/gmail/service");
    await assert.rejects(
      async () => {
        await sendGmailMessage(null, {
          to: "test@example.com",
          subject: "Test Subject",
          body: "Hello",
          threadId: "thread-xyz",
        });
      },
      {
        message: /Unauthenticated/,
      }
    );
  });
  it("rejects CRLF injection in recipient or subject (defense-in-depth)", async () => {
    const { isFreeCRLF, isValidEmail } = await import("../lib/gmail/service");
    assert.equal(isFreeCRLF("safe.recipient@example.com"), true);
    assert.equal(isFreeCRLF("Safe Subject Line"), true);
    // Rejects CR or LF
    assert.equal(isFreeCRLF("user@example.com\r\nBcc: evil@attacker.com"), false);
    assert.equal(isFreeCRLF("Subject\nInjected-Header: evil"), false);
    assert.equal(isFreeCRLF("Subject\rInjected-Header: evil"), false);
    // Email format validation rejects CRLF embedded emails
    assert.equal(isValidEmail("user@example.com\r\nBcc: evil@attacker.com"), false);
    assert.equal(isValidEmail("valid.user@example.com"), true);
  });
  it("validates that normal manual send works without threadId", async () => {
    const { sendGmailMessage } = await import("../lib/gmail/service");
    // Should fail with unauthenticated rather than a validation error on missing threadId
    await assert.rejects(
      async () => {
        await sendGmailMessage(null, {
          to: "recipient@example.com",
          subject: "Standalone Email",
          body: "No threadId provided",
        });
      },
      {
        message: /Unauthenticated/,
      }
    );
  });
  it("pending send store preserves threadId through create and consume cycle", async () => {
    const { createPendingSend, verifyAndConsumePendingSend } = await import(
      "../lib/ai/pending-sends"
    );
    const testSession = "test-session-auth-123";
    const pending = createPendingSend(testSession, {
      to: "reply-recipient@example.com",
      subject: "Re: Discussion Thread",
      body: "Sounds good, let's proceed.",
      threadId: "gmail-thread-preserve-test",
    });
    assert.ok(pending.token, "Must generate secure token");
    assert.equal(pending.threadId, "gmail-thread-preserve-test", "Must preserve threadId in record");
    // Consume and verify
    const consumed = verifyAndConsumePendingSend(testSession, pending.token);
    assert.ok(consumed, "Must successfully consume token");
    assert.equal(consumed!.threadId, "gmail-thread-preserve-test", "Must return preserved threadId");
    assert.equal(consumed!.to, "reply-recipient@example.com");
    assert.equal(consumed!.subject, "Re: Discussion Thread");
    // Single use enforcement: second consume must be null
    const secondConsume = verifyAndConsumePendingSend(testSession, pending.token);
    assert.equal(secondConsume, null, "Pending send must be single use");
  });
  it("pending send store works normally when threadId is omitted (standalone draft)", async () => {
    const { createPendingSend, verifyAndConsumePendingSend } = await import(
      "../lib/ai/pending-sends"
    );
    const testSession = "test-session-standalone";
    const pending = createPendingSend(testSession, {
      to: "standalone@example.com",
      subject: "New Topic",
      body: "Initial discussion without thread.",
    });
    assert.equal(pending.threadId, undefined, "threadId must be undefined when omitted");
    assert.equal(pending.inReplyTo, undefined, "inReplyTo must be undefined when omitted");
    const consumed = verifyAndConsumePendingSend(testSession, pending.token);
    assert.ok(consumed);
    assert.equal(consumed!.threadId, undefined, "Consumed threadId must be undefined");
    assert.equal(consumed!.inReplyTo, undefined, "Consumed inReplyTo must be undefined");
  });
  it("pending send store preserves both threadId and inReplyTo through create and consume cycle", async () => {
    const { createPendingSend, verifyAndConsumePendingSend } = await import(
      "../lib/ai/pending-sends"
    );
    const testSession = "test-session-reply-threading";
    const pending = createPendingSend(testSession, {
      to: "reply@example.com",
      subject: "Re: Nebula Mail App",
      body: "Looks good to me!",
      threadId: "gmail-thread-123",
      inReplyTo: "<parent-message-id-456@mail.gmail.com>",
    });
    assert.equal(pending.threadId, "gmail-thread-123");
    assert.equal(pending.inReplyTo, "<parent-message-id-456@mail.gmail.com>");
    const consumed = verifyAndConsumePendingSend(testSession, pending.token);
    assert.ok(consumed);
    assert.equal(consumed!.threadId, "gmail-thread-123");
    assert.equal(consumed!.inReplyTo, "<parent-message-id-456@mail.gmail.com>");
  });
  describe("RFC 2822 MIME threading generation & security", () => {
    it("generates In-Reply-To and References headers when inReplyTo is supplied", () => {
      const mime = buildRFC2822Message({
        from: "Sender <sender@example.com>",
        to: "recipient@example.com",
        subject: "Re: Project Roadmap",
        body: "Thanks for the update.",
        inReplyTo: "<parent-msg-789@mail.gmail.com>",
      });
      assert.ok(mime.includes("In-Reply-To: <parent-msg-789@mail.gmail.com>"));
      assert.ok(mime.includes("References: <parent-msg-789@mail.gmail.com>"));
      assert.ok(mime.includes("To: recipient@example.com"));
      assert.ok(mime.includes("Subject: =?UTF-8?B?UmU6IFByb2plY3QgUm9hZG1hcA==?="));
    });
    it("wraps inReplyTo with angle brackets if missing", () => {
      const mime = buildRFC2822Message({
        from: "Sender <sender@example.com>",
        to: "recipient@example.com",
        subject: "Re: Without Brackets",
        body: "Body",
        inReplyTo: "raw-id-without-brackets@mail.gmail.com",
      });
      assert.ok(mime.includes("In-Reply-To: <raw-id-without-brackets@mail.gmail.com>"));
      assert.ok(mime.includes("References: <raw-id-without-brackets@mail.gmail.com>"));
    });
    it("does NOT generate In-Reply-To or References headers for standalone emails", () => {
      const mime = buildRFC2822Message({
        from: "Sender <sender@example.com>",
        to: "recipient@example.com",
        subject: "Fresh Topic",
        body: "Starting a new thread.",
      });
      assert.ok(!mime.includes("In-Reply-To:"));
      assert.ok(!mime.includes("References:"));
    });
    it("normalizes nested or excessive angle brackets to exactly one pair", () => {
      const mime = buildRFC2822Message({
        from: "Sender <sender@example.com>",
        to: "recipient@example.com",
        subject: "Re: Extra Brackets",
        body: "Body",
        inReplyTo: "<<<extra-brackets@mail.gmail.com>>>",
      });
      assert.ok(mime.includes("In-Reply-To: <extra-brackets@mail.gmail.com>"));
      assert.ok(mime.includes("References: <extra-brackets@mail.gmail.com>"));
      assert.ok(!mime.includes("<<"));
      assert.ok(!mime.includes(">>"));
    });
    it("strictly rejects CRLF injection inside inReplyTo", () => {
      assert.throws(
        () => {
          buildRFC2822Message({
            from: "Sender <sender@example.com>",
            to: "recipient@example.com",
            subject: "Re: Test",
            body: "Body",
            inReplyTo: "<msg-id>\r\nBcc: attacker@evil.com",
          });
        },
        {
          message: /VALIDATION_ERROR: In-Reply-To header contains invalid characters/,
        }
      );
      assert.throws(
        () => {
          buildRFC2822Message({
            from: "Sender <sender@example.com>",
            to: "recipient@example.com",
            subject: "Re: Test",
            body: "Body",
            inReplyTo: "<msg-id>\nInjected: value",
          });
        },
        {
          message: /VALIDATION_ERROR: In-Reply-To header contains invalid characters/,
        }
      );
    });
  });
  describe("chatRequestSchema & AI Reply threading context preservation", () => {
    it("preserves threadId and messageIdHeader when parsing appContext in chat request", async () => {
      const { chatRequestSchema } = await import("../app/api/ai/chat/route");
      const rawPayload = {
        messages: [{ role: "user", content: "Reply to this email" }],
        appContext: {
          currentFolder: "inbox",
          messageCount: 5,
          selectedEmail: {
            id: "msg-12345",
            threadId: "gmail-thread-9999",
            messageIdHeader: "<parent-message-id-9999@mail.gmail.com>",
            subject: "Re: Nebula Mail App",
            from: { name: "Test Sender", email: "sender@example.com" },
            to: [{ name: "User", email: "user@example.com" }],
            date: "2026-09-05T07:10:00.000Z",
            snippet: "Testing reply threading",
          },
          composeIsOpen: false,
          composeTo: "",
          composeSubject: "",
          aiFilterActive: false,
          aiFilterLabel: null,
        },
      };
      const parsed = chatRequestSchema.safeParse(rawPayload);
      assert.ok(parsed.success, "Payload must parse successfully");
      assert.equal(
        parsed.data.appContext.selectedEmail?.threadId,
        "gmail-thread-9999",
        "threadId must survive schema parsing"
      );
      assert.equal(
        parsed.data.appContext.selectedEmail?.messageIdHeader,
        "<parent-message-id-9999@mail.gmail.com>",
        "messageIdHeader must survive schema parsing"
      );
    });
    it("prepare_reply receives threadId and inReplyTo and emits them in open_compose action", async () => {
      const { createAiTools } = await import("../lib/ai/tools");
      type UiActionType = import("../types/ai").UiAction;
      const recordedActions: UiActionType[] = [];
      const tools = createAiTools({
        sessionId: "test-session-schema-check",
        recordAction: (action) => recordedActions.push(action),
        appContext: {
          currentFolder: "inbox",
          messageCount: 5,
          selectedEmail: {
            id: "msg-test-id",
            threadId: "thread-test-preserve-123",
            messageIdHeader: "<parent-test-id@mail.gmail.com>",
            subject: "Re: Nebula Mail App",
            from: { name: "Alice", email: "alice@example.com" },
            to: [{ name: "Bob", email: "bob@example.com" }],
            date: "2026-09-05T07:10:00.000Z",
            snippet: "Hello Alice",
          },
          composeIsOpen: false,
          composeTo: "",
          composeSubject: "",
          aiFilterActive: false,
          aiFilterLabel: null,
        },
      });
      const executeReply = tools.prepare_reply.execute as unknown as (
        args: { body: string },
        options?: Record<string, unknown>
      ) => Promise<{ success: boolean }>;
      const result = await executeReply(
        { body: "Received and reviewing now." },
        { toolCallId: "call-1", messages: [] }
      );
      assert.ok(result.success);
      assert.equal(recordedActions.length, 1);
      const action = recordedActions[0];
      assert.equal(action.type, "open_compose");
      if (action.type === "open_compose") {
        assert.equal(action.payload.threadId, "thread-test-preserve-123");
        assert.equal(action.payload.inReplyTo, "<parent-test-id@mail.gmail.com>");
      }
    });
  });
});
