"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  Send,
  X,
  RotateCcw,
  Bot,
  User,
  AlertCircle,
  CheckCircle2,
  Mail,
  ArrowRight,
  FolderSync,
} from "lucide-react";
import { useAI } from "@/context/ai-context";
import { useMail } from "@/context/mail-context";
import { UiAction } from "@/types/ai";

/**
 * Formats a UiAction for human-readable visual display as a pill badge.
 */
function renderActionPill(action: UiAction, idx: number) {
  switch (action.type) {
    case "open_compose": {
      const { to, subject } = action.payload;
      return (
        <span
          key={idx}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
        >
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          <span>
            Opened Compose Draft{to ? ` (To: ${to})` : ""}
            {subject ? ` — "${subject}"` : ""}
          </span>
        </span>
      );
    }
    case "set_compose_field": {
      const { field, value } = action.payload;
      return (
        <span
          key={idx}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
        >
          <CheckCircle2 className="w-3 h-3 text-indigo-400" />
          <span>
            Set {field}: &quot;{value.length > 25 ? value.slice(0, 25) + "…" : value}&quot;
          </span>
        </span>
      );
    }
    case "navigate_mailbox": {
      return (
        <span
          key={idx}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-purple-500/15 text-purple-300 border border-purple-500/30"
        >
          <FolderSync className="w-3 h-3 text-purple-400" />
          <span>Switched to {action.payload.folder}</span>
        </span>
      );
    }
    case "select_message": {
      return (
        <span
          key={idx}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-blue-500/15 text-blue-300 border border-blue-500/30"
        >
          <Mail className="w-3 h-3 text-blue-400" />
          <span>Selected email</span>
        </span>
      );
    }
    case "clear_filter": {
      return (
        <span
          key={idx}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
        >
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          <span>Filter cleared &bull; Normal mailbox restored</span>
        </span>
      );
    }
    case "set_filtered_messages": {
      const count = action.payload.messages?.length ?? 0;
      return (
        <span
          key={idx}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
        >
          <CheckCircle2 className="w-3 h-3 text-indigo-400" />
          <span>
            Filtered {count} {count === 1 ? "email" : "emails"}: &quot;{action.payload.filterLabel}&quot;
          </span>
        </span>
      );
    }
    default:
      return null;
  }
}

