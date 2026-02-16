import type { MockCaseTemplate, JudgeTemperament } from "@/lib/mockSimulation";
import { mockJudges } from "@/lib/mockSimulation";

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

      {/* Template selector */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Start from an example case
        </label>
        <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
          Pick a template to see how a case looks, or write your own from scratch.
        </p>
        <select
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm transition-colors focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800"
          value={selectedTemplateId}
          onChange={(e) => onLoadTemplate(e.target.value)}
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </div>

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
                    ? "border-zinc-900 bg-zinc-50 shadow-sm dark:border-zinc-300 dark:bg-zinc-800"
                    : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/50"
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
          className="w-full rounded-lg bg-zinc-900 px-8 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:py-2.5 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
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
