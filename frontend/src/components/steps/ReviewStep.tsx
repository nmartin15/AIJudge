import type { Case } from "@/lib/types";
import type { JudgeTemperament } from "@/lib/mockSimulation";
import { mockJudges } from "@/lib/mockSimulation";

interface ReviewStepProps {
  caseRecord: Case | null;
  plaintiffNarrative: string;
  defendantNarrative: string;
  amountClaimed: number;
  judgeId: JudgeTemperament;
  plaintiffName: string;
  defendantName: string;
  allowEarlyJudgment: boolean;
  onAllowEarlyJudgmentChange: (value: boolean) => void;
  hearingConcluded: boolean;
  hasExistingJudgment: boolean;
  isBackendMode: boolean;
  onBack: () => void;
  onBeginHearing: () => void;
  onSkipToJudgment: () => void;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "...";
}

export function ReviewStep({
  caseRecord,
  plaintiffNarrative,
  defendantNarrative,
  amountClaimed,
  judgeId,
  plaintiffName,
  defendantName,
  allowEarlyJudgment,
  onAllowEarlyJudgmentChange,
  hearingConcluded,
  hasExistingJudgment,
  isBackendMode,
  onBack,
  onBeginHearing,
  onSkipToJudgment,
}: ReviewStepProps) {
  const selectedJudge = mockJudges.find((j) => j.id === judgeId) ?? mockJudges[0];
  const evidenceCount = caseRecord?.evidence.length ?? 0;
  const timelineCount = caseRecord?.timeline_events.length ?? 0;
  const partyCount = caseRecord?.parties.length ?? 0;

  return (
    <div className="animate-fade-in space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Review your case
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          Take a moment to review everything before the hearing. Once you&apos;re ready, the
          judge will hear your case and ask questions to fill in any gaps.
        </p>
      </div>

      {/* Case summary */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 sm:mb-4">
          Case summary
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
          <div>
            <p className="text-xs font-medium text-zinc-400">Plaintiff</p>
            <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {plaintiffName}
            </p>
            <p className="mt-2 text-xs text-zinc-500 leading-relaxed">
              &ldquo;{truncate(plaintiffNarrative, 200)}&rdquo;
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-400">Defendant</p>
            <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {defendantName}
            </p>
            <p className="mt-2 text-xs text-zinc-500 leading-relaxed">
              &ldquo;{truncate(defendantNarrative, 200)}&rdquo;
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
            <p className="text-xs text-zinc-400">Amount</p>
            <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              ${amountClaimed.toLocaleString()}
            </p>
          </div>
          {isBackendMode && (
            <>
              <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
                <p className="text-xs text-zinc-400">Parties</p>
                <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {partyCount}
                </p>
              </div>
              <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
                <p className="text-xs text-zinc-400">Evidence</p>
                <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {evidenceCount}
                </p>
              </div>
              <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
                <p className="text-xs text-zinc-400">Timeline</p>
                <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {timelineCount} events
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Judge card */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 sm:mb-4">
          Presiding judge
        </h3>
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-wy-navy text-base font-bold text-white sm:h-12 sm:w-12 sm:text-lg dark:bg-wy-gold dark:text-wy-navy">
            {selectedJudge.name.split(" ").pop()?.[0] ?? "J"}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900 sm:text-base dark:text-zinc-100">
              {selectedJudge.name}
            </p>
            <p className="text-xs text-zinc-500 sm:text-sm">{selectedJudge.tone}</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500 sm:text-sm dark:text-zinc-400">
              {selectedJudge.description}
            </p>
          </div>
        </div>
      </div>

      {/* Hearing status */}
      {hearingConcluded && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
          Hearing has been concluded. You can proceed directly to judgment.
        </div>
      )}

      {/* Early judgment override */}
      {isBackendMode && !hearingConcluded && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-800/50 dark:bg-amber-950/20">
          <label className="flex items-start gap-3 text-sm text-amber-800 dark:text-amber-300">
            <input
              className="mt-0.5 h-4 w-4 rounded border-amber-300 accent-amber-600 dark:border-amber-600"
              type="checkbox"
              checked={allowEarlyJudgment}
              onChange={(e) => onAllowEarlyJudgmentChange(e.target.checked)}
            />
            <div>
              <p className="font-semibold">Skip the hearing and go straight to judgment</p>
              <p className="mt-1 text-xs leading-relaxed opacity-80">
                We recommend completing the hearing first &mdash; it gives the judge a
                chance to ask clarifying questions, which leads to a better decision.
              </p>
            </div>
          </label>
        </div>
      )}

      {/* Error for existing judgment */}
      {hasExistingJudgment && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/30 dark:text-zinc-400">
          A judgment has already been generated for this case. You can view it or start a
          new case.
        </div>
      )}

      {/* Navigation */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          className="order-last rounded-lg border border-zinc-300 px-6 py-3 text-sm font-semibold transition-colors hover:bg-zinc-50 sm:order-first sm:py-2.5 dark:border-zinc-700 dark:hover:bg-zinc-800"
          onClick={onBack}
        >
          Back
        </button>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
          {(allowEarlyJudgment || hearingConcluded || !isBackendMode) && (
            <button
              type="button"
              className="rounded-lg border border-zinc-300 px-6 py-3 text-sm font-semibold transition-colors hover:bg-zinc-50 sm:py-2.5 dark:border-zinc-700 dark:hover:bg-zinc-800"
              onClick={onSkipToJudgment}
            >
              {hearingConcluded ? "Get judgment" : "Skip to judgment"}
            </button>
          )}
          {!hearingConcluded && (
            <button
              type="button"
              className="rounded-lg bg-wy-navy px-8 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-wy-navy-light sm:py-2.5 dark:bg-wy-gold dark:text-wy-navy dark:hover:bg-wy-gold-light"
              onClick={onBeginHearing}
            >
              Begin hearing
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
