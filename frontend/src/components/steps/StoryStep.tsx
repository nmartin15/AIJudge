import { useState, useRef, useEffect, useCallback } from "react";
import type { MockCaseTemplate, JudgeTemperament } from "@/lib/mockSimulation";
import { mockJudges, BLANK_TEMPLATE } from "@/lib/mockSimulation";

// ── Case-type badge labels ───────────────────────────────────────────────────
const caseTypeLabels: Record<string, string> = {
  security_deposit: "Security Deposit",
  property_damage: "Property Damage",
  contract: "Contract",
  loan_debt: "Loan / Debt",
  consumer: "Consumer",
  landlord_tenant: "Landlord-Tenant",
  neighbor: "Neighbor",
  wages: "Wages / Services",
  pet: "Pet / Animal",
  other: "Other",
};

interface StoryStepProps {
  templates: MockCaseTemplate[];
  selectedTemplateId: string;
  onLoadTemplate: (id: string) => void;
  plaintiffNarrative: string;
  onPlaintiffNarrativeChange: (value: string) => void;
  defendantNarrative: string;
  onDefendantNarrativeChange: (value: string) => void;
  amountClaimed: number;
  onAmountChange: (value: number) => void;
  judgeId: JudgeTemperament;
  onJudgeChange: (value: JudgeTemperament) => void;
  isSaving: boolean;
  error: string | null;
  onContinue: () => void;
}

function narrativeStrength(text: string): { label: string; color: string; pct: number } {
  const len = text.trim().length;
  if (len === 0) return { label: "Empty", color: "text-zinc-400", pct: 0 };
  if (len < 40) return { label: "Too short", color: "text-rose-500", pct: Math.round((len / 40) * 50) };
  if (len < 120) return { label: "Good start", color: "text-amber-500", pct: 60 };
  if (len < 300) return { label: "Solid", color: "text-emerald-500", pct: 80 };
  return { label: "Detailed", color: "text-emerald-600", pct: 100 };
}

