"use client";

import React from "react";
import { AuthProvider } from "@/context/auth-context";
import { MailProvider } from "@/context/mail-context";
import { AIProvider } from "@/context/ai-context";
import { MailShell } from "@/components/mail";

export default function Home() {
  return (
    <AuthProvider>
      <MailProvider>
        <AIProvider>
          <MailShell />
        </AIProvider>
      </MailProvider>
    </AuthProvider>
  );
}
