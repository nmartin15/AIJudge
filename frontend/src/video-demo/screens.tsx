"use client";

/**
 * TEMPORARY video demo screens. Delete with src/app/demo and this folder.
 */

import { useState } from "react";
import type { DemoOwner } from "@/video-demo/script";
import { type FileReading, type StoredFile, type StoredSide } from "@/video-demo/store";

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
      className="mt-8 rounded-lg bg-wy-navy px-5 py-2.5 text-sm font-semibold text-white hover:bg-wy-navy-light dark:bg-wy-gold dark:text-wy-navy"
      onClick={submit ? undefined : onClick}
    >
      {label}
    </button>
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

export function FileCard({ file }: { file: StoredFile }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-full bg-wy-cream-dark px-3 py-1 text-sm text-wy-navy dark:bg-zinc-800 dark:text-zinc-100"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{file.title}</span>
        <span className="text-xs text-zinc-400">{open ? "Hide" : "Open"}</span>
      </button>
      {open && (
        <ul className="mt-2 space-y-1">
          {file.lines.map((line) => (
            <li key={line} className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ReplyScreen({
  owner,
  other,
  disputes,
  onDisputes,
  onNext,
  nextLabel,
}: {
  owner: DemoOwner;
  other: Omit<StoredSide, "privateGaps">;
  disputes: string[];
  onDisputes: (lines: string[]) => void;
  onNext: () => void;
  nextLabel: string;
}) {
  const name = owner === "alex" ? "Alex" : "Jordan";
  return (
    <div>
      <h1 className="[font-family:var(--font-demo-serif)] text-4xl font-medium tracking-tight text-wy-navy dark:text-white">
        {name} replies
      </h1>
      <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        {name} can read what {other.name} filed. The reply answers only the disputed points.
      </p>

      <ol className="mt-8 space-y-6">
        {other.claims.map((claim) => (
          <li key={claim.id} className="border-t border-wy-navy/10 pt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
              {formatDay(claim.date)}
            </p>
            <p className="mt-2 max-w-3xl text-lg leading-8 text-zinc-800 [font-family:var(--font-demo-serif)] dark:text-zinc-100">
              {claim.text}
            </p>
            {claim.files.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {claim.files.map((file) => (
                  <FileCard key={file.id} file={file} />
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>

      <section className="mt-8 border-t border-wy-navy/10 pt-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
          What {name} disputes
        </h2>
        <ul className="mt-4 space-y-3">
          {disputes.map((line, index) => (
            <li key={`${index}-${line.slice(0, 12)}`}>
              <textarea
                rows={2}
                value={line}
                onChange={(event) =>
                  onDisputes(disputes.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))
                }
                className="w-full resize-none bg-transparent text-base leading-7 text-zinc-800 outline-none dark:text-zinc-100"
              />
            </li>
          ))}
        </ul>
      </section>
      <Advance label={nextLabel} onClick={onNext} />
    </div>
  );
}

export function Decision({ reading, onReplay }: { reading: FileReading; onReplay: () => void }) {
  return (
    <div>
      <h1 className="[font-family:var(--font-demo-serif)] text-4xl font-medium tracking-tight text-wy-navy dark:text-white">
        Decision
      </h1>
      <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-800 [font-family:var(--font-demo-serif)] dark:text-zinc-100">
        {reading.outcome}
      </p>

      <section className="mt-8">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">In the file</h2>
        <ul className="mt-3 space-y-1">
          {reading.filed.map((file) => (
            <li key={`${file.who}-${file.title}`} className="text-sm text-zinc-700 dark:text-zinc-300">
              {file.title}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 max-w-3xl border-t border-wy-navy/10 pt-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
          {reading.statute.citation}
        </h2>
        {reading.statute.paragraphs.map((paragraph) => (
          <p key={paragraph.slice(0, 24)} className="mt-3 text-sm leading-7 text-zinc-700 dark:text-zinc-300">
            {paragraph}
          </p>
        ))}
        <p className="mt-3 text-xs text-zinc-400">{reading.statute.source}</p>
      </section>

      <section className="mt-8">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Still open</h2>
        <ul className="mt-3 space-y-1">
          {reading.openQuestions.map((item) => (
            <li key={item} className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
              {item}
            </li>
          ))}
        </ul>
      </section>
      <Advance label="Play it again" onClick={onReplay} />
    </div>
  );
}
