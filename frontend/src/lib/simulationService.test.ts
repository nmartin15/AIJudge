import { beforeEach, describe, expect, it, vi } from "vitest";

const mockApi = vi.hoisted(() => ({
  ApiClientError: class ApiClientError extends Error {
    code: "http" | "timeout" | "network";
    status?: number;

    constructor(
      message: string,
      options: {
        code: "http" | "timeout" | "network";
        status?: number;
      }
    ) {
      super(message);
      this.code = options.code;
      this.status = options.status;
    }
  },
  createCase: vi.fn(),
  generateJudgment: vi.fn(),
  getOrCreateSession: vi.fn(),
  healthCheck: vi.fn(),
  getArchetypes: vi.fn(),
}));

vi.mock("@/lib/api", () => mockApi);

import {
  checkBackendCapabilities,
  executeSimulation,
} from "@/lib/simulationService";
import type { SimulationInput } from "@/lib/mockSimulation";

const sampleInput: SimulationInput = {
  templateId: "wy-deposit-001",
  plaintiffNarrative: "Plaintiff describes withheld deposit and move-out condition.",
  defendantNarrative: "Defendant claims excessive cleaning damage.",
  amountClaimed: 1500,
  plaintiffEvidenceStrength: 70,
  defendantEvidenceStrength: 40,
  judgeId: "common_sense",
};

describe("executeSimulation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses mock path when mode is mock", async () => {
    const result = await executeSimulation(sampleInput, "mock");
    expect(result.modeUsed).toBe("mock");
    expect(result.output.winner).toBeDefined();
    expect(mockApi.createCase).not.toHaveBeenCalled();
  });

  it("uses backend result when backend mode succeeds", async () => {
    mockApi.getOrCreateSession.mockResolvedValue("session-1");
    mockApi.createCase.mockResolvedValue({ id: "case-1" });
    mockApi.generateJudgment.mockResolvedValue({
      in_favor_of: "plaintiff",
      awarded_amount: 1200,
      rationale: "Backend rationale",
      judgment_text: "Fallback judgment text",
      conclusions_of_law: [{ text: "Rule applies", citation: "Wyo. Stat. 1-1-109" }],
    });

    const result = await executeSimulation(sampleInput, "backend");

    expect(result.modeUsed).toBe("backend");
    expect(result.output.winner).toBe("plaintiff");
    expect(result.output.awardAmount).toBe(1200);
    expect(result.output.citedAuthorities).toEqual(["Wyo. Stat. 1-1-109"]);
  });

  it("falls back to mock output when backend mode fails", async () => {
    mockApi.getOrCreateSession.mockResolvedValue("session-1");
    mockApi.createCase.mockRejectedValue(
      new mockApi.ApiClientError("timed out", { code: "timeout" })
    );

    const result = await executeSimulation(sampleInput, "backend");

    expect(result.modeUsed).toBe("mock");
    expect(result.warning).toContain("Backend timed out");
    expect(result.output.winner).toBeDefined();
  });
});

describe("checkBackendCapabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ready in mock mode without backend calls", async () => {
    const readiness = await checkBackendCapabilities("mock");
    expect(readiness.status).toBe("ready");
    expect(mockApi.healthCheck).not.toHaveBeenCalled();
  });

  it("returns ready when backend health and archetypes pass", async () => {
    mockApi.healthCheck.mockResolvedValue({ status: "healthy" });
    mockApi.getArchetypes.mockResolvedValue([{ id: "strict" }, { id: "practical" }]);

    const readiness = await checkBackendCapabilities("backend");
    expect(readiness.status).toBe("ready");
    expect(readiness.detail).toContain("2 judge archetypes");
  });

  it("returns degraded when health is up but archetypes fail", async () => {
    mockApi.healthCheck.mockResolvedValue({ status: "healthy" });
    mockApi.getArchetypes.mockRejectedValue(
      new mockApi.ApiClientError("network issue", { code: "network" })
    );

    const readiness = await checkBackendCapabilities("backend");
    expect(readiness.status).toBe("degraded");
    expect(readiness.detail).toContain("archetype fetch failed");
  });

  it("returns offline when health check fails", async () => {
    mockApi.healthCheck.mockRejectedValue(
      new mockApi.ApiClientError("timed out", { code: "timeout" })
    );

    const readiness = await checkBackendCapabilities("backend");
    expect(readiness.status).toBe("offline");
    expect(readiness.detail).toContain("timed out");
  });
});
