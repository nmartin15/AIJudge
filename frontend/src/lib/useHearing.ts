import { useCallback, useEffect, useRef, useState } from "react";
import type { HearingMessage } from "@/lib/types";
import {
  API_BASE_URL,
  ApiClientError,
  getHearing,
  getOrCreateSession,
  postHearingMessage,
  startHearing,
} from "@/lib/api";
import { SIMULATION_MODE } from "@/lib/simulationService";

// ── Helpers ──────────────────────────────────────────────────────────

function toWebSocketUrl(
  apiBase: string,
  caseId: string,
  sessionId: string
): string {
  const isSecure = apiBase.startsWith("https://");
  const base = `${isSecure ? "wss" : "ws"}://${apiBase.replace(/^https?:\/\//, "")}/cases/${caseId}/hearing/ws`;
  const params = new URLSearchParams({ session_id: sessionId });
  return `${base}?${params.toString()}`;
}

function sortMessages(messages: HearingMessage[]): HearingMessage[] {
  return [...messages].sort((a, b) => a.sequence - b.sequence);
}

// ── Types ────────────────────────────────────────────────────────────

interface UseHearingOptions {
  caseId: string | null;
  judgeId: string;
  onError?: (message: string) => void;
  /** Called once when a case needs to be created/updated before hearing starts */
  ensureCase: () => Promise<string | null>;
}

interface UseHearingReturn {
  messages: HearingMessage[];
  concluded: boolean;
  isStarting: boolean;
  isSending: boolean;
  status: string;
  isConnected: boolean;
  hasHearingRecord: boolean;
  beginHearing: () => Promise<void>;
  sendMessage: (role: "plaintiff" | "defendant", content: string) => Promise<void>;
  refreshTranscript: (silent?: boolean) => Promise<void>;
}

// ── Constants ────────────────────────────────────────────────────────

const WS_RECONNECT_BASE_MS = 1000;
const WS_RECONNECT_MAX_MS = 16000;
const WS_MAX_RETRIES = 5;

// ── Hook ─────────────────────────────────────────────────────────────

