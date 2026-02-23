import { useState } from "react";
import type { PartyRole, TimelineEvent } from "@/lib/types";

interface TimelineStepProps {
  savedEvents: TimelineEvent[];
  onSave: (data: {
    date: string;
    description: string;
    source: PartyRole;
    disputed: boolean;
  }) => Promise<void>;
  isSaving: boolean;
  error: string | null;
  onBack: () => void;
  onContinue: () => void;
  isBackendMode: boolean;
}

export function TimelineStep({
  savedEvents,
  onSave,
  isSaving,
  error,
  onBack,
  onContinue,
  isBackendMode,
}: TimelineStepProps) {
  // Form state lives here — keystrokes don't ripple up to the page
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState<PartyRole>("plaintiff");
  const [disputed, setDisputed] = useState(false);

  async function handleSave() {
    await onSave({ date, description, source, disputed });
    setDate("");
    setDescription("");
    setDisputed(false);
  }

  return (
    <div className="animate-fade-in space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          What happened, and when?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          Build a timeline of key events. Judges love clarity &mdash; knowing exactly when
          things happened helps them piece together the story and spot inconsistencies.
        </p>
      </div>

      {/* Add event form */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Add a timeline event
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="timeline-date" className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              When did it happen? *
            </label>
            <input
              id="timeline-date"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm transition-colors focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800"
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="timeline-source" className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Who reported this?
            </label>
            <select
              id="timeline-source"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm transition-colors focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800"
              value={source}
              onChange={(e) => setSource(e.target.value as PartyRole)}
            >
              <option value="plaintiff">Plaintiff</option>
              <option value="defendant">Defendant</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="timeline-description" className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              What happened? *
            </label>
            <textarea
              id="timeline-description"
              className="h-20 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm leading-relaxed transition-colors focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800"
              placeholder="Describe the event briefly..."
              maxLength={5_000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <label className="sm:col-span-2 flex items-center gap-2.5 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-zinc-300 accent-zinc-900 dark:border-zinc-600"
              checked={disputed}
              onChange={(e) => setDisputed(e.target.checked)}
            />
            The other party disputes that this happened this way
          </label>
        </div>
        <button
          type="button"
          className="mt-4 rounded-lg border border-zinc-300 px-5 py-2 text-sm font-semibold transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
          onClick={() => void handleSave()}
          disabled={isSaving || !date || !description.trim()}
        >
          {isSaving ? "Adding..." : "+ Add event"}
        </button>
      </div>

      {/* Saved timeline */}
      {savedEvents.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Timeline ({savedEvents.length} events)
          </p>
          <div className="relative space-y-0">
            {[...savedEvents]
              .sort(
                (a, b) =>
                  new Date(a.event_date).getTime() -
                  new Date(b.event_date).getTime()
              )
              .map((event, index) => (
                <div key={event.id} className="flex gap-4">
                  {/* Timeline line */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`h-3 w-3 flex-shrink-0 rounded-full ${
                        event.disputed
                          ? "bg-amber-400"
                          : "bg-emerald-500"
                      }`}
                    />
                    {index < savedEvents.length - 1 && (
                      <div className="w-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
                    )}
                  </div>
                  {/* Event content */}
                  <div className="pb-6">
                    <p className="text-xs font-medium text-zinc-400">
                      {new Date(event.event_date).toLocaleDateString("en-US", {
                        weekday: "short",
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                      {event.disputed && (
                        <span className="ml-2 text-amber-500">Disputed</span>
                      )}
                    </p>
                    <p className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
                      {event.description}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      Source: {event.source}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Hint for mock mode */}
      {!isBackendMode && savedEvents.length === 0 && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/30 dark:text-zinc-400">
          In this simulation mode, timeline events are inferred from your narratives.
          You can continue to the next step.
        </div>
      )}

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
