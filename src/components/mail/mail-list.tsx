"use client";

import React from "react";
import { Mail, Paperclip, AlertCircle, RefreshCw, Sparkles } from "lucide-react";
import { useMail } from "@/context/mail-context";
import { EmailMessage } from "@/types/mail";

function formatEmailDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }

    const isThisYear = date.getFullYear() === now.getFullYear();
    if (isThisYear) {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }

    return date.toLocaleDateString([], { month: "short", day: "numeric", year: "2-digit" });
  } catch {
    return dateStr;
  }
}

export function MailList() {
  const {
    activeFolder,
    messages,
    selectedMessageId,
    selectMessage,
    isLoading,
    error,
    refreshMail,
    clearError,
    aiFilterActive,
    aiFilterLabel,
    clearAiFilter,
  } = useMail();

  const folderTitle = activeFolder === "sent" ? "Sent Messages" : "Inbox";

  return (
    <div className="w-96 border-r border-zinc-800/80 bg-zinc-950/40 flex flex-col shrink-0 h-full">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800/60 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100 capitalize">
            {folderTitle}
          </h2>
          <p className="text-xs text-zinc-400">
            {messages.length} {messages.length === 1 ? "email" : "emails"}
          </p>
        </div>
        <button
          onClick={() => refreshMail()}
          disabled={isLoading}
          title="Refresh"
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* AI Filter Banner */}
      {aiFilterActive && (
        <div
          id="ai-filter-banner"
          className="mx-3 mt-3 p-3 rounded-xl bg-gradient-to-r from-indigo-950/60 to-purple-950/60 border border-indigo-500/30 text-xs flex items-center justify-between gap-2 shadow-sm"
        >
          <div className="flex items-center gap-2 text-indigo-300 min-w-0">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0 animate-pulse" />
            <span className="font-semibold text-zinc-200 shrink-0">AI Filter:</span>
            <span className="truncate text-indigo-200">{aiFilterLabel || "Search Results"}</span>
          </div>
          <button
            id="ai-filter-clear-btn"
            type="button"
            onClick={clearAiFilter}
            className="text-xs text-indigo-400 hover:text-indigo-200 px-2 py-0.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors shrink-0 font-medium border border-indigo-500/20"
          >
            Clear
          </button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="m-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => {
              clearError();
              refreshMail();
            }}
            className="text-xs text-rose-400 hover:text-rose-200 underline shrink-0 font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {/* Message List */}
      <div className="flex-1 overflow-y-auto divide-y divide-zinc-900/60">
        {isLoading && messages.length === 0 ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <div
                key={n}
                className="p-3 rounded-xl border border-zinc-900 bg-zinc-900/30 animate-pulse space-y-2"
              >
                <div className="flex justify-between items-center">
                  <div className="h-3.5 bg-zinc-800 rounded w-1/3" />
                  <div className="h-3 bg-zinc-850 rounded w-12" />
                </div>
                <div className="h-4 bg-zinc-800 rounded w-3/4" />
                <div className="h-3 bg-zinc-850 rounded w-full" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 space-y-3">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-center text-zinc-400">
              <Mail className="w-6 h-6" />
            </div>
            {aiFilterActive ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-zinc-300">
                  No matching emails found
                </p>
                <p className="text-xs text-zinc-500 max-w-xs mx-auto">
                  No emails in your mailbox matched the filter &quot;{aiFilterLabel}&quot;.
                </p>
                <button
                  type="button"
                  onClick={clearAiFilter}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 text-xs font-medium border border-indigo-500/30 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Clear filter &amp; show all
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-400">
                  No emails in {activeFolder}
                </p>
                <p className="text-xs text-zinc-600">
                  Real Gmail messages will appear here once received.
                </p>
              </div>
            )}
          </div>
        ) : (
          messages.map((email: EmailMessage) => {
            const isSelected = selectedMessageId === email.id;
            const senderOrRecipient =
              activeFolder === "sent"
                ? email.to?.[0]?.name || email.to?.[0]?.email || "Recipient"
                : email.from?.name || email.from?.email || "Unknown";

            return (
              <div
                key={email.id}
                onClick={() => selectMessage(email.id)}
                className={`p-3.5 cursor-pointer transition-all duration-150 relative ${
                  isSelected
                    ? "bg-zinc-850/90 border-l-2 border-indigo-500 shadow-sm"
                    : email.isUnread
                    ? "bg-zinc-900/40 hover:bg-zinc-850/50"
                    : "hover:bg-zinc-900/30 text-zinc-400"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    {email.isUnread && (
                      <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                    )}
                    <span
                      className={`text-xs truncate ${
                        email.isUnread
                          ? "font-semibold text-zinc-100"
                          : "font-medium text-zinc-300"
                      }`}
                    >
                      {senderOrRecipient}
                    </span>
                  </div>
                  <span className="text-[11px] text-zinc-400 shrink-0">
                    {formatEmailDate(email.date)}
                  </span>
                </div>

                <h3
                  className={`text-xs line-clamp-1 mb-1 ${
                    email.isUnread
                      ? "font-semibold text-zinc-200"
                      : "text-zinc-300"
                  }`}
                >
                  {email.subject || "(No Subject)"}
                </h3>

                <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                  {email.snippet}
                </p>

                {email.attachments && email.attachments.length > 0 && (
                  <div className="mt-2 flex items-center gap-1 text-[10px] text-zinc-400">
                    <Paperclip className="w-3 h-3" />
                    <span>
                      {email.attachments.length}{" "}
                      {email.attachments.length === 1 ? "attachment" : "attachments"}
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
