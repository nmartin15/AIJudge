"use client";

/**
 * TEMPORARY claim track. The page edits map onto claim and file routes.
 * Delete with src/app/demo and the rest of src/video-demo.
 * It does not write the wizard, hearing, or pipeline tables.
 */

import { useEffect, useRef, useState } from "react";
import {
  createClaim,
  createClaimFile,
  claimToken,
  createClaimMatter,
  deleteClaim,
  deleteClaimFile,
  moveClaimMatter,
  patchClaimHeader,
  readClaimMatter,
  updateClaim,
} from "@/video-demo/remote";
import {
  accounts,
  alexClaims,
  chanceNotes,
  demoCase,
  demoFiles,
  replies,
  type DemoFile,
  type DemoOwner,
  type DemoStep,
} from "@/video-demo/script";

export const DEPOSIT_CAP = 6000;
const STORAGE_KEY = "wy-claim-track-v1";

/** Verbatim from the 2026 Wyoming Statutes compilation, W.S. 1-21-1208. */
export const STATUTE_1208 = {
  citation: "W.S. 1-21-1208",
  source: "2026 Wyoming Statutes, statutes.wyoleg.gov",
  paragraphs: [
    "(a) Upon termination of the rental agreement, property or money held as a deposit may be applied by the owner or his agent to the payment of accrued rent, damages to the residential rental unit beyond reasonable wear and tear, the cost to clean the unit to the condition at the beginning of the rental agreement and to other costs provided by any contract. The balance of any deposit and prepaid rent and a written itemization of any deductions from the deposit together with reasons therefor, shall be delivered or mailed without interest to the renter within thirty (30) days after termination of the rental agreement or within fifteen (15) days after receipt of the renter's new mailing address, whichever is later. If there is damage to the residential rental unit, this period shall be extended by thirty (30) days. The renter shall within thirty (30) days of termination of the rental agreement, notify the owner or designated agent of the location where payment and notice may be made or mailed.",
    "(c) If the owner of a residential rental unit or his agent unreasonably fails to comply with subsection (a) or (b) of this section, the renter may recover the full deposit and court costs.",
  ],
};

export interface StoredFile {
  id: string;
  title: string;
  kind: string;
  lines: string[];
}

export interface StoredClaim {
  id: string;
  text: string;
  date: string;
  files: StoredFile[];
}

export interface StoredSide {
  owner: DemoOwner;
  name: string;
  otherName: string;
  amount: string;
  wants: string;
  claims: StoredClaim[];
  privateGaps: string[];
  disputes: string[];
}

export interface TrackState {
  step: DemoStep;
  owner: DemoOwner | null;
  sides: Record<DemoOwner, StoredSide>;
  matterId?: string | null;
  server?: "saving" | "saved" | "offline";
}

export interface FileReading {
  overCap: boolean;
  amount: number;
  plaintiff: string;
  defendant: string;
  filed: { who: string; title: string }[];
  itemizationFiled: boolean;
  billFiled: boolean;
  outcome: string;
  openQuestions: string[];
  statute: { citation: string; source: string; paragraphs: string[] };
}

