"use client";

import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import {
  AssistantMessage,
  AiChatMessage,
  AiChatResponse,
  AppContext,
} from "@/types/ai";
import { useMail } from "./mail-context";

interface AIContextState {
  messages: AssistantMessage[];
  isOpen: boolean;
  isLoading: boolean;
  error: string | null;
  setIsOpen: (isOpen: boolean) => void;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setMessages: React.Dispatch<React.SetStateAction<AssistantMessage[]>>;
  sendMessage: (content: string) => Promise<void>;
  clearHistory: () => void;
  clearError: () => void;
}

const AIContext = createContext<AIContextState | undefined>(undefined);

export function AIProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Consume current mail state from MailContext
  const {
    activeFolder,
    messages: mailListMessages,
    selectedMessage,
    compose,
    aiFilterActive,
    aiFilterLabel,
    dispatchAiActions,
  } = useMail();

  // Keep a mutable ref of the latest mail context to prevent stale closure issues
  const mailStateRef = useRef({
    activeFolder,
    mailListMessages,
    selectedMessage,
    compose,
    aiFilterActive,
    aiFilterLabel,
    dispatchAiActions,
  });

  useEffect(() => {
    mailStateRef.current = {
      activeFolder,
      mailListMessages,
      selectedMessage,
      compose,
      aiFilterActive,
      aiFilterLabel,
      dispatchAiActions,
    };
  }, [
    activeFolder,
    mailListMessages,
    selectedMessage,
    compose,
    aiFilterActive,
    aiFilterLabel,
    dispatchAiActions,
  ]);

  // Keep a ref of conversation messages for request payload generation
  const messagesRef = useRef<AssistantMessage[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearHistory = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const sendMessage = useCallback(
    async (rawContent: string): Promise<void> => {
      const content = rawContent.trim();
      if (!content || isLoading) return;

      setError(null);

      // 1. Create and append user message
      const userMessageId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const userMsg: AssistantMessage = {
        id: userMessageId,
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      try {
        // 2. Build AppContext snapshot strictly from current UI state
        // SECURITY: Never include session IDs, OAuth tokens, Gemini API keys, or raw email bodies
        const currentState = mailStateRef.current;

        const appContext: AppContext = {
          currentFolder: currentState.activeFolder,
          messageCount: currentState.mailListMessages.length,
          selectedEmail: currentState.selectedMessage
            ? {
                id: currentState.selectedMessage.id,
                threadId: currentState.selectedMessage.threadId,
                messageIdHeader: currentState.selectedMessage.messageIdHeader,
                subject: currentState.selectedMessage.subject || "(No Subject)",
                from: {
                  name: currentState.selectedMessage.from?.name,
                  email: currentState.selectedMessage.from?.email || "",
                },
                to: Array.isArray(currentState.selectedMessage.to)
                  ? currentState.selectedMessage.to.map((recipient) => ({
                      name: recipient.name,
                      email: recipient.email || "",
                    }))
                  : [],
                date: currentState.selectedMessage.date || "",
                snippet: (currentState.selectedMessage.snippet || "").slice(0, 200),
              }
            : null,
          composeIsOpen: currentState.compose.isOpen,
          composeTo: currentState.compose.isOpen ? currentState.compose.to.value : "",
          composeSubject: currentState.compose.isOpen
            ? currentState.compose.subject.value
            : "",
          aiFilterActive: currentState.aiFilterActive,
          aiFilterLabel: currentState.aiFilterLabel,
        };

        // 3. Construct conversation history for POST /api/ai/chat
        const conversationHistory: AiChatMessage[] = [
          ...messagesRef.current
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            })),
          { role: "user", content },
        ];

        // 4. Send request to server-side AI endpoint
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: conversationHistory,
            appContext,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const errMsg =
            errData.error ||
            `AI request failed with HTTP ${response.status}: ${response.statusText}`;

          setError(errMsg);

          const errorAssistantMsg: AssistantMessage = {
            id: `asst-err-${Date.now()}`,
            role: "assistant",
            content: `⚠️ ${errMsg}`,
            timestamp: new Date().toISOString(),
          };

          setMessages((prev) => [...prev, errorAssistantMsg]);
          return;
        }

        const data: AiChatResponse = await response.json();

        // 5. Create assistant message with returned actions
        const assistantMessageId = `asst-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const assistantMsg: AssistantMessage = {
          id: assistantMessageId,
          role: "assistant",
          content:
            data.text ||
            (data.actions && data.actions.length > 0
              ? "I have performed the requested action."
              : "Done."),
          timestamp: new Date().toISOString(),
          actions: data.actions || [],
        };

        setMessages((prev) => [...prev, assistantMsg]);

        // 6. STAGE 4B: Dispatch structured UiAction[] into MailContext
        if (
          data.actions &&
          Array.isArray(data.actions) &&
          data.actions.length > 0
        ) {
          currentState.dispatchAiActions(data.actions);
        }
      } catch (err: unknown) {
        console.error("AI Assistant request error:", err);
        const errMsg =
          err instanceof Error
            ? err.message
            : "Network error: unable to connect to the AI assistant.";

        setError(errMsg);

        const errorAssistantMsg: AssistantMessage = {
          id: `asst-err-${Date.now()}`,
          role: "assistant",
          content: `⚠️ ${errMsg}`,
          timestamp: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, errorAssistantMsg]);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading]
  );

  return (
    <AIContext.Provider
      value={{
        messages,
        isOpen,
        isLoading,
        error,
        setIsOpen,
        setIsLoading,
        setMessages,
        sendMessage,
        clearHistory,
        clearError,
      }}
    >
      {children}
    </AIContext.Provider>
  );
}

export function useAI() {
  const context = useContext(AIContext);
  if (!context) {
    throw new Error("useAI must be used within an AIProvider");
  }
  return context;
}
