/**
 * Unit tests for Stage 4 AI search query building and sanitization.
 *
 * Covers:
 * - resolveRelativeDate deterministic calculation
 * - buildGmailQuery safe parameter concatenation and injection stripping
 * - aiSearchParamsSchema validation rules
 *
 * Running:
 *   npx tsx --test src/__tests__/gmail-search.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveRelativeDate,
  buildGmailQuery,
  aiSearchParamsSchema,
} from "../lib/gmail/search";

describe("resolveRelativeDate", () => {
  it("generates a valid YYYY-MM-DD format date string", () => {
    const result = resolveRelativeDate(10);
    assert.match(result, /^\d{4}-\d{2}-\d{2}$/);
  });

  it("calculates exactly N days prior to today", () => {
    const today = new Date();
    const expected = new Date();
    expected.setDate(today.getDate() - 7);

    const expectedStr = `${expected.getFullYear()}-${String(
      expected.getMonth() + 1
    ).padStart(2, "0")}-${String(expected.getDate()).padStart(2, "0")}`;

    const result = resolveRelativeDate(7);
    assert.equal(result, expectedStr);
  });
});

describe("buildGmailQuery", () => {
  it("builds an inbox folder query", () => {
    const query = buildGmailQuery({ folder: "inbox" });
    assert.equal(query, "in:inbox");
  });

  it("builds a sent folder query", () => {
    const query = buildGmailQuery({ folder: "sent" });
    assert.equal(query, "in:sent");
  });

  it("handles isUnread flag", () => {
    const query = buildGmailQuery({ isUnread: true });
    assert.equal(query, "is:unread");
  });

  it("handles isRead flag", () => {
    const query = buildGmailQuery({ isRead: true });
    assert.equal(query, "is:read");
  });

  it("formats fromSender and strips special query punctuation", () => {
    const query = buildGmailQuery({
      fromSender: 'Sarah "CEO" <sarah@company.com>',
    });
    // Double quotes and angle brackets should be stripped
    assert.equal(query.includes('"'), false);
    assert.equal(query.includes("<"), false);
    assert.equal(query.includes(">"), false);
    assert.match(query, /^from:\(.*\)$/);
  });

  it("resolves relativeDays into after: query", () => {
    const query = buildGmailQuery({ relativeDays: 10 });
    assert.match(query, /^after:\d{4}-\d{2}-\d{2}$/);
  });

  it("handles explicit afterDate and beforeDate", () => {
    const query = buildGmailQuery({
      afterDate: "2026-08-01",
      beforeDate: "2026-08-31",
    });
    assert.equal(query, "after:2026-08-01 before:2026-08-31");
  });

  it("sanitizes keyword by stripping parenthesis and brace breakouts", () => {
    const query = buildGmailQuery({ keyword: "project (confidential) {admin}" });
    assert.equal(query.includes("{"), false);
    assert.equal(query.includes("}"), false);
    assert.match(query, /\(project\s+confidential\s+admin\)/);
  });

  it("combines multiple structured search parameters safely", () => {
    const query = buildGmailQuery({
      folder: "inbox",
      fromSender: "David",
      keyword: "Quarterly Report",
      isUnread: true,
      relativeDays: 14,
    });

    assert.ok(query.includes("in:inbox"));
    assert.ok(query.includes("from:(David)"));
    assert.ok(query.includes("(Quarterly Report)"));
    assert.ok(query.includes("is:unread"));
    assert.match(query, /after:\d{4}-\d{2}-\d{2}/);
  });

  it("returns empty string for empty parameters", () => {
    const query = buildGmailQuery({});
    assert.equal(query, "");
  });
});

describe("aiSearchParamsSchema", () => {
  it("validates compliant search parameters", () => {
    const result = aiSearchParamsSchema.safeParse({
      folder: "inbox",
      fromSender: "Alice",
      keyword: "meeting",
      relativeDays: 5,
      isUnread: true,
    });
    assert.equal(result.success, true);
  });

  it("rejects invalid relativeDays exceeding 365", () => {
    const result = aiSearchParamsSchema.safeParse({
      relativeDays: 500,
    });
    assert.equal(result.success, false);
  });

  it("rejects negative relativeDays", () => {
    const result = aiSearchParamsSchema.safeParse({
      relativeDays: -5,
    });
    assert.equal(result.success, false);
  });

  it("rejects malformed date strings", () => {
    const result = aiSearchParamsSchema.safeParse({
      afterDate: "not-a-date",
    });
    assert.equal(result.success, false);
  });

  it("accepts valid ISO date format", () => {
    const result = aiSearchParamsSchema.safeParse({
      afterDate: "2026-09-01",
      beforeDate: "2026-09-05",
    });
    assert.equal(result.success, true);
  });
});
