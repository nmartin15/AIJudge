import { useCallback, useEffect, useState } from "react";
import type { JudgeTemperament, SimulationOutput } from "@/lib/mockSimulation";
import {
  SIMULATION_MODE,
  checkBackendCapabilities,
  executeSimulation,
  mapJudgmentToSimulationOutput,
  type BackendReadinessStatus,
} from "@/lib/simulationService";
import {
  ApiClientError,
  generateJudgment,
  getJudgment,
  getJudgmentMetadata,
  runComparison,
} from "@/lib/api";
import type { ComparisonInsights, JudgmentMetadata } from "@/lib/types";
import { normalizeError } from "@/lib/normalizeError";

// ── Types ────────────────────────────────────────────────────────────

interface UseSimulationOptions {
  selectedTemplateId: string;
  plaintiffNarrative: string;
  defendantNarrative: string;
  amountClaimed: number;
  judgeId: JudgeTemperament;
  hearingConcluded: boolean;
  allowEarlyJudgment: boolean;
  ensureCase: () => Promise<string | null>;
  clearPersistedForm: () => void;
  addToast: (message: string, type: "success" | "error" | "info") => void;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function useSimulation({
  selectedTemplateId,
  plaintiffNarrative,
  defendantNarrative,
  amountClaimed,
  judgeId,
  hearingConcluded,
  allowEarlyJudgment,
  ensureCase,
  clearPersistedForm,
  addToast,
}: UseSimulationOptions) {
  // ── Result state ───────────────────────────────────────────────────
  const [result, setResult] = useState<SimulationOutput | null>(null);
  const [resultMode, setResultMode] = useState<"mock" | "backend" | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // ── Judgment metadata ──────────────────────────────────────────────
  const [judgmentMetadata, setJudgmentMetadata] =
    useState<JudgmentMetadata | null>(null);

  // ── Multi-judge comparison ─────────────────────────────────────────
  const [comparisonResults, setComparisonResults] = useState<
    Array<{ judgeId: JudgeTemperament; output: SimulationOutput }>
  >([]);
  const [isRunningComparison, setIsRunningComparison] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [comparisonInsights, setComparisonInsights] =
    useState<ComparisonInsights | null>(null);

  // ── Backend status ─────────────────────────────────────────────────
  const [backendStatus, setBackendStatus] =
    useState<BackendReadinessStatus | null>(null);
  const [backendDetail, setBackendDetail] = useState(
    "Checking backend capabilities...",
  );
  const [isCheckingBackend, setIsCheckingBackend] = useState(true);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);

