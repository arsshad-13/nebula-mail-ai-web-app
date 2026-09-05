"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { EmailMessage, EmailThread, MailFolder, MailLabel, ComposeState, SendMailRequest } from "@/types/mail";
import { UiAction } from "@/types/ai";
import { useAuth } from "./auth-context";

export interface PendingAiSend {
  token: string;
  to: string;
  subject: string;
  bodyPreview: string;
}

interface MailContextState {
  activeFolder: MailFolder;
  messages: EmailMessage[];
  selectedMessage: EmailMessage | null;
  selectedMessageId: string | null;
  selectedThread: EmailThread | null;
  labels: MailLabel[];
  isLoading: boolean;
  isDetailLoading: boolean;
  error: string | null;
  nextPageToken?: string;
  // Compose state
  compose: ComposeState;
  setActiveFolder: (folder: MailFolder) => void;
  selectMessage: (id: string | null) => Promise<void>;
  focusMessage: (message: EmailMessage) => void;
  refreshMail: () => Promise<void>;
  clearError: () => void;
  // Compose actions
  openCompose: () => void;
  closeCompose: () => void;
  updateComposeField: (field: keyof Pick<ComposeState, "to" | "subject" | "body">, value: string) => void;
  sendMail: (payload: SendMailRequest) => Promise<boolean>;
  // Stage 4B: Client-side AI Action Dispatcher & Filter State
  dispatchAiActions: (actions: UiAction[]) => void;
  aiFilterActive: boolean;
  aiFilterLabel: string | null;
  clearAiFilter: () => void;
  // Stage 4E: AI Send Confirmation State
  pendingAiSend: PendingAiSend | null;
  confirmAiSend: () => Promise<boolean>;
  cancelAiSend: () => Promise<void>;
}

const EMPTY_COMPOSE: ComposeState = {
  isOpen: false,
  to: { value: "", dirty: false },
  subject: { value: "", dirty: false },
  body: { value: "", dirty: false },
  threadId: undefined,
  inReplyTo: undefined,
  isSending: false,
  sendError: null,
  sendSuccess: false,
};

const MailContext = createContext<MailContextState | undefined>(undefined);

