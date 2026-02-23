import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
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

// ── Shared input class ──────────────────────────────────────────────────────

const INPUT_CLASS =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm transition-colors focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800";

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

function PartyCard({
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
  // Local state owns each input — completely decoupled from parent re-renders.
  // Parent re-renders can NOT move the cursor because inputs read from here.
  const [localName, setLocalName] = useState(data.name);
  const [localAddress, setLocalAddress] = useState(data.address);
  const [localPhone, setLocalPhone] = useState(formatPhone(data.phone));

  // Re-sync only when the parent pushes a genuinely new value
  // (form recovery on mount, or template change that resets everything).
  // During normal typing the parent value matches local state, so
  // setState with the same value is a no-op — no extra render.
  useEffect(() => { setLocalName(data.name); }, [data.name]);
  useEffect(() => { setLocalAddress(data.address); }, [data.address]);
  useEffect(() => { setLocalPhone(formatPhone(data.phone)); }, [data.phone]);

  // Phone cursor management — formatting changes the string length,
  // so we compute the correct cursor position and apply it after React
  // commits the new value to the DOM.
  const phoneRef = useRef<HTMLInputElement>(null);
  const phoneCursor = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = phoneRef.current;
    if (el && phoneCursor.current !== null) {
      el.setSelectionRange(phoneCursor.current, phoneCursor.current);
      phoneCursor.current = null;
    }
  }, [localPhone]);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {label}
        </h3>
        {isSaved && (
          <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
            <svg aria-hidden="true" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Saved
          </span>
        )}
      </div>

      <div className="space-y-3">
        {/* Full name */}
        <div>
          <label htmlFor={`${role}-name`} className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Full name *
          </label>
          <input
            id={`${role}-name`}
            type="text"
            className={INPUT_CLASS}
            placeholder={role === "plaintiff" ? "Your full legal name" : "Their full legal name"}
            maxLength={255}
            value={localName}
            onChange={(e) => {
              const v = e.target.value;
              setLocalName(v);
              onFieldChange("name", v);
            }}
          />
        </div>

        {/* Address */}
        <div>
          <label htmlFor={`${role}-address`} className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Address
          </label>
          <input
            id={`${role}-address`}
            type="text"
            className={INPUT_CLASS}
            placeholder="Street address, city, state"
            maxLength={500}
            value={localAddress}
            onChange={(e) => {
              const v = e.target.value;
              setLocalAddress(v);
              onFieldChange("address", v);
            }}
          />
        </div>

        {/* Phone */}
        <div>
          <label htmlFor={`${role}-phone`} className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Phone
          </label>
          <input
            id={`${role}-phone`}
            ref={phoneRef}
            type="tel"
            className={INPUT_CLASS}
            placeholder="(307) 555-0100"
            value={localPhone}
            onChange={(e) => {
              const raw = e.target.value;
              const formatted = formatPhone(raw);
              const cursor = e.target.selectionStart ?? formatted.length;
              const delta = formatted.length - raw.length;
              phoneCursor.current = Math.max(0, cursor + delta);
              setLocalPhone(formatted);
              onFieldChange("phone", stripNonDigits(raw));
            }}
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
}

// ── Main step ───────────────────────────────────────────────────────────────

export function PartiesStep({
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
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
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
          className="rounded-lg bg-wy-navy px-8 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-wy-navy-light disabled:cursor-not-allowed disabled:opacity-60 sm:py-2.5 dark:bg-wy-gold dark:text-wy-navy dark:hover:bg-wy-gold-light"
          onClick={onContinue}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
