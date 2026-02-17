import { memo, useCallback, useRef, useEffect } from "react";
import type { Party, PartyRole } from "@/lib/types";

// ── Phone formatting ────────────────────────────────────────────────────────

function stripNonDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function formatPhone(value: string): string {
  const digits = stripNonDigits(value).slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// ── Stable text input that owns its own cursor position ─────────────────────

function StableInput({
  value,
  onChange,
  placeholder,
  type = "text",
  formatFn,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "tel";
  formatFn?: (raw: string) => string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Sync parent value into the input only when the input is NOT focused,
  // so we never fight the user's cursor position mid-typing.
  useEffect(() => {
    const el = inputRef.current;
    if (!el || el === document.activeElement) return;
    const display = formatFn ? formatFn(value) : value;
    if (el.value !== display) {
      el.value = display;
    }
  }, [value, formatFn]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (formatFn) {
        const formatted = formatFn(raw);
        // Preserve cursor position relative to the formatted value
        const el = e.target;
        const prevCursor = el.selectionStart ?? formatted.length;
        const prevLen = raw.length;
        el.value = formatted;
        // Adjust cursor: if formatting added characters, shift cursor right
        const delta = formatted.length - prevLen;
        const newCursor = Math.max(0, prevCursor + delta);
        el.setSelectionRange(newCursor, newCursor);
        onChangeRef.current(stripNonDigits(raw));
      } else {
        onChangeRef.current(raw);
      }
    },
    [formatFn],
  );

  const handleBlur = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    if (formatFn) {
      const formatted = formatFn(el.value);
      el.value = formatted;
      onChangeRef.current(stripNonDigits(el.value));
    } else {
      onChangeRef.current(el.value);
    }
  }, [formatFn]);

  const display = formatFn ? formatFn(value) : value;

  return (
    <input
      ref={inputRef}
      type={type}
      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm transition-colors focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800"
      placeholder={placeholder}
      defaultValue={display}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
}

// ── Party card ──────────────────────────────────────────────────────────────

interface PartiesStepProps {
  plaintiff: { name: string; address: string; phone: string };
  defendant: { name: string; address: string; phone: string };
  onFieldChange: (
    party: "plaintiff" | "defendant",
    field: "name" | "address" | "phone",
    value: string
  ) => void;
  savedParties: Party[];
  onSaveParty: (role: PartyRole) => void;
  isSaving: boolean;
  error: string | null;
  onBack: () => void;
  onContinue: () => void;
  isBackendMode: boolean;
}

const PartyCard = memo(function PartyCard({
  role,
  label,
  data,
  isSaved,
  onFieldChange,
  onSave,
  isSaving,
  isBackendMode,
}: {
  role: "plaintiff" | "defendant";
  label: string;
  data: { name: string; address: string; phone: string };
  isSaved: boolean;
  onFieldChange: (field: "name" | "address" | "phone", value: string) => void;
  onSave: () => void;
  isSaving: boolean;
  isBackendMode: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {label}
        </h3>
        {isSaved && (
          <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Saved
          </span>
        )}
      </div>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Full name *
          </label>
          <StableInput
            placeholder={role === "plaintiff" ? "Your full legal name" : "Their full legal name"}
            value={data.name}
            onChange={(v) => onFieldChange("name", v)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Address
          </label>
          <StableInput
            placeholder="Street address, city, state"
            value={data.address}
            onChange={(v) => onFieldChange("address", v)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Phone
          </label>
          <StableInput
            type="tel"
            placeholder="(307) 555-0100"
            value={data.phone}
            onChange={(v) => onFieldChange("phone", v)}
            formatFn={formatPhone}
          />
        </div>
      </div>
      {isBackendMode && !isSaved && (
        <button
          type="button"
          className="mt-4 w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
          onClick={onSave}
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : `Save ${label.toLowerCase()}`}
        </button>
      )}
    </div>
  );
});

// ── Main step ───────────────────────────────────────────────────────────────

export const PartiesStep = memo(function PartiesStep({
  plaintiff,
  defendant,
  onFieldChange,
  savedParties,
  onSaveParty,
  isSaving,
  error,
  onBack,
  onContinue,
  isBackendMode,
}: PartiesStepProps) {
  const hasPlaintiff = savedParties.some((p) => p.role === "plaintiff");
  const hasDefendant = savedParties.some((p) => p.role === "defendant");

  const handlePlaintiffField = useCallback(
    (field: "name" | "address" | "phone", value: string) =>
      onFieldChange("plaintiff", field, value),
    [onFieldChange],
  );

  const handleDefendantField = useCallback(
    (field: "name" | "address" | "phone", value: string) =>
      onFieldChange("defendant", field, value),
    [onFieldChange],
  );

  const savePlaintiff = useCallback(
    () => onSaveParty("plaintiff"),
    [onSaveParty],
  );

  const saveDefendant = useCallback(
    () => onSaveParty("defendant"),
    [onSaveParty],
  );

  return (
    <div className="animate-fade-in space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Who&apos;s involved?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          Enter information for both parties. The judge needs to know who&apos;s who in this
          dispute. Names are required; address and phone help with formal documents.
        </p>
      </div>

      {/* Party cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        <PartyCard
          role="plaintiff"
          label="Plaintiff (you)"
          data={plaintiff}
          isSaved={hasPlaintiff}
          onFieldChange={handlePlaintiffField}
          onSave={savePlaintiff}
          isSaving={isSaving}
          isBackendMode={isBackendMode}
        />
        <PartyCard
          role="defendant"
          label="Defendant (other party)"
          data={defendant}
          isSaved={hasDefendant}
          onFieldChange={handleDefendantField}
          onSave={saveDefendant}
          isSaving={isSaving}
          isBackendMode={isBackendMode}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Navigation */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          className="rounded-lg border border-zinc-300 px-6 py-3 text-sm font-semibold transition-colors hover:bg-zinc-50 sm:py-2.5 dark:border-zinc-700 dark:hover:bg-zinc-800"
          onClick={onBack}
        >
          Back
        </button>
        <button
          type="button"
          className="rounded-lg bg-zinc-900 px-8 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 sm:py-2.5 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          onClick={onContinue}
        >
          Continue
        </button>
      </div>
    </div>
  );
});
