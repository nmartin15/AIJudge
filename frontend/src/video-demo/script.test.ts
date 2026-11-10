import { describe, expect, it } from "vitest";

import {
  DEMO_STEPS,
  accounts,
  chanceNotes,
  demoCase,
  demoFiles,
  demoJudgment,
  demoLogin,
  alexClaims,
  filesFromOther,
  filesOwnedBy,
  nextDemoStep,
  replies,
} from "./script";

describe("video demo discovery", () => {
  it("starts as a first visit, finishes one side, then skips to both parties", () => {
    expect(DEMO_STEPS.slice(0, 4)).toEqual(["welcome", "login", "home", "submit-alex"]);
    expect(nextDemoStep("welcome")).toBe("login");
    expect(nextDemoStep("login")).toBe("home");
    expect(nextDemoStep("home")).toBe("submit-alex");
    expect(nextDemoStep("submit-alex")).toBe("alex-done");
    expect(nextDemoStep("alex-done")).toBe("both-parties");
    expect(nextDemoStep("both-parties")).toBe("alex-reply");
    expect(nextDemoStep("jordan-reply")).toBe("decision");
    expect(nextDemoStep("decision")).toBeNull();
    expect(demoLogin.email).toMatch(/@/);
    expect(demoLogin.password.length).toBeGreaterThan(4);
    expect(accounts.alex.story).toMatch(/\$1,500/);
    expect(accounts.alex.story.length).toBeLessThan(500);
    expect(accounts.jordan.story.length).toBeLessThan(500);
    expect(alexClaims[0]?.files).toHaveLength(2);
    expect(alexClaims[1]?.files).toHaveLength(1);
  });

  it("attaches a dummy file, with lines, to each point that was filed", () => {
    expect(demoFiles.map((file) => file.id)).toEqual([
      "lease",
      "notice",
      "bank",
      "photos",
    ]);
    for (const file of demoFiles) {
      expect(file.point.length).toBeGreaterThan(8);
      expect(file.lines.length).toBeGreaterThanOrEqual(4);
    }
    expect(filesOwnedBy("alex").map((file) => file.id)).toContain("bank");
    expect(filesFromOther("jordan").map((file) => file.id)).toContain("bank");
    expect(filesOwnedBy("jordan").map((file) => file.id)).toEqual(["photos"]);
  });

  it("keeps each person's unfilled gaps off the other person's side", () => {
    const alexOpen = chanceNotes.alex
      .filter((item) => item.outcome === "left-open")
      .map((item) => item.label);
    const jordanOpen = chanceNotes.jordan
      .filter((item) => item.outcome === "left-open")
      .map((item) => item.label);
    expect(alexOpen).toEqual(["Your own photos of the carpet on move-out day"]);
    expect(jordanOpen.join(" ")).toMatch(/itemized list/i);
    expect(jordanOpen.join(" ")).toMatch(/invoice/i);

    const jordanSees = [
      ...accounts.alex.points.map((point) => point.text),
      ...filesFromOther("jordan").flatMap((file) => [file.title, file.point, ...file.lines]),
      ...replies.jordan.lines,
    ].join(" ");
    for (const label of alexOpen) {
      expect(jordanSees).not.toContain(label);
    }

    const alexSees = [
      ...accounts.jordan.points.map((point) => point.text),
      ...filesFromOther("alex").flatMap((file) => [file.title, file.point, ...file.lines]),
      ...replies.alex.lines,
    ].join(" ");
    for (const label of jordanOpen) {
      expect(alexSees).not.toContain(label);
    }

    expect(accounts.alex.points.length).toBeGreaterThanOrEqual(4);
    expect(accounts.jordan.points.length).toBeGreaterThanOrEqual(3);
    expect(replies.alex.lines).toHaveLength(2);
    expect(replies.jordan.lines).toHaveLength(2);
    expect(demoJudgment.awardAmount).toBe(demoCase.amountClaimed);
    expect(demoJudgment.findingsOfFact.length).toBeGreaterThanOrEqual(5);
    expect(demoJudgment.judgmentText).toContain(demoCase.plaintiffName);
  });
});
