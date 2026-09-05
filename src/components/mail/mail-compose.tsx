"use client";

import React, { useCallback, useRef, useEffect } from "react";
import { useMail } from "@/context/mail-context";

/**
 * MailCompose — Compose modal for Stage 3 + Stage 4E.
 *
 * Design decisions:
 * - Stable DOM IDs on all interactive fields so Stage 4 AI can target them.
 *   - #compose-to, #compose-subject, #compose-body, #compose-send-btn, #compose-cancel-btn
 * - data-compose-role attributes mirror the IDs for semantic clarity.
 * - Each field calls updateComposeField which sets dirty=true to prevent AI overwrite of
 *   manually entered text in Stage 4.
 * - From address is NOT shown and NOT sent by the client; it is derived server-side.
 * - Modal traps focus (Escape to close) for accessibility.
 * - Stage 4E: When pendingAiSend is set, an AI confirmation banner replaces the normal footer.
 *   The existing #compose-send-btn manual path remains untouched.
 */
export function MailCompose() {
  const {
    compose,
    closeCompose,
    updateComposeField,
    sendMail,
    pendingAiSend,
    confirmAiSend,
    cancelAiSend,
  } = useMail();
  const toRef = useRef<HTMLInputElement>(null);

  // Focus the To field when the modal opens
  useEffect(() => {
    if (compose.isOpen && toRef.current) {
      toRef.current.focus();
    }
  }, [compose.isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!compose.isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCompose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [compose.isOpen, closeCompose]);

  const handleSend = useCallback(async () => {
    const to = compose.to.value.trim();
    const subject = compose.subject.value.trim();
    const body = compose.body.value;

    // Client-side presence check (server validates format + CRLF)
    if (!to) {
      updateComposeField("to", "");
      return;
    }
    if (!subject) {
      updateComposeField("subject", "");
      return;
    }

    await sendMail({
      to,
      subject,
      body,
      threadId: compose.threadId,
      inReplyTo: compose.inReplyTo,
    });
  }, [
    compose.to.value,
    compose.subject.value,
    compose.body.value,
    compose.threadId,
    compose.inReplyTo,
    sendMail,
    updateComposeField,
  ]);

  if (!compose.isOpen) return null;

  return (
    /* Backdrop */
    <div
      id="compose-backdrop"
      className="fixed inset-0 z-50 flex items-end justify-end p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compose-title"
      onClick={(e) => {
        // Close if user clicks backdrop outside the modal card
        if (e.target === e.currentTarget) closeCompose();
      }}
    >
      {/* Modal card */}
      <div
        id="compose-modal"
        className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          background: "var(--surface-elevated, #1e1e2e)",
          border: "1px solid rgba(255,255,255,0.08)",
          animation: "compose-slide-in 0.22s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{
            background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
          }}
        >
          <h2
            id="compose-title"
            className="text-sm font-semibold text-white tracking-wide"
          >
            New Message
          </h2>
          <div className="flex gap-2">
            <button
              id="compose-cancel-btn"
              data-compose-role="cancel"
              type="button"
              onClick={closeCompose}
              aria-label="Discard and close compose window"
              disabled={compose.isSending}
              className="text-white/70 hover:text-white transition-colors rounded px-2 py-0.5 text-xs"
            >
              Discard
            </button>
          </div>
        </div>

        {/* Fields */}
        <div className="flex flex-col gap-0" style={{ flex: 1 }}>
          {/* To */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5">
            <label
              htmlFor="compose-to"
              className="text-xs font-medium w-14 shrink-0"
              style={{ color: "var(--text-muted, #a0a0b8)" }}
            >
              To
            </label>
            <input
              ref={toRef}
              id="compose-to"
              data-compose-role="to"
              type="email"
              autoComplete="email"
              placeholder="recipient@example.com"
              value={compose.to.value}
              onChange={(e) => updateComposeField("to", e.target.value)}
              disabled={compose.isSending}
              aria-label="Recipient email address"
              aria-required="true"
              className="flex-1 bg-transparent outline-none text-sm placeholder-white/20 disabled:opacity-50"
              style={{ color: "var(--text-primary, #e0e0f0)" }}
            />
          </div>

          {/* Subject */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5">
            <label
              htmlFor="compose-subject"
              className="text-xs font-medium w-14 shrink-0"
              style={{ color: "var(--text-muted, #a0a0b8)" }}
            >
              Subject
            </label>
            <input
              id="compose-subject"
              data-compose-role="subject"
              type="text"
              placeholder="Subject"
              value={compose.subject.value}
              onChange={(e) => updateComposeField("subject", e.target.value)}
              disabled={compose.isSending}
              aria-label="Email subject"
              aria-required="true"
              className="flex-1 bg-transparent outline-none text-sm placeholder-white/20 disabled:opacity-50"
              style={{ color: "var(--text-primary, #e0e0f0)" }}
            />
          </div>

          {/* Body */}
          <div className="px-5 pt-3 pb-2 flex flex-col" style={{ minHeight: 220 }}>
            <textarea
              id="compose-body"
              data-compose-role="body"
              placeholder="Write your message here…"
              value={compose.body.value}
              onChange={(e) => updateComposeField("body", e.target.value)}
              disabled={compose.isSending}
              aria-label="Email body"
              rows={9}
              className="flex-1 w-full bg-transparent outline-none text-sm resize-none placeholder-white/20 disabled:opacity-50"
              style={{ color: "var(--text-primary, #e0e0f0)" }}
            />
          </div>

          {/* Error banner */}
          {compose.sendError && (
            <div
              role="alert"
              aria-live="assertive"
              className="mx-5 mb-3 rounded-lg px-4 py-2 text-xs"
              style={{
                background: "rgba(239,68,68,0.12)",
                border: "1px solid rgba(239,68,68,0.3)",
                color: "#fca5a5",
              }}
            >
              {compose.sendError}
            </div>
          )}

          {/* Stage 4E — AI Send Confirmation Banner */}
          {pendingAiSend ? (
            <div
              id="ai-send-confirmation"
              role="alertdialog"
              aria-labelledby="ai-send-confirmation-title"
              aria-modal="false"
              className="mx-4 mb-4 mt-1 rounded-2xl overflow-hidden"
              style={{
                border: "1px solid rgba(99,102,241,0.35)",
                background: "rgba(99,102,241,0.08)",
              }}
            >
              {/* Banner header */}
              <div
                className="px-4 py-2.5 flex items-center gap-2"
                style={{
                  background: "linear-gradient(135deg, rgba(99,102,241,0.25) 0%, rgba(139,92,246,0.2) 100%)",
                  borderBottom: "1px solid rgba(99,102,241,0.2)",
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ color: "#a5b4fc", flexShrink: 0 }}
                  aria-hidden="true"
                >
                  <path d="M22 2L11 13" />
                  <path d="M22 2L15 22 11 13 2 9l20-7z" />
                </svg>
                <span
                  id="ai-send-confirmation-title"
                  className="text-xs font-semibold"
                  style={{ color: "#c7d2fe" }}
                >
                  Ready to send this email
                </span>
              </div>

              {/* Recipient / Subject / Preview */}
              <div className="px-4 py-3 space-y-1.5">
                <div className="flex items-baseline gap-2 text-xs">
                  <span className="font-medium shrink-0" style={{ color: "#a0a0b8", minWidth: "3.5rem" }}>To:</span>
                  <span className="break-all" style={{ color: "#e0e0f0" }}>{pendingAiSend.to}</span>
                </div>
                <div className="flex items-baseline gap-2 text-xs">
                  <span className="font-medium shrink-0" style={{ color: "#a0a0b8", minWidth: "3.5rem" }}>Subject:</span>
                  <span className="break-words" style={{ color: "#e0e0f0" }}>{pendingAiSend.subject}</span>
                </div>
                {pendingAiSend.bodyPreview && (
                  <div className="mt-2 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className="text-[11px] mb-1 font-medium" style={{ color: "#a0a0b8" }}>Message preview:</p>
                    <p
                      className="text-xs leading-relaxed whitespace-pre-wrap break-words"
                      style={{ color: "#c0c0d8" }}
                    >
                      {pendingAiSend.bodyPreview.length > 200
                        ? pendingAiSend.bodyPreview.slice(0, 200) + "…"
                        : pendingAiSend.bodyPreview}
                    </p>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div
                className="flex items-center justify-end gap-2 px-4 py-3"
                style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
              >
                <button
                  id="ai-send-cancel-btn"
                  type="button"
                  onClick={() => void cancelAiSend()}
                  disabled={compose.isSending}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
                  style={{
                    color: "#a0a0b8",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  Cancel
                </button>
                <button
                  id="ai-send-confirm-btn"
                  type="button"
                  onClick={() => void confirmAiSend()}
                  disabled={compose.isSending}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-40 transition-all"
                  style={{
                    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                    boxShadow: compose.isSending ? "none" : "0 2px 10px rgba(99,102,241,0.4)",
                  }}
                >
                  {compose.isSending ? (
                    <>
                      <span
                        className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"
                        aria-hidden="true"
                      />
                      Sending…
                    </>
                  ) : (
                    "Confirm & Send"
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Normal manual send footer — Stage 3 path UNCHANGED */
            <div className="flex items-center justify-between px-5 pb-4 pt-1">
              <p className="text-xs" style={{ color: "var(--text-muted, #a0a0b8)" }}>
                From address is determined by your connected account.
              </p>
              <button
                id="compose-send-btn"
                data-compose-role="send"
                type="button"
                onClick={handleSend}
                disabled={compose.isSending || !compose.to.value.trim() || !compose.subject.value.trim()}
                aria-label="Send email"
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-all"
                style={{
                  background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                  boxShadow: compose.isSending ? "none" : "0 4px 14px rgba(99,102,241,0.4)",
                }}
              >
                {compose.isSending ? (
                  <>
                    <span
                      className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
                      aria-hidden="true"
                    />
                    Sending…
                  </>
                ) : (
                  <>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M22 2L11 13" />
                      <path d="M22 2L15 22 11 13 2 9l20-7z" />
                    </svg>
                    Send
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Slide-in animation */}
      <style jsx global>{`
        @keyframes compose-slide-in {
          from {
            opacity: 0;
            transform: translateY(32px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
