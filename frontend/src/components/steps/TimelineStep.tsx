import { useState } from "react";
import type { PartyRole, TimelineEvent } from "@/lib/types";

function eventDateLabel(value: string): string {
  if (!value) return "Date not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Date not set";
  return parsed.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface TimelineStepProps {
  savedEvents: TimelineEvent[];
  onSave: (data: {
    date: string;
    description: string;
    source: PartyRole;
    disputed: boolean;
  }) => Promise<void>;
  onUpdate?: (
    id: string,
    data: {
      date: string;
      description: string;
      source: PartyRole;
      disputed: boolean;
    },
  ) => void;
  isSaving: boolean;
  error: string | null;
  onBack: () => void;
  onContinue: () => void;
  isBackendMode: boolean;
}

export function TimelineStep({
  savedEvents,
  onSave,
  onUpdate,
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
              When did it happen?
            </label>
            <input
              id="timeline-date"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm transition-colors focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800"
              type="date"
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
              What happened?
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
          disabled={isSaving}
        >
          {isSaving ? "Adding..." : "+ Add event"}
        </button>
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
          Add as many events as you want, then fill in the date and what
          happened. Empty events are fine.
          {!isBackendMode && " They stay with this case for the demo."}
        </p>
      </div>

      {savedEvents.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Timeline ({savedEvents.length}{" "}
            {savedEvents.length === 1 ? "event" : "events"})
          </p>
          <div className="space-y-4">
            {savedEvents.map((event) =>
              event.id.startsWith("draft-") && onUpdate ? (
                <div
                  key={event.id}
                  className="grid gap-3 rounded-lg border border-zinc-200 p-4 sm:grid-cols-2 dark:border-zinc-700"
                >
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      When did it happen?
                    </label>
                    <input
                      aria-label={`Date for ${event.description || "event"}`}
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                      type="date"
                      value={event.event_date.slice(0, 10)}
                      onChange={(e) =>
                        onUpdate(event.id, {
                          date: e.target.value,
                          description: event.description,
                          source: event.source ?? "plaintiff",
                          disputed: event.disputed,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Who reported this?
                    </label>
                    <select
                      aria-label={`Source for ${event.description || "event"}`}
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                      value={event.source ?? "plaintiff"}
                      onChange={(e) =>
                        onUpdate(event.id, {
                          date: event.event_date,
                          description: event.description,
                          source: e.target.value as PartyRole,
                          disputed: event.disputed,
                        })
                      }
                    >
                      <option value="plaintiff">Plaintiff</option>
                      <option value="defendant">Defendant</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      What happened?
                    </label>
                    <textarea
                      aria-label={`What happened for ${event.description || "event"}`}
                      className="h-20 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                      maxLength={5_000}
                      value={event.description}
                      onChange={(e) =>
                        onUpdate(event.id, {
                          date: event.event_date,
                          description: e.target.value,
                          source: event.source ?? "plaintiff",
                          disputed: event.disputed,
                        })
                      }
                    />
                  </div>
                  <label className="sm:col-span-2 flex items-center gap-2.5 text-sm text-zinc-700 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-zinc-300 accent-zinc-900 dark:border-zinc-600"
                      checked={event.disputed}
                      onChange={(e) =>
                        onUpdate(event.id, {
                          date: event.event_date,
                          description: event.description,
                          source: event.source ?? "plaintiff",
                          disputed: e.target.checked,
                        })
                      }
                    />
                    The other party disputes that this happened this way
                  </label>
                </div>
              ) : (
                <div key={event.id} className="flex gap-4">
                  <div
                    className={`mt-1 h-3 w-3 flex-shrink-0 rounded-full ${
                      event.disputed ? "bg-amber-400" : "bg-emerald-500"
                    }`}
                  />
                  <div className="pb-2">
                    <p className="text-xs font-medium text-zinc-400">
                      {eventDateLabel(event.event_date)}
                      {event.disputed && (
                        <span className="ml-2 text-amber-500">Disputed</span>
                      )}
                    </p>
                    <p className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
                      {event.description || "No description yet"}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      Source: {event.source}
                    </p>
                  </div>
                </div>
              ),
            )}
          </div>
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