export function useHearing({
  caseId,
  judgeId,
  onError,
  ensureCase,
}: UseHearingOptions): UseHearingReturn {
  const [messages, setMessages] = useState<HearingMessage[]>([]);
  const [concluded, setConcluded] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState("Not started.");
  const [isConnected, setIsConnected] = useState(false);
  const [hasHearingRecord, setHasHearingRecord] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeCaseIdRef = useRef<string | null>(null);

  // Keep caseId ref in sync for reconnection logic
  useEffect(() => {
    activeCaseIdRef.current = caseId;
  }, [caseId]);

  // ── WebSocket management ───────────────────────────────────────────

  const disconnectSocket = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null; // prevent reconnect on intentional close
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const connectSocket = useCallback(
    async (targetCaseId: string): Promise<void> => {
      disconnectSocket();
      retriesRef.current = 0;

      async function attemptConnect() {
        try {
          const sessionId = await getOrCreateSession();
          const ws = new WebSocket(
            toWebSocketUrl(API_BASE_URL, targetCaseId, sessionId)
          );
          wsRef.current = ws;

          ws.onopen = () => {
            setIsConnected(true);
            setStatus("WebSocket connected.");
            retriesRef.current = 0;
          };

          ws.onclose = () => {
            setIsConnected(false);
            // Auto-reconnect if we still have the same case
            if (
              activeCaseIdRef.current === targetCaseId &&
              retriesRef.current < WS_MAX_RETRIES
            ) {
              const delay = Math.min(
                WS_RECONNECT_BASE_MS * Math.pow(2, retriesRef.current),
                WS_RECONNECT_MAX_MS
              );
              retriesRef.current += 1;
              setStatus(
                `Connection lost. Reconnecting in ${Math.round(delay / 1000)}s...`
              );
              reconnectTimerRef.current = setTimeout(
                () => void attemptConnect(),
                delay
              );
            } else if (retriesRef.current >= WS_MAX_RETRIES) {
              setStatus("WebSocket unavailable. HTTP fallback active.");
            }
          };

          ws.onerror = () => {
            // onclose fires after onerror, reconnect happens there
          };

          ws.onmessage = (event) => {
            try {
              const payload = JSON.parse(event.data) as
                | { role: string; content: string; sequence: number }
                | { event: string }
                | { error: string };

              if ("event" in payload && payload.event === "hearing_concluded") {
                setConcluded(true);
                setStatus("Hearing concluded.");
                return;
              }
              if ("error" in payload) {
                setStatus(`WebSocket error: ${payload.error}`);
                return;
              }
              if (
                "role" in payload &&
                "content" in payload &&
                "sequence" in payload
              ) {
                setMessages((prev) => {
                  if (prev.some((msg) => msg.sequence === payload.sequence))
                    return prev;
                  return sortMessages([
                    ...prev,
                    {
                      id: `${payload.sequence}`,
                      hearing_id: "live",
                      role: payload.role,
                      content: payload.content,
                      sequence: payload.sequence,
                      created_at: new Date().toISOString(),
                    },
                  ]);
                });
              }
            } catch {
              setStatus("Received invalid WebSocket payload.");
            }
          };
        } catch (error) {
          const msg =
            error instanceof Error ? error.message : String(error);
          setStatus(`WebSocket setup failed. ${msg}`);
        }
      }

      await attemptConnect();
    },
    [disconnectSocket]
  );

  // ── API operations ─────────────────────────────────────────────────

  const refreshTranscript = useCallback(
    async (silent = false): Promise<void> => {
      if (SIMULATION_MODE !== "backend" || !caseId) return;
      try {
        const hearing = await getHearing(caseId);
        setMessages(sortMessages(hearing.messages));
        setConcluded(Boolean(hearing.completed_at));
        setHasHearingRecord(true);
        if (!silent) setStatus("Hearing transcript refreshed.");
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 404) {
          setHasHearingRecord(false);
        } else if (!silent) {
          const msg =
            error instanceof Error ? error.message : String(error);
          setStatus(msg);
        }
      }
    },
    [caseId]
  );

  const beginHearing = useCallback(async (): Promise<void> => {
    if (SIMULATION_MODE !== "backend") {
      setStatus("Hearing simulation requires backend mode.");
      return;
    }
    setIsStarting(true);
    setStatus("Starting hearing...");
    try {
      const persistedCaseId = await ensureCase();
      if (!persistedCaseId) throw new Error("Save case basics first.");

      try {
        const hearing = await startHearing(persistedCaseId, judgeId);
        setMessages(sortMessages(hearing.messages));
        setConcluded(Boolean(hearing.completed_at));
        setHasHearingRecord(true);
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 409) {
          const hearing = await getHearing(persistedCaseId);
          setMessages(sortMessages(hearing.messages));
          setConcluded(Boolean(hearing.completed_at));
          setHasHearingRecord(true);
        } else {
          throw error;
        }
      }

      await connectSocket(persistedCaseId);
      setStatus("Hearing started.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setStatus(msg);
      onError?.("Failed to start hearing");
    } finally {
      setIsStarting(false);
    }
  }, [judgeId, ensureCase, connectSocket, onError]);

  const sendMessage = useCallback(
    async (role: "plaintiff" | "defendant", content: string): Promise<void> => {
      if (!caseId || !content.trim() || concluded) return;
      setIsSending(true);

      const nextSequence = (messages.at(-1)?.sequence ?? 0) + 1;
      const localUserMessage: HearingMessage = {
        id: `local-${nextSequence}`,
        hearing_id: "live",
        role,
        content: content.trim(),
        sequence: nextSequence,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => sortMessages([...prev, localUserMessage]));

      try {
        if (
          isConnected &&
          wsRef.current?.readyState === WebSocket.OPEN
        ) {
          wsRef.current.send(
            JSON.stringify({ role, content: content.trim() })
          );
        } else {
          const response = await postHearingMessage(caseId, {
            role,
            content: content.trim(),
          });
          setMessages((prev) =>
            sortMessages([
              ...prev,
              {
                id: `local-${response.judge_message.sequence}`,
                hearing_id: "live",
                role: "judge",
                content: response.judge_message.content,
                sequence: response.judge_message.sequence,
                created_at: new Date().toISOString(),
              },
            ])
          );
          if (response.hearing_concluded) {
            setConcluded(true);
            setStatus("Hearing concluded.");
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        setStatus(msg);
      } finally {
        setIsSending(false);
      }
    },
    [caseId, concluded, messages, isConnected]
  );

  // ── Sync hearing state when case ID changes ────────────────────────

  useEffect(() => {
    if (SIMULATION_MODE !== "backend" || !caseId) return;
    let active = true;

    async function syncHearingState() {
      try {
        const hearing = await getHearing(caseId!);
        if (!active) return;
        setMessages(sortMessages(hearing.messages));
        setConcluded(Boolean(hearing.completed_at));
        setHasHearingRecord(true);
      } catch (error) {
        if (!active) return;
        if (error instanceof ApiClientError && error.status === 404) {
          setHasHearingRecord(false);
        }
      }
    }

    void syncHearingState();
    return () => {
      active = false;
    };
  }, [caseId]);

  // ── Cleanup on unmount ─────────────────────────────────────────────

  useEffect(() => {
    return () => {
      disconnectSocket();
    };
  }, [disconnectSocket]);

  return {
    messages,
    concluded,
    isStarting,
    isSending,
    status,
    isConnected,
    hasHearingRecord,
    beginHearing,
    sendMessage,
    refreshTranscript,
  };
}