export function MailProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [activeFolder, setActiveFolderState] = useState<MailFolder>("inbox");
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<EmailMessage | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<EmailThread | null>(null);
  const [labels, setLabels] = useState<MailLabel[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDetailLoading, setIsDetailLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [compose, setCompose] = useState<ComposeState>(EMPTY_COMPOSE);

  // Stage 4B: AI Filter state
  const [aiFilterActive, setAiFilterActive] = useState<boolean>(false);
  const [aiFilterLabel, setAiFilterLabel] = useState<string | null>(null);
  const [filteredMessages, setFilteredMessages] = useState<EmailMessage[] | null>(null);

  // Stage 4E: AI Send Confirmation State
  const [pendingAiSend, setPendingAiSend] = useState<PendingAiSend | null>(null);

  const fetchMessages = useCallback(
    async (folder: MailFolder, isSilent: boolean = false) => {
      if (!isAuthenticated) {
        setMessages([]);
        setSelectedMessage(null);
        setSelectedMessageId(null);
        return;
      }

      if (!isSilent) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const res = await fetch(`/api/gmail?folder=${folder}&maxResults=25`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `Failed to fetch ${folder} messages`);
        }
        const data = await res.json();
        setMessages(data.messages || []);
        setNextPageToken(data.nextPageToken);

        setLabels([
          {
            id: "INBOX",
            name: "Inbox",
            type: "system",
            unreadCount: (data.messages || []).filter((m: EmailMessage) => m.isUnread).length,
          },
          {
            id: "SENT",
            name: "Sent",
            type: "system",
          },
        ]);
      } catch (err) {
        console.error(`Error loading ${folder} emails:`, err);
        if (!isSilent) {
          setError((err as Error).message || "An unexpected error occurred.");
          setMessages([]);
        }
      } finally {
        if (!isSilent) {
          setIsLoading(false);
        }
      }
    },
    [isAuthenticated]
  );

  const clearAiFilter = useCallback(() => {
    setAiFilterActive(false);
    setAiFilterLabel(null);
    setFilteredMessages(null);
  }, []);

  const setActiveFolder = useCallback((folder: MailFolder) => {
    setActiveFolderState(folder);
    setSelectedMessage(null);
    setSelectedMessageId(null);
    setSelectedThread(null);
    setAiFilterActive(false);
    setAiFilterLabel(null);
    setFilteredMessages(null);
  }, []);

  useEffect(() => {
    let isCancelled = false;

    if (!isAuthenticated) {
      queueMicrotask(() => {
        if (!isCancelled) {
          setMessages([]);
          setSelectedMessage(null);
          setSelectedMessageId(null);
          setSelectedThread(null);
          setError(null);
        }
      });
      return () => {
        isCancelled = true;
      };
    }

    queueMicrotask(() => {
      if (!isCancelled) {
        void fetchMessages(activeFolder);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [isAuthenticated, activeFolder, fetchMessages]);

  // Stage 4F-1: Real-Time Mail Stream (SSE) & Gmail Watch Registration
  useEffect(() => {
    if (!isAuthenticated) return;

    // 1. Attempt watch registration/renewal if configured on server
    fetch("/api/gmail/watch", { method: "POST" }).catch((err) => {
      console.debug("[mail-context] Watch registration ping error:", err);
    });

    // 2. Open Server-Sent Events stream for real-time mailbox notifications
    const eventSource = new EventSource("/api/mail/stream");

    eventSource.addEventListener("connected", (e) => {
      console.log("[mail-context] Real-time mail stream connected:", e.data);
    });

    const handleMailChange = () => {
      console.log("[mail-context] Real-time mail change received.");
      if (activeFolder === "inbox") {
        void fetchMessages("inbox", true);
      } else {
        // Update unread count for INBOX label without disturbing current folder view
        fetch(`/api/gmail?folder=inbox&maxResults=25`)
          .then((r) => r.json())
          .then((d) => {
            const count = (d.messages || []).filter((m: EmailMessage) => m.isUnread).length;
            setLabels((prev) =>
              prev.map((l) => (l.id === "INBOX" ? { ...l, unreadCount: count } : l))
            );
          })
          .catch(() => {});
      }
    };

    eventSource.addEventListener("mail:new", handleMailChange);
    eventSource.addEventListener("mail:refresh", handleMailChange);

    eventSource.onerror = (err) => {
      console.warn("[mail-context] Real-time stream error / reconnecting:", err);
    };

    return () => {
      eventSource.close();
    };
  }, [isAuthenticated, activeFolder, fetchMessages]);

  const selectMessage = useCallback(async (id: string | null) => {
    if (!id) {
      setSelectedMessageId(null);
      setSelectedMessage(null);
      setSelectedThread(null);
      return;
    }

    setSelectedMessageId(id);

    setIsDetailLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/gmail/${id}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to load email details");
      }
      const data = await res.json();
      setSelectedMessage(data.message);
      setSelectedThread(data.thread || null);

      // Also mark as read locally in the messages list and filtered list if was unread
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, isUnread: false } : m))
      );
      setFilteredMessages((prev) =>
        prev ? prev.map((m) => (m.id === id ? { ...m, isUnread: false } : m)) : null
      );
    } catch (err) {
      console.error("Error loading email detail:", err);
      setError((err as Error).message || "Failed to fetch email content.");
    } finally {
      setIsDetailLoading(false);
    }
  }, []);

  const focusMessage = useCallback((message: EmailMessage) => {
    setSelectedMessage(message);
    setSelectedMessageId(message.id);
  }, []);

  const refreshMail = useCallback(async () => {
    clearAiFilter();
    await fetchMessages(activeFolder);
  }, [activeFolder, clearAiFilter, fetchMessages]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Compose actions
  // ---------------------------------------------------------------------------

  const openCompose = useCallback(() => {
    setPendingAiSend(null);
    setCompose({ ...EMPTY_COMPOSE, isOpen: true });
  }, []);

  const closeCompose = useCallback(() => {
    setPendingAiSend(null);
    setCompose(EMPTY_COMPOSE);
  }, []);

  const cancelAiSend = useCallback(async () => {
    if (!pendingAiSend) return;

    const token = pendingAiSend.token;
    setPendingAiSend(null);

    try {
      await fetch("/api/ai/confirm-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, cancel: true }),
      });
    } catch (err) {
      console.error("Failed to notify server of send cancellation:", err);
    }
  }, [pendingAiSend]);

  const confirmAiSend = useCallback(async (): Promise<boolean> => {
    if (!pendingAiSend) return false;

    setCompose((prev) => ({
      ...prev,
      isSending: true,
      sendError: null,
      sendSuccess: false,
    }));

    try {
      const res = await fetch("/api/ai/confirm-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: pendingAiSend.token }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errMsg = data.error || "Failed to send email. Please try again.";
        setCompose((prev) => ({
          ...prev,
          isSending: false,
          sendError: errMsg,
        }));
        return false;
      }

      // Success — clear pending send and close compose
      setPendingAiSend(null);
      setCompose(EMPTY_COMPOSE);

      // If user is viewing Sent, refresh immediately
      if (activeFolder === "sent") {
        void fetchMessages("sent");
      } else {
        void fetchMessages(activeFolder, true);
      }

      if (selectedMessageId) {
        void selectMessage(selectedMessageId);
      }

      return true;
    } catch (err) {
      const errMsg = (err as Error).message || "Network error. Please try again.";
      setCompose((prev) => ({
        ...prev,
        isSending: false,
        sendError: errMsg,
      }));
      return false;
    }
  }, [pendingAiSend, activeFolder, fetchMessages, selectedMessageId, selectMessage]);

  const updateComposeField = useCallback(
    (field: keyof Pick<ComposeState, "to" | "subject" | "body">, value: string) => {
      setCompose((prev) => ({
        ...prev,
        [field]: { value, dirty: true },
        sendError: null,
        sendSuccess: false,
      }));
    },
    []
  );

  /**
   * Sends an email via POST /api/gmail/send.
   * Returns true on success, false on failure (error is stored in compose.sendError).
   * On success, re-fetches the Sent mailbox so Gmail remains the source of truth.
   */
  const sendMail = useCallback(
    async (payload: SendMailRequest): Promise<boolean> => {
      setCompose((prev) => ({
        ...prev,
        isSending: true,
        sendError: null,
        sendSuccess: false,
      }));

      try {
        const res = await fetch("/api/gmail/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const errMsg = data.error || "Failed to send email. Please try again.";
          setCompose((prev) => ({
            ...prev,
            isSending: false,
            sendError: errMsg,
          }));
          return false;
        }

        // Success — close compose and re-fetch mailbox to keep Gmail as source of truth
        setCompose(EMPTY_COMPOSE);

        // If the user is currently viewing Sent, refresh immediately so the new message appears
        if (activeFolder === "sent") {
          void fetchMessages("sent");
        } else {
          void fetchMessages(activeFolder, true);
        }

        if (selectedMessageId) {
          void selectMessage(selectedMessageId);
        }

        return true;
      } catch (err) {
        const errMsg = (err as Error).message || "Network error. Please try again.";
        setCompose((prev) => ({
          ...prev,
          isSending: false,
          sendError: errMsg,
        }));
        return false;
      }
    },
    [activeFolder, fetchMessages, selectedMessageId, selectMessage]
  );

  // ---------------------------------------------------------------------------
  // Stage 4B: AI Action Dispatcher
  // Safe execution of typed UiAction[] with functional state updates
  // ---------------------------------------------------------------------------

  const dispatchAiActions = useCallback(
    (actions: UiAction[]) => {
      if (!Array.isArray(actions) || actions.length === 0) return;

      for (const action of actions) {
        try {
          if (!action || typeof action !== "object" || !("type" in action)) {
            console.warn("Malformed AI action ignored:", action);
            continue;
          }

          switch (action.type) {
            case "open_compose": {
              const payload = action.payload || {};
              setCompose((prev) => ({
                isOpen: true,
                to: {
                  value: payload.to !== undefined ? payload.to : prev.to.value,
                  dirty: false,
                },
                subject: {
                  value: payload.subject !== undefined ? payload.subject : prev.subject.value,
                  dirty: false,
                },
                body: {
                  value: payload.body !== undefined ? payload.body : prev.body.value,
                  dirty: false,
                },
                threadId: payload.threadId !== undefined ? payload.threadId : undefined,
                inReplyTo: payload.inReplyTo !== undefined ? payload.inReplyTo : undefined,
                isSending: false,
                sendError: null,
                sendSuccess: false,
              }));
              break;
            }

            case "set_compose_field": {
              const payload = action.payload;
              if (
                payload &&
                (payload.field === "to" || payload.field === "subject" || payload.field === "body")
              ) {
                const field = payload.field;
                const value = typeof payload.value === "string" ? payload.value : "";
                setCompose((prev) => ({
                  ...prev,
                  isOpen: true,
                  [field]: { value, dirty: false },
                }));
              }
              break;
            }

            case "navigate_mailbox": {
              const folder = action.payload?.folder;
              if (folder === "inbox" || folder === "sent") {
                setActiveFolder(folder);
              }
              break;
            }

            case "select_message": {
              const messageId = action.payload?.messageId;
              if (messageId && typeof messageId === "string") {
                void selectMessage(messageId);
              }
              break;
            }

            case "clear_filter": {
              clearAiFilter();
              break;
            }

            case "set_filtered_messages": {
              if (action.payload && Array.isArray(action.payload.messages)) {
                setAiFilterActive(true);
                setAiFilterLabel(action.payload.filterLabel || "Filtered Messages");
                setFilteredMessages(action.payload.messages);
              }
              break;
            }

            case "request_send_confirmation": {
              if (action.payload && action.payload.token) {
                setPendingAiSend(action.payload);
                setCompose((prev) => ({
                  ...prev,
                  isOpen: true,
                  to: {
                    value: action.payload.to || prev.to.value,
                    dirty: false,
                  },
                  subject: {
                    value: action.payload.subject || prev.subject.value,
                    dirty: false,
                  },
                }));
              }
              break;
            }

            default: {
              console.warn(
                "Unknown AI action type:",
                (action as { type?: string }).type
              );
            }
          }
        } catch (err) {
          console.error("Failed to dispatch AI action:", action, err);
        }
      }
    },
    [clearAiFilter, setActiveFolder, selectMessage]
  );

  const displayedMessages = aiFilterActive && filteredMessages !== null ? filteredMessages : messages;

  return (
    <MailContext.Provider
      value={{
        activeFolder,
        messages: displayedMessages,
        selectedMessage,
        selectedMessageId,
        selectedThread,
        labels,
        isLoading,
        isDetailLoading,
        error,
        nextPageToken,
        compose,
        setActiveFolder,
        selectMessage,
        focusMessage,
        refreshMail,
        clearError,
        openCompose,
        closeCompose,
        updateComposeField,
        sendMail,
        dispatchAiActions,
        aiFilterActive,
        aiFilterLabel,
        clearAiFilter,
        pendingAiSend,
        confirmAiSend,
        cancelAiSend,
      }}
    >
      {children}
    </MailContext.Provider>
  );
}

export function useMail() {
  const context = useContext(MailContext);
  if (!context) {
    throw new Error("useMail must be used within a MailProvider");
  }
  return context;
}