export function AiAssistantPanel() {
  const {
    messages,
    isOpen,
    isLoading,
    error,
    setIsOpen,
    sendMessage,
    clearHistory,
    clearError,
  } = useAI();

  const { activeFolder, messages: mailMessages, selectedMessage, compose } = useMail();

  const [inputVal, setInputVal] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom of chat when new messages appear or loading state changes
  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading, isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const prompt = inputVal.trim();
    if (!prompt || isLoading) return;

    setInputVal("");
    await sendMessage(prompt);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const quickPrompts = [
    "Show me emails from the last 10 days",
    "Show unread emails",
    "Open compose and prepare an email to alex@example.com about the project sync",
    "Clear the filter",
  ];

  return (
    <aside
      id="ai-assistant-panel"
      className="w-96 border-l border-zinc-800/80 bg-zinc-950/80 backdrop-blur-2xl flex flex-col shrink-0 h-full select-none z-30 transition-all duration-200"
      aria-label="Nebula AI Assistant"
    >
      {/* Header */}
      <div className="p-4 border-b border-zinc-800/60 flex items-center justify-between bg-zinc-900/40">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0">
            <Sparkles className="w-4 h-4 text-white animate-pulse" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-zinc-100 tracking-tight">
                Nebula AI
              </h2>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Copilot
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 truncate">
              {isLoading ? (
                <span className="text-indigo-400 animate-pulse flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  Thinking &amp; executing tools…
                </span>
              ) : (
                <span>Connected to MailContext</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1 shrink-0">
          <button
            id="ai-chat-clear-btn"
            type="button"
            onClick={clearHistory}
            title="Clear chat history"
            disabled={isLoading || messages.length === 0}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors disabled:opacity-30"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            id="ai-chat-close-btn"
            type="button"
            onClick={() => setIsOpen(false)}
            title="Close AI panel"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* App Context Status Pill */}
      <div className="px-4 py-2 border-b border-zinc-900 bg-zinc-950/60 text-[11px] text-zinc-400 flex items-center justify-between overflow-hidden">
        <span className="truncate">
          Folder: <strong className="text-zinc-300 capitalize">{activeFolder}</strong> ({mailMessages.length} msgs)
          {selectedMessage && (
            <span className="ml-1 text-zinc-400 truncate">
              &bull; &quot;{selectedMessage.subject || "(No Subject)"}&quot;
            </span>
          )}
        </span>
        {compose.isOpen && (
          <span className="text-indigo-400 text-[10px] font-semibold bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 shrink-0">
            Compose Open
          </span>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div
          id="ai-error-banner"
          role="alert"
          className="m-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start justify-between gap-2"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span className="leading-snug">{error}</span>
          </div>
          <button
            onClick={clearError}
            className="text-xs text-rose-400 hover:text-rose-200 underline shrink-0 font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Messages List */}
      <div
        id="ai-chat-messages"
        className="flex-1 overflow-y-auto p-4 space-y-4 text-xs"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 space-y-3 select-none">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-inner">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-200">How can I help with your mail?</p>
              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                I can prepare draft emails, search your messages, switch folders, and interact directly with your client.
              </p>
            </div>

            <div className="w-full pt-4 space-y-2 text-left">
              <p className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 px-1">
                Suggested Commands
              </p>
              {quickPrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setInputVal(prompt);
                    if (inputRef.current) inputRef.current.focus();
                  }}
                  className="w-full text-left p-2.5 rounded-xl border border-zinc-850 bg-zinc-900/50 hover:bg-zinc-850/80 hover:border-indigo-500/30 text-zinc-300 text-xs transition-all flex items-center justify-between group"
                >
                  <span className="line-clamp-2">{prompt}</span>
                  <ArrowRight className="w-3 h-3 text-zinc-500 group-hover:text-indigo-400 shrink-0 ml-2 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={msg.id}
                className={`flex flex-col space-y-1.5 ${
                  isUser ? "items-end" : "items-start"
                }`}
              >
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 px-1">
                  {isUser ? (
                    <>
                      <span>You</span>
                      <User className="w-3 h-3 text-indigo-400" />
                    </>
                  ) : (
                    <>
                      <Bot className="w-3 h-3 text-purple-400" />
                      <span>Nebula Assistant</span>
                    </>
                  )}
                </div>

                <div
                  className={`p-3 rounded-2xl max-w-[90%] leading-relaxed break-words ${
                    isUser
                      ? "bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-tr-sm shadow-md shadow-indigo-500/10"
                      : "bg-zinc-900/90 border border-zinc-800/80 text-zinc-200 rounded-tl-sm shadow-sm"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>

                {/* Display executed UI action badges */}
                {!isUser && msg.actions && msg.actions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1 px-1">
                    {msg.actions.map((act, idx) => renderActionPill(act, idx))}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Loading Indicator */}
        {isLoading && (
          <div
            id="ai-loading-indicator"
            className="flex items-start space-y-1.5 flex-col"
          >
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 px-1">
              <Bot className="w-3 h-3 text-purple-400" />
              <span>Nebula Assistant</span>
            </div>
            <div className="p-3.5 rounded-2xl rounded-tl-sm bg-zinc-900/90 border border-zinc-800/80 text-zinc-300 flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
              <span className="w-2 h-2 rounded-full bg-pink-400 animate-bounce" />
              <span className="text-xs text-zinc-400 pl-2">
                Processing command…
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="p-3 border-t border-zinc-800/60 bg-zinc-950/90">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <div className="relative rounded-2xl border border-zinc-800 bg-zinc-900/70 focus-within:border-indigo-500/60 focus-within:ring-1 focus-within:ring-indigo-500/30 transition-all">
            <textarea
              ref={inputRef}
              id="ai-chat-input"
              rows={2}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              placeholder="Ask AI or give a command (e.g. 'Draft an email to...')..."
              className="w-full bg-transparent outline-none p-3 text-xs text-zinc-200 placeholder-zinc-500 resize-none disabled:opacity-50"
            />
            <div className="flex items-center justify-between px-3 pb-2 pt-0.5">
              <span className="text-[10px] text-zinc-400 select-none">
                Enter to send &bull; Shift+Enter for newline
              </span>
              <button
                id="ai-chat-send-btn"
                type="submit"
                disabled={isLoading || !inputVal.trim()}
                aria-label="Send message to AI"
                className="flex items-center justify-center p-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white disabled:opacity-30 hover:brightness-110 active:scale-95 transition-all shadow-md shadow-indigo-500/25"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </aside>
  );
}
