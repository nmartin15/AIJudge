"use client";

/**
 * TEMPORARY claim track. Delete src/app/demo and src/video-demo together.
 * The claim page and its reading talk to the claim routes, not the wizard.
 */

import { useEffect, useState } from "react";
import { nextDemoStep, type DemoStep } from "@/video-demo/script";
import {
  BothPartiesScreen,
  DoneScreen,
  HomeScreen,
  LoginScreen,
  WelcomeScreen,
} from "@/video-demo/firstVisit";
import { CaseScreen } from "@/video-demo/claimScreen";
import { readClaimReading } from "@/video-demo/remote";
import { Decision, ReplyScreen } from "@/video-demo/screens";
import { sharedSide, useClaimTrack, type FileReading } from "@/video-demo/store";

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

const DEMO_STEPS_NAV = TRAILS.flatMap((group) => group.steps);

function StepNav({ step, onStep }: { step: DemoStep; onStep: (next: DemoStep) => void }) {
  const index = DEMO_STEPS_NAV.findIndex((item) => item.id === step);
  if (index < 0) return null;
  return (
    <nav aria-label="Demo">
      <ol className="flex flex-wrap gap-2">
        {DEMO_STEPS_NAV.map((item, itemIndex) => {
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
  const track = useClaimTrack();
  const state = track.state;

  if (!state) {
    return <div className="mx-auto max-w-6xl px-8 py-8 text-sm text-zinc-500">Loading your claim.</div>;
  }

  const { step, owner, sides } = state;
  const side = owner ? sides[owner] : sides.alex;

  function go(next: DemoStep) {
    track.setStep(next);
  }

  function goNext() {
    const next = nextDemoStep(step);
    if (next) track.setStep(next);
  }

  function openOther() {
    track.assign({ owner: null, step: "login" });
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col px-8 py-8 lg:px-10">
      <StepNav step={step} onStep={go} />

      <div className={step === "submit-alex" ? "mt-6" : "mt-6 rounded-xl bg-white px-8 py-8 shadow-[0_1px_2px_rgba(0,45,98,0.06)] dark:bg-zinc-900 lg:px-12"}>
        {step === "welcome" && <WelcomeScreen onNext={goNext} />}
        {step === "login" && (
          <LoginScreen
            onLogin={(nextOwner) => {
              void track.signIn(nextOwner);
            }}
          />
        )}
        {step === "home" && <HomeScreen side={side} onNext={goNext} />}
        {step === "submit-alex" && owner && (
          <CaseScreen
            side={sides[owner]}
            onChange={track.replaceSide}
            onNext={goNext}
            serverNote={
              state.server === "saved" && state.matterId
                ? `Saved on the server. Record ${state.matterId}.`
                : state.server === "offline"
                  ? "The server did not keep this change."
                  : "Saving to the server."
            }
          />
        )}
        {step === "alex-done" && <DoneScreen side={side} onNext={goNext} onOther={openOther} />}
        {step === "both-parties" && (
          <BothPartiesScreen alex={sides.alex} jordan={sides.jordan} onNext={goNext} />
        )}
        {step === "alex-reply" && (
          <ReplyScreen
            owner="alex"
            other={sharedSide(sides.jordan)}
            disputes={sides.alex.disputes}
            onDisputes={(disputes) => track.replaceSide({ ...sides.alex, disputes })}
            onNext={goNext}
            nextLabel={NEXT_LABEL["alex-reply"]}
          />
        )}
        {step === "jordan-reply" && (
          <ReplyScreen
            owner="jordan"
            other={sharedSide(sides.alex)}
            disputes={sides.jordan.disputes}
            onDisputes={(disputes) => track.replaceSide({ ...sides.jordan, disputes })}
            onNext={goNext}
            nextLabel={NEXT_LABEL["jordan-reply"]}
          />
        )}
        {step === "decision" && (
          <ServerDecision
            matterId={state.matterId}
            offline={state.server === "offline"}
            onReplay={() => {
              track.assign({ owner: null, step: "welcome" });
            }}
          />
        )}
      </div>
    </div>
  );
}

function ServerDecision({
  matterId,
  offline,
  onReplay,
}: {
  matterId?: string | null;
  offline: boolean;
  onReplay: () => void;
}) {
  const [reading, setReading] = useState<FileReading | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!matterId) return;
    let cancel = false;
    setFailed(false);
    readClaimReading(matterId)
      .then((next) => {
        if (!cancel) setReading(next);
      })
      .catch(() => {
        if (!cancel) setFailed(true);
      });
    return () => {
      cancel = true;
    };
  }, [matterId]);

  if (failed || (!matterId && offline)) {
    return <p className="text-base text-zinc-600 dark:text-zinc-300">The server did not produce a reading.</p>;
  }
  if (!reading) {
    return <p className="text-base text-zinc-600 dark:text-zinc-300">The server is reading the file.</p>;
  }
  return <Decision reading={reading} onReplay={onReplay} />;
}
