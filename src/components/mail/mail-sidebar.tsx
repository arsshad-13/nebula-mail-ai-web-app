"use client";

import React from "react";
import { Inbox, Send, RefreshCw, LogOut, Mail, Edit, Sparkles } from "lucide-react";
import { useMail } from "@/context/mail-context";
import { useAuth } from "@/context/auth-context";
import { useAI } from "@/context/ai-context";
import { MailFolder } from "@/types/mail";
import Image from "next/image";

export function MailSidebar() {
  const { activeFolder, setActiveFolder, refreshMail, isLoading, labels, openCompose } = useMail();
  const { user, logout } = useAuth();
  const { isOpen: isAiOpen, setIsOpen: setIsAiOpen } = useAI();

  const inboxLabel = labels.find((l) => l.id === "INBOX");
  const unreadCount = inboxLabel?.unreadCount || 0;

  const navItems: { id: MailFolder; label: string; icon: React.ReactNode; badge?: number }[] = [
    {
      id: "inbox",
      label: "Inbox",
      icon: <Inbox className="w-4 h-4" />,
      badge: unreadCount,
    },
    {
      id: "sent",
      label: "Sent",
      icon: <Send className="w-4 h-4" />,
    },
  ];

  return (
    <aside className="w-64 border-r border-zinc-800/80 bg-zinc-950/60 backdrop-blur-xl flex flex-col justify-between shrink-0 select-none h-full">
      {/* Brand Header */}
      <div className="p-4 border-b border-zinc-800/60">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <Mail className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-zinc-100 tracking-tight flex items-center gap-1.5">
              Nebula Mail
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Gmail
              </span>
            </h1>
            <p className="text-xs text-zinc-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Connected
            </p>
          </div>
        </div>
      </div>

      {/* Compose & AI Assistant Actions */}
      <div className="px-3 pt-3 pb-1 space-y-2">
        <button
          id="sidebar-compose-btn"
          type="button"
          onClick={openCompose}
          aria-label="Compose new email"
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.97]"
          style={{
            background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
            boxShadow: "0 4px 14px rgba(99,102,241,0.35)",
          }}
        >
          <Edit className="w-4 h-4" aria-hidden="true" />
          Compose
        </button>

        <button
          id="sidebar-ai-btn"
          type="button"
          onClick={() => setIsAiOpen(!isAiOpen)}
          aria-label="Toggle AI assistant"
          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 border ${
            isAiOpen
              ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-300 shadow-sm"
              : "bg-zinc-900/40 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850"
          }`}
        >
          <div className="flex items-center space-x-2">
            <Sparkles className={`w-3.5 h-3.5 ${isAiOpen ? "text-indigo-400" : "text-zinc-400"}`} />
            <span>AI Assistant</span>
          </div>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-semibold">
            {isAiOpen ? "Open" : "Closed"}
          </span>
        </button>
      </div>

      {/* Navigation Folders */}
      <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          Mailboxes
        </div>
        {navItems.map((item) => {
          const isActive = activeFolder === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveFolder(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                isActive
                  ? "bg-zinc-800 text-white shadow-sm shadow-black/20"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
              }`}
            >
              <div className="flex items-center space-x-3">
                <span className={isActive ? "text-indigo-400" : "text-zinc-400"}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && item.badge > 0 && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    isActive
                      ? "bg-indigo-500 text-white"
                      : "bg-zinc-800 text-zinc-300"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}

        <div className="pt-4 px-2">
          <button
            onClick={() => refreshMail()}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-850 text-xs text-zinc-300 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-indigo-400" : ""}`} />
            <span>{isLoading ? "Syncing..." : "Sync Mailbox"}</span>
          </button>
        </div>
      </div>

      {/* User Profile & Logout */}
      <div className="p-3 border-t border-zinc-800/60 bg-zinc-950/40">
        <div className="flex items-center justify-between p-2 rounded-xl bg-zinc-900/50 border border-zinc-800/40">
          <div className="flex items-center space-x-2.5 min-w-0">
            {user?.avatarUrl ? (
              <Image
                src={user.avatarUrl}
                alt={user.name || "User avatar"}
                width={32}
                height={32}
                className="w-8 h-8 rounded-full ring-1 ring-zinc-700 shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-indigo-600/30 text-indigo-300 font-semibold flex items-center justify-center text-xs ring-1 ring-indigo-500/30 shrink-0">
                {user?.name?.[0] || user?.email?.[0] || "U"}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-zinc-200 truncate">
                {user?.name || "Connected Account"}
              </p>
              <p className="text-[11px] text-zinc-400 truncate">
                {user?.email}
              </p>
            </div>
          </div>
          <button
            onClick={() => logout()}
            title="Sign out of Gmail"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
