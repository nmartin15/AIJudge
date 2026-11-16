/**
 * TEMPORARY. Maps the claim page onto the claim-track routes. Delete with the demo.
 */

import { API_BASE_URL } from "@/lib/api";
import type { DemoOwner, DemoStep } from "@/video-demo/script";
import type { FileReading, StoredClaim, StoredFile, StoredSide, TrackState } from "@/video-demo/store";

export interface ClaimRecord {
  id: string;
  step: DemoStep;
  owner: DemoOwner | null;
  sides: Record<DemoOwner, StoredSide>;
}

const TOKEN_KEY = "wy-claim-actor-token";

export function claimToken(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function saveClaimToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export async function claimLogin(email: string, password: string): Promise<DemoOwner> {
  const res = await fetch(`${API_BASE_URL}/claim-access`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error("That login is not on this track.");
  }
  const body = (await res.json()) as { owner: DemoOwner; token: string };
  saveClaimToken(body.token);
  return body.owner;
}

function seg(value: string): string {
  return encodeURIComponent(value);
}

async function send(path: string, method: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = {};
  const token = claimToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Claim record was not saved (${res.status})`);
  }
  return res;
}

export async function createClaimMatter(state: TrackState): Promise<ClaimRecord> {
  const res = await send("/claim-matters", "POST", {
    step: state.step,
    owner: state.owner,
    sides: state.sides,
  });
  return res.json() as Promise<ClaimRecord>;
}

export async function readClaimReading(matterId: string): Promise<FileReading> {
  const res = await send(`/claim-matters/${matterId}/reading`, "GET");
  return res.json() as Promise<FileReading>;
}

export async function readClaimMatter(matterId: string): Promise<ClaimRecord> {
  const res = await send(`/claim-matters/${matterId}`, "GET");
  return res.json() as Promise<ClaimRecord>;
}

export async function moveClaimMatter(matterId: string, state: TrackState): Promise<void> {
  await send(`/claim-matters/${matterId}`, "PATCH", { step: state.step, owner: state.owner });
}

export async function patchClaimHeader(matterId: string, side: StoredSide): Promise<void> {
  await send(`/claim-matters/${matterId}/sides/${side.owner}`, "PATCH", {
    name: side.name,
    otherName: side.otherName,
    amount: side.amount,
    wants: side.wants,
    privateGaps: side.privateGaps,
    disputes: side.disputes,
  });
}

export async function createClaim(matterId: string, owner: DemoOwner, claim: StoredClaim): Promise<void> {
  await send(`/claim-matters/${matterId}/sides/${owner}/claims`, "POST", {
    id: claim.id,
    text: claim.text,
    date: claim.date,
  });
}

export async function updateClaim(matterId: string, owner: DemoOwner, claim: StoredClaim): Promise<void> {
  await send(`/claim-matters/${matterId}/sides/${owner}/claims/${seg(claim.id)}`, "PATCH", {
    text: claim.text,
    date: claim.date,
  });
}

export async function deleteClaim(matterId: string, owner: DemoOwner, claimId: string): Promise<void> {
  await send(`/claim-matters/${matterId}/sides/${owner}/claims/${seg(claimId)}`, "DELETE");
}

export async function createClaimFile(
  matterId: string,
  owner: DemoOwner,
  claimId: string,
  file: StoredFile,
): Promise<void> {
  await send(`/claim-matters/${matterId}/sides/${owner}/claims/${seg(claimId)}/files`, "POST", file);
}

export async function deleteClaimFile(
  matterId: string,
  owner: DemoOwner,
  claimId: string,
  fileId: string,
): Promise<void> {
  await send(`/claim-matters/${matterId}/sides/${owner}/claims/${seg(claimId)}/files/${seg(fileId)}`, "DELETE");
}
