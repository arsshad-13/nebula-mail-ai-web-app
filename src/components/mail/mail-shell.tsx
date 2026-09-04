"use client";

import React from "react";
import { Mail, ShieldCheck, AlertCircle, Key } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { MailSidebar } from "./mail-sidebar";
import { MailList } from "./mail-list";
import { MailDetail } from "./mail-detail";
import { MailCompose } from "./mail-compose";
import { AiAssistantPanel } from "@/components/ai";

export function MailShell() {
  const { isAuthenticated, isLoading, isConfigured, authError, login, clearAuthError } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-100">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/30 animate-pulse">
            <Mail className="w-6 h-6 text-white" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-semibold text-zinc-200">Nebula Mail</p>
            <p className="text-xs text-zinc-500">Checking authentication status...</p>
          </div>
        </div>
      </div>
    );
  }

  // Unauthenticated State: Show OAuth Connect Screen with Setup Guidance
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-indigo-600/10 blur-[120px] pointer-events-none rounded-full" />

        <div className="max-w-xl w-full relative z-10 space-y-6">
          {/* Main Card */}
          <div className="p-8 rounded-3xl border border-zinc-850 bg-zinc-900/60 backdrop-blur-2xl shadow-2xl space-y-6">
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-xl shadow-indigo-500/25">
                <Mail className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                  Nebula Mail
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    Phase 3
                  </span>
                </h1>
                <p className="text-xs text-zinc-400">
                  AI-Powered Mail Web Application &bull; Real Gmail Integration
                </p>
              </div>
            </div>

            {/* Error Notification */}
            {authError && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-200 text-xs flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-rose-300">Authentication Failed</p>
                    <p className="text-rose-400/90 mt-0.5">{authError}</p>
                  </div>
                </div>
                <button
                  onClick={clearAuthError}
                  className="text-xs text-rose-400 hover:text-rose-200 underline font-medium shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Connect Button or Missing Config Warning */}
            {isConfigured ? (
              <div className="space-y-4">
                <p className="text-sm text-zinc-300 leading-relaxed">
                  Sign in securely with your Google account to connect directly to the Gmail API. Real received and sent emails will be synced into your private session.
                </p>

                <button
                  onClick={login}
                  className="w-full flex items-center justify-center gap-3 py-3.5 px-5 rounded-2xl bg-white hover:bg-zinc-100 text-zinc-950 font-semibold text-sm transition-all duration-150 shadow-lg shadow-white/5 hover:scale-[1.01] active:scale-[0.99]"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Connect with Google Gmail</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-amber-300">
                    <Key className="w-4 h-4" />
                    <span>Google OAuth Configuration Required</span>
                  </div>
                  <p className="text-amber-200/90 leading-relaxed">
                    To connect to real Gmail, add your Google OAuth 2.0 client credentials to{" "}
                    <code className="px-1.5 py-0.5 rounded bg-amber-500/20 font-mono text-amber-100">
                      .env.local
                    </code>
                    .
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 font-mono text-[11px] text-zinc-300 space-y-1 overflow-x-auto">
                  <p className="text-zinc-500"># .env.local</p>
                  <p>GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com</p>
                  <p>GOOGLE_CLIENT_SECRET=your-client-secret</p>
                  <p>GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback</p>
                </div>
              </div>
            )}

            {/* Security Guarantee Checklist */}
            <div className="pt-4 border-t border-zinc-800/60 space-y-2 text-xs text-zinc-400">
              <p className="font-semibold text-zinc-300 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Security &amp; Scope Architecture
              </p>
              <ul className="space-y-1.5 pl-5 list-disc text-zinc-400">
                <li>
                  <strong className="text-zinc-300">Server-Side Token Isolation:</strong> Tokens are stored on the server; the browser receives only an opaque session cookie.
                </li>
                <li>
                  <strong className="text-zinc-300">CSRF Protected:</strong> OAuth authorization uses cryptographically randomized state verification.
                </li>
                <li>
                  <strong className="text-zinc-300">Least-Privilege Scopes:</strong> Requests <code className="text-zinc-300">gmail.readonly</code> for reading and <code className="text-zinc-300">gmail.send</code> for sending.
                </li>
                <li>
                  <strong className="text-zinc-300">XSS Defense:</strong> All incoming email HTML is sanitized on the server with <code className="text-zinc-300">sanitize-html</code>.
                </li>
              </ul>
            </div>
          </div>

          <p className="text-[11px] text-zinc-500 text-center">
            Nebula KnowLab Hiring Assignment &bull; Real Gmail Client Integration
          </p>
        </div>
      </div>
    );
  }

  // Authenticated State: 3-Pane Mail Client
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 relative">
      <MailSidebar />
      <MailList />
      <MailDetail />
      <AiAssistantPanel />
      {/* Compose modal — rendered at root level so it overlays the full viewport */}
      <MailCompose />
    </div>
  );
}