export function todayISO(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function amountOverCap(amount: string): boolean {
  const value = Number(amount);
  return Number.isFinite(value) && value > DEPOSIT_CAP;
}

function toStoredFile(file: DemoFile): StoredFile {
  return { id: file.id, title: file.title, kind: file.kind, lines: file.lines };
}

function leftOpen(owner: DemoOwner): string[] {
  return chanceNotes[owner].filter((note) => note.outcome === "left-open").map((note) => note.label);
}

function claimsFor(owner: DemoOwner): StoredClaim[] {
  if (owner === "alex") {
    return alexClaims.map((claim) => ({
      id: claim.id,
      text: claim.text,
      date: accounts.alex.points.find((point) => point.text === claim.text)?.iso ?? todayISO(),
      files: claim.files.map(toStoredFile),
    }));
  }
  const photos = demoFiles.find((file) => file.id === "photos");
  return accounts.jordan.points.map((point, index) => ({
    id: `jordan-${index + 1}`,
    text: point.text,
    date: point.iso,
    files: photos && /photo/i.test(point.text) ? [toStoredFile(photos)] : [],
  }));
}

export function seedSide(owner: DemoOwner): StoredSide {
  const alex = owner === "alex";
  return {
    owner,
    name: alex ? demoCase.plaintiffName : demoCase.defendantName,
    otherName: alex ? demoCase.defendantName : demoCase.plaintiffName,
    amount: String(demoCase.amountClaimed),
    wants: accounts[owner].wants,
    claims: claimsFor(owner),
    privateGaps: leftOpen(owner),
    disputes: replies[owner].lines,
  };
}

export function seedTrack(): TrackState {
  return {
    step: "welcome",
    owner: null,
    sides: { alex: seedSide("alex"), jordan: seedSide("jordan") },
  };
}

/** What the other person is allowed to read. Private gaps stay off. */
export function sharedSide(side: StoredSide): Omit<StoredSide, "privateGaps"> {
  return {
    owner: side.owner,
    name: side.name,
    otherName: side.otherName,
    amount: side.amount,
    wants: side.wants,
    claims: side.claims,
    disputes: side.disputes,
  };
}

export function addClaim(side: StoredSide, now = new Date(), id?: string): StoredSide {
  return {
    ...side,
    claims: [
      ...side.claims,
      { id: id ?? `added-${side.claims.length + 1}-${todayISO(now)}`, text: "", date: todayISO(now), files: [] },
    ],
  };
}

export function removeClaim(side: StoredSide, claimId: string): StoredSide {
  return { ...side, claims: side.claims.filter((claim) => claim.id !== claimId) };
}

export function attachFiles(side: StoredSide, claimId: string, files: StoredFile[]): StoredSide {
  return {
    ...side,
    claims: side.claims.map((claim) =>
      claim.id === claimId ? { ...claim, files: [...claim.files, ...files] } : claim,
    ),
  };
}

export function removeFile(side: StoredSide, claimId: string, fileId: string): StoredSide {
  return {
    ...side,
    claims: side.claims.map((claim) =>
      claim.id === claimId ? { ...claim, files: claim.files.filter((file) => file.id !== fileId) } : claim,
    ),
  };
}

function fileBlob(file: StoredFile): string {
  return `${file.title} ${file.kind} ${file.lines.join(" ")}`;
}

export function readFile(sides: Record<DemoOwner, StoredSide>): FileReading {
  const alex = sides.alex;
  const jordan = sides.jordan;
  const amount = Number(alex.amount);
  const filed = [...alex.claims, ...jordan.claims].flatMap((claim) =>
    claim.files.map((file) => ({ who: claim.text.slice(0, 48), title: file.title })),
  );
  const blob = [...alex.claims, ...jordan.claims]
    .flatMap((claim) => claim.files.map(fileBlob))
    .join(" ");
  const itemizationFiled = /itemiz/i.test(blob);
  const billFiled = /invoice|receipt|\bbill\b/i.test(blob);
  const overCap = amountOverCap(alex.amount);
  const openQuestions = [
    "Whether the carpet patches were beyond reasonable wear and tear.",
    "Whether the owner unreasonably failed to comply with the itemization deadline in the statute quoted here.",
  ];
  if (!billFiled) {
    openQuestions.push("What the cleaning and carpet work cost. No bill is in the file.");
  }
  let outcome = `${alex.name} and ${jordan.name} both have a side in the file.`;
  if (overCap) {
    outcome = `This track stops at $${DEPOSIT_CAP.toLocaleString("en-US")}. No award is read from an amount above that.`;
  } else if (!itemizationFiled && Number.isFinite(amount)) {
    outcome = `Reading of this file: the $${amount.toLocaleString("en-US")} deposit returns to ${alex.name}. The written itemization is not in the file.`;
  } else if (itemizationFiled) {
    outcome = "An itemization is in the file. This reading does not turn the photos into a winner by themselves.";
  }
  return {
    overCap,
    amount: Number.isFinite(amount) ? amount : 0,
    plaintiff: alex.name,
    defendant: jordan.name,
    filed,
    itemizationFiled,
    billFiled,
    outcome,
    openQuestions,
    statute: STATUTE_1208,
  };
}

function uniqueClaims(claims: StoredClaim[]): StoredClaim[] {
  const seen = new Set<string>();
  const unique: StoredClaim[] = [];
  for (const claim of claims) {
    if (seen.has(claim.id)) continue;
    seen.add(claim.id);
    unique.push(claim);
  }
  return unique;
}

function uniqueSides(sides: Record<DemoOwner, StoredSide>): Record<DemoOwner, StoredSide> {
  return {
    alex: { ...sides.alex, claims: uniqueClaims(sides.alex.claims) },
    jordan: { ...sides.jordan, claims: uniqueClaims(sides.jordan.claims) },
  };
}

export function loadTrack(): TrackState {
  if (typeof localStorage === "undefined") return seedTrack();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedTrack();
    const parsed = JSON.parse(raw) as TrackState;
    if (!parsed?.sides?.alex?.claims || !parsed?.sides?.jordan?.claims) return seedTrack();
    return { ...parsed, sides: uniqueSides(parsed.sides) };
  } catch {
    return seedTrack();
  }
}

