import { describe, expect, it } from "vitest";

import { runMockSimulation } from "@/lib/mockSimulation";

describe("runMockSimulation", () => {
  it("returns plaintiff win when plaintiff evidence dominates", () => {
    const result = runMockSimulation({
      templateId: "wy-auto-001",
      plaintiffNarrative: "Plaintiff states the parked car was hit.",
      defendantNarrative: "Defendant disputes the extent of damages.",
      amountClaimed: 1000,
      plaintiffEvidenceStrength: 90,
      defendantEvidenceStrength: 20,
      judgeId: "evidence_heavy",
    });

    expect(result.winner).toBe("plaintiff");
    expect(result.awardAmount).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThanOrEqual(0.51);
    expect(result.confidence).toBeLessThanOrEqual(0.95);
  });

  it("returns zero award on defendant win", () => {
    const result = runMockSimulation({
      templateId: "wy-contract-001",
      plaintiffNarrative: "Plaintiff says work was not completed.",
      defendantNarrative: "Defendant says scope changed without approval.",
      amountClaimed: 2400,
      plaintiffEvidenceStrength: 20,
      defendantEvidenceStrength: 90,
      judgeId: "strict",
    });

    expect(result.winner).toBe("defendant");
    expect(result.awardAmount).toBe(0);
  });
});
