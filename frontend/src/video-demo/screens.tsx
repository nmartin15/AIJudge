"use client";

/**
 * TEMPORARY video demo screens. Delete with src/app/demo and this folder.
 */

import { useState } from "react";
import {
  accounts,
  alexClaims,
  chanceNotes,
  demoCase,
  DEMO_TODAY,
  demoJudgment,
  filesFromOther,
  filesOwnedBy,
  otherOwner,
  replies,
  stillUncertain,
  type DemoFile,
  type DemoOwner,
} from "@/video-demo/script";

export function money(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function Advance({
  label,
  onClick,
  submit = false,
}: {
  label: string;
  onClick: () => void;
  submit?: boolean;
}) {
  return (
    <button
      type={submit ? "submit" : "button"}
      className="mt-8 w-full rounded-xl bg-wy-navy px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-wy-navy-light dark:bg-wy-gold dark:text-wy-navy dark:hover:bg-wy-gold-light"
      onClick={submit ? undefined : onClick}
    >
      {label}
    </button>
  );
}

function personName(owner: DemoOwner): string {
  return owner === "alex" ? demoCase.plaintiffName : demoCase.defendantName;
}

export function SubmitScreen({ owner, onNext }: { owner: DemoOwner; onNext: () => void }) {
  const account = accounts[owner];
  const name = personName(owner);
  const other = personName(otherOwner(owner));
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onNext();
      }}
    >
      <h1 className="text-3xl font-bold tracking-tight text-wy-navy dark:text-white">
        Submit your claim
      </h1>
      <p className="mt-2 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        Your name, their name, the amount, what happened, and what you want. Then send it.
      </p>

      <div className="mt-5 space-y-4">
        <Field label="Your name" defaultValue={name} />
        <Field label="The other person" defaultValue={other} />
        <Field label="Amount" defaultValue={String(demoCase.amountClaimed)} prefix="$" />
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">What happened</span>
          <textarea
            rows={6}
            defaultValue={account.story}
            className="mt-1 w-full resize-none rounded-xl border border-wy-navy/15 bg-white px-3 py-2.5 text-sm leading-relaxed text-zinc-800 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>
        <Field label="What you want" defaultValue={account.wants} />
      </div>

      <Advance label="Submit case" onClick={() => undefined} submit />
    </form>
  );
}

function Field({
  label,
  defaultValue,
  prefix,
}: {
  label: string;
  defaultValue: string;
  prefix?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{label}</span>
      <span className="mt-1 flex overflow-hidden rounded-xl border border-wy-navy/15 bg-white dark:border-white/15 dark:bg-zinc-900">
        {prefix && (
          <span className="flex items-center px-3 text-sm font-semibold text-zinc-400">{prefix}</span>
        )}
        <input
          defaultValue={defaultValue}
          className="w-full bg-transparent px-3 py-2.5 text-sm text-zinc-800 dark:text-zinc-100"
        />
      </span>
    </label>
  );
}

function formatDay(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric", year: "numeric" },
  );
}

function QuietField({
  label,
  defaultValue,
  prefix,
}: {
  label: string;
  defaultValue: string;
  prefix?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">{label}</span>
      <span className="mt-2 flex items-baseline border-b border-wy-navy/15 pb-1.5 dark:border-white/15">
        {prefix && <span className="pr-1 text-base text-zinc-400">{prefix}</span>}
        <input
          defaultValue={defaultValue}
          className="w-full bg-transparent text-base text-zinc-900 outline-none dark:text-zinc-100"
        />
      </span>
    </label>
  );
}

