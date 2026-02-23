"use client";

import { useState } from "react";
import type { SimulationOutput, JudgeTemperament } from "@/lib/mockSimulation";
import { mockJudges } from "@/lib/mockSimulation";
import type { SimulationMode } from "@/lib/simulationService";
import type {
  CaseAdvisory,
  ComparisonInsights,
} from "@/lib/types";

interface JudgmentViewProps {
  result: SimulationOutput;
  resultMode: SimulationMode | null;
  warning: string | null;
  judgeId: JudgeTemperament;
  comparisonResults: Array<{
    judgeId: JudgeTemperament;
    output: SimulationOutput;
  }>;
  comparisonInsights: ComparisonInsights | null;
  isRunningComparison: boolean;
  comparisonError: string | null;
  onRunComparison: () => void;
  onStartOver: () => void;
  isRunning: boolean;
}

function toCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function buildJudgmentDocument(result: SimulationOutput): string {
  const findings = result.findingsOfFact
    .map((item, i) => `${i + 1}. ${item}`)
    .join("\n");
  const conclusions = result.conclusionsOfLaw
    .map(
      (entry, i) =>
        `${i + 1}. ${entry.text}${entry.citation ? ` (${entry.citation})` : ""}`
    )
    .join("\n");
  return [
    `Finding for ${result.winner.toUpperCase()}`,
    "",
    "Findings of Fact",
    findings,
    "",
    "Conclusions of Law",
    conclusions,
    "",
    "Order",
    result.judgmentText,
    "",
    `Awarded Amount: ${toCurrency(result.awardAmount)}`,
  ].join("\n");
}

function priorityColor(priority: string): string {
  switch (priority) {
    case "critical":
      return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400";
    case "high":
      return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400";
    case "medium":
      return "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400";
    case "low":
      return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
    default:
      return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
  }
}

function strengthColor(score: number): string {
  if (score >= 8) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 6.5) return "text-green-600 dark:text-green-400";
  if (score >= 4.5) return "text-amber-600 dark:text-amber-400";
  if (score >= 3) return "text-orange-600 dark:text-orange-400";
  return "text-red-600 dark:text-red-400";
}

function strengthBarColor(score: number): string {
  if (score >= 8) return "bg-emerald-500";
  if (score >= 6.5) return "bg-green-500";
  if (score >= 4.5) return "bg-amber-500";
  if (score >= 3) return "bg-orange-500";
  return "bg-red-500";
}