// ── Searchable template combobox ──────────────────────────────────────────────
function TemplateCombobox({
  templates,
  selectedTemplateId,
  onSelect,
}: {
  templates: MockCaseTemplate[];
  selectedTemplateId: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedTemplate =
    templates.find((t) => t.id === selectedTemplateId) ?? templates[0];

  const lowerQuery = query.toLowerCase().trim();

  const filtered = lowerQuery
    ? templates.filter((t) => {
        const haystack = `${t.title} ${t.caseType} ${t.tags.join(" ")} ${t.plaintiffNarrative}`.toLowerCase();
        return lowerQuery.split(/\s+/).every((word) => haystack.includes(word));
      })
    : templates;

  const clampHighlight = useCallback(
    (idx: number) => Math.max(0, Math.min(idx, filtered.length - 1)),
    [filtered.length],
  );

  useEffect(() => {
    setHighlightIdx(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[highlightIdx] as HTMLElement | undefined;
    el?.scrollIntoView?.({ block: "nearest" });
  }, [highlightIdx, open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIdx((prev) => clampHighlight(prev + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIdx((prev) => clampHighlight(prev - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (filtered[highlightIdx]) {
          onSelect(filtered[highlightIdx].id);
          setQuery("");
          setOpen(false);
        }
        break;
      case "Escape":
        e.preventDefault();
        setQuery("");
        setOpen(false);
        break;
    }
  }

  function pick(id: string) {
    onSelect(id);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  return (
    <div
      ref={containerRef}
      className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Start from an example case
      </label>
      <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
        Pick a template to see how a case looks, or type to search by keyword
        (e.g.&nbsp;&ldquo;dog&rdquo;, &ldquo;deposit&rdquo;, &ldquo;fence&rdquo;).
      </p>

      <div className="relative">
        {/* Input / trigger */}
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            className="w-full rounded-lg border border-zinc-300 bg-white py-2.5 pl-3 pr-9 text-sm transition-colors placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:placeholder:text-zinc-500"
            placeholder="Search templates…"
            value={open ? query : ""}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!open) setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
          />
          {/* chevron */}
          <svg
            className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {/* Current selection chip (shown when closed) */}
        {!open && (
          <button
            type="button"
            className="mt-2 flex w-full items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700/50"
            onClick={() => {
              setOpen(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
          >
            {selectedTemplate.id === "blank" ? (
              <span className="text-zinc-400 italic">No template — writing from scratch</span>
            ) : (
              <>
                <span className="inline-flex items-center rounded-md bg-wy-navy-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-wy-navy dark:bg-zinc-700 dark:text-zinc-300">
                  {caseTypeLabels[selectedTemplate.caseType] ?? selectedTemplate.caseType}
                </span>
                <span className="truncate text-zinc-700 dark:text-zinc-200">
                  {selectedTemplate.title}
                </span>
              </>
            )}
          </button>
        )}

        {/* Dropdown list */}
        {open && (
          <ul
            ref={listRef}
            role="listbox"
            className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
          >
            {filtered.length === 0 && (
              <li className="px-3 py-4 text-center text-sm text-zinc-400">
                No templates match &ldquo;{query}&rdquo;
              </li>
            )}
            {filtered.map((t, idx) => {
              const isHighlighted = idx === highlightIdx;
              const isSelected = t.id === selectedTemplateId;
              const isBlank = t.id === "blank";
              return (
                <li
                  key={t.id}
                  role="option"
                  aria-selected={isSelected}
                  className={`cursor-pointer px-3 py-2.5 text-sm transition-colors ${
                    isHighlighted
                      ? "bg-zinc-100 dark:bg-zinc-700"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-700/40"
                  } ${isSelected ? "font-medium" : ""}`}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(t.id)}
                >
                  {isBlank ? (
                    <span className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Start from scratch
                    </span>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-md bg-wy-navy-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-wy-navy/70 dark:bg-zinc-700 dark:text-zinc-400">
                          {caseTypeLabels[t.caseType] ?? t.caseType}
                        </span>
                        <span className="truncate text-zinc-800 dark:text-zinc-100">
                          {t.title}
                        </span>
                        {isSelected && (
                          <svg className="ml-auto h-4 w-4 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className="line-clamp-1 text-xs text-zinc-400 dark:text-zinc-500">
                        {t.plaintiffNarrative.slice(0, 100)}
                        {t.plaintiffNarrative.length > 100 ? "…" : ""}
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Result count when filtering */}
      {open && lowerQuery && (
        <p className="mt-2 text-xs text-zinc-400">
          {filtered.length} template{filtered.length !== 1 ? "s" : ""} match
          {filtered.length !== 1 ? "" : "es"} your search
        </p>
      )}
    </div>
  );
}

export function StoryStep({
  templates,
  selectedTemplateId,
  onLoadTemplate,
  plaintiffNarrative,
  onPlaintiffNarrativeChange,
  defendantNarrative,
  onDefendantNarrativeChange,
  amountClaimed,
  onAmountChange,
  judgeId,
  onJudgeChange,
  isSaving,
  error,
  onContinue,
}: StoryStepProps) {
  const pStrength = narrativeStrength(plaintiffNarrative);
  const dStrength = narrativeStrength(defendantNarrative);

  return (
    <div className="animate-fade-in space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Tell us what happened
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          Describe the situation from both perspectives. We know thinking about the other
          side is hard, but judges always hear both &mdash; and putting yourself in their
          shoes actually strengthens your case.
        </p>
      </div>

      {/* Template selector — searchable combobox */}
      <TemplateCombobox
        templates={templates}
        selectedTemplateId={selectedTemplateId}
        onSelect={onLoadTemplate}
      />

      {/* Narratives */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Your side of the story
          </label>
          <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
            What happened? What did you lose? Why do you believe you&apos;re owed something?
          </p>
          <textarea
            className="h-36 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm leading-relaxed transition-colors focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800"
            placeholder="In my own words, what happened was..."
            value={plaintiffNarrative}
            onChange={(e) => onPlaintiffNarrativeChange(e.target.value)}
          />
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className={pStrength.color}>{pStrength.label}</span>
            <span className="text-zinc-400">
              {plaintiffNarrative.trim().length} characters
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Their side of the story
          </label>
          <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
            What would they say? What&apos;s their defense? Be as honest as you can &mdash;
            it helps the judge see the full picture.
          </p>
          <textarea
            className="h-36 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm leading-relaxed transition-colors focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800"
            placeholder="They would probably say..."
            value={defendantNarrative}
            onChange={(e) => onDefendantNarrativeChange(e.target.value)}
          />
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className={dStrength.color}>{dStrength.label}</span>
            <span className="text-zinc-400">
              {defendantNarrative.trim().length} characters
            </span>
          </div>
        </div>
      </div>

      {/* Amount + Judge */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        {/* Amount */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Amount you&apos;re claiming
          </label>
          <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
            Wyoming small claims court handles disputes up to $6,000.
          </p>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">
              $
            </span>
            <input
              className="w-full rounded-lg border border-zinc-300 bg-white py-2.5 pl-7 pr-3 text-sm transition-colors focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800"
              type="number"
              min={0}
              max={6000}
              value={amountClaimed}
              onChange={(e) => onAmountChange(Number(e.target.value || "0"))}
            />
          </div>
          {amountClaimed > 6000 && (
            <p className="mt-2 text-xs text-rose-500">
              Amount exceeds Wyoming&apos;s $6,000 small claims limit.
            </p>
          )}
        </div>

        {/* Judge selection */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Choose your judge
          </label>
          <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
            Each judge weighs evidence differently. You can compare all four later.
          </p>
          <div className="space-y-2">
            {mockJudges.map((judge) => (
              <button
                key={judge.id}
                type="button"
                onClick={() => onJudgeChange(judge.id)}
                className={`w-full rounded-lg border p-3 text-left transition-all ${
                  judgeId === judge.id
                    ? "border-wy-navy bg-wy-navy-50 shadow-sm ring-1 ring-wy-navy/10 dark:border-wy-gold dark:bg-zinc-800 dark:ring-wy-gold/20"
                    : "border-zinc-200 hover:border-wy-navy/30 hover:bg-wy-navy-50/50 dark:border-zinc-700 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/50"
                }`}
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {judge.name}
                  </span>
                  <span className="text-xs text-zinc-400">{judge.tone}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {judge.description}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Continue */}
      <div className="flex justify-end">
        <button
          type="button"
          className="w-full rounded-lg bg-wy-navy px-8 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-wy-navy-light disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:py-2.5 dark:bg-wy-gold dark:text-wy-navy dark:hover:bg-wy-gold-light"
          onClick={onContinue}
          disabled={isSaving}
        >
          {isSaving ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Saving...
            </span>
          ) : (
            "Continue"
          )}
        </button>
      </div>
    </div>
  );
}