function ClaimDate({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="group relative block cursor-pointer pt-1 text-left">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
        Date
      </span>
      <span className="mt-2 block border-b border-transparent pb-1.5 text-left text-sm tabular-nums text-zinc-800 group-hover:border-wy-navy/20 dark:text-zinc-100">
        {formatDay(value)}
      </span>
      <input
        type="date"
        aria-label="Date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  );
}

function ClaimFile({ file }: { file: DemoFile }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="max-w-md">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-2 rounded-full bg-wy-cream-dark px-3 py-1 text-sm text-wy-navy hover:bg-wy-navy-50 dark:bg-zinc-800 dark:text-zinc-100"
      >
        <span>{file.title}</span>
        <span className="text-xs text-zinc-400">{open ? "Hide" : "Open"}</span>
      </button>
      {open && (
        <div className="mt-2 rounded-lg bg-wy-cream-dark/70 px-4 py-3 dark:bg-zinc-800">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{file.kind}</p>
          <ul className="mt-1.5 space-y-1">
            {file.lines.map((line) => (
              <li key={line} className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function CaseScreen({ onNext }: { onNext: () => void }) {
  const [claims, setClaims] = useState(() => alexClaims.map((claim) => ({ ...claim })));
  const [freshId, setFreshId] = useState<string | null>(null);
  const [dates, setDates] = useState<Record<string, string>>(() =>
    Object.fromEntries(alexClaims.map((claim) => [claim.id, DEMO_TODAY])),
  );
  const [attached, setAttached] = useState<Record<string, number>>({});

  function attach(claimId: string) {
    setAttached((current) => ({ ...current, [claimId]: (current[claimId] ?? 0) + 1 }));
  }

  function addClaim() {
    const id = `added-${claims.length + 1}`;
    setClaims((current) => [...current, { id, text: "", files: [] }]);
    setDates((current) => ({ ...current, [id]: DEMO_TODAY }));
    setFreshId(id);
  }

  return (
    <form
      className="mt-6 rounded-xl bg-white px-8 py-8 shadow-[0_1px_2px_rgba(0,45,98,0.06)] dark:bg-zinc-900 lg:px-12"
      onSubmit={(event) => {
        event.preventDefault();
        onNext();
      }}
    >
      <div className="flex items-start justify-between gap-8">
        <h1 className="[font-family:var(--font-demo-serif)] text-4xl font-medium tracking-tight text-wy-navy dark:text-white">
          Your claim
        </h1>
        <button
          type="submit"
          className="shrink-0 rounded-lg bg-wy-navy px-5 py-2.5 text-sm font-semibold text-white hover:bg-wy-navy-light dark:bg-wy-gold dark:text-wy-navy"
        >
          Send case
        </button>
      </div>

      <div className="mt-8 grid grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_8rem] items-end gap-x-10">
        <QuietField label="Your name" defaultValue={demoCase.plaintiffName} />
        <QuietField label="The other person" defaultValue={demoCase.defendantName} />
        <QuietField label="Amount" defaultValue={String(demoCase.amountClaimed)} prefix="$" />
      </div>
      <div className="mt-6 max-w-2xl">
        <QuietField label="What you want" defaultValue={accounts.alex.wants} />
      </div>

      <ol className="mt-4">
        {claims.map((claim, index) => {
          const count = attached[claim.id] ?? 0;
          const shown = claim.files.slice(0, count);
          const extras = Math.max(0, count - claim.files.length);
          return (
            <li
              key={claim.id}
              className="grid grid-cols-[2.25rem_minmax(0,1fr)_9.5rem] items-start gap-x-8 border-t border-wy-navy/10 py-5 dark:border-white/10"
            >
              <span className="pt-1 text-sm tabular-nums text-zinc-400">{index + 1}</span>
              <div className="min-w-0">
                <label className="block">
                  <span className="sr-only">Claim {index + 1}</span>
                  <textarea
                    rows={2}
                    defaultValue={claim.text}
                    autoFocus={claim.id === freshId}
                    placeholder="Write what happened"
                    className="w-full resize-none bg-transparent py-0.5 text-lg leading-8 text-zinc-900 outline-none placeholder:text-zinc-300 [font-family:var(--font-demo-serif)] dark:text-zinc-100 dark:placeholder:text-zinc-600"
                  />
                </label>
                <div className="mt-3 flex flex-wrap items-start gap-2">
                  <button
                    type="button"
                    aria-label={count === 0 ? "Attach a document" : "Attach another document"}
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm text-zinc-500 hover:bg-wy-navy/5 hover:text-wy-navy dark:hover:bg-white/5 dark:hover:text-wy-gold"
                    onClick={() => attach(claim.id)}
                  >
                    <PaperclipIcon />
                    {count === 0 ? "Attach" : "Attach another"}
                  </button>
                  {shown.map((file) => (
                    <ClaimFile key={file.id} file={file} />
                  ))}
                  {Array.from({ length: extras }, (_, extra) => (
                    <span
                      key={`${claim.id}-extra-${extra}`}
                      className="inline-flex items-center rounded-full bg-wy-cream-dark px-3 py-1 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      Additional document {extra + 1}
                    </span>
                  ))}
                </div>
              </div>
              <ClaimDate
                value={dates[claim.id] ?? DEMO_TODAY}
                onChange={(next) => setDates((current) => ({ ...current, [claim.id]: next }))}
              />
            </li>
          );
        })}
      </ol>
      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_9.5rem] border-t border-wy-navy/10 dark:border-white/10">
        <span />
        <button
          type="button"
          className="inline-flex items-center gap-3 py-5 text-sm font-semibold text-wy-navy hover:text-wy-navy-light dark:text-wy-gold"
          onClick={addClaim}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-wy-navy/25 text-lg leading-none dark:border-wy-gold/40">
            +
          </span>
          Add a claim
        </button>
      </div>
    </form>
  );
}

function PaperclipIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.82-2.83l8.49-8.48"
      />
    </svg>
  );
}

export function AccountScreen({
  owner,
  onNext,
  nextLabel,
}: {
  owner: DemoOwner;
  onNext: () => void;
  nextLabel: string;
}) {
  const account = accounts[owner];
  const [added, setAdded] = useState(0);
  const nextPoint = account.points[added];
  const finished = added >= account.points.length;

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight text-wy-navy dark:text-white">Add a date</h1>
      <p className="mt-2 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        Put the day in the date box, write what happened, then press Add this date.
      </p>

      {nextPoint && (
        <form
          key={nextPoint.iso + nextPoint.text}
          className="mt-5 space-y-4 rounded-2xl border border-wy-navy/15 bg-white p-4 dark:border-white/15 dark:bg-zinc-900"
          onSubmit={(event) => {
            event.preventDefault();
            setAdded((count) => count + 1);
          }}
        >
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Date</span>
            <input
              type="date"
              name="date"
              required
              defaultValue={nextPoint.iso}
              className="mt-1 w-full rounded-xl border border-wy-navy/15 bg-white px-3 py-2.5 text-sm text-zinc-800 dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              What happened
            </span>
            <textarea
              name="what"
              required
              rows={3}
              defaultValue={nextPoint.text}
              className="mt-1 w-full resize-none rounded-xl border border-wy-navy/15 bg-white px-3 py-2.5 text-sm leading-relaxed text-zinc-800 dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-xl bg-wy-navy px-4 py-3 text-sm font-semibold text-white hover:bg-wy-navy-light dark:bg-wy-gold dark:text-wy-navy"
          >
            Add this date
          </button>
        </form>
      )}

      {added > 0 && (
        <ol className="mt-5 space-y-3">
          {account.points.slice(0, added).map((point) => (
            <li key={point.iso + point.text}>
              <DatedItem date={point.date} iso={point.iso} text={point.text} />
            </li>
          ))}
        </ol>
      )}

      {finished && <Advance label={nextLabel} onClick={onNext} />}
    </div>
  );
}

function DatedItem({ date, iso, text }: { date: string; iso: string; text: string }) {
  const [, month, day] = iso.split("-");
  const monthName = new Date(Number(iso.slice(0, 4)), Number(month) - 1, Number(day))
    .toLocaleString("en-US", { month: "short" })
    .toUpperCase();
  return (
    <article className="flex gap-3 rounded-2xl border border-wy-navy/10 bg-white p-3 dark:border-white/10 dark:bg-zinc-900">
      <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-lg border border-wy-navy/20 bg-wy-cream py-2 text-wy-navy dark:border-white/20 dark:bg-zinc-950 dark:text-white">
        <span className="text-[10px] font-semibold tracking-wide">{monthName}</span>
        <span className="text-lg font-bold leading-none">{Number(day)}</span>
        <span className="text-[10px]">{iso.slice(0, 4)}</span>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{date}</p>
        <p className="mt-1 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{text}</p>
      </div>
    </article>
  );
}

export function ProofScreen({
  owner,
  onNext,
  nextLabel,
}: {
  owner: DemoOwner;
  onNext: () => void;
  nextLabel: string;
}) {
  const name = personName(owner);
  const files = filesOwnedBy(owner).filter((file) => !file.addedOnChance);
  const added = filesOwnedBy(owner).filter((file) => file.addedOnChance);
  const notes = chanceNotes[owner];
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight text-wy-navy dark:text-white">Attach a file</h1>
      <p className="mt-2 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        Each date has one file. Press Attach file on that date. Then press Open file to read it.
      </p>
      <ul className="mt-5 space-y-3">
        {files.map((file) => (
          <li key={file.id}>
            <Attachable file={file} />
          </li>
        ))}
      </ul>

      <section className="mt-6 rounded-2xl border border-wy-gold/50 bg-wy-gold/10 p-4 dark:border-wy-gold/30 dark:bg-wy-gold/5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-wy-navy dark:text-wy-gold">
          Only {name} sees this
        </h2>
        <p className="mt-2 text-sm font-medium text-wy-navy dark:text-white">
          One chance to add what was missing
        </p>
        <ul className="mt-3 space-y-3">
          {notes.map((item) => (
            <li key={item.label} className="rounded-xl bg-white/80 p-3 dark:bg-zinc-900/80">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {item.outcome === "added" ? "Added" : "Not added"}
              </p>
              <p className="mt-1 text-sm font-medium text-wy-navy dark:text-white">{item.label}</p>
              <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{item.note}</p>
              {item.outcome === "added" &&
                added
                  .filter((file) => item.label.toLowerCase().includes(file.title.toLowerCase()))
                  .map((file) => (
                    <div key={file.id} className="mt-3">
                      <FileCard file={file} />
                    </div>
                  ))}
            </li>
          ))}
        </ul>
      </section>
      <Advance label={nextLabel} onClick={onNext} />
    </div>
  );
}

export function ReplyScreen({
  owner,
  onNext,
  nextLabel,
}: {
  owner: DemoOwner;
  onNext: () => void;
  nextLabel: string;
}) {
  const name = personName(owner);
  const other = otherOwner(owner);
  const otherName = personName(other);
  const reply = replies[owner];
  const theirAccount = accounts[other];
  const theirFiles = filesFromOther(owner);
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight text-wy-navy dark:text-white">{name} replies</h1>
      <p className="mt-2 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        {name} can read what {otherName} wrote and open what {otherName} filed. The reply answers only the disputed points.
      </p>

      <section className="mt-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          What {otherName} wrote
        </h2>
        <ul className="mt-3 space-y-3">
          {theirAccount.points.map((point) => (
            <li
              key={point.text}
              className="rounded-2xl border border-wy-navy/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{point.date}</p>
              <p className="mt-1 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{point.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          What {otherName} filed
        </h2>
        <ul className="mt-3 space-y-3">
          {theirFiles.map((file) => (
            <li key={file.id}>
              <FileCard file={file} />
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          What {name} disputes
        </h2>
        <ul className="mt-3 space-y-3">
          {reply.lines.map((line) => (
            <li
              key={line}
              className="rounded-2xl border border-wy-navy/10 bg-white p-4 text-sm leading-relaxed text-zinc-700 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300"
            >
              {line}
            </li>
          ))}
        </ul>
      </section>
      <Advance label={nextLabel} onClick={onNext} />
    </div>
  );
}

function Attachable({ file }: { file: DemoFile }) {
  const [attached, setAttached] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-wy-navy/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{file.when}</p>
          <p className="mt-1 text-sm font-semibold text-wy-navy dark:text-white">{file.point}</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {attached ? "Attached" : "Ready to attach"}: {file.title}
          </p>
        </div>
        {attached ? (
          <button
            type="button"
            className="shrink-0 rounded-lg border border-wy-navy px-3 py-2 text-sm font-semibold text-wy-navy dark:border-wy-gold dark:text-wy-gold"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Hide file" : "Open file"}
          </button>
        ) : (
          <button
            type="button"
            className="shrink-0 rounded-lg bg-wy-navy px-3 py-2 text-sm font-semibold text-white hover:bg-wy-navy-light dark:bg-wy-gold dark:text-wy-navy"
            onClick={() => setAttached(true)}
          >
            Attach file
          </button>
        )}
      </div>
      {open && (
        <div className="mt-3 border-t border-wy-navy/10 pt-3 dark:border-white/10">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{file.kind}</p>
          <ul className="mt-2 space-y-1.5">
            {file.lines.map((line) => (
              <li key={line} className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function FileCard({ file }: { file: DemoFile }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-wy-navy/10 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-900">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 p-4 text-left"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          <span className="block text-xs font-semibold uppercase tracking-wide text-zinc-400">
            {file.point}
          </span>
          <span className="mt-1 block text-base font-semibold text-wy-navy dark:text-white">
            {file.title}
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold text-wy-navy dark:text-wy-gold">
          {open ? "Hide" : "Open"}
        </span>
      </button>
      {open && (
        <div className="border-t border-wy-navy/10 px-4 py-3 dark:border-white/10">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{file.kind}</p>
          <ul className="mt-2 space-y-1.5">
            {file.lines.map((line) => (
              <li key={line} className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function Decision({ onReplay }: { onReplay: () => void }) {
  const conclusion = demoJudgment.conclusionsOfLaw[0];
  return (
    <div>
      <div className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-b from-emerald-50 to-white p-6 text-center dark:border-emerald-800 dark:from-emerald-950/30 dark:to-zinc-900">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
          Decision
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-wy-navy dark:text-white">
          {demoCase.plaintiffName}
        </h1>
        <p className="mt-3 text-4xl font-bold text-zinc-900 dark:text-zinc-100">
          {money(demoJudgment.awardAmount)}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
          {demoCase.defendantName} returns the deposit.
        </p>
      </div>

      <article className="mt-4 rounded-2xl border border-wy-navy/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">What the record shows</h2>
        <ol className="mt-2 list-decimal space-y-2 pl-5">
          {demoJudgment.findingsOfFact.map((finding) => (
            <li key={finding} className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              {finding}
            </li>
          ))}
        </ol>
      </article>

      <article className="mt-3 rounded-2xl border border-wy-navy/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">What decided the deposit</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{conclusion?.text}</p>
        {conclusion?.citation && (
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">{conclusion.citation}</p>
        )}
      </article>

      <article className="mt-3 rounded-2xl border border-wy-navy/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Still uncertain</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          {stillUncertain.map((item) => (
            <li key={item} className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              {item}
            </li>
          ))}
        </ul>
      </article>

      <Advance label="Play it again" onClick={onReplay} />
    </div>
  );
}
