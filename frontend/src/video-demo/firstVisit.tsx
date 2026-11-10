"use client";

/**
 * TEMPORARY. The first-visit path for the video demo.
 * A stranger arrives, logs in with the dummy account, and finishes their side.
 */

import { accounts, demoCase, demoLogin, filesOwnedBy } from "@/video-demo/script";
import { Advance } from "@/video-demo/screens";

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

export function LoginScreen({ onNext }: { onNext: () => void }) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onNext();
      }}
    >
      <h1 className="text-3xl font-bold tracking-tight text-wy-navy dark:text-white">Log in</h1>
      <p className="mt-2 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        Demo account for {demoLogin.name}. The fields are filled. Send it.
      </p>
      <label className="mt-5 block">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Email</span>
        <input
          type="email"
          name="email"
          autoComplete="username"
          defaultValue={demoLogin.email}
          className="mt-1 w-full rounded-xl border border-wy-navy/15 bg-white px-3 py-2.5 text-sm text-zinc-800 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </label>
      <label className="mt-4 block">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Password</span>
        <input
          type="text"
          name="password"
          autoComplete="current-password"
          defaultValue={demoLogin.password}
          className="mt-1 w-full rounded-xl border border-wy-navy/15 bg-white px-3 py-2.5 text-sm text-zinc-800 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </label>
      <Advance label="Log in" onClick={() => undefined} submit />
    </form>
  );
}

export function HomeScreen({ onNext }: { onNext: () => void }) {
  return (
    <div>
      <p className="text-sm font-medium text-wy-navy dark:text-wy-gold">Signed in as {demoLogin.email}</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-wy-navy dark:text-white">
        Hello, {demoLogin.name.split(" ")[0]}
      </h1>
      <p className="mt-3 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        You don&apos;t have a case yet. Starting one keeps it on this page.
      </p>
      <div className="mt-5 rounded-2xl border border-dashed border-wy-navy/30 bg-white p-5 dark:border-white/20 dark:bg-zinc-900">
        <p className="text-sm font-semibold text-wy-navy dark:text-white">No cases yet</p>
        <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
          A claim is your name, their name, the amount, what happened, and what you want.
        </p>
      </div>
      <Advance label="Start a claim" onClick={onNext} />
    </div>
  );
}

export function DoneScreen({ onNext }: { onNext: () => void }) {
  const first = demoLogin.name.split(" ")[0];
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight text-wy-navy dark:text-white">
        {first}, your side is finished.
      </h1>
      <p className="mt-3 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        You logged in, sent the claim, and attached your files. {demoCase.defendantName} does the same thing from their own login. You can leave.
      </p>
      <ul className="mt-5 space-y-2">
        <li className="rounded-2xl bg-white px-4 py-3 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          Logged in as {demoLogin.email}
        </li>
        <li className="rounded-2xl bg-white px-4 py-3 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          Sent a {demoCase.amountClaimed.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} claim against {demoCase.defendantName}
        </li>
        <li className="rounded-2xl bg-white px-4 py-3 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          Attached {filesOwnedBy("alex").filter((file) => !file.addedOnChance).map((file) => file.title.toLowerCase()).join(" and ")}
        </li>
      </ul>
      <Advance label="Skip to both parties" onClick={onNext} />
    </div>
  );
}

export function BothPartiesScreen({ onNext }: { onNext: () => void }) {
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight text-wy-navy dark:text-white">Both parties</h1>
      <p className="mt-3 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        {demoCase.defendantName} logged in the same way and sent their side. From here, each person only answers what they dispute.
      </p>
      <div className="mt-5 space-y-3">
        <PartyCard
          name={demoCase.plaintiffName}
          wants={accounts.alex.wants}
          files={filesOwnedBy("alex").map((file) => file.title)}
        />
        <PartyCard
          name={demoCase.defendantName}
          wants={accounts.jordan.wants}
          files={filesOwnedBy("jordan").map((file) => file.title)}
        />
      </div>
      <Advance label="See what they dispute" onClick={onNext} />
    </div>
  );
}

function PartyCard({ name, wants, files }: { name: string; wants: string; files: string[] }) {
  return (
    <article className="rounded-2xl border border-wy-navy/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
      <h2 className="text-base font-semibold text-wy-navy dark:text-white">{name}</h2>
      <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{wants}</p>
      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        Filed: {files.join(", ")}
      </p>
    </article>
  );
}
