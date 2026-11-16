"use client";

/**
 * TEMPORARY. The first-visit path for the video demo.
 * A stranger arrives, logs in with the dummy account, and finishes their side.
 */

import { useState } from "react";
import { claimLogin } from "@/video-demo/remote";
import { demoLogin, jordanLogin, type DemoOwner } from "@/video-demo/script";
import { Advance } from "@/video-demo/screens";
import type { StoredSide } from "@/video-demo/store";

export function WelcomeScreen({ onNext }: { onNext: () => void }) {
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight text-wy-navy dark:text-white">
        You were told to check this site.
      </h1>
      <p className="mt-3 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        You have a dispute. The other person has their side of it. This is where each of you writes it down.
      </p>
      <ul className="mt-5 space-y-3">
        <li className="rounded-2xl border border-wy-navy/10 bg-white p-4 text-sm leading-relaxed text-zinc-700 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300">
          You log in, write what happened, and say what you want.
        </li>
        <li className="rounded-2xl border border-wy-navy/10 bg-white p-4 text-sm leading-relaxed text-zinc-700 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300">
          You attach a file to each point. The other person does the same from their own login.
        </li>
        <li className="rounded-2xl border border-wy-navy/10 bg-white p-4 text-sm leading-relaxed text-zinc-700 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300">
          You answer only what you disagree with. Then there is a decision. You do not both have to be here at once.
        </li>
      </ul>
      <Advance label="Log in" onClick={onNext} />
    </div>
  );
}

export function LoginScreen({ onLogin }: { onLogin: (owner: DemoOwner) => void }) {
  const [email, setEmail] = useState(demoLogin.email);
  const [password, setPassword] = useState(demoLogin.password);
  const [error, setError] = useState("");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void claimLogin(email, password).then(onLogin).catch(() => {
          setError("That login is not on this track.");
        });
      }}
    >
      <h1 className="[font-family:var(--font-demo-serif)] text-4xl font-medium tracking-tight text-wy-navy dark:text-white">
        Log in
      </h1>
      <p className="mt-2 max-w-xl text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        Demo account for {demoLogin.name}. The fields are filled. Jordan has a separate login.
      </p>
      <label className="mt-6 block max-w-md">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Email</span>
        <input
          type="email"
          name="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1 w-full border-b border-wy-navy/15 bg-transparent px-0 py-2 text-base text-zinc-800 outline-none dark:text-zinc-100"
        />
      </label>
      <label className="mt-4 block max-w-md">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Password</span>
        <input
          type="text"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1 w-full border-b border-wy-navy/15 bg-transparent px-0 py-2 text-base text-zinc-800 outline-none dark:text-zinc-100"
        />
      </label>
      {error && <p className="mt-3 text-sm text-wy-navy dark:text-wy-gold">{error}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <Advance label="Log in" onClick={() => undefined} submit />
        <button
          type="button"
          className="mt-8 text-sm font-semibold text-wy-navy underline-offset-4 hover:underline dark:text-wy-gold"
          onClick={() => {
            setEmail(jordanLogin.email);
            setPassword(jordanLogin.password);
            setError("");
          }}
        >
          Use Jordan&apos;s login
        </button>
      </div>
    </form>
  );
}

export function HomeScreen({ side, onNext }: { side: StoredSide; onNext: () => void }) {
  const first = side.name.split(" ")[0];
  const saved = side.claims.some((claim) => claim.text.trim().length > 0);
  return (
    <div>
      <p className="text-sm font-medium text-wy-navy dark:text-wy-gold">Signed in as {side.name}</p>
      <h1 className="mt-2 [font-family:var(--font-demo-serif)] text-4xl font-medium tracking-tight text-wy-navy dark:text-white">
        Hello, {first}
      </h1>
      <p className="mt-3 max-w-xl text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        {saved
          ? "Your claim is saved. Open it to keep going."
          : "You don't have a case yet. Starting one keeps it on this page."}
      </p>
      <Advance label={saved ? "Your claim" : "Start a claim"} onClick={onNext} />
    </div>
  );
}

export function DoneScreen({
  side,
  onNext,
  onOther,
}: {
  side: StoredSide;
  onNext: () => void;
  onOther: () => void;
}) {
  const first = side.name.split(" ")[0];
  const titles = side.claims.flatMap((claim) => claim.files.map((file) => file.title.toLowerCase()));
  return (
    <div>
      <h1 className="[font-family:var(--font-demo-serif)] text-4xl font-medium tracking-tight text-wy-navy dark:text-white">
        {first}, your side is finished.
      </h1>
      <p className="mt-3 max-w-xl text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        You logged in, sent the claim, and attached your files. {side.otherName} does the same thing from their own login. You can leave.
      </p>
      <ul className="mt-5 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
        <li>Signed in as {side.name}</li>
        <li>
          Sent a ${Number(side.amount).toLocaleString("en-US")} claim against {side.otherName}
        </li>
        {titles.length > 0 && <li>Attached {titles.join(", ")}</li>}
      </ul>
      <div className="flex flex-wrap items-center gap-4">
        <Advance label="Skip to both parties" onClick={onNext} />
        <button
          type="button"
          className="mt-8 text-sm font-semibold text-wy-navy underline-offset-4 hover:underline dark:text-wy-gold"
          onClick={onOther}
        >
          Open {side.otherName.split(" ")[0]}&apos;s claim
        </button>
      </div>
    </div>
  );
}

export function BothPartiesScreen({
  alex,
  jordan,
  onNext,
}: {
  alex: StoredSide;
  jordan: StoredSide;
  onNext: () => void;
}) {
  return (
    <div>
      <h1 className="[font-family:var(--font-demo-serif)] text-4xl font-medium tracking-tight text-wy-navy dark:text-white">
        Both parties
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        {jordan.name} logged in the same way and sent their side. From here, each person only answers what they dispute.
      </p>
      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <PartyCard side={alex} />
        <PartyCard side={jordan} />
      </div>
      <Advance label="See what they dispute" onClick={onNext} />
    </div>
  );
}

function PartyCard({ side }: { side: StoredSide }) {
  const files = side.claims.flatMap((claim) => claim.files.map((file) => file.title));
  return (
    <article>
      <h2 className="text-base font-semibold text-wy-navy dark:text-white">{side.name}</h2>
      <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{side.wants}</p>
      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        Filed: {files.length > 0 ? files.join(", ") : "Nothing attached"}
      </p>
    </article>
  );
}