export function saveTrack(state: TrackState): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function recordSignature(state: TrackState): string {
  return JSON.stringify({ step: state.step, owner: state.owner, sides: state.sides });
}

export type SideWrite =
  | { op: "patch-side" }
  | { op: "create-claim"; claim: StoredClaim }
  | { op: "update-claim"; claim: StoredClaim }
  | { op: "delete-claim"; id: string }
  | { op: "create-file"; claimId: string; file: StoredFile }
  | { op: "delete-file"; claimId: string; fileId: string };

function sameList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

/** The writes that turn one saved side into the side now on the page. */
export function planSideWrites(before: StoredSide, after: StoredSide): SideWrite[] {
  const writes: SideWrite[] = [];
  const headerChanged =
    before.name !== after.name ||
    before.otherName !== after.otherName ||
    before.amount !== after.amount ||
    before.wants !== after.wants ||
    !sameList(before.privateGaps, after.privateGaps) ||
    !sameList(before.disputes, after.disputes);
  if (headerChanged) writes.push({ op: "patch-side" });

  const priorClaims = new Map(before.claims.map((claim) => [claim.id, claim]));
  const nextIds = new Set(after.claims.map((claim) => claim.id));
  for (const claim of before.claims) {
    if (!nextIds.has(claim.id)) writes.push({ op: "delete-claim", id: claim.id });
  }
  for (const claim of after.claims) {
    const prior = priorClaims.get(claim.id);
    if (!prior) {
      writes.push({ op: "create-claim", claim: { ...claim, files: [] } });
      for (const file of claim.files) writes.push({ op: "create-file", claimId: claim.id, file });
      continue;
    }
    if (prior.text !== claim.text || prior.date !== claim.date) {
      writes.push({ op: "update-claim", claim });
    }
    const priorFiles = new Set(prior.files.map((file) => file.id));
    const nextFiles = new Set(claim.files.map((file) => file.id));
    for (const file of prior.files) {
      if (!nextFiles.has(file.id)) writes.push({ op: "delete-file", claimId: claim.id, fileId: file.id });
    }
    for (const file of claim.files) {
      if (!priorFiles.has(file.id)) writes.push({ op: "create-file", claimId: claim.id, file });
    }
  }
  return writes;
}

async function applySideWrites(matterId: string, side: StoredSide, writes: SideWrite[]): Promise<void> {
  for (const write of writes) {
    if (write.op === "patch-side") await patchClaimHeader(matterId, side);
    else if (write.op === "create-claim") await createClaim(matterId, side.owner, write.claim);
    else if (write.op === "update-claim") await updateClaim(matterId, side.owner, write.claim);
    else if (write.op === "delete-claim") await deleteClaim(matterId, side.owner, write.id);
    else if (write.op === "create-file") await createClaimFile(matterId, side.owner, write.claimId, write.file);
    else await deleteClaimFile(matterId, side.owner, write.claimId, write.fileId);
  }
}

