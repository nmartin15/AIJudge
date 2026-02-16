import {
  ApiClientError,
  createCase,
  generateJudgment,
  getArchetypes,
  getOrCreateSession,
  healthCheck,
} from "@/lib/api";
import type { CaseAdvisory, CaseType, Judgment } from "@/lib/types";
import {
  mockCaseTemplates,
  runMockSimulation,
  type SimulationInput,
  type SimulationOutput,
} from "@/lib/mockSimulation";

export type SimulationMode = "mock" | "backend";

export interface SimulationExecutionResult {
  output: SimulationOutput;
  modeUsed: SimulationMode;
  warning?: string;
}

export type BackendReadinessStatus = "ready" | "degraded" | "offline";

export interface BackendReadiness {
  status: BackendReadinessStatus;
  detail: string;
}

function parseMode(value: string | undefined): SimulationMode {
  return value?.toLowerCase() === "backend" ? "backend" : "mock";
}

export const SIMULATION_MODE = parseMode(process.env.NEXT_PUBLIC_SIMULATION_MODE);

function mapTemplateCaseType(templateId: string): CaseType | undefined {
  const template = mockCaseTemplates.find((item) => item.id === templateId);
  return template?.caseType;
}

export function mapJudgmentToSimulationOutput(
  judgment: Partial<Judgment>,
  templateId: string
): SimulationOutput {
  const fallbackCitations =
    mockCaseTemplates.find((item) => item.id === templateId)?.citations ?? [];
  const conclusions: Array<{ text: string; citation: string }> = judgment.conclusions_of_law ?? [];
  const citedAuthorities: string[] = [
    ...new Set(
      conclusions
        .map((entry: { text: string; citation: string }) => entry.citation?.trim())
        .filter((value: string | undefined): value is string => Boolean(value))
    ),
  ];

  return {
    winner: judgment.in_favor_of ?? "defendant",
    awardAmount: judgment.awarded_amount ?? 0,
    confidence: 0.75,
    rationale: judgment.rationale || judgment.judgment_text || "No rationale returned.",
    citedAuthorities:
      citedAuthorities.length > 0 ? citedAuthorities : fallbackCitations,
    findingsOfFact: judgment.findings_of_fact ?? [],
    conclusionsOfLaw: conclusions,
    judgmentText: judgment.judgment_text ?? "",
    evidenceScoreSummary: Object.entries(judgment.evidence_scores ?? {}).map(
      ([item, score]) => ({
        item,
        score: typeof score === "number" ? score : 0,
      })
    ),
    reasoningChain:
      judgment.reasoning_chain && typeof judgment.reasoning_chain === "object"
        ? judgment.reasoning_chain
        : undefined,
    advisory: (judgment as Judgment).advisory ?? null,
  };
}

async function runBackendSimulation(
  input: SimulationInput
): Promise<SimulationOutput> {
  const sessionId = await getOrCreateSession();
  const createdCase = await createCase(sessionId, {
    case_type: mapTemplateCaseType(input.templateId),
    plaintiff_narrative: input.plaintiffNarrative,
    defendant_narrative: input.defendantNarrative,
    claimed_amount: input.amountClaimed,
  });

  const judgment = await generateJudgment(createdCase.id, input.judgeId);
  return mapJudgmentToSimulationOutput(judgment, input.templateId);
}

function toUserFacingError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === "timeout") {
      return "Backend timed out while generating a judgment.";
    }
    if (error.code === "network") {
      return "Backend is unreachable from the frontend.";
    }
    if (error.status === 400) {
      return "Backend rejected the case input. Check narratives and case details.";
    }
    if (error.status === 401 || error.status === 403) {
      return "Session authorization failed. Start a fresh session and retry.";
    }
    if (error.status === 409) {
      return "A judgment already exists for this case in backend mode.";
    }
    return `Backend returned HTTP ${error.status ?? "error"}.`;
  }
  return "Unknown backend error occurred.";
}

export async function checkBackendCapabilities(
  mode: SimulationMode = SIMULATION_MODE
): Promise<BackendReadiness> {
  if (mode === "mock") {
    return {
      status: "ready",
      detail: "Mock mode active. Backend checks are optional.",
    };
  }

  try {
    const health = await healthCheck();
    if (health.status !== "healthy") {
      return {
        status: "degraded",
        detail: "Backend responded, but health status is not healthy.",
      };
    }
  } catch (error) {
    return {
      status: "offline",
      detail: toUserFacingError(error),
    };
  }

  try {
    const archetypes = await getArchetypes();
    if (archetypes.length === 0) {
      return {
        status: "degraded",
        detail: "Backend is healthy but returned no judge archetypes.",
      };
    }
    return {
      status: "ready",
      detail: `Backend ready with ${archetypes.length} judge archetypes.`,
    };
  } catch (error) {
    return {
      status: "degraded",
      detail: `Health is up, but archetype fetch failed: ${toUserFacingError(error)}`,
    };
  }
}

export async function executeSimulation(
  input: SimulationInput,
  mode: SimulationMode = SIMULATION_MODE
): Promise<SimulationExecutionResult> {
  if (mode === "mock") {
    return {
      output: runMockSimulation(input),
      modeUsed: "mock",
    };
  }

  try {
    const output = await runBackendSimulation(input);
    return {
      output,
      modeUsed: "backend",
    };
  } catch (error) {
    return {
      output: runMockSimulation(input),
      modeUsed: "mock",
      warning: `Backend simulation failed (${toUserFacingError(
        error
      )}). Showing mock result instead.`,
    };
  }
}