export function JudgmentView({
  result,
  resultMode,
  warning,
  judgeId,
  comparisonResults,
  comparisonInsights,
  isRunningComparison,
  comparisonError,
  onRunComparison,
  onStartOver,
  isRunning,
}: JudgmentViewProps) {
  const [showComparison, setShowComparison] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["strength", "recommendations"])
  );
  const judge = mockJudges.find((j) => j.id === judgeId) ?? mockJudges[0];
  const judgmentDocument = buildJudgmentDocument(result);
  const advisory = result.advisory ?? null;

  function toggleSection(section: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  function copyDocument() {
    void navigator.clipboard.writeText(judgmentDocument);
  }

  function downloadDocument() {
    const blob = new Blob([judgmentDocument], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "judgment-document.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  function buildCourtPrepDocument(): string {
    if (!advisory?.court_preparation) return "";
    const prep = advisory.court_preparation;
    const parts = [
      "COURT DAY PREPARATION PACKET",
      "Wyoming Small Claims Court",
      "=" .repeat(50),
      "",
      "CASE SUMMARY:",
      prep.case_summary,
      "",
      "OPENING STATEMENT:",
      prep.opening_statement,
      "",
      "KEY POINTS TO MAKE:",
      ...(prep.key_points ?? []).map((p, i) => `  ${i + 1}. ${p}`),
      "",
      "EVIDENCE CHECKLIST:",
      ...(prep.evidence_checklist ?? []).map(
        (e) => `  [${e.priority.toUpperCase()}] ${e.item} — ${e.note}`
      ),
      "",
      "ANTICIPATED QUESTIONS & HOW TO RESPOND:",
      ...(prep.anticipated_questions ?? []).map(
        (q, i) =>
          `  ${i + 1}. Q: ${q.question}\n     A: ${q.suggested_approach}`
      ),
      "",
      "---",
      "This is an educational simulation. It does not constitute legal advice.",
    ];
    return parts.join("\n");
  }

  function downloadCourtPrep() {
    const content = buildCourtPrepDocument();
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "court-preparation-packet.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  if (isRunning) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <svg
          className="h-10 w-10 animate-spin text-zinc-400"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <p className="text-lg font-semibold text-zinc-600 dark:text-zinc-400">
          The judge is deliberating...
        </p>
        <p className="text-sm text-zinc-400">
          This may take a moment as the judge reviews all evidence and applies Wyoming law.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-8">
      {/* Decision header */}
      <div className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-b from-emerald-50 to-white p-5 text-center sm:p-8 dark:border-emerald-800 dark:from-emerald-950/30 dark:to-zinc-900">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
          Judgment rendered by {judge.name}
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 sm:mt-3 sm:text-3xl dark:text-zinc-100">
          Finding for the{" "}
          <span
            className={
              result.winner === "plaintiff"
                ? "text-blue-600 dark:text-blue-400"
                : "text-violet-600 dark:text-violet-400"
            }
          >
            {result.winner}
          </span>
        </h1>

        <div className="mt-4 flex items-center justify-center gap-6 sm:mt-6 sm:gap-8">
          <div>
            <p className="text-xs text-zinc-400">Award</p>
            <p className="mt-1 text-xl font-bold text-zinc-900 sm:text-2xl dark:text-zinc-100">
              {toCurrency(result.awardAmount)}
            </p>
          </div>
          <div className="h-8 w-px bg-zinc-200 dark:bg-zinc-700" />
          <div>
            <p className="text-xs text-zinc-400">Confidence</p>
            <p className="mt-1 text-xl font-bold text-zinc-900 sm:text-2xl dark:text-zinc-100">
              {Math.round(result.confidence * 100)}%
            </p>
          </div>
        </div>

        {warning && (
          <p className="mt-4 text-xs text-amber-600 dark:text-amber-400">
            {warning}
          </p>
        )}
        {resultMode && (
          <p className="mt-2 text-xs text-zinc-400">
            Source: {resultMode === "backend" ? "AI judicial pipeline" : "Mock simulation"}
          </p>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          PRIORITY 1+2: Case Strength & Actionable Recommendations
          ═══════════════════════════════════════════════════════════ */}

      {advisory && (
        <>
          {/* Case Strength Score */}
          <CaseStrengthSection
            strength={advisory.case_strength}
            expanded={expandedSections.has("strength")}
            onToggle={() => toggleSection("strength")}
          />

          {/* Actionable Recommendations */}
          {(advisory.evidence_actions.length > 0 ||
            advisory.strategic_advice.length > 0) && (
            <CollapsibleSection
              title="What you should do"
              id="recommendations"
              expanded={expandedSections.has("recommendations")}
              onToggle={() => toggleSection("recommendations")}
              accent
            >
              <div className="space-y-6">
                {/* Evidence improvement actions */}
                {advisory.evidence_actions.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Strengthen your evidence
                    </h4>
                    <div className="mt-3 space-y-3">
                      {advisory.evidence_actions.map((action, i) => (
                        <div
                          key={`action-${i}`}
                          className="rounded-lg border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/50"
                        >
                          <div className="flex flex-wrap items-start gap-2">
                            <span
                              className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${priorityColor(
                                action.current_strength === "none"
                                  ? "critical"
                                  : action.current_strength === "weak"
                                  ? "high"
                                  : "medium"
                              )}`}
                            >
                              {action.current_strength === "none"
                                ? "No evidence"
                                : action.current_strength === "weak"
                                ? "Weak"
                                : "Moderate"}
                            </span>
                            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                              {action.element}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                            {action.action}
                          </p>
                          {action.what_to_bring && (
                            <p className="mt-1.5 text-sm">
                              <span className="font-semibold text-blue-600 dark:text-blue-400">
                                Bring:
                              </span>{" "}
                              <span className="text-zinc-600 dark:text-zinc-400">
                                {action.what_to_bring}
                              </span>
                            </p>
                          )}
                          {action.impact && (
                            <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                              {action.impact}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Strategic advice */}
                {advisory.strategic_advice.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Strategic recommendations
                    </h4>
                    <div className="mt-3 space-y-3">
                      {advisory.strategic_advice.map((advice, i) => (
                        <div
                          key={`advice-${i}`}
                          className="flex gap-3 rounded-lg border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/50"
                        >
                          <span
                            className={`mt-0.5 inline-block h-2 w-2 flex-shrink-0 rounded-full ${
                              advice.priority === "high"
                                ? "bg-amber-500"
                                : advice.priority === "medium"
                                ? "bg-blue-500"
                                : "bg-zinc-400"
                            }`}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                              {advice.title}
                            </p>
                            <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                              {advice.advice}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleSection>
          )}

          {/* ═══════════════════════════════════════════════════════════
              PRIORITY 4: Court-Day Preparation Packet
              ═══════════════════════════════════════════════════════ */}
          {advisory.court_preparation &&
            Object.keys(advisory.court_preparation).length > 0 && (
            <CollapsibleSection
              title="Court day preparation"
              id="courtprep"
              expanded={expandedSections.has("courtprep")}
              onToggle={() => toggleSection("courtprep")}
            >
              <div className="space-y-6">
                {/* Download button */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="rounded-lg bg-wy-navy px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-wy-navy-light dark:bg-wy-gold dark:text-wy-navy dark:hover:bg-wy-gold-light"
                    onClick={downloadCourtPrep}
                  >
                    Download preparation packet
                  </button>
                </div>

                {/* Case summary */}
                {advisory.court_preparation.case_summary && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Your case in a nutshell
                    </h4>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                      {advisory.court_preparation.case_summary}
                    </p>
                  </div>
                )}

                {/* Opening statement */}
                {advisory.court_preparation.opening_statement && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Suggested opening statement
                    </h4>
                    <div className="mt-2 rounded-lg border-l-4 border-blue-400 bg-blue-50 p-4 dark:border-blue-600 dark:bg-blue-950/20">
                      <p className="text-sm italic leading-relaxed text-zinc-700 dark:text-zinc-300">
                        &ldquo;{advisory.court_preparation.opening_statement}&rdquo;
                      </p>
                    </div>
                  </div>
                )}

                {/* Key points */}
                {advisory.court_preparation.key_points &&
                  advisory.court_preparation.key_points.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Key points to make
                    </h4>
                    <ol className="mt-2 list-decimal space-y-1.5 pl-5">
                      {advisory.court_preparation.key_points.map(
                        (point, i) => (
                          <li
                            key={`kp-${i}`}
                            className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300"
                          >
                            {point}
                          </li>
                        )
                      )}
                    </ol>
                  </div>
                )}

                {/* Evidence checklist */}
                {advisory.court_preparation.evidence_checklist &&
                  advisory.court_preparation.evidence_checklist.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      What to bring to court
                    </h4>
                    <div className="mt-2 space-y-2">
                      {advisory.court_preparation.evidence_checklist.map(
                        (item, i) => (
                          <div
                            key={`ec-${i}`}
                            className="flex items-start gap-3"
                          >
                            <span
                              className={`mt-0.5 inline-block flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${priorityColor(
                                item.priority
                              )}`}
                            >
                              {item.priority}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                {item.item}
                              </p>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                {item.note}
                              </p>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

                {/* Anticipated questions */}
                {advisory.court_preparation.anticipated_questions &&
                  advisory.court_preparation.anticipated_questions.length >
                    0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Questions the judge may ask
                    </h4>
                    <div className="mt-2 space-y-3">
                      {advisory.court_preparation.anticipated_questions.map(
                        (q, i) => (
                          <div
                            key={`aq-${i}`}
                            className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50"
                          >
                            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                              &ldquo;{q.question}&rdquo;
                            </p>
                            <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">
                              {q.suggested_approach}
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleSection>
          )}
        </>
      )}

      {/* Rationale */}
      <CollapsibleSection
        title="Rationale"
        id="rationale"
        expanded={expandedSections.has("rationale")}
        onToggle={() => toggleSection("rationale")}
      >
        <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          {result.rationale}
        </p>
      </CollapsibleSection>

      {/* Evidence scores */}
      {result.evidenceScoreSummary.length > 0 && (
        <CollapsibleSection
          title="Evidence analysis"
          id="evidence"
          expanded={expandedSections.has("evidence")}
          onToggle={() => toggleSection("evidence")}
        >
          <div className="space-y-3">
            {result.evidenceScoreSummary.map((entry) => (
              <div key={entry.item} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <span className="min-w-0 text-sm text-zinc-700 dark:text-zinc-300">
                  {entry.item}
                </span>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 sm:w-24 dark:bg-zinc-700">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${Math.min(100, entry.score)}%` }}
                    />
                  </div>
                  <span className="min-w-[3ch] text-right text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {entry.score}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Findings of Fact */}
      <CollapsibleSection
        title={`Findings of fact (${result.findingsOfFact.length})`}
        id="findings"
        expanded={expandedSections.has("findings")}
        onToggle={() => toggleSection("findings")}
      >
        <ol className="list-decimal space-y-2 pl-5">
          {result.findingsOfFact.map((finding, i) => (
            <li
              key={i}
              className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300"
            >
              {finding}
            </li>
          ))}
        </ol>
      </CollapsibleSection>

      {/* Conclusions of Law */}
      <CollapsibleSection
        title={`Conclusions of law (${result.conclusionsOfLaw.length})`}
        id="conclusions"
        expanded={expandedSections.has("conclusions")}
        onToggle={() => toggleSection("conclusions")}
      >
        <ol className="list-decimal space-y-3 pl-5">
          {result.conclusionsOfLaw.map((conclusion, i) => (
            <li
              key={i}
              className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300"
            >
              {conclusion.text}
              {conclusion.citation && (
                <span className="ml-1 font-semibold text-zinc-900 dark:text-zinc-100">
                  ({conclusion.citation})
                </span>
              )}
            </li>
          ))}
        </ol>
      </CollapsibleSection>

      {/* Cited authorities */}
      {result.citedAuthorities.length > 0 && (
        <CollapsibleSection
          title="Cited authorities"
          id="authorities"
          expanded={expandedSections.has("authorities")}
          onToggle={() => toggleSection("authorities")}
        >
          <ul className="list-disc space-y-1 pl-5">
            {result.citedAuthorities.map((authority) => (
              <li
                key={authority}
                className="text-sm text-zinc-700 dark:text-zinc-300"
              >
                {authority}
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {/* Formal document */}
      <div className="judgment-document rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Formal judgment document
          </h3>
          <div className="no-print flex gap-2">
            <button
              type="button"
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              onClick={copyDocument}
            >
              Copy
            </button>
            <button
              type="button"
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              onClick={downloadDocument}
            >
              Download .txt
            </button>
          </div>
        </div>
        <div className="mt-4 space-y-4 text-sm leading-relaxed">
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Findings of Fact
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-zinc-700 dark:text-zinc-300">
              {result.findingsOfFact.map((finding, i) => (
                <li key={`doc-f-${i}`}>{finding}</li>
              ))}
            </ol>
          </section>
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Conclusions of Law
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-zinc-700 dark:text-zinc-300">
              {result.conclusionsOfLaw.map((c, i) => (
                <li key={`doc-c-${i}`}>
                  {c.text}
                  {c.citation ? ` (${c.citation})` : ""}
                </li>
              ))}
            </ol>
          </section>
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Order
            </p>
            <p className="mt-2 text-zinc-700 dark:text-zinc-300">
              {result.judgmentText}
            </p>
          </section>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          Multi-judge comparison (with P3: Insights)
          ═══════════════════════════════════════════════════════════ */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              How would other judges rule?
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Different judges weigh evidence differently. See how your case plays out
              across all four judicial temperaments.
            </p>
          </div>
          {!showComparison ? (
            <button
              type="button"
              className="w-full flex-shrink-0 rounded-lg bg-wy-navy px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-wy-navy-light sm:w-auto dark:bg-wy-gold dark:text-wy-navy dark:hover:bg-wy-gold-light"
              onClick={() => {
                setShowComparison(true);
                if (comparisonResults.length === 0) onRunComparison();
              }}
            >
              Compare judges
            </button>
          ) : (
            <button
              type="button"
              className="w-full flex-shrink-0 rounded-lg border border-zinc-300 px-5 py-2 text-sm font-semibold transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto dark:border-zinc-700 dark:hover:bg-zinc-800"
              onClick={onRunComparison}
              disabled={isRunningComparison}
            >
              {isRunningComparison ? "Running..." : "Re-run comparison"}
            </button>
          )}
        </div>

        {showComparison && (
          <div className="mt-5">
            {isRunningComparison && comparisonResults.length === 0 && (
              <div className="flex items-center justify-center gap-3 py-8">
                <svg
                  className="h-5 w-5 animate-spin text-zinc-400"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm text-zinc-500">
                  Running all four judges...
                </span>
              </div>
            )}

            {comparisonError && (
              <p className="mb-3 text-xs text-amber-600 dark:text-amber-400">
                {comparisonError}
              </p>
            )}

            {/* P3: Comparison Insights Banner */}
            {comparisonInsights && comparisonResults.length > 0 && (
              <ComparisonInsightsBanner insights={comparisonInsights} />
            )}

            {comparisonResults.length > 0 && (
              <>
                {/* Mobile: card layout */}
                <div className="space-y-3 sm:hidden">
                  {comparisonResults.map((entry) => {
                    const entryJudge =
                      mockJudges.find((j) => j.id === entry.judgeId) ??
                      mockJudges[0];
                    return (
                      <div
                        key={`mobile-${entry.judgeId}`}
                        className="rounded-lg border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/50"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                              {entryJudge.name}
                            </p>
                            <p className="text-xs text-zinc-400">
                              {entryJudge.tone}
                            </p>
                          </div>
                          <span
                            className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              entry.output.winner === "plaintiff"
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400"
                                : "bg-violet-100 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400"
                            }`}
                          >
                            {entry.output.winner}
                          </span>
                        </div>
                        <div className="mt-3 flex gap-4 text-sm">
                          <div>
                            <p className="text-xs text-zinc-400">Award</p>
                            <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                              {toCurrency(entry.output.awardAmount)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-zinc-400">Confidence</p>
                            <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                              {Math.round(entry.output.confidence * 100)}%
                            </p>
                          </div>
                        </div>
                        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                          {entry.output.rationale || "No rationale provided."}
                        </p>
                        {entry.output.citedAuthorities.length > 0 && (
                          <p className="mt-2 text-xs text-zinc-400">
                            Cited: {entry.output.citedAuthorities.join(", ")}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Desktop: table + detail cards */}
                <div className="hidden sm:block">
                  <div className="overflow-x-auto">
                    <table aria-label="Judge comparison results" className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-zinc-200 dark:border-zinc-700">
                          <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            Judge
                          </th>
                          <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            Ruling
                          </th>
                          <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            Award
                          </th>
                          <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            Confidence
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparisonResults.map((entry) => {
                          const entryJudge =
                            mockJudges.find((j) => j.id === entry.judgeId) ??
                            mockJudges[0];
                          return (
                            <tr
                              key={entry.judgeId}
                              className="border-b border-zinc-100 dark:border-zinc-800"
                            >
                              <td className="px-3 py-3">
                                <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                                  {entryJudge.name}
                                </p>
                                <p className="text-xs text-zinc-400">
                                  {entryJudge.tone}
                                </p>
                              </td>
                              <td className="px-3 py-3">
                                <span
                                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                    entry.output.winner === "plaintiff"
                                      ? "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400"
                                      : "bg-violet-100 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400"
                                  }`}
                                >
                                  {entry.output.winner}
                                </span>
                              </td>
                              <td className="px-3 py-3 font-semibold">
                                {toCurrency(entry.output.awardAmount)}
                              </td>
                              <td className="px-3 py-3">
                                {Math.round(entry.output.confidence * 100)}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {comparisonResults.map((entry) => {
                      const entryJudge =
                        mockJudges.find((j) => j.id === entry.judgeId) ??
                        mockJudges[0];
                      return (
                        <div
                          key={`detail-${entry.judgeId}`}
                          className="rounded-lg border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/50"
                        >
                          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            {entryJudge.name}
                          </p>
                          <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                            {entry.output.rationale || "No rationale provided."}
                          </p>
                          {entry.output.citedAuthorities.length > 0 && (
                            <p className="mt-2 text-xs text-zinc-400">
                              Cited: {entry.output.citedAuthorities.join(", ")}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col-reverse gap-4 border-t border-zinc-200 pt-6 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
        <p className="text-center text-xs text-zinc-400 sm:text-left">
          This is an educational simulation. It does not constitute legal advice.
        </p>
        <button
          type="button"
          className="w-full rounded-lg border border-zinc-300 px-6 py-2.5 text-sm font-semibold transition-colors hover:bg-zinc-50 sm:w-auto dark:border-zinc-700 dark:hover:bg-zinc-800"
          onClick={onStartOver}
        >
          Start a new case
        </button>
      </div>
    </div>
  );
}

/* ── Case Strength Section ─────────────────────────────────────── */

function CaseStrengthSection({
  strength,
  expanded,
  onToggle,
}: {
  strength: CaseAdvisory["case_strength"];
  expanded: boolean;
  onToggle: () => void;
}) {
  const pct = Math.round((strength.score / 10) * 100);
  return (
    <div className="rounded-xl border-2 border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left sm:px-6 sm:py-4"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls="case-strength-details"
      >
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center">
            <span
              className={`text-2xl font-bold ${strengthColor(strength.score)}`}
            >
              {strength.score}
            </span>
            <span className="text-[10px] text-zinc-400">/10</span>
          </div>
          <div>
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Case Strength:{" "}
              <span className={strengthColor(strength.score)}>
                {strength.label}
              </span>
            </span>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {strength.elements_proven}/{strength.elements_total} legal elements
              proven &middot; Confidence: {strength.confidence}
            </p>
          </div>
        </div>
        <svg
          aria-hidden="true"
          className={`h-4 w-4 flex-shrink-0 text-zinc-400 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {expanded && (
        <div id="case-strength-details" className="border-t border-zinc-100 px-4 pb-4 sm:px-6 sm:pb-5 dark:border-zinc-800">
          {/* Strength bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Very Weak</span>
              <span>Very Strong</span>
            </div>
            <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
              <div
                className={`h-full rounded-full transition-all duration-700 ${strengthBarColor(
                  strength.score
                )}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Quick stats grid */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-zinc-50 p-3 text-center dark:bg-zinc-800/50">
              <p className="text-xs text-zinc-400">Elements Proven</p>
              <p className="mt-1 text-lg font-bold text-zinc-900 dark:text-zinc-100">
                {strength.elements_proven}/{strength.elements_total}
              </p>
            </div>
            <div className="rounded-lg bg-zinc-50 p-3 text-center dark:bg-zinc-800/50">
              <p className="text-xs text-zinc-400">Damages Proven</p>
              <p className="mt-1 text-lg font-bold text-zinc-900 dark:text-zinc-100">
                {strength.damages_proven ? "Yes" : "No"}
              </p>
            </div>
            <div className="rounded-lg bg-zinc-50 p-3 text-center dark:bg-zinc-800/50">
              <p className="text-xs text-zinc-400">Amount Justified</p>
              <p className="mt-1 text-lg font-bold text-zinc-900 dark:text-zinc-100">
                {strength.amount_justified != null
                  ? toCurrency(strength.amount_justified)
                  : "N/A"}
              </p>
            </div>
            <div className="rounded-lg bg-zinc-50 p-3 text-center dark:bg-zinc-800/50">
              <p className="text-xs text-zinc-400">Confidence</p>
              <p className="mt-1 text-lg font-bold capitalize text-zinc-900 dark:text-zinc-100">
                {strength.confidence}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Comparison Insights Banner ────────────────────────────────── */

function ComparisonInsightsBanner({
  insights,
}: {
  insights: ComparisonInsights;
}) {
  const consensusColor =
    insights.consensus.includes("plaintiff")
      ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20"
      : insights.consensus.includes("defendant")
      ? "border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/20"
      : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20";

  return (
    <div className={`mb-4 rounded-lg border-2 p-4 ${consensusColor}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {insights.consensus === "unanimous_plaintiff"
              ? "Unanimous: All judges favor plaintiff"
              : insights.consensus === "unanimous_defendant"
              ? "Unanimous: All judges favor defendant"
              : insights.consensus === "majority_plaintiff"
              ? `Majority: ${insights.plaintiff_wins}/${insights.total_judges} favor plaintiff`
              : insights.consensus === "majority_defendant"
              ? `Majority: ${insights.defendant_wins}/${insights.total_judges} favor defendant`
              : "Split Decision"}
          </p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {insights.consensus_text}
          </p>
        </div>
        <div className="flex gap-4 text-sm">
          <div className="text-center">
            <p className="text-xs text-zinc-400">Award Range</p>
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">
              {toCurrency(insights.award_range.min)} &mdash;{" "}
              {toCurrency(insights.award_range.max)}
            </p>
          </div>
        </div>
      </div>

      {/* Risk factors from dissenting judges */}
      {insights.risks.length > 0 && (
        <div className="mt-3 border-t border-current/10 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Vulnerabilities identified by dissenting judges
          </p>
          <div className="mt-2 space-y-1.5">
            {insights.risks.map((risk, i) => (
              <p
                key={`risk-${i}`}
                className="text-sm text-zinc-600 dark:text-zinc-400"
              >
                <span className="font-semibold">{risk.archetype_id}:</span>{" "}
                {risk.reason}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Collapsible section helper ────────────────────────────────── */

function CollapsibleSection({
  title,
  id,
  expanded,
  onToggle,
  children,
  accent,
}: {
  title: string;
  id: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-white dark:bg-zinc-900 ${
        accent
          ? "border-2 border-blue-200 dark:border-blue-800"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left sm:px-6 sm:py-4"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`section-${id}`}
      >
        <span
          className={`text-sm font-semibold ${
            accent
              ? "text-blue-700 dark:text-blue-400"
              : "text-zinc-900 dark:text-zinc-100"
          }`}
        >
          {title}
        </span>
        <svg
          aria-hidden="true"
          className={`h-4 w-4 flex-shrink-0 text-zinc-400 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {expanded && (
        <div id={`section-${id}`} className="px-4 pb-4 sm:px-6 sm:pb-5">
          {children}
        </div>
      )}
    </div>
  );
}