export function useClaimTrack() {
  const [state, setState] = useState<TrackState | null>(null);
  const sent = useRef("");
  const synced = useRef<TrackState | null>(null);
  const creating = useRef(false);
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    const local = loadTrack();
    if (!claimToken()) {
      setState({ ...local, step: local.step === "welcome" ? "welcome" : "login", owner: null });
      return;
    }
    if (!local.matterId) {
      setState(local);
      return;
    }
    readClaimMatter(local.matterId)
      .then((remote) => {
        const next: TrackState = {
          ...local,
          step: remote.step ?? local.step,
          owner: remote.owner ?? local.owner,
          matterId: remote.id,
          server: "saved",
        };
        synced.current = next;
        sent.current = recordSignature(next);
        setState(next);
      })
      .catch(() => setState({ ...local, server: "offline" }));
  }, []);

  useEffect(() => {
    if (!state) return;
    saveTrack(state);
    const signature = recordSignature(state);
    if (sent.current === signature) return;
    const snapshot = state;
    const handle = window.setTimeout(() => {
      void syncClaim(snapshot);
    }, 350);
    return () => window.clearTimeout(handle);
  }, [state]);

  async function syncClaim(snapshot: TrackState) {
    try {
      if (!snapshot.matterId) {
        if (creating.current) return;
        creating.current = true;
        try {
          const created = await createClaimMatter(snapshot);
          const saved = {
            ...snapshot,
            sides: created.sides ? uniqueSides(created.sides) : snapshot.sides,
            matterId: created.id,
            server: "saved" as const,
          };
          synced.current = saved;
          sent.current = recordSignature(saved);
          setState((current) =>
            current ? { ...current, sides: saved.sides, matterId: created.id, server: "saved" } : current,
          );
        } finally {
          creating.current = false;
        }
        return;
      }
      const base = synced.current;
      if (snapshot.owner && base) {
        const writes = planSideWrites(base.sides[snapshot.owner], snapshot.sides[snapshot.owner]);
        if (writes.length > 0) await applySideWrites(snapshot.matterId, snapshot.sides[snapshot.owner], writes);
      }
      if (!base || base.step !== snapshot.step || base.owner !== snapshot.owner) {
        await moveClaimMatter(snapshot.matterId, snapshot);
      }
      synced.current = snapshot;
      sent.current = recordSignature(snapshot);
      setState((current) => (current ? { ...current, server: "saved" } : current));
    } catch {
      sent.current = recordSignature(snapshot);
      setState((current) => (current ? { ...current, server: "offline" } : current));
    }
  }

  function assign(partial: Partial<Pick<TrackState, "step" | "owner">>) {
    setState((current) => (current ? { ...current, ...partial } : current));
  }

  function setStep(step: DemoStep) {
    assign({ step });
  }

  function replaceSide(side: StoredSide) {
    setState((current) =>
      current ? { ...current, sides: { ...current.sides, [side.owner]: side } } : current,
    );
  }

  async function signIn(owner: DemoOwner) {
    const current = latest.current;
    if (!current?.matterId) {
      setState((value) => (value ? { ...value, owner, step: "home" } : value));
      return;
    }
    try {
      const remote = await readClaimMatter(current.matterId);
      setState((value) => {
        if (!value) return value;
        const sides = { ...remote.sides };
        const localGaps = value.sides[owner].privateGaps;
        if ((sides[owner]?.privateGaps?.length ?? 0) === 0 && localGaps.length > 0) {
          sides[owner] = { ...sides[owner], privateGaps: localGaps };
        }
        const next: TrackState = { ...value, owner, step: "home", sides, matterId: remote.id, server: "saved" };
        synced.current = { ...next, sides: remote.sides };
        sent.current = recordSignature(synced.current);
        return next;
      });
    } catch {
      setState((value) => (value ? { ...value, owner, step: "home", server: "offline" } : value));
    }
  }

  return { state, setStep, assign, replaceSide, signIn };
}
