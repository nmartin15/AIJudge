import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useFormPersistence,
  type PersistedFormData,
} from "@/lib/useFormPersistence";
import { useToasts } from "@/lib/useToasts";
import { useHearing } from "@/lib/useHearing";
import {
  mockCaseTemplates,
  type JudgeTemperament,
} from "@/lib/mockSimulation";
import { SIMULATION_MODE } from "@/lib/simulationService";
import {
  ApiClientError,
  addEvidence,
  addParty,
  addTimelineEvent,
  createCase,
  getCase,
  getOrCreateSession,
  updateCase,
} from "@/lib/api";
import type {
  Case,
  CaseType,
  EvidenceType,
  PartyRole,
} from "@/lib/types";
import { normalizeError } from "@/lib/normalizeError";

// ── Constants ────────────────────────────────────────────────────────

export type Phase = "intake" | "hearing" | "judgment";

export const STEP_LABELS = [
  "Your Story",
  "Who's Involved",
  "Your Evidence",
  "Timeline",
  "Review",
] as const;

function isNarrativeValid(value: string): boolean {
  return value.trim().length >= 40;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function useCaseWizard() {
  const { toasts, addToast, removeToast } = useToasts();

  // ── Phase & navigation ─────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("intake");
  const [activeStep, setActiveStep] = useState(0);

  // ── Template & narratives ──────────────────────────────────────────
  const defaultTemplate =
    mockCaseTemplates.find((t) => t.id !== "blank") ?? mockCaseTemplates[0];
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    defaultTemplate.id,
  );
  const selectedTemplate =
    mockCaseTemplates.find((item) => item.id === selectedTemplateId) ??
    defaultTemplate;

  const [plaintiffNarrative, setPlaintiffNarrative] = useState(
    selectedTemplate.plaintiffNarrative,
  );
  const [defendantNarrative, setDefendantNarrative] = useState(
    selectedTemplate.defendantNarrative,
  );
  const [amountClaimed, setAmountClaimed] = useState(
    selectedTemplate.amountClaimed,
  );
  const [judgeId, setJudgeId] = useState<JudgeTemperament>("common_sense");

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

  // ── Hearing input (owned by page, consumed by HearingRoom) ────────
  const [hearingInput, setHearingInput] = useState("");
  const [hearingRole, setHearingRole] = useState<"plaintiff" | "defendant">(
    "plaintiff",
  );
  const [allowEarlyJudgment, setAllowEarlyJudgment] = useState(false);

  // ── ensureCase ─────────────────────────────────────────────────────
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

  // ── Hearing hook ───────────────────────────────────────────────────
  const hearing = useHearing({
    caseId,
    judgeId,
    onError: (msg) => addToast(msg, "error"),
    ensureCase,
  });

  // ── Form persistence ──────────────────────────────────────────────
  const {
    save: persistForm,
    restore: restoreForm,
    clear: clearPersistedForm,
  } = useFormPersistence();
  const [showRecoveryBanner, setShowRecoveryBanner] = useState(false);

  useEffect(() => {
    const saved = restoreForm();
    if (!saved) return;
    if (
      saved.activeStep > 0 ||
      saved.plaintiffName !== "Plaintiff" ||
      saved.defendantName !== "Defendant"
    ) {
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

  // ── Template loading ───────────────────────────────────────────────

  function loadTemplate(templateId: string): void {
    const template =
      mockCaseTemplates.find((item) => item.id === templateId) ??
      mockCaseTemplates[0];
    setSelectedTemplateId(template.id);
    setPlaintiffNarrative(template.plaintiffNarrative);
    setDefendantNarrative(template.defendantNarrative);
    setAmountClaimed(template.amountClaimed);
    setCaseRecord(null);
    setActiveStep(0);
    setPhase("intake");
    setAllowEarlyJudgment(false);
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
    return null;
  }

  function validateEvidenceStep(): string | null {
    return null;
  }

  function validateTimelineStep(): string | null {
    return null;
  }

  // ── Backend persistence ────────────────────────────────────────────

  async function refreshCase(caseRecordId: string): Promise<void> {
    const latest = await getCase(caseRecordId);
    setCaseRecord(latest);
  }

  async function saveBasicsAndContinue(): Promise<void> {
    const basicsError = validateBasicsStep();
    if (basicsError) {
      setStepError(basicsError);
      return;
    }
    setStepError(null);

    if (SIMULATION_MODE === "backend") {
      setIsSavingStep(true);
      try {
        await ensureCase();
        addToast("Case details saved", "success");
      } catch (error) {
        setStepError(`Failed to save case: ${normalizeError(error)}`);
        setIsSavingStep(false);
        return;
      }
      setIsSavingStep(false);
    }

    setActiveStep(1);
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
        `${role === "plaintiff" ? "Plaintiff" : "Defendant"} name is required.`,
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
        "success",
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
          evidence_type: data.evidenceType as EvidenceType,
          title: data.title.trim(),
          description: data.description.trim() || undefined,
        },
        data.file ?? undefined,
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

  // ── Step navigation ────────────────────────────────────────────────

  function goToStepWithValidation(
    nextStep: number,
    validator?: () => string | null,
  ): void {
    const error = validator ? validator() : null;
    if (error) {
      setStepError(error);
      return;
    }
    setStepError(null);
    setActiveStep(nextStep);
  }

  // ── Unsaved-changes guard ──────────────────────────────────────────
  const hasUnsavedChanges = useMemo(() => {
    if (phase === "judgment") return false;
    if (activeStep > 0) return true;
    if (plaintiffNarrative !== selectedTemplate.plaintiffNarrative) return true;
    if (defendantNarrative !== selectedTemplate.defendantNarrative) return true;
    if (amountClaimed !== selectedTemplate.amountClaimed) return true;
    if (phase === "hearing" && hearing.messages.length > 0) return true;
    return false;
  }, [
    phase,
    activeStep,
    plaintiffNarrative,
    defendantNarrative,
    amountClaimed,
    selectedTemplate,
    hearing.messages.length,
  ]);

  // ── Memoized party props ───────────────────────────────────────────
  const plaintiffParty = useMemo(
    () => ({
      name: plaintiffName,
      address: plaintiffAddress,
      phone: plaintiffPhone,
    }),
    [plaintiffName, plaintiffAddress, plaintiffPhone],
  );
  const defendantParty = useMemo(
    () => ({
      name: defendantName,
      address: defendantAddress,
      phone: defendantPhone,
    }),
    [defendantName, defendantAddress, defendantPhone],
  );
  const handlePartyFieldChange = useCallback(
    (
      party: "plaintiff" | "defendant",
      field: "name" | "address" | "phone",
      value: string,
    ) => {
      if (party === "plaintiff") {
        if (field === "name") setPlaintiffName(value);
        else if (field === "address") setPlaintiffAddress(value);
        else setPlaintiffPhone(value);
      } else {
        if (field === "name") setDefendantName(value);
        else if (field === "address") setDefendantAddress(value);
        else setDefendantPhone(value);
      }
    },
    [],
  );
  const handleSaveParty = useCallback(
    (role: PartyRole) => void saveParty(role),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saveParty],
  );
  const handlePartiesBack = useCallback(() => {
    setStepError(null);
    setActiveStep(0);
  }, []);
  const handlePartiesContinue = useCallback(async () => {
    const error = validatePartiesStep();
    if (error) {
      setStepError(error);
      return;
    }
    setStepError(null);

    if (SIMULATION_MODE === "backend" && caseRecord) {
      const parties = caseRecord.parties ?? [];
      const hasPlaintiff = parties.some((p) => p.role === "plaintiff");
      const hasDefendant = parties.some((p) => p.role === "defendant");

      setIsSavingStep(true);
      try {
        if (!hasPlaintiff) {
          await addParty(caseRecord.id, {
            role: "plaintiff" as PartyRole,
            name: plaintiffName.trim(),
            address: plaintiffAddress.trim(),
            phone: plaintiffPhone.trim(),
          });
        }
        if (!hasDefendant) {
          await addParty(caseRecord.id, {
            role: "defendant" as PartyRole,
            name: defendantName.trim(),
            address: defendantAddress.trim(),
            phone: defendantPhone.trim(),
          });
        }
        await refreshCase(caseRecord.id);
        addToast("Parties saved", "success");
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 409) {
          await refreshCase(caseRecord.id);
        } else {
          setStepError(`Failed to save parties: ${normalizeError(error)}`);
          setIsSavingStep(false);
          return;
        }
      }
      setIsSavingStep(false);
    }

    setActiveStep(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRecord, plaintiffName, plaintiffAddress, plaintiffPhone, defendantName, defendantAddress, defendantPhone]);

  return {
    // Phase & navigation
    phase,
    setPhase,
    activeStep,
    setActiveStep,
    // Template & narratives
    defaultTemplate,
    selectedTemplateId,
    selectedTemplate,
    plaintiffNarrative,
    setPlaintiffNarrative,
    defendantNarrative,
    setDefendantNarrative,
    amountClaimed,
    setAmountClaimed,
    judgeId,
    setJudgeId,
    // Case record
    caseRecord,
    isSavingStep,
    stepError,
    setStepError,
    // Parties
    plaintiffName,
    defendantName,
    plaintiffParty,
    defendantParty,
    handlePartyFieldChange,
    handleSaveParty,
    handlePartiesBack,
    handlePartiesContinue,
    // Hearing input
    hearingInput,
    setHearingInput,
    hearingRole,
    setHearingRole,
    allowEarlyJudgment,
    setAllowEarlyJudgment,
    // Hearing hook
    hearing,
    // Case operations
    ensureCase,
    loadTemplate,
    saveBasicsAndContinue,
    saveEvidence,
    saveTimelineEvent,
    // Validation
    validateEvidenceStep,
    validateTimelineStep,
    goToStepWithValidation,
    // Form persistence
    clearPersistedForm,
    showRecoveryBanner,
    setShowRecoveryBanner,
    hasUnsavedChanges,
    // Toasts
    toasts,
    addToast,
    removeToast,
  };
}
