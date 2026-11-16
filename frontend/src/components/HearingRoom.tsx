"use client";

import { useCallback, useEffect, useRef } from "react";
import type { HearingMessage } from "@/lib/types";
import type { JudgeTemperament } from "@/lib/mockSimulation";
import { mockJudges } from "@/lib/mockSimulation";

interface HearingRoomProps {
  judgeId: JudgeTemperament;
  messages: HearingMessage[];
  input: string;
  onInputChange: (value: string) => void;
  role: "plaintiff" | "defendant";
  onRoleChange: (value: "plaintiff" | "defendant") => void;
  concluded: boolean;
  isStarting: boolean;
  isSending: boolean;
  status: string;
  isConnected: boolean;
  hasHearingRecord: boolean;
  onBegin: () => void;
  onSend: () => void;
  onProceedToJudgment: () => void;
  onBack: () => void;
  plaintiffName: string;
  defendantName: string;
}

function roleDisplayName(
  role: string,
  plaintiffName: string,
  defendantName: string
): string {
  if (role === "judge") return "Judge";
  if (role === "plaintiff") return plaintiffName || "Plaintiff";
  if (role === "defendant") return defendantName || "Defendant";
  return role;
}

export function HearingRoom({
  judgeId,
  messages,
  input,
  onInputChange,
  role,
  onRoleChange,
  concluded,
  isStarting,
  isSending,
  isConnected,
  hasHearingRecord,
  onBegin,
  onSend,
  onProceedToJudgment,
  onBack,
  plaintiffName,
  defendantName,
}: HearingRoomProps) {
  const judge = mockJudges.find((j) => j.id === judgeId) ?? mockJudges[0];
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Focus textarea after judge responds
  useEffect(() => {
    if (!isSending && !concluded) {
      textareaRef.current?.focus();
    }
  }, [isSending, concluded]);

  // Auto-resize textarea to fit content
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [input, resizeTextarea]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && input.trim() && !isSending && !concluded) {
      e.preventDefault();
      onSend();
    }
  };

  const hearingNotStarted = !hasHearingRecord && messages.length === 0;

  return (
    <div className="animate-fade-in flex min-h-[calc(100vh-10rem)] flex-col sm:min-h-[calc(100vh-12rem)]">
      {/* Judge header */}
      <div className="mb-4 overflow-hidden border border-wy-navy/15 sm:mb-6 dark:border-white/10">
        <div className="bg-wy-navy px-4 py-4 text-center text-white sm:py-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-wy-gold">
            The bench
          </p>
          <h2 className="mt-1 font-serif text-2xl font-medium tracking-tight">
            {judge.name}
          </h2>
          <p className="mt-1 text-xs text-white/70">
            {judge.tone} &middot; {judge.description}
          </p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-wy-navy/10 bg-white dark:divide-white/10 dark:bg-[#101c30]">
          <div className="px-3 py-2.5 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Plaintiff
            </p>
            <p className="mt-0.5 text-sm font-semibold text-wy-navy dark:text-white">
              {plaintiffName || "Plaintiff"}
            </p>
          </div>
          <div className="px-3 py-2.5 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Defendant
            </p>
            <p className="mt-0.5 text-sm font-semibold text-wy-navy dark:text-white">
              {defendantName || "Defendant"}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-center gap-2 border-t border-wy-navy/10 bg-wy-cream py-2 dark:border-white/10 dark:bg-[#0c1728]">
          <span
            aria-hidden="true"
            className={`inline-block h-2 w-2 rounded-full ${
              isConnected
                ? "bg-emerald-500"
                : hasHearingRecord
                  ? "bg-amber-500"
                  : "bg-zinc-300"
            }`}
          />
          <span role="status" className="text-xs text-zinc-500 dark:text-zinc-400">
            {isConnected
              ? "Live connection"
              : hasHearingRecord
                ? "HTTP mode"
                : "Not started"}
          </span>
        </div>
      </div>

      {/* Pre-hearing state */}
      {hearingNotStarted && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 py-16">
          <div className="max-w-md text-center">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Ready to begin the hearing?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              The judge will review your case, ask questions, and gather what they need
              to make a decision. Answer honestly and provide as much detail as you can.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg bg-wy-navy px-10 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-wy-navy-light disabled:cursor-not-allowed disabled:opacity-60 dark:bg-wy-gold dark:text-wy-navy dark:hover:bg-wy-gold-light"
            onClick={onBegin}
            disabled={isStarting}
          >
            {isStarting ? (
              <span className="flex items-center gap-2">
                <svg aria-hidden="true" className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Starting hearing...
              </span>
            ) : (
              "Start hearing"
            )}
          </button>
          <button
            type="button"
            className="text-sm text-zinc-400 underline-offset-2 hover:text-zinc-600 hover:underline dark:hover:text-zinc-300"
            onClick={onBack}
          >
            Go back to case review
          </button>
        </div>
      )}

      {/* Active hearing */}
      {!hearingNotStarted && (
        <>
          {/* Message area */}
          <div role="log" aria-live="polite" className="flex-1 overflow-y-auto border border-wy-navy/10 bg-white p-4 dark:border-white/10 dark:bg-[#101c30]">
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-zinc-400">Waiting for the hearing to begin...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => {
                  const isJudge = msg.role === "judge";
                  return (
                    <div
                      key={`${msg.sequence}-${msg.role}`}
                      className={`flex ${isJudge ? "justify-start" : "justify-end"}`}
                    >
                      <div
                        className={`max-w-[90%] px-3 py-2.5 sm:max-w-[80%] sm:px-4 sm:py-3 ${
                          isJudge
                            ? "border-l-2 border-wy-gold bg-wy-cream text-zinc-900 dark:bg-[#16243a] dark:text-zinc-100"
                            : msg.role === "plaintiff"
                              ? "bg-wy-navy text-white"
                              : "border border-wy-navy/20 bg-wy-navy-50 text-wy-navy dark:border-wy-gold/30 dark:bg-wy-gold/10 dark:text-white"
                        }`}
                      >
                        <p
                          className={`mb-1 text-xs font-semibold ${
                            isJudge
                              ? "text-zinc-500 dark:text-zinc-400"
                              : msg.role === "plaintiff"
                                ? "text-white/80"
                                : "text-wy-navy/70 dark:text-wy-gold"
                          }`}
                        >
                          {roleDisplayName(msg.role, plaintiffName, defendantName)}
                        </p>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {msg.content}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {/* Thinking indicator */}
                {isSending && (
                  <div className="flex justify-start" aria-label="Judge is thinking" role="status">
                    <div className="rounded-2xl rounded-tl-md bg-white px-4 py-3 shadow-sm dark:bg-zinc-800">
                      <p className="mb-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                        {judge.name.split(" ").pop()}
                      </p>
                      <div aria-hidden="true" className="flex items-center gap-1.5">
                        <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:0ms]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:150ms]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:300ms]" />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Concluded banner */}
          {concluded && (
            <div role="status" className="mt-4 border border-wy-navy/15 bg-white p-5 text-center dark:border-white/10 dark:bg-[#101c30]">
              <p className="font-serif text-lg font-medium text-wy-navy dark:text-white">
                The hearing has concluded.
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                The judge has heard enough to make a decision.
              </p>
              <button
                type="button"
                className="mt-4 bg-wy-navy px-8 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-wy-navy-light dark:bg-wy-gold dark:text-wy-navy dark:hover:bg-wy-gold-light"
                onClick={onProceedToJudgment}
              >
                Get my judgment
              </button>
            </div>
          )}

          {/* Input area — upgraded to auto-resizing textarea */}
          {!concluded && (
            <div className="safe-bottom sticky bottom-0 z-10 -mx-4 mt-4 border-t border-zinc-200 bg-white/95 px-3 py-3 backdrop-blur-sm sm:relative sm:mx-0 sm:rounded-xl sm:border sm:p-4 sm:shadow-none dark:border-zinc-800 dark:bg-zinc-900/95">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
                <select
                  aria-label="Speaking as"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm transition-colors focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 sm:w-auto sm:flex-shrink-0 dark:border-zinc-700 dark:bg-zinc-800"
                  value={role}
                  onChange={(e) =>
                    onRoleChange(e.target.value as "plaintiff" | "defendant")
                  }
                >
                  <option value="plaintiff">
                    As {plaintiffName || "plaintiff"}
                  </option>
                  <option value="defendant">
                    As {defendantName || "defendant"}
                  </option>
                </select>
                <div className="flex flex-1 gap-2">
                  <textarea
                    ref={textareaRef}
                    aria-label="Your response to the judge"
                    className="min-w-0 flex-1 resize-none rounded-lg border border-zinc-300 bg-white px-3 py-3 text-sm leading-relaxed transition-colors focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 sm:py-2.5 dark:border-zinc-700 dark:bg-zinc-800"
                    rows={1}
                    maxLength={10_000}
                    value={input}
                    onChange={(e) => onInputChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Respond to the judge... (Shift+Enter for new line)"
                    disabled={concluded}
                  />
                  <button
                    type="button"
                    className="flex-shrink-0 self-end rounded-lg bg-wy-navy px-5 py-3 text-sm font-semibold text-white transition-all hover:bg-wy-navy-light disabled:cursor-not-allowed disabled:opacity-60 sm:py-2.5 dark:bg-wy-gold dark:text-wy-navy dark:hover:bg-wy-gold-light"
                    onClick={onSend}
                    disabled={!input.trim() || isSending || concluded}
                  >
                    {isSending ? "..." : "Send"}
                  </button>
                </div>
              </div>
              <p className="mt-2 hidden text-xs text-zinc-400 sm:block">
                Press Enter to send, Shift+Enter for a new line. Be thorough &mdash; the judge uses your answers to build the case.
              </p>
            </div>
          )}

          {/* Back link */}
          <div className="mt-4 text-center">
            <button
              type="button"
              className="text-sm text-zinc-400 underline-offset-2 hover:text-zinc-600 hover:underline dark:hover:text-zinc-300"
              onClick={onBack}
            >
              Back to case review
            </button>
          </div>
        </>
      )}
    </div>
  );
}
