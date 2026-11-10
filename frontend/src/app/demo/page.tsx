"use client";

/**
 * TEMPORARY video demo. Delete src/app/demo and src/video-demo together.
 * This page does not use the backend.
 *
 * Opens as a first visit: welcome, dummy login, an empty home, one
 * finished side, then a skip to both parties.
 */

import { useState } from "react";
import { nextDemoStep, type DemoStep } from "@/video-demo/script";
import {
  BothPartiesScreen,
  DoneScreen,
  HomeScreen,
  LoginScreen,
  WelcomeScreen,
} from "@/video-demo/firstVisit";
import {
  CaseScreen,
  Decision,
  ReplyScreen,
} from "@/video-demo/screens";

const NEXT_LABEL = {
  "alex-reply": "See what Jordan disputes",
  "jordan-reply": "Read the decision",
} as const;

const TRAILS: { label: string; steps: { id: DemoStep; label: string }[] }[] = [
  {
    label: "First visit",
    steps: [
      { id: "welcome", label: "Welcome" },
      { id: "login", label: "Log in" },
      { id: "home", label: "Home" },
    ],
  },
  {
    label: "Your case",
    steps: [
      { id: "submit-alex", label: "Claim" },
      { id: "alex-done", label: "Done" },
    ],
  },
  {
    label: "Both parties",
    steps: [
      { id: "both-parties", label: "Both" },
      { id: "alex-reply", label: "Alex" },
      { id: "jordan-reply", label: "Jordan" },
      { id: "decision", label: "Decision" },
    ],
  },
];

function StepNav({ step, onStep }: { step: DemoStep; onStep: (next: DemoStep) => void }) {
  const trail = TRAILS.find((group) => group.steps.some((item) => item.id === step));
  if (!trail) return null;
  const index = trail.steps.findIndex((item) => item.id === step);
  return (
    <nav aria-label={trail.label}>
      <p className="text-xs font-semibold uppercase tracking-widest text-wy-navy/70 dark:text-wy-gold">
        {trail.label}
      </p>
      <ol className="mt-3 flex flex-wrap gap-2">
        {trail.steps.map((item, itemIndex) => {
          const current = itemIndex === index;
          const done = itemIndex < index;
          return (
            <li key={item.id}>
              <button
                type="button"
                disabled={itemIndex > index}
                onClick={() => onStep(item.id)}
                aria-current={current ? "step" : undefined}
                className={
                  current
                    ? "rounded-full bg-wy-navy px-3 py-1 text-xs font-semibold text-white dark:bg-wy-gold dark:text-wy-navy"
                    : done
                      ? "rounded-full border border-wy-navy/25 px-3 py-1 text-xs font-semibold text-wy-navy hover:bg-white dark:border-white/20 dark:text-white"
                      : "cursor-default rounded-full px-3 py-1 text-xs font-semibold text-zinc-400"
                }
              >
                {itemIndex + 1}. {item.label}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default function VideoDemoPage() {
  const [step, setStep] = useState<DemoStep>("welcome");

  function goNext() {
    const next = nextDemoStep(step);
    if (next) setStep(next);
  }

  const wide = step === "submit-alex";

  return (
    <div
      className={
        wide
          ? "mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col px-8 py-8 lg:px-10"
          : "mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl flex-col px-4 py-6 sm:px-6 sm:py-8"
      }
    >
      <StepNav step={step} onStep={setStep} />

      <div className="mt-6 flex-1">
        {step === "welcome" && <WelcomeScreen onNext={goNext} />}
        {step === "login" && <LoginScreen onNext={goNext} />}
        {step === "home" && <HomeScreen onNext={goNext} />}
        {step === "submit-alex" && <CaseScreen onNext={goNext} />}
        {step === "alex-done" && <DoneScreen onNext={goNext} />}
        {step === "both-parties" && <BothPartiesScreen onNext={goNext} />}
        {step === "alex-reply" && (
          <ReplyScreen owner="alex" onNext={goNext} nextLabel={NEXT_LABEL["alex-reply"]} />
        )}
        {step === "jordan-reply" && (
          <ReplyScreen owner="jordan" onNext={goNext} nextLabel={NEXT_LABEL["jordan-reply"]} />
        )}
        {step === "decision" && <Decision onReplay={() => setStep("welcome")} />}
      </div>
    </div>
  );
}
