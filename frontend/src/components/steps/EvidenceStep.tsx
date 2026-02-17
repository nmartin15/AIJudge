import { useState } from "react";
import type { Evidence, EvidenceType, PartyRole } from "@/lib/types";

interface EvidenceStepProps {
  savedEvidence: Evidence[];
  onSave: (data: {
    role: PartyRole;
    evidenceType: EvidenceType;
    title: string;
    description: string;
    file: File | null;
  }) => Promise<void>;
  isSaving: boolean;
  error: string | null;
  onBack: () => void;
  onContinue: () => void;
  isBackendMode: boolean;
}

const evidenceTypeLabels: Record<EvidenceType, string> = {
  document: "Document",
  photo: "Photo",
  receipt: "Receipt",
  text_message: "Text message",
  email: "Email",
  contract: "Contract",
  other: "Other",
};

export function EvidenceStep({
  savedEvidence,
  onSave,
  isSaving,
  error,
  onBack,
  onContinue,
  isBackendMode,
}: EvidenceStepProps) {
  // Form state lives here — no need to re-render the entire page on every keystroke
  const [role, setRole] = useState<PartyRole>("plaintiff");
  const [evidenceType, setEvidenceType] = useState<EvidenceType>("document");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);

  async function handleSave() {
    await onSave({ role, evidenceType, title, description, file });
    // Clear form after successful save (parent controls isSaving)
    setTitle("");
    setDescription("");
    setFile(null);
  }

  return (
    <div className="animate-fade-in space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          What evidence do you have?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          Documents, photos, receipts, text messages &mdash; anything that supports your
          side of the story. The stronger your evidence, the more confident the judge can
          be in the decision.
        </p>
      </div>

      {/* Add evidence form */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Add an evidence item
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Submitted by
            </label>
            <select
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm transition-colors focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800"
              value={role}
              onChange={(e) => setRole(e.target.value as PartyRole)}
            >
              <option value="plaintiff">Plaintiff</option>
              <option value="defendant">Defendant</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Type of evidence
            </label>
            <select
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm transition-colors focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800"
              value={evidenceType}
              onChange={(e) => setEvidenceType(e.target.value as EvidenceType)}
            >
              {Object.entries(evidenceTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Title *
            </label>
            <input
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm transition-colors focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800"
              placeholder='e.g., "Signed lease agreement" or "Photo of damage"'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Description
            </label>
            <textarea
              className="h-20 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm leading-relaxed transition-colors focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800"
              placeholder="Briefly describe what this evidence shows..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Attach file (optional)
            </label>
            <input
              className="w-full text-sm text-zinc-500 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-200 dark:text-zinc-400 dark:file:bg-zinc-800 dark:file:text-zinc-300"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="mt-1 text-xs text-zinc-400">
                Selected: {file.name} ({Math.round(file.size / 1024)} KB)
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          className="mt-4 rounded-lg border border-zinc-300 px-5 py-2 text-sm font-semibold transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
          onClick={() => void handleSave()}
          disabled={isSaving || !title.trim()}
        >
          {isSaving ? "Adding..." : "+ Add evidence"}
        </button>
      </div>

      {/* Saved evidence list */}
      {savedEvidence.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Evidence on file ({savedEvidence.length})
          </p>
          <div className="space-y-2">
            {savedEvidence.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800/50"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {item.title}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {evidenceTypeLabels[item.evidence_type] ?? item.evidence_type} &middot;{" "}
                    {item.submitted_by}
                  </p>
                </div>
                <span className="flex-shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                  Added
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hint when no evidence in mock mode */}
      {!isBackendMode && savedEvidence.length === 0 && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/30 dark:text-zinc-400">
          In this simulation mode, evidence is described in your narratives. You can
          continue to the next step.
        </div>
      )}

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
          className="rounded-lg bg-wy-navy px-8 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-wy-navy-light disabled:cursor-not-allowed disabled:opacity-60 sm:py-2.5 dark:bg-wy-gold dark:text-wy-navy dark:hover:bg-wy-gold-light"
          onClick={onContinue}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
