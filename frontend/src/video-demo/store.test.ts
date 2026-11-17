import { beforeEach, describe, expect, it } from "vitest";

import { chanceNotes } from "./script";
import {
  addClaim,
  attachFiles,
  loadTrack,
  planSideWrites,
  readFile,
  removeClaim,
  removeFile,
  saveTrack,
  seedTrack,
  sharedSide,
  todayISO,
  amountOverCap,
} from "./store";

describe("claim track store", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("opens the sample claims on the days in the story, with both deposit files", () => {
    const track = seedTrack();
    const deposit = track.sides.alex.claims[0];
    expect(deposit?.date).toBe("2024-06-01");
    expect(deposit?.files.map((file) => file.title)).toEqual(["Signed lease", "Bank record"]);
    expect(track.sides.alex.claims.map((claim) => claim.date)).toEqual([
      "2024-06-01",
      "2025-04-01",
      "2025-05-01",
      "2025-05-31",
    ]);
    expect(track.sides.jordan.claims[1]?.files.map((file) => file.title)).toEqual(["Move-out photos"]);
  });

  it("stamps a new claim with the given day and keeps it after a reload", () => {
    const track = seedTrack();
    const next = addClaim(track.sides.alex, new Date(2026, 10, 16), "added-test");
    expect(next.claims.at(-1)?.date).toBe(todayISO(new Date(2026, 10, 16)));
    const withFile = attachFiles(next, "added-test", [
      { id: "extra", title: "Note.txt", kind: "text/plain", lines: ["A second document."] },
    ]);
    expect(withFile.claims.at(-1)?.files).toHaveLength(1);
    const removed = removeFile(withFile, "added-test", "extra");
    expect(removed.claims.at(-1)?.files).toHaveLength(0);

    saveTrack({
      ...track,
      owner: "alex",
      step: "submit-alex",
      sides: {
        ...track.sides,
        alex: { ...withFile, claims: [...withFile.claims, withFile.claims[0]] },
      },
    });
    const loaded = loadTrack();
    expect(loaded.sides.alex.claims.filter((claim) => claim.id === "deposit")).toHaveLength(1);
    expect(loaded.step).toBe("submit-alex");
    expect(loaded.sides.alex.claims.at(-1)?.id).toBe("added-test");
    expect(loaded.sides.alex.claims.at(-1)?.files[0]?.title).toBe("Note.txt");
  });

  it("keeps private gaps off the other person's shared side and off the reading", () => {
    const track = seedTrack();
    const alexOpen = chanceNotes.alex.filter((note) => note.outcome === "left-open").map((note) => note.label);
    const jordanOpen = chanceNotes.jordan.filter((note) => note.outcome === "left-open").map((note) => note.label);
    const jordanSees = JSON.stringify(sharedSide(track.sides.alex));
    const alexSees = JSON.stringify(sharedSide(track.sides.jordan));
    for (const label of alexOpen) expect(jordanSees).not.toContain(label);
    for (const label of jordanOpen) expect(alexSees).not.toContain(label);

    const reading = JSON.stringify(readFile(track.sides));
    for (const label of [...alexOpen, ...jordanOpen]) expect(reading).not.toContain(label);
    expect(readFile(track.sides).itemizationFiled).toBe(false);
    expect(readFile(track.sides).outcome).toContain("1,500");
    expect(amountOverCap("6001")).toBe(true);
    expect(amountOverCap("6000")).toBe(false);
  });

  it("maps a page edit onto one create, one update, and one delete", () => {
    const before = seedTrack().sides.alex;
    const dated = {
      ...before,
      claims: before.claims.map((claim, index) => (index === 0 ? { ...claim, date: "2024-06-02" } : claim)),
    };
    const added = addClaim(dated, new Date(2026, 10, 16), "added-test");
    const withFile = attachFiles(added, "added-test", [
      { id: "extra", title: "Note.txt", kind: "text/plain", lines: ["A second document."] },
    ]);
    const dropped = removeClaim(withFile, before.claims[3].id);
    const writes = planSideWrites(before, dropped);
    expect(writes.map((write) => write.op)).toEqual([
      "delete-claim",
      "update-claim",
      "create-claim",
      "create-file",
    ]);
  });
});
