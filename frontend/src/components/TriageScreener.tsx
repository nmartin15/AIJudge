"use client";

import { useState } from "react";

interface TriageResult {
  suitable: boolean;
  warnings: string[];
  suggestions: string[];
}

interface TriageScreenerProps {
  onComplete: (result: TriageResult) => void;
  onSkip: () => void;
}

interface TriageAnswers {
  amount: string;
  timeframe: string;
  triedResolving: string;
  hasEvidence: string;
  defendantLocatable: string;
}

const QUESTIONS = [
  {
    id: "amount" as const,
    question: "How much money are you trying to recover?",
    options: [
      { value: "under_1000", label: "Under $1,000" },
      { value: "1000_3000", label: "$1,000 - $3,000" },
      { value: "3000_6000", label: "$3,000 - $6,000" },
      { value: "over_6000", label: "Over $6,000" },
    ],
  },
  {
    id: "timeframe" as const,
    question: "When did the dispute occur?",
    options: [
      { value: "under_1year", label: "Less than 1 year ago" },
      { value: "1_2years", label: "1-2 years ago" },
      { value: "2_4years", label: "2-4 years ago" },
      { value: "over_4years", label: "Over 4 years ago" },
    ],
  },
  {
    id: "triedResolving" as const,
    question: "Have you tried to resolve this directly with the other party?",
    options: [
      { value: "yes_written", label: "Yes, I sent a written demand" },
      { value: "yes_verbal", label: "Yes, we talked but couldn't agree" },
      { value: "no", label: "No, I haven't tried yet" },
    ],
  },
  {
    id: "hasEvidence" as const,
    question: "What kind of evidence do you have?",
    options: [
      { value: "strong", label: "Contracts, receipts, photos, or written communications" },
      { value: "some", label: "Some records but not complete" },
      { value: "testimony_only", label: "Mostly my own account of what happened" },
      { value: "none", label: "No real documentation" },
    ],
  },
  {
    id: "defendantLocatable" as const,
    question: "Can you locate and serve the other party?",
    options: [
      { value: "yes_address", label: "Yes, I know their current address" },
      { value: "business", label: "They're a registered business" },
      { value: "unsure", label: "I'm not sure of their current address" },
      { value: "no", label: "I have no idea where they are" },
    ],
  },
] as const;

function evaluateAnswers(answers: TriageAnswers): TriageResult {
  const warnings: string[] = [];
  const suggestions: string[] = [];
  let suitable = true;

  if (answers.amount === "over_6000") {
    warnings.push(
      "Wyoming small claims court has a $6,000 maximum. You may need to file in district court or reduce your claim to $6,000."
    );
    suitable = false;
  }

  if (answers.timeframe === "over_4years") {
    warnings.push(
      "Wyoming's statute of limitations for most claims is 4 years for written contracts and 4 years for oral contracts (W.S. 1-3-105). Your claim may be time-barred."
    );
    suitable = false;
  } else if (answers.timeframe === "2_4years") {
    warnings.push(
      "Your dispute is approaching the statute of limitations. Consider filing promptly to preserve your claim."
    );
  }

  if (answers.triedResolving === "no") {
    suggestions.push(
      "Wyoming courts encourage parties to attempt resolution before filing. Send a written demand letter first — it also becomes good evidence."
    );
  } else if (answers.triedResolving === "yes_verbal") {
    suggestions.push(
      "Follow up your verbal attempt with a written demand letter sent by certified mail. This creates a paper trail and shows the court you tried to resolve the matter."
    );
  }

  if (answers.hasEvidence === "none" || answers.hasEvidence === "testimony_only") {
    warnings.push(
      "Without documentary evidence, your case relies heavily on credibility. Judges strongly prefer written records, receipts, photos, and text messages."
    );
    suggestions.push(
      "Before filing, gather any texts, emails, photos, receipts, or bank statements related to your dispute. Even partial records can help."
    );
  }

  if (answers.defendantLocatable === "no") {
    warnings.push(
      "You must be able to serve the defendant with court papers. Without a known address, you cannot proceed. Consider using a skip-tracing service or checking public records."
    );
    suitable = false;
  } else if (answers.defendantLocatable === "unsure") {
    suggestions.push(
      "You'll need the defendant's current address for service. Check social media, business registrations (Wyoming Secretary of State), or white pages before filing."
    );
  }

  if (suitable && warnings.length === 0) {
    suggestions.push(
      "Your situation appears well-suited for Wyoming small claims court. Continue to the case analysis for a detailed assessment."
    );
  }

  return { suitable, warnings, suggestions };
}

