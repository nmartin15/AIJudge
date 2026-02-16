"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUnsavedChangesWarning } from "@/lib/useUnsavedChangesWarning";
import {
  useFormPersistence,
  type PersistedFormData,
} from "@/lib/useFormPersistence";
import { useToasts } from "@/lib/useToasts";
import { useHearing } from "@/lib/useHearing";
import {
  mockCaseTemplates,
  type SimulationOutput,
  type JudgeTemperament,
} from "@/lib/mockSimulation";
import {
  SIMULATION_MODE,
  checkBackendCapabilities,
  executeSimulation,
  mapJudgmentToSimulationOutput,
  type BackendReadinessStatus,
} from "@/lib/simulationService";
import {
  ApiClientError,
  addEvidence,
  addParty,
  addTimelineEvent,
  claimAdminRole,
  createCase,
  generateJudgment,
  getCase,
  getCorpusStats,
  getJudgment,
  getJudgmentMetadata,
  getOrCreateSession,
  getSessionAuth,
  ingestCorpus,
  runComparison,
  searchCorpus,
  updateCase,
} from "@/lib/api";
import type {
  Case,
  CaseType,
  ComparisonInsights,
  CorpusSearchResult,
  CorpusStats,
  JudgmentMetadata,
  OperatorRole,
  PartyRole,
} from "@/lib/types";

// ── Components ───────────────────────────────────────────────────────
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ToastContainer } from "@/components/ui/ToastContainer";
import { StoryStep } from "@/components/steps/StoryStep";
import { PartiesStep } from "@/components/steps/PartiesStep";
import { EvidenceStep } from "@/components/steps/EvidenceStep";
import { TimelineStep } from "@/components/steps/TimelineStep";
import { ReviewStep } from "@/components/steps/ReviewStep";
import { HearingRoom } from "@/components/HearingRoom";
import { JudgmentView } from "@/components/JudgmentView";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { SimulationStatusBanner } from "@/components/simulation/SimulationStatusBanner";
import { QualityGatesPanel } from "@/components/simulation/QualityGatesPanel";
import { CorpusAdminPanel } from "@/components/simulation/CorpusAdminPanel";

// ── Constants ────────────────────────────────────────────────────────

type Phase = "intake" | "hearing" | "judgment";

const STEP_LABELS = [
  "Your Story",
  "Who's Involved",
  "Your Evidence",
  "Timeline",
  "Review",
] as const;

// ── Helpers ──────────────────────────────────────────────────────────

