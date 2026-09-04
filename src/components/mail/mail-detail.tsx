"use client";

import React from "react";
import { Mail, Paperclip, Clock, ArrowLeft } from "lucide-react";
import { useMail } from "@/context/mail-context";

function formatFullDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    }).format(date);
  } catch {
    return dateStr;
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function MailDetail() {
  const { selectedMessage, isDetailLoading, selectMessage } = useMail();

  if (isDetailLoading) {
    return (
      <div className="flex-1 bg-zinc-950/20 p-8 flex flex-col justify-start space-y-6 animate-pulse">
        <div className="h-6 bg-zinc-850 rounded w-2/3" />
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-zinc-850" />
          <div className="space-y-2 flex-1">
            <div className="h-4 bg-zinc-850 rounded w-1/4" />
            <div className="h-3 bg-zinc-900 rounded w-1/3" />
          </div>
        </div>
        <div className="border-t border-zinc-850 pt-6 space-y-3">
          <div className="h-4 bg-zinc-850 rounded w-full" />
          <div className="h-4 bg-zinc-850 rounded w-5/6" />
          <div className="h-4 bg-zinc-850 rounded w-4/6" />
          <div className="h-4 bg-zinc-900 rounded w-3/4" />
        </div>
      </div>
    );
  }

  if (!selectedMessage) {
    return (
      <div className="flex-1 bg-zinc-950/20 flex flex-col items-center justify-center text-zinc-500 p-8">
        <div className="w-16 h-16 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-center text-zinc-400 mb-4 shadow-inner">
          <Mail className="w-8 h-8" />
        </div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-1">
          No message selected
        </h3>
        <p className="text-xs text-zinc-400 max-w-xs text-center">
          Choose an email from the list to view its full details, headers, and attachments.
        </p>
      </div>
    );
  }

  const { from, to, cc, subject, date, bodyHtml, bodyText, attachments } = selectedMessage;

  return (
    <div className="flex-1 bg-zinc-950/20 flex flex-col overflow-hidden h-full">
      {/* Detail Header / Action Toolbar */}
      <div className="p-6 border-b border-zinc-800/60 bg-zinc-950/40">
        <div className="flex items-center justify-between gap-4 mb-4">
          <button
            onClick={() => selectMessage(null)}
            className="md:hidden flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to list
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Gmail
            </span>
          </div>
        </div>

        <h1 className="text-lg font-bold text-zinc-100 mb-4 leading-snug">
          {subject || "(No Subject)"}
        </h1>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 text-white font-bold flex items-center justify-center text-sm shadow-md ring-1 ring-white/10 shrink-0">
              {from.name?.[0]?.toUpperCase() || from.email[0]?.toUpperCase() || "M"}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-zinc-100">
                  {from.name || from.email}
                </span>
                <span className="text-xs text-zinc-400 font-mono">
                  &lt;{from.email}&gt;
                </span>
              </div>
              <p className="text-xs text-zinc-400 truncate">
                to {to.map((recipient) => recipient.name || recipient.email).join(", ")}
                {cc && cc.length > 0 && ` • cc: ${cc.map((c) => c.name || c.email).join(", ")}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 text-xs text-zinc-400 shrink-0">
            <Clock className="w-3.5 h-3.5" />
            <span>{formatFullDate(date)}</span>
          </div>
        </div>
      </div>

      {/* Detail Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {bodyHtml ? (
          <div
            className="prose prose-invert prose-zinc max-w-none text-zinc-200 text-sm leading-relaxed overflow-x-auto [&_a]:text-indigo-400 [&_a]:underline [&_img]:max-w-full [&_table]:border-collapse [&_table]:w-full"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        ) : bodyText ? (
          <pre className="font-sans text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">
            {bodyText}
          </pre>
        ) : (
          <p className="text-xs text-zinc-500 italic">
            This message has no readable text content.
          </p>
        )}

        {/* Attachments Section */}
        {attachments && attachments.length > 0 && (
          <div className="border-t border-zinc-800/80 pt-4 mt-6">
            <h4 className="text-xs font-semibold text-zinc-400 mb-3 flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5" />
              Attachments ({attachments.length})
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="p-3 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-850 flex items-center justify-between gap-3 text-xs transition-colors"
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <Paperclip className="w-4 h-4 text-indigo-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-200 truncate">
                        {att.filename}
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        {formatBytes(att.size)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