export function TriageScreener({ onComplete, onSkip }: TriageScreenerProps) {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Partial<TriageAnswers>>({});
  const [result, setResult] = useState<TriageResult | null>(null);

  const question = QUESTIONS[currentQuestion];
  const totalQuestions = QUESTIONS.length;
  const progress = ((currentQuestion + (result ? 1 : 0)) / totalQuestions) * 100;

  function handleSelect(value: string) {
    const updated = { ...answers, [question.id]: value } as Partial<TriageAnswers>;
    setAnswers(updated);

    if (currentQuestion < totalQuestions - 1) {
      setCurrentQuestion((prev) => prev + 1);
    } else {
      const triageResult = evaluateAnswers(updated as TriageAnswers);
      setResult(triageResult);
    }
  }

  if (result) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div
            className={`mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full ${
              result.suitable
                ? "bg-emerald-100 dark:bg-emerald-900/30"
                : "bg-amber-100 dark:bg-amber-900/30"
            }`}
          >
            {result.suitable ? (
              <svg
                className="h-7 w-7 text-emerald-600 dark:text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg
                className="h-7 w-7 text-amber-600 dark:text-amber-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            )}
          </div>
          <h2 className="mt-4 text-xl font-bold text-zinc-900 dark:text-zinc-100">
            {result.suitable
              ? "Your case looks suitable for small claims court"
              : "There are some things to consider first"}
          </h2>
        </div>

        {result.warnings.length > 0 && (
          <div className="space-y-2">
            {result.warnings.map((w, i) => (
              <div
                key={`warn-${i}`}
                className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/20"
              >
                <svg
                  className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01"
                  />
                </svg>
                <p className="text-sm text-amber-800 dark:text-amber-300">{w}</p>
              </div>
            ))}
          </div>
        )}

        {result.suggestions.length > 0 && (
          <div className="space-y-2">
            {result.suggestions.map((s, i) => (
              <div
                key={`sug-${i}`}
                className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/20"
              >
                <svg
                  className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-sm text-blue-800 dark:text-blue-300">{s}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            className="rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            onClick={() => onComplete(result)}
          >
            {result.suitable
              ? "Continue to case analysis"
              : "Proceed anyway (educational purposes)"}
          </button>
          <button
            type="button"
            className="rounded-lg border border-zinc-300 px-6 py-2.5 text-sm font-semibold transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            onClick={() => {
              setResult(null);
              setCurrentQuestion(0);
              setAnswers({});
            }}
          >
            Start over
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          Quick case check
        </h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Answer {totalQuestions} quick questions to see if small claims court is right
          for your situation.
        </p>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div
          className="h-full rounded-full bg-zinc-900 transition-all duration-300 dark:bg-zinc-100"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Question */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Question {currentQuestion + 1} of {totalQuestions}
        </p>
        <p className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {question.question}
        </p>
      </div>

      {/* Options */}
      <div className="space-y-2">
        {question.options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="w-full rounded-lg border border-zinc-200 p-4 text-left text-sm font-medium text-zinc-700 transition-all hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
            onClick={() => handleSelect(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        {currentQuestion > 0 ? (
          <button
            type="button"
            className="text-sm font-semibold text-zinc-500 transition-colors hover:text-zinc-700 dark:hover:text-zinc-300"
            onClick={() => setCurrentQuestion((prev) => prev - 1)}
          >
            Back
          </button>
        ) : (
          <div />
        )}
        <button
          type="button"
          className="text-sm font-semibold text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
          onClick={onSkip}
        >
          Skip screening
        </button>
      </div>
    </div>
  );
}
