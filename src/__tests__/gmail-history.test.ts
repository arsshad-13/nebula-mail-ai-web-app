/**
 * Unit tests for Stage 4F-1 Gmail history processing logic.
 *
 * These tests cover pure/isolated logic that does NOT require a live Google API:
 * - Pub/Sub message decoding
 * - Gmail notification parsing
 * - History expiry error detection
 * - Idempotency helper logic
 *
 * Integration tests (requiring actual Google Cloud + Gmail API) are intentionally
 * excluded and documented as manual verification steps.
 *
 * Running: These tests use Node.js built-in test runner (node --test) which is
 * available in Node.js 18+. No jest/vitest dependency needed.
 *
 * Usage:
 *   node --experimental-vm-modules --test src/__tests__/gmail-history.test.ts
 *
 * Or with tsx:
 *   npx tsx --test src/__tests__/gmail-history.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decodePubSubMessage, isHistoryExpiredError, GmailPubSubPayload } from "../lib/gmail/history";

// ---------------------------------------------------------------------------
// decodePubSubMessage
// ---------------------------------------------------------------------------

describe("decodePubSubMessage", () => {
  function makePubSubBody(payload: GmailPubSubPayload, extra?: object) {
    const dataB64 = Buffer.from(JSON.stringify(payload)).toString("base64");
    return {
      message: {
        data: dataB64,
        messageId: "test-message-id-123",
        publishTime: "2026-09-04T10:00:00Z",
        ...extra,
      },
      subscription: "projects/nebula-mail-507603/subscriptions/gmail-push-sub",
    };
  }

  it("decodes a valid Pub/Sub message correctly", () => {
    const payload: GmailPubSubPayload = {
      emailAddress: "user@gmail.com",
      historyId: 123456,
    };
    const body = makePubSubBody(payload);
    const result = decodePubSubMessage(body);

    assert.ok(result !== null, "Should return a decoded result");
    assert.equal(result!.payload.emailAddress, "user@gmail.com");
    assert.equal(result!.payload.historyId, 123456);
    assert.equal(result!.messageId, "test-message-id-123");
    assert.equal(result!.subscription, "projects/nebula-mail-507603/subscriptions/gmail-push-sub");
  });

  it("returns null for missing message field", () => {
    const result = decodePubSubMessage({ subscription: "sub" });
    assert.equal(result, null);
  });

  it("returns null for missing data field", () => {
    const result = decodePubSubMessage({ message: { messageId: "abc" } });
    assert.equal(result, null);
  });

  it("returns null for malformed base64 data", () => {
    const result = decodePubSubMessage({
      message: { data: "not-valid-json-base64!!", messageId: "abc" },
    });
    assert.equal(result, null);
  });

  it("returns null for valid base64 but missing emailAddress", () => {
    const badPayload = { historyId: 100 }; // no emailAddress
    const dataB64 = Buffer.from(JSON.stringify(badPayload)).toString("base64");
    const result = decodePubSubMessage({
      message: { data: dataB64, messageId: "abc" },
      subscription: "sub",
    });
    assert.equal(result, null);
  });

  it("returns null for valid base64 but missing historyId", () => {
    const badPayload = { emailAddress: "user@gmail.com" }; // no historyId
    const dataB64 = Buffer.from(JSON.stringify(badPayload)).toString("base64");
    const result = decodePubSubMessage({
      message: { data: dataB64, messageId: "abc" },
      subscription: "sub",
    });
    assert.equal(result, null);
  });

  it("returns null for null body", () => {
    assert.equal(decodePubSubMessage(null), null);
  });

  it("returns null for non-object body", () => {
    assert.equal(decodePubSubMessage("string input"), null);
    assert.equal(decodePubSubMessage(42), null);
  });
});

// ---------------------------------------------------------------------------
// isHistoryExpiredError
// ---------------------------------------------------------------------------

describe("isHistoryExpiredError", () => {
  it("returns true for HTTP 404 error code", () => {
    const err = { code: 404, message: "Not Found" };
    assert.equal(isHistoryExpiredError(err), true);
  });

  it("returns true for 'Start history ID too old' message", () => {
    const err = { code: 400, message: "Start history ID too old." };
    assert.equal(isHistoryExpiredError(err), true);
  });

  it("returns true for 'invalid history id' message (case-insensitive)", () => {
    const err = { code: 400, message: "Invalid History ID provided" };
    assert.equal(isHistoryExpiredError(err), true);
  });

  it("returns true for nested errors with reason notFound", () => {
    const err = {
      code: 404,
      errors: [{ reason: "notFound", message: "History not found" }],
    };
    assert.equal(isHistoryExpiredError(err), true);
  });

  it("returns false for a generic 500 error", () => {
    const err = { code: 500, message: "Internal Server Error" };
    assert.equal(isHistoryExpiredError(err), false);
  });

  it("returns false for a network error without code", () => {
    const err = new Error("ECONNRESET");
    assert.equal(isHistoryExpiredError(err), false);
  });

  it("returns false for null", () => {
    assert.equal(isHistoryExpiredError(null), false);
  });

  it("returns false for undefined", () => {
    assert.equal(isHistoryExpiredError(undefined), false);
  });

  it("returns false for a string", () => {
    assert.equal(isHistoryExpiredError("some error string"), false);
  });
});

// ---------------------------------------------------------------------------
// Idempotency logic (pure BigInt comparison — same as webhook uses)
// ---------------------------------------------------------------------------

describe("Idempotency: notified historyId vs known historyId", () => {
  function shouldSkip(notifiedHistoryId: number, knownHistoryId: string | null): boolean {
    if (!knownHistoryId) return false;
    return BigInt(notifiedHistoryId) <= BigInt(knownHistoryId);
  }

  it("skips if notified historyId equals known historyId (duplicate)", () => {
    assert.equal(shouldSkip(500, "500"), true);
  });

  it("skips if notified historyId is older than known historyId", () => {
    assert.equal(shouldSkip(400, "500"), true);
  });

  it("does NOT skip if notified historyId is newer than known historyId", () => {
    assert.equal(shouldSkip(600, "500"), false);
  });

  it("does NOT skip if no known historyId exists (first notification)", () => {
    assert.equal(shouldSkip(100, null), false);
  });

  it("handles large historyId values correctly (BigInt safety)", () => {
    // Test within JS safe integer range
    const large = "9007199254740000";
    assert.equal(shouldSkip(9007199254740001, large), false);
    assert.equal(shouldSkip(9007199254740000, large), true);
    assert.equal(shouldSkip(9007199254739999, large), true);
  });
});