function normalizeError(error: unknown): string {
  if (error instanceof ApiClientError) {
    const backendCode = error.backendCode ? ` [${error.backendCode}]` : "";
    if (error.message) return `${error.message}${backendCode}`;
    return (
      error.details ||
      `Backend request failed (${error.status ?? error.code})${backendCode}.`
    );
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

function isNarrativeValid(value: string): boolean {
  return value.trim().length >= 40;
}

// ── Main component ───────────────────────────────────────────────────

export default function Home() {
  // ── Phase & navigation ─────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("intake");
  const [activeStep, setActiveStep] = useState(0);

  // ── Toast (extracted hook) ─────────────────────────────────────────
  const { toasts, addToast, removeToast } = useToasts();

  // ── Case basics ────────────────────────────────────────────────────
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    mockCaseTemplates[0].id
  );
  const selectedTemplate =
    mockCaseTemplates.find((item) => item.id === selectedTemplateId) ??
    mockCaseTemplates[0];

  const [plaintiffNarrative, setPlaintiffNarrative] = useState(
    selectedTemplate.plaintiffNarrative
  );
  const [defendantNarrative, setDefendantNarrative] = useState(
    selectedTemplate.defendantNarrative
  );
  const [amountClaimed, setAmountClaimed] = useState(
    selectedTemplate.amountClaimed
  );
  const [judgeId, setJudgeId] = useState<JudgeTemperament>("common_sense");

  // ── Simulation result ──────────────────────────────────────────────
  const [result, setResult] = useState<SimulationOutput | null>(null);
  const [resultMode, setResultMode] = useState<"mock" | "backend" | null>(
    null
  );
  const [warning, setWarning] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // ── Backend status ─────────────────────────────────────────────────
  const [backendStatus, setBackendStatus] =
    useState<BackendReadinessStatus | null>(null);
  const [backendDetail, setBackendDetail] = useState(
    "Checking backend capabilities..."
  );
  const [isCheckingBackend, setIsCheckingBackend] = useState(true);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);

  // ── Case record ────────────────────────────────────────────────────
  const [caseRecord, setCaseRecord] = useState<Case | null>(null);
  const [isSavingStep, setIsSavingStep] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  // ── Parties ────────────────────────────────────────────────────────
  const [plaintiffName, setPlaintiffName] = useState("Plaintiff");
  const [plaintiffAddress, setPlaintiffAddress] = useState("");
  const [plaintiffPhone, setPlaintiffPhone] = useState("");
  const [defendantName, setDefendantName] = useState("Defendant");
  const [defendantAddress, setDefendantAddress] = useState("");
  const [defendantPhone, setDefendantPhone] = useState("");

  // ── Hearing (extracted hook) ───────────────────────────────────────
  const [hearingInput, setHearingInput] = useState("");
  const [hearingRole, setHearingRole] = useState<"plaintiff" | "defendant">(
    "plaintiff"
  );
  const [allowEarlyJudgment, setAllowEarlyJudgment] = useState(false);

  const caseId = caseRecord?.id ?? null;

  const ensureCase = useCallback(async (): Promise<string | null> => {
    if (SIMULATION_MODE !== "backend") return null;
    const payload = {
      case_type: selectedTemplate.caseType as CaseType,
      plaintiff_narrative: plaintiffNarrative,
      defendant_narrative: defendantNarrative,
      claimed_amount: amountClaimed,
    };
    if (caseRecord) {
      const updated = await updateCase(caseRecord.id, payload);
      setCaseRecord(updated);
      return updated.id;
    }
    const sessionId = await getOrCreateSession();
    const created = await createCase(sessionId, payload);
    setCaseRecord(created);
    return created.id;
  }, [selectedTemplate, plaintiffNarrative, defendantNarrative, amountClaimed, caseRecord]);

  const hearing = useHearing({
    caseId,
    judgeId,
    onError: (msg) => addToast(msg, "error"),
    ensureCase,
  });

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

  // ── Corpus admin ───────────────────────────────────────────────────
  const [corpusStats, setCorpusStats] = useState<CorpusStats | null>(null);
  const [corpusQuery, setCorpusQuery] = useState("");
  const [corpusResults, setCorpusResults] = useState<CorpusSearchResult[]>([]);
  const [isLoadingCorpus, setIsLoadingCorpus] = useState(false);
  const [isIngestingCorpus, setIsIngestingCorpus] = useState(false);
  const [corpusStatus, setCorpusStatus] = useState<string | null>(null);
  const [sessionRole, setSessionRole] = useState<OperatorRole | null>(null);
  const [adminKey, setAdminKey] = useState("");
  const [isClaimingAdmin, setIsClaimingAdmin] = useState(false);
  const isCorpusAdmin = sessionRole === "admin";

  // ── Unsaved-changes guard ──────────────────────────────────────────
  const hasUnsavedChanges = useMemo(() => {
    if (phase === "judgment" && result !== null) return false;
    if (activeStep > 0) return true;
    if (plaintiffNarrative !== selectedTemplate.plaintiffNarrative) return true;
    if (defendantNarrative !== selectedTemplate.defendantNarrative) return true;
    if (amountClaimed !== selectedTemplate.amountClaimed) return true;
    if (phase === "hearing" && hearing.messages.length > 0) return true;
    return false;
  }, [
    phase,
    result,
    activeStep,
    plaintiffNarrative,
    defendantNarrative,
    amountClaimed,
    selectedTemplate,
    hearing.messages.length,
  ]);

  useUnsavedChangesWarning(hasUnsavedChanges);

  // ── Form persistence (sessionStorage) ──────────────────────────────
  const { save: persistForm, restore: restoreForm, clear: clearPersistedForm } =
    useFormPersistence();
  const [showRecoveryBanner, setShowRecoveryBanner] = useState(false);

  useEffect(() => {
    const saved = restoreForm();
    if (!saved) return;
    if (saved.activeStep > 0 || saved.plaintiffName !== "Plaintiff" || saved.defendantName !== "Defendant") {
      setActiveStep(saved.activeStep);
      setSelectedTemplateId(saved.selectedTemplateId);
      setPlaintiffNarrative(saved.plaintiffNarrative);
      setDefendantNarrative(saved.defendantNarrative);
      setAmountClaimed(saved.amountClaimed);
      setJudgeId(saved.judgeId);
      setPlaintiffName(saved.plaintiffName);
      setPlaintiffAddress(saved.plaintiffAddress);
      setPlaintiffPhone(saved.plaintiffPhone);
      setDefendantName(saved.defendantName);
      setDefendantAddress(saved.defendantAddress);
      setDefendantPhone(saved.defendantPhone);
      setShowRecoveryBanner(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save — only persist fields the page still owns (sub-form fields removed)
  useEffect(() => {
    if (phase !== "intake") return;
    persistForm({
      activeStep,
      selectedTemplateId,
      plaintiffNarrative,
      defendantNarrative,
      amountClaimed,
      judgeId,
      plaintiffName,
      plaintiffAddress,
      plaintiffPhone,
      defendantName,
      defendantAddress,
      defendantPhone,
      // Sub-form defaults (these fields are now owned by their step components)
      evidenceRole: "plaintiff",
      evidenceType: "document",
      evidenceTitle: "",
      evidenceDescription: "",
      timelineDate: "",
      timelineDescription: "",
      timelineSource: "plaintiff",
      timelineDisputed: false,
    });
  }, [
    phase,
    activeStep,
    selectedTemplateId,
    plaintiffNarrative,
    defendantNarrative,
    amountClaimed,
    judgeId,
    plaintiffName,
    plaintiffAddress,
    plaintiffPhone,
    defendantName,
    defendantAddress,
    defendantPhone,
    persistForm,
  ]);

  // ── Case operations ────────────────────────────────────────────────

  function loadTemplate(templateId: string): void {
    const template =
      mockCaseTemplates.find((item) => item.id === templateId) ??
      mockCaseTemplates[0];
    setSelectedTemplateId(template.id);
    setPlaintiffNarrative(template.plaintiffNarrative);
    setDefendantNarrative(template.defendantNarrative);
    setAmountClaimed(template.amountClaimed);
    setResult(null);
    setResultMode(null);
    setWarning(null);
    setCaseRecord(null);
    setActiveStep(0);
    setPhase("intake");
    setAllowEarlyJudgment(false);
    setJudgmentMetadata(null);
    setComparisonResults([]);
    setComparisonError(null);
    setComparisonInsights(null);
    setStepError(null);
    setShowRecoveryBanner(false);
    clearPersistedForm();
  }

  // ── Validation ─────────────────────────────────────────────────────

  function validateBasicsStep(): string | null {
    if (amountClaimed <= 0) return "Claimed amount must be greater than 0.";
    if (amountClaimed > 6000) return "Claimed amount cannot exceed $6,000.";
    if (
      !isNarrativeValid(plaintiffNarrative) ||
      !isNarrativeValid(defendantNarrative)
    ) {
      return "Both narratives should be at least 40 characters for reliable analysis.";
    }
    return null;
  }

  function validatePartiesStep(): string | null {
    if (!plaintiffName.trim() || !defendantName.trim()) {
      return "Plaintiff and defendant names are required.";
    }
    if (SIMULATION_MODE === "backend") {
      const parties = caseRecord?.parties ?? [];
      const hasPlaintiff = parties.some((party) => party.role === "plaintiff");
      const hasDefendant = parties.some((party) => party.role === "defendant");
      if (!hasPlaintiff || !hasDefendant) {
        return "Save both plaintiff and defendant records before continuing.";
      }
    }
    return null;
  }

  function validateEvidenceStep(): string | null {
    if (
      SIMULATION_MODE === "backend" &&
      (caseRecord?.evidence.length ?? 0) === 0
    ) {
      return "Add at least one evidence item before continuing.";
    }
    return null;
  }

  function validateTimelineStep(): string | null {
    if (
      SIMULATION_MODE === "backend" &&
      (caseRecord?.timeline_events.length ?? 0) === 0
    ) {
      return "Add at least one timeline event before review.";
    }
    return null;
  }

  // ── Backend persistence ────────────────────────────────────────────

  async function refreshCase(caseRecordId: string): Promise<void> {
    const latest = await getCase(caseRecordId);
    setCaseRecord(latest);
  }

  /**
   * Non-blocking step navigation: navigate immediately, save in background.
   * Validation still runs synchronously before navigation.
   */
  function saveBasicsAndContinue(): void {
    const basicsError = validateBasicsStep();
    if (basicsError) {
      setStepError(basicsError);
      return;
    }
    setStepError(null);
    setActiveStep(1);

    // Fire-and-forget backend save — toast on failure
    if (SIMULATION_MODE === "backend") {
      void (async () => {
        try {
          await ensureCase();
          addToast("Case details saved", "success");
        } catch (error) {
          addToast(
            `Background save failed: ${normalizeError(error)}`,
            "error"
          );
        }
      })();
    }
  }

  async function saveParty(role: PartyRole): Promise<void> {
    if (SIMULATION_MODE !== "backend") {
      setStepError("Party persistence requires backend mode.");
      return;
    }
    if (!caseRecord) {
      setStepError("Save case basics before adding parties.");
      return;
    }
    const payload =
      role === "plaintiff"
        ? {
            role,
            name: plaintiffName.trim(),
            address: plaintiffAddress.trim(),
            phone: plaintiffPhone.trim(),
          }
        : {
            role,
            name: defendantName.trim(),
            address: defendantAddress.trim(),
            phone: defendantPhone.trim(),
          };
    if (!payload.name) {
      setStepError(
        `${role === "plaintiff" ? "Plaintiff" : "Defendant"} name is required.`
      );
      return;
    }
    setIsSavingStep(true);
    setStepError(null);
    try {
      await addParty(caseRecord.id, payload);
      await refreshCase(caseRecord.id);
      addToast(
        `${role === "plaintiff" ? "Plaintiff" : "Defendant"} saved`,
        "success"
      );
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 409) {
        await refreshCase(caseRecord.id);
        addToast("Party already saved", "info");
      } else {
        setStepError(normalizeError(error));
        addToast("Failed to save party", "error");
      }
    } finally {
      setIsSavingStep(false);
    }
  }

  async function saveEvidence(data: {
    role: PartyRole;
    evidenceType: string;
    title: string;
    description: string;
    file: File | null;
  }): Promise<void> {
    if (SIMULATION_MODE !== "backend") {
      setStepError("Evidence upload requires backend mode.");
      return;
    }
    if (!caseRecord) {
      setStepError("Save case basics before adding evidence.");
      return;
    }
    if (!data.title.trim()) {
      setStepError("Evidence title is required.");
      return;
    }
    setIsSavingStep(true);
    setStepError(null);
    try {
      await addEvidence(
        caseRecord.id,
        {
          submitted_by: data.role,
          evidence_type: data.evidenceType as import("@/lib/types").EvidenceType,
          title: data.title.trim(),
          description: data.description.trim() || undefined,
        },
        data.file ?? undefined
      );
      await refreshCase(caseRecord.id);
      addToast("Evidence added", "success");
    } catch (error) {
      setStepError(normalizeError(error));
      addToast("Failed to add evidence", "error");
    } finally {
      setIsSavingStep(false);
    }
  }

  async function saveTimelineEvent(data: {
    date: string;
    description: string;
    source: PartyRole;
    disputed: boolean;
  }): Promise<void> {
    if (SIMULATION_MODE !== "backend") {
      setStepError("Timeline entry requires backend mode.");
      return;
    }
    if (!caseRecord) {
      setStepError("Save case basics before adding timeline events.");
      return;
    }
    if (!data.date || !data.description.trim()) {
      setStepError("Timeline date and description are required.");
      return;
    }
    setIsSavingStep(true);
    setStepError(null);
    try {
      await addTimelineEvent(caseRecord.id, {
        event_date: new Date(data.date).toISOString(),
        description: data.description.trim(),
        source: data.source,
        disputed: data.disputed,
      });
      await refreshCase(caseRecord.id);
      addToast("Timeline event added", "success");
    } catch (error) {
      setStepError(normalizeError(error));
      addToast("Failed to add timeline event", "error");
    } finally {
      setIsSavingStep(false);
    }
  }

  // ── Simulation / judgment ──────────────────────────────────────────

  async function runSimulation(): Promise<void> {
    setIsRunning(true);
    setWarning(null);
    try {
      if (SIMULATION_MODE === "backend") {
        if (!hearing.concluded && !allowEarlyJudgment) {
          setWarning(
            "Judgment is disabled until hearing concludes. Enable override in review to continue early."
          );
          return;
        }
        const persistedCaseId = await ensureCase();
        if (!persistedCaseId) throw new Error("Could not persist case.");
        try {
          const judgment = await generateJudgment(persistedCaseId, judgeId);
          setResult(
            mapJudgmentToSimulationOutput(judgment, selectedTemplate.id)
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
              mapJudgmentToSimulationOutput(existing, selectedTemplate.id)
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
        templateId: selectedTemplate.id,
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
          templateId: selectedTemplate.id,
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
              "mock"
            );
            return { judgeId: judge, output: run.output };
          })
        );
        setComparisonResults(runs);
        return;
      }

      if (!hearing.concluded && !allowEarlyJudgment) {
        setComparisonError(
          "Conclude hearing first or enable early judgment override."
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
          selectedTemplate.id
        ),
      }));
      setComparisonResults(runs);
      setComparisonInsights(comparisonRun.comparison_insights ?? null);
      if (comparisonRun.reused) {
        setComparisonError(
          "Loaded a saved comparison run for this case (no new model calls)."
        );
      }
    } catch (error) {
      setComparisonError(normalizeError(error));
    } finally {
      setIsRunningComparison(false);
    }
  }

  // ── Corpus admin ───────────────────────────────────────────────────

  async function refreshCorpusStats(): Promise<void> {
    if (!isCorpusAdmin) {
      setCorpusStatus("Admin role required for corpus operations.");
      return;
    }
    setIsLoadingCorpus(true);
    try {
      const stats = await getCorpusStats();
      setCorpusStats(stats);
      setCorpusStatus(null);
    } catch (error) {
      setCorpusStatus(normalizeError(error));
    } finally {
      setIsLoadingCorpus(false);
    }
  }

  async function runCorpusSearch(): Promise<void> {
    if (!isCorpusAdmin) {
      setCorpusStatus("Admin role required for corpus operations.");
      return;
    }
    if (!corpusQuery.trim()) return;
    setIsLoadingCorpus(true);
    try {
      const results = await searchCorpus(corpusQuery.trim(), 5);
      setCorpusResults(results);
      setCorpusStatus(null);
    } catch (error) {
      setCorpusStatus(normalizeError(error));
    } finally {
      setIsLoadingCorpus(false);
    }
  }

  async function runCorpusIngest(): Promise<void> {
    if (!isCorpusAdmin) {
      setCorpusStatus("Admin role required for corpus operations.");
      return;
    }
    setIsIngestingCorpus(true);
    try {
      const response = await ingestCorpus();
      setCorpusStatus(
        `Ingest complete. Chunks ingested: ${response.chunks_ingested}`
      );
      await refreshCorpusStats();
    } catch (error) {
      setCorpusStatus(normalizeError(error));
    } finally {
      setIsIngestingCorpus(false);
    }
  }

  async function refreshSessionRole(): Promise<void> {
    if (SIMULATION_MODE !== "backend") return;
    try {
      const auth = await getSessionAuth();
      setSessionRole(auth.role);
    } catch {
      setSessionRole(null);
    }
  }

  async function authenticateCorpusAdmin(): Promise<void> {
    if (!adminKey.trim()) {
      setCorpusStatus("Provide an admin key.");
      return;
    }
    setIsClaimingAdmin(true);
    try {
      const role = await claimAdminRole(adminKey.trim());
      setSessionRole(role);
      setAdminKey("");
      setCorpusStatus("Admin role claim updated.");
      await refreshCorpusStats();
    } catch (error) {
      setCorpusStatus(normalizeError(error));
    } finally {
      setIsClaimingAdmin(false);
    }
  }

  async function checkCapabilities(): Promise<void> {
    setIsCheckingBackend(true);
    const readiness = await checkBackendCapabilities();
    setBackendStatus(readiness.status);
    setBackendDetail(readiness.detail);
    setLastCheckedAt(new Date().toLocaleTimeString());
    setIsCheckingBackend(false);
  }

  // ── Effects ────────────────────────────────────────────────────────

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

  useEffect(() => {
    void refreshSessionRole();
  }, []);

  useEffect(() => {
    if (SIMULATION_MODE !== "backend" || !isCorpusAdmin) return;
    let active = true;
    async function syncCorpusStats(): Promise<void> {
      setIsLoadingCorpus(true);
      try {
        const stats = await getCorpusStats();
        if (!active) return;
        setCorpusStats(stats);
        setCorpusStatus(null);
      } catch (error) {
        if (!active) return;
        setCorpusStatus(normalizeError(error));
      } finally {
        if (active) setIsLoadingCorpus(false);
      }
    }
    void syncCorpusStats();
    return () => {
      active = false;
    };
  }, [isCorpusAdmin]);

  // ── Step navigation helper ─────────────────────────────────────────

  function goToStepWithValidation(
    nextStep: number,
    validator?: () => string | null
  ): void {
    const error = validator ? validator() : null;
    if (error) {
      setStepError(error);
      return;
    }
    setStepError(null);
    setActiveStep(nextStep);
  }

  // ══════════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════════

  // ── Phase: Judgment ────────────────────────────────────────────────
  if (phase === "judgment") {
    return (
      <>
        <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
          <SectionErrorBoundary section="Judgment">
          <JudgmentView
            result={
              result ?? {
                winner: "defendant",
                awardAmount: 0,
                confidence: 0,
                rationale: "",
                citedAuthorities: [],
                findingsOfFact: [],
                conclusionsOfLaw: [],
                judgmentText: "",
                evidenceScoreSummary: [],
              }
            }
            resultMode={resultMode}
            warning={warning}
            judgeId={judgeId}
            comparisonResults={comparisonResults}
            comparisonInsights={comparisonInsights}
            isRunningComparison={isRunningComparison}
            comparisonError={comparisonError}
            onRunComparison={() => void runMultiJudgeComparison()}
            onStartOver={() => loadTemplate(mockCaseTemplates[0].id)}
            isRunning={isRunning}
          />
          </SectionErrorBoundary>
        </main>
        <ToastContainer toasts={toasts} onDismiss={removeToast} />
      </>
    );
  }

  // ── Phase: Hearing ─────────────────────────────────────────────────
  if (phase === "hearing") {
    return (
      <>
        <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
          <SectionErrorBoundary section="Hearing">
          <HearingRoom
            judgeId={judgeId}
            messages={hearing.messages}
            input={hearingInput}
            onInputChange={setHearingInput}
            role={hearingRole}
            onRoleChange={setHearingRole}
            concluded={hearing.concluded}
            isStarting={hearing.isStarting}
            isSending={hearing.isSending}
            status={hearing.status}
            isConnected={hearing.isConnected}
            hasHearingRecord={hearing.hasHearingRecord}
            onBegin={() => void hearing.beginHearing()}
            onSend={() => {
              void hearing.sendMessage(hearingRole, hearingInput);
              setHearingInput("");
            }}
            onProceedToJudgment={() => {
              setPhase("judgment");
              void runSimulation();
            }}
            onBack={() => setPhase("intake")}
            plaintiffName={plaintiffName}
            defendantName={defendantName}
          />
          </SectionErrorBoundary>
        </main>
        <ToastContainer toasts={toasts} onDismiss={removeToast} />
      </>
    );
  }

  // ── Phase: Intake ──────────────────────────────────────────────────
  return (
    <>
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
        {/* Warm welcome header */}
        <header className="mb-8 text-center sm:mb-10">
          <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">
            Let&apos;s figure out your case
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500 sm:mt-3 dark:text-zinc-400">
            Walk through each step below. Take your time &mdash; the more detail
            you provide, the better the judge can understand your situation.
          </p>
        </header>

        {/* Progress bar */}
        <ProgressBar steps={[...STEP_LABELS]} currentStep={activeStep} />

        {/* Recovery banner */}
        {showRecoveryBanner && (
          <div className="mt-4 flex flex-col items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-blue-800 dark:bg-blue-950/30">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <p className="text-sm text-blue-800 dark:text-blue-300">
                Your previous progress has been restored.
              </p>
            </div>
            <button
              type="button"
              className="text-xs font-semibold text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
              onClick={() => setShowRecoveryBanner(false)}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Step content */}
        <div className="mt-8">
          {activeStep === 0 && (
            <StoryStep
              templates={mockCaseTemplates}
              selectedTemplateId={selectedTemplateId}
              onLoadTemplate={loadTemplate}
              plaintiffNarrative={plaintiffNarrative}
              onPlaintiffNarrativeChange={setPlaintiffNarrative}
              defendantNarrative={defendantNarrative}
              onDefendantNarrativeChange={setDefendantNarrative}
              amountClaimed={amountClaimed}
              onAmountChange={setAmountClaimed}
              judgeId={judgeId}
              onJudgeChange={setJudgeId}
              isSaving={isSavingStep}
              error={stepError}
              onContinue={saveBasicsAndContinue}
            />
          )}

          {activeStep === 1 && (
            <PartiesStep
              plaintiff={{
                name: plaintiffName,
                address: plaintiffAddress,
                phone: plaintiffPhone,
              }}
              defendant={{
                name: defendantName,
                address: defendantAddress,
                phone: defendantPhone,
              }}
              onFieldChange={(party, field, value) => {
                if (party === "plaintiff") {
                  if (field === "name") setPlaintiffName(value);
                  else if (field === "address") setPlaintiffAddress(value);
                  else setPlaintiffPhone(value);
                } else {
                  if (field === "name") setDefendantName(value);
                  else if (field === "address") setDefendantAddress(value);
                  else setDefendantPhone(value);
                }
              }}
              savedParties={caseRecord?.parties ?? []}
              onSaveParty={(role) => void saveParty(role)}
              isSaving={isSavingStep}
              error={stepError}
              onBack={() => {
                setStepError(null);
                setActiveStep(0);
              }}
              onContinue={() =>
                goToStepWithValidation(2, validatePartiesStep)
              }
              isBackendMode={SIMULATION_MODE === "backend"}
            />
          )}

          {activeStep === 2 && (
            <EvidenceStep
              savedEvidence={caseRecord?.evidence ?? []}
              onSave={(data) => saveEvidence(data)}
              isSaving={isSavingStep}
              error={stepError}
              onBack={() => {
                setStepError(null);
                setActiveStep(1);
              }}
              onContinue={() =>
                goToStepWithValidation(3, validateEvidenceStep)
              }
              isBackendMode={SIMULATION_MODE === "backend"}
            />
          )}

          {activeStep === 3 && (
            <TimelineStep
              savedEvents={caseRecord?.timeline_events ?? []}
              onSave={(data) => saveTimelineEvent(data)}
              isSaving={isSavingStep}
              error={stepError}
              onBack={() => {
                setStepError(null);
                setActiveStep(2);
              }}
              onContinue={() =>
                goToStepWithValidation(4, validateTimelineStep)
              }
              isBackendMode={SIMULATION_MODE === "backend"}
            />
          )}

          {activeStep === 4 && (
            <ReviewStep
              caseRecord={caseRecord}
              plaintiffNarrative={plaintiffNarrative}
              defendantNarrative={defendantNarrative}
              amountClaimed={amountClaimed}
              judgeId={judgeId}
              plaintiffName={plaintiffName}
              defendantName={defendantName}
              allowEarlyJudgment={allowEarlyJudgment}
              onAllowEarlyJudgmentChange={setAllowEarlyJudgment}
              hearingConcluded={hearing.concluded}
              hasExistingJudgment={result !== null}
              isBackendMode={SIMULATION_MODE === "backend"}
              onBack={() => {
                setStepError(null);
                setActiveStep(3);
              }}
              onBeginHearing={() => {
                setPhase("hearing");
                if (!hearing.hasHearingRecord) void hearing.beginHearing();
              }}
              onSkipToJudgment={() => {
                setPhase("judgment");
                void runSimulation();
              }}
            />
          )}
        </div>

        {/* Developer tools (collapsed, out of the way) */}
        <details className="mt-20 rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
          <summary className="cursor-pointer px-5 py-3 text-xs font-semibold uppercase tracking-widest text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
            Developer tools
          </summary>
          <div className="space-y-6 p-5">
            <SimulationStatusBanner
              configuredMode={SIMULATION_MODE}
              backendStatus={backendStatus}
              backendDetail={backendDetail}
              isCheckingBackend={isCheckingBackend}
              lastCheckedAt={lastCheckedAt}
              onRecheckBackend={() => {
                void checkCapabilities();
              }}
            />
            <QualityGatesPanel
              caseId={caseRecord?.id ?? null}
              metadata={judgmentMetadata}
              onRefreshMetadata={() => {
                void (async () => {
                  if (!caseRecord) return;
                  try {
                    const metadata = await getJudgmentMetadata(caseRecord.id);
                    setJudgmentMetadata(metadata);
                  } catch (error) {
                    setWarning(normalizeError(error));
                  }
                })();
              }}
            />
            <CorpusAdminPanel
              sessionRole={sessionRole}
              isCorpusAdmin={isCorpusAdmin}
              adminKey={adminKey}
              onAdminKeyChange={setAdminKey}
              onClaimAdminRole={() => {
                void authenticateCorpusAdmin();
              }}
              isClaimingAdmin={isClaimingAdmin}
              isLoadingCorpus={isLoadingCorpus}
              isIngestingCorpus={isIngestingCorpus}
              corpusQuery={corpusQuery}
              onCorpusQueryChange={setCorpusQuery}
              corpusStatus={corpusStatus}
              corpusStats={corpusStats}
              corpusResults={corpusResults}
              onRefreshStats={() => {
                void refreshCorpusStats();
              }}
              onIngestCorpus={() => {
                void runCorpusIngest();
              }}
              onSearchCorpus={() => {
                void runCorpusSearch();
              }}
            />
          </div>
        </details>
      </main>
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </>
  );
}