  const checkCapabilities = useCallback(async (): Promise<void> => {
    setIsCheckingBackend(true);
    const readiness = await checkBackendCapabilities();
    setBackendStatus(readiness.status);
    setBackendDetail(readiness.detail);
    setLastCheckedAt(new Date().toLocaleTimeString());
    setIsCheckingBackend(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function initialCapabilityCheck(): Promise<void> {
      setIsCheckingBackend(true);
      const readiness = await checkBackendCapabilities();
      if (!mounted) return;
      setBackendStatus(readiness.status);
      setBackendDetail(readiness.detail);
      setLastCheckedAt(new Date().toLocaleTimeString());
      setIsCheckingBackend(false);
    }
    void initialCapabilityCheck();
    return () => {
      mounted = false;
    };
  }, []);

  // ── Run judgment ───────────────────────────────────────────────────

  async function runSimulation(): Promise<void> {
    setIsRunning(true);
    setWarning(null);
    try {
      if (SIMULATION_MODE === "backend") {
        if (!hearingConcluded && !allowEarlyJudgment) {
          setWarning(
            "Judgment is disabled until hearing concludes. Enable override in review to continue early.",
          );
          return;
        }
        const persistedCaseId = await ensureCase();
        if (!persistedCaseId) throw new Error("Could not persist case.");
        try {
          const judgment = await generateJudgment(persistedCaseId, judgeId);
          setResult(
            mapJudgmentToSimulationOutput(judgment, selectedTemplateId),
          );
          setResultMode("backend");
          clearPersistedForm();
          addToast("Judgment generated", "success");
          try {
            const metadata = await getJudgmentMetadata(persistedCaseId);
            setJudgmentMetadata(metadata);
          } catch {
            setJudgmentMetadata(null);
          }
          return;
        } catch (error) {
          if (error instanceof ApiClientError && error.status === 409) {
            const existing = await getJudgment(persistedCaseId);
            setResult(
              mapJudgmentToSimulationOutput(existing, selectedTemplateId),
            );
            setResultMode("backend");
            clearPersistedForm();
            setWarning("Existing backend judgment loaded for this case.");
            try {
              const metadata = await getJudgmentMetadata(persistedCaseId);
              setJudgmentMetadata(metadata);
            } catch {
              setJudgmentMetadata(null);
            }
            return;
          }
          throw error;
        }
      }
      const run = await executeSimulation({
        templateId: selectedTemplateId,
        plaintiffNarrative,
        defendantNarrative,
        amountClaimed,
        plaintiffEvidenceStrength: 72,
        defendantEvidenceStrength: 54,
        judgeId,
      });
      setResult(run.output);
      setResultMode(run.modeUsed);
      setWarning(run.warning ?? null);
      setJudgmentMetadata(null);
      clearPersistedForm();
      addToast("Judgment generated", "success");
    } catch (error) {
      addToast(normalizeError(error), "error");
    } finally {
      setIsRunning(false);
    }
  }

  // ── Multi-judge comparison ─────────────────────────────────────────

  async function runMultiJudgeComparison(): Promise<void> {
    setIsRunningComparison(true);
    setComparisonError(null);
    setComparisonResults([]);
    setComparisonInsights(null);
    const judgeIds: JudgeTemperament[] = [
      "strict",
      "common_sense",
      "evidence_heavy",
      "practical",
    ];
    try {
      if (SIMULATION_MODE === "mock") {
        const baseInput = {
          templateId: selectedTemplateId,
          plaintiffNarrative,
          defendantNarrative,
          amountClaimed,
          plaintiffEvidenceStrength: 72,
          defendantEvidenceStrength: 54,
        };
        const runs = await Promise.all(
          judgeIds.map(async (judge) => {
            const run = await executeSimulation(
              { ...baseInput, judgeId: judge },
              "mock",
            );
            return { judgeId: judge, output: run.output };
          }),
        );
        setComparisonResults(runs);
        return;
      }

      if (!hearingConcluded && !allowEarlyJudgment) {
        setComparisonError(
          "Conclude hearing first or enable early judgment override.",
        );
        return;
      }
      const persistedCaseId = await ensureCase();
      if (!persistedCaseId) {
        throw new Error("Could not persist case for comparison.");
      }
      const comparisonRun = await runComparison(persistedCaseId, judgeIds);
      const runs = comparisonRun.results.map((entry) => ({
        judgeId: entry.archetype_id as JudgeTemperament,
        output: mapJudgmentToSimulationOutput(
          {
            in_favor_of: entry.in_favor_of,
            awarded_amount: entry.awarded_amount,
            rationale: entry.rationale,
            judgment_text: entry.judgment_text,
            conclusions_of_law: entry.conclusions_of_law,
            findings_of_fact: entry.findings_of_fact,
            evidence_scores: entry.evidence_scores ?? undefined,
            reasoning_chain: entry.reasoning_chain ?? undefined,
          },
          selectedTemplateId,
        ),
      }));
      setComparisonResults(runs);
      setComparisonInsights(comparisonRun.comparison_insights ?? null);
      if (comparisonRun.reused) {
        setComparisonError(
          "Loaded a saved comparison run for this case (no new model calls).",
        );
      }
    } catch (error) {
      setComparisonError(normalizeError(error));
    } finally {
      setIsRunningComparison(false);
    }
  }

  // ── Reset on start-over ────────────────────────────────────────────

  function resetSimulation(): void {
    setResult(null);
    setResultMode(null);
    setWarning(null);
    setJudgmentMetadata(null);
    setComparisonResults([]);
    setComparisonError(null);
    setComparisonInsights(null);
  }

  return {
    // Result
    result,
    resultMode,
    warning,
    setWarning,
    isRunning,
    runSimulation,
    // Judgment metadata
    judgmentMetadata,
    setJudgmentMetadata,
    // Comparison
    comparisonResults,
    isRunningComparison,
    comparisonError,
    comparisonInsights,
    runMultiJudgeComparison,
    // Backend status
    backendStatus,
    backendDetail,
    isCheckingBackend,
    lastCheckedAt,
    checkCapabilities,
    // Reset
    resetSimulation,
  };
}
