"use client";

/**
 * TEMPORARY. The one-page claim. Delete with the rest of the demo track.
 */

import { useRef, useState } from "react";
import {
  addClaim,
  amountOverCap,
  attachFiles,
  DEPOSIT_CAP,
  removeClaim,
  removeFile,
  type StoredFile,
  type StoredSide,
} from "@/video-demo/store";

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
  value,
  onChange,
  prefix,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  prefix?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">{label}</span>
      <span className="mt-2 flex items-baseline border-b border-wy-navy/15 pb-1.5 dark:border-white/15">
        {prefix && <span className="pr-1 text-base text-zinc-400">{prefix}</span>}
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full bg-transparent text-base text-zinc-900 outline-none dark:text-zinc-100"
        />
      </span>
    </label>
  );
}

async function ingestFile(file: File): Promise<StoredFile> {
  const asText =
    file.type.startsWith("text") || /\.(txt|csv|md)$/i.test(file.name) ? await file.text() : "";
  const lines = asText
    ? asText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 40)
    : [file.name, file.type || "file", `${file.size} bytes`];
  return {
    id: `file-${file.name}-${file.size}-${file.lastModified}`,
    title: file.name,
    kind: file.type || "file",
    lines,
  };
}

export function CaseScreen({
  side,
  onChange,
  onNext,
  serverNote,
}: {
  side: StoredSide;
  onChange: (next: StoredSide) => void;
  onNext: () => void;
  serverNote?: string;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const targetClaim = useRef<string | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const over = amountOverCap(side.amount);

  function patch(partial: Partial<StoredSide>) {
    onChange({ ...side, ...partial });
  }

  function openPicker(claimId: string) {
    targetClaim.current = claimId;
    picker.current?.click();
  }

  async function onPicked(list: FileList | null) {
    const claimId = targetClaim.current;
    if (!claimId || !list || list.length === 0) return;
    const files = await Promise.all([...list].map(ingestFile));
    onChange(attachFiles(side, claimId, files));
    if (picker.current) picker.current.value = "";
  }

  return (
    <form
      className="rounded-xl bg-white px-8 py-8 shadow-[0_1px_2px_rgba(0,45,98,0.06)] dark:bg-zinc-900 lg:px-12"
      onSubmit={(event) => {
        event.preventDefault();
        if (!over) onNext();
      }}
    >
      <input
        ref={picker}
        type="file"
        multiple
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => void onPicked(event.target.files)}
      />
      <div className="flex items-start justify-between gap-8">
        <div>
          <h1 className="[font-family:var(--font-demo-serif)] text-4xl font-medium tracking-tight text-wy-navy dark:text-white">
            Your claim
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Security deposit, Wyoming. This track stops at ${DEPOSIT_CAP.toLocaleString("en-US")}.
          </p>
          {serverNote && <p className="mt-1 text-sm text-zinc-500">{serverNote}</p>}
        </div>
        <button
          type="submit"
          disabled={over}
          className="shrink-0 rounded-lg bg-wy-navy px-5 py-2.5 text-sm font-semibold text-white hover:bg-wy-navy-light disabled:cursor-not-allowed disabled:opacity-40 dark:bg-wy-gold dark:text-wy-navy"
        >
          Send case
        </button>
      </div>

      <div className="mt-8 grid grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_8rem] items-end gap-x-10">
        <QuietField label="Your name" value={side.name} onChange={(name) => patch({ name })} />
        <QuietField
          label="The other person"
          value={side.otherName}
          onChange={(otherName) => patch({ otherName })}
        />
        <QuietField
          label="Amount"
          value={side.amount}
          prefix="$"
          onChange={(amount) => patch({ amount })}
        />
      </div>
      <div className="mt-6 max-w-2xl">
        <QuietField label="What you want" value={side.wants} onChange={(wants) => patch({ wants })} />
      </div>
      {over && (
        <p className="mt-4 text-sm text-wy-navy dark:text-wy-gold">
          ${DEPOSIT_CAP.toLocaleString("en-US")} is the top of this track. Lower the amount to send it.
        </p>
      )}

      <ol className="mt-4">
        {side.claims.map((claim, index) => (
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
                  value={claim.text}
                  autoFocus={claim.id === freshId}
                  placeholder="Write what happened"
                  onChange={(event) =>
                    patch({
                      claims: side.claims.map((item) =>
                        item.id === claim.id ? { ...item, text: event.target.value } : item,
                      ),
                    })
                  }
                  className="w-full resize-none bg-transparent py-0.5 text-lg leading-8 text-zinc-900 outline-none placeholder:text-zinc-300 [font-family:var(--font-demo-serif)] dark:text-zinc-100"
                />
              </label>
              <div className="mt-3 flex flex-wrap items-start gap-2">
                <button
                  type="button"
                  aria-label="Attach a document"
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm text-zinc-500 hover:bg-wy-navy/5 hover:text-wy-navy dark:hover:text-wy-gold"
                  onClick={() => openPicker(claim.id)}
                >
                  <PaperclipIcon />
                  {claim.files.length === 0 ? "Attach" : "Attach another"}
                </button>
                {claim.files.map((file) => (
                  <span
                    key={file.id}
                    className="inline-flex items-center gap-2 rounded-full bg-wy-cream-dark px-3 py-1 text-sm text-wy-navy dark:bg-zinc-800 dark:text-zinc-100"
                  >
                    <span>{file.title}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${file.title}`}
                      className="text-xs text-zinc-400 hover:text-wy-navy"
                      onClick={() => onChange(removeFile(side, claim.id, file.id))}
                    >
                      Remove
                    </button>
                  </span>
                ))}
              </div>
            </div>
            <div>
              <label className="group relative block cursor-pointer pt-1 text-left">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Date
                </span>
                <span className="mt-2 block pb-1.5 text-left text-sm tabular-nums text-zinc-800 dark:text-zinc-100">
                  {formatDay(claim.date)}
                </span>
                <input
                  type="date"
                  aria-label="Date"
                  value={claim.date}
                  onChange={(event) =>
                    patch({
                      claims: side.claims.map((item) =>
                        item.id === claim.id ? { ...item, date: event.target.value } : item,
                      ),
                    })
                  }
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
              <button
                type="button"
                className="mt-3 text-xs font-semibold text-zinc-400 hover:text-wy-navy"
                onClick={() => onChange(removeClaim(side, claim.id))}
              >
                Remove claim
              </button>
            </div>
          </li>
        ))}
      </ol>
      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_9.5rem] border-t border-wy-navy/10 dark:border-white/10">
        <span />
        <button
          type="button"
          className="inline-flex items-center gap-3 py-5 text-sm font-semibold text-wy-navy dark:text-wy-gold"
          onClick={() => {
            const id = `added-${side.claims.length + 1}`;
            setFreshId(id);
            onChange(addClaim(side, new Date(), id));
          }}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-wy-navy/25 text-lg leading-none">
            +
          </span>
          Add a claim
        </button>
      </div>

      {side.privateGaps.length > 0 && (
        <section className="mt-2 border-t border-wy-navy/10 pt-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Only on your screen
          </h2>
          <ul className="mt-3 space-y-1">
            {side.privateGaps.map((gap) => (
              <li key={gap} className="text-sm text-zinc-600 dark:text-zinc-300">
                {gap}
              </li>
            ))}
          </ul>
        </section>
      )}
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
