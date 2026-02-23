"use client";

import { mockCaseTemplates } from "@/lib/mockSimulation";
import { SIMULATION_MODE } from "@/lib/simulationService";
import { getJudgmentMetadata } from "@/lib/api";
import { useUnsavedChangesWarning } from "@/lib/useUnsavedChangesWarning";
import { useCaseWizard, STEP_LABELS } from "@/lib/useCaseWizard";
import { useSimulation } from "@/lib/useSimulation";
import { useCorpusAdmin } from "@/lib/useCorpusAdmin";
import { normalizeError } from "@/lib/normalizeError";

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

export default function Home() {
  const wizard = useCaseWizard();
  const simulation = useSimulation({
    selectedTemplateId: wizard.selectedTemplate.id,
    plaintiffNarrative: wizard.plaintiffNarrative,
    defendantNarrative: wizard.defendantNarrative,
    amountClaimed: wizard.amountClaimed,
    judgeId: wizard.judgeId,
    hearingConcluded: wizard.hearing.concluded,
    allowEarlyJudgment: wizard.allowEarlyJudgment,
    ensureCase: wizard.ensureCase,
    clearPersistedForm: wizard.clearPersistedForm,
    addToast: wizard.addToast,
  });
  const corpus = useCorpusAdmin();

  useUnsavedChangesWarning(wizard.hasUnsavedChanges);

  function handleStartOver(): void {
    wizard.loadTemplate(wizard.defaultTemplate.id);
    simulation.resetSimulation();
  }

  // ── Phase: Judgment ────────────────────────────────────────────────
  if (wizard.phase === "judgment") {
    return (
      <>
        <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
          <SectionErrorBoundary section="Judgment">
            <JudgmentView
              result={
                simulation.result ?? {
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
              resultMode={simulation.resultMode}
              warning={simulation.warning}
              judgeId={wizard.judgeId}
              comparisonResults={simulation.comparisonResults}
              comparisonInsights={simulation.comparisonInsights}
              isRunningComparison={simulation.isRunningComparison}
              comparisonError={simulation.comparisonError}
              onRunComparison={() => void simulation.runMultiJudgeComparison()}
              onStartOver={handleStartOver}
              isRunning={simulation.isRunning}
            />
          </SectionErrorBoundary>
        </main>
        <ToastContainer toasts={wizard.toasts} onDismiss={wizard.removeToast} />
      </>
    );
  }

  // ── Phase: Hearing ─────────────────────────────────────────────────
  if (wizard.phase === "hearing") {
    return (
      <>
        <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
          <SectionErrorBoundary section="Hearing">
            <HearingRoom
              judgeId={wizard.judgeId}
              messages={wizard.hearing.messages}
              input={wizard.hearingInput}
              onInputChange={wizard.setHearingInput}
              role={wizard.hearingRole}
              onRoleChange={wizard.setHearingRole}
              concluded={wizard.hearing.concluded}
              isStarting={wizard.hearing.isStarting}
              isSending={wizard.hearing.isSending}
              status={wizard.hearing.status}
              isConnected={wizard.hearing.isConnected}
              hasHearingRecord={wizard.hearing.hasHearingRecord}
              onBegin={() => void wizard.hearing.beginHearing()}
              onSend={() => {
                void wizard.hearing.sendMessage(
                  wizard.hearingRole,
                  wizard.hearingInput,
                );
                wizard.setHearingInput("");
              }}
              onProceedToJudgment={() => {
                wizard.setPhase("judgment");
                void simulation.runSimulation();
              }}
              onBack={() => wizard.setPhase("intake")}
              plaintiffName={wizard.plaintiffName}
              defendantName={wizard.defendantName}
            />
          </SectionErrorBoundary>
        </main>
        <ToastContainer toasts={wizard.toasts} onDismiss={wizard.removeToast} />
      </>
    );
  }

  // ── Phase: Intake ──────────────────────────────────────────────────
  return (
    <>
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
        {/* Warm welcome header */}
        <header className="mb-8 text-center sm:mb-10">
          <h1 className="text-2xl font-bold tracking-tight text-wy-navy sm:text-4xl dark:text-white">
            Let&apos;s figure out your case
          </h1>
          <div className="mx-auto mt-3 h-1 w-16 rounded-full bg-wy-gold sm:mt-4 sm:w-20" />
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500 sm:mt-3 dark:text-zinc-400">
            Walk through each step below. Take your time &mdash; the more detail
            you provide, the better the judge can understand your situation.
          </p>
        </header>

        {/* Progress bar */}
        <ProgressBar
          steps={[...STEP_LABELS]}
          currentStep={wizard.activeStep}
          onStepClick={(step) => {
            wizard.setStepError(null);
            wizard.setActiveStep(step);
          }}
        />

        {/* Recovery banner */}
        {wizard.showRecoveryBanner && (
          <div className="mt-4 flex flex-col items-start gap-2 rounded-lg border border-wy-navy/20 bg-wy-navy-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-wy-gold/30 dark:bg-wy-gold/5">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 flex-shrink-0 text-wy-navy dark:text-wy-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <p className="text-sm text-wy-navy dark:text-wy-gold-light">
                Your previous progress has been restored.
              </p>
            </div>
            <button
              type="button"
              className="text-xs font-semibold text-wy-navy underline-offset-2 hover:underline dark:text-wy-gold"
              onClick={() => wizard.setShowRecoveryBanner(false)}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Step content */}
        <div className="mt-8">
          {wizard.activeStep === 0 && (
            <StoryStep
              templates={mockCaseTemplates}
              selectedTemplateId={wizard.selectedTemplateId}
              onLoadTemplate={(id) => {
                wizard.loadTemplate(id);
                simulation.resetSimulation();
              }}
              plaintiffNarrative={wizard.plaintiffNarrative}
              onPlaintiffNarrativeChange={wizard.setPlaintiffNarrative}
              defendantNarrative={wizard.defendantNarrative}
              onDefendantNarrativeChange={wizard.setDefendantNarrative}
              amountClaimed={wizard.amountClaimed}
              onAmountChange={wizard.setAmountClaimed}
              judgeId={wizard.judgeId}
              onJudgeChange={wizard.setJudgeId}
              isSaving={wizard.isSavingStep}
              error={wizard.stepError}
              onContinue={() => void wizard.saveBasicsAndContinue()}
            />
          )}

          {wizard.activeStep === 1 && (
            <PartiesStep
              plaintiff={wizard.plaintiffParty}
              defendant={wizard.defendantParty}
              onFieldChange={wizard.handlePartyFieldChange}
              savedParties={wizard.caseRecord?.parties ?? []}
              onSaveParty={wizard.handleSaveParty}
              isSaving={wizard.isSavingStep}
              error={wizard.stepError}
              onBack={wizard.handlePartiesBack}
              onContinue={() => void wizard.handlePartiesContinue()}
              isBackendMode={SIMULATION_MODE === "backend"}
            />
          )}

          {wizard.activeStep === 2 && (
            <EvidenceStep
              savedEvidence={wizard.caseRecord?.evidence ?? []}
              onSave={(data) => wizard.saveEvidence(data)}
              isSaving={wizard.isSavingStep}
              error={wizard.stepError}
              onBack={() => {
                wizard.setStepError(null);
                wizard.setActiveStep(1);
              }}
              onContinue={() =>
                wizard.goToStepWithValidation(3, wizard.validateEvidenceStep)
              }
              isBackendMode={SIMULATION_MODE === "backend"}
            />
          )}

          {wizard.activeStep === 3 && (
            <TimelineStep
              savedEvents={wizard.caseRecord?.timeline_events ?? []}
              onSave={(data) => wizard.saveTimelineEvent(data)}
              isSaving={wizard.isSavingStep}
              error={wizard.stepError}
              onBack={() => {
                wizard.setStepError(null);
                wizard.setActiveStep(2);
              }}
              onContinue={() =>
                wizard.goToStepWithValidation(4, wizard.validateTimelineStep)
              }
              isBackendMode={SIMULATION_MODE === "backend"}
            />
          )}

          {wizard.activeStep === 4 && (
            <ReviewStep
              caseRecord={wizard.caseRecord}
              plaintiffNarrative={wizard.plaintiffNarrative}
              defendantNarrative={wizard.defendantNarrative}
              amountClaimed={wizard.amountClaimed}
              judgeId={wizard.judgeId}
              plaintiffName={wizard.plaintiffName}
              defendantName={wizard.defendantName}
              allowEarlyJudgment={wizard.allowEarlyJudgment}
              onAllowEarlyJudgmentChange={wizard.setAllowEarlyJudgment}
              hearingConcluded={wizard.hearing.concluded}
              hasExistingJudgment={simulation.result !== null}
              isBackendMode={SIMULATION_MODE === "backend"}
              onBack={() => {
                wizard.setStepError(null);
                wizard.setActiveStep(3);
              }}
              onBeginHearing={() => {
                wizard.setPhase("hearing");
                if (!wizard.hearing.hasHearingRecord)
                  void wizard.hearing.beginHearing();
              }}
              onSkipToJudgment={() => {
                wizard.setPhase("judgment");
                void simulation.runSimulation();
              }}
            />
          )}
        </div>

        {/* Developer tools */}
        <details className="mt-20 rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
          <summary className="cursor-pointer px-5 py-3 text-xs font-semibold uppercase tracking-widest text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
            Developer tools
          </summary>
          <div className="space-y-6 p-5">
            <SimulationStatusBanner
              configuredMode={SIMULATION_MODE}
              backendStatus={simulation.backendStatus}
              backendDetail={simulation.backendDetail}
              isCheckingBackend={simulation.isCheckingBackend}
              lastCheckedAt={simulation.lastCheckedAt}
              onRecheckBackend={() => {
                void simulation.checkCapabilities();
              }}
            />
            <QualityGatesPanel
              caseId={wizard.caseRecord?.id ?? null}
              metadata={simulation.judgmentMetadata}
              onRefreshMetadata={() => {
                void (async () => {
                  if (!wizard.caseRecord) return;
                  try {
                    const metadata = await getJudgmentMetadata(
                      wizard.caseRecord.id,
                    );
                    simulation.setJudgmentMetadata(metadata);
                  } catch (error) {
                    simulation.setWarning(normalizeError(error));
                  }
                })();
              }}
            />
            <CorpusAdminPanel
              sessionRole={corpus.sessionRole}
              isCorpusAdmin={corpus.isCorpusAdmin}
              adminKey={corpus.adminKey}
              onAdminKeyChange={corpus.setAdminKey}
              onClaimAdminRole={() => {
                void corpus.authenticateCorpusAdmin();
              }}
              isClaimingAdmin={corpus.isClaimingAdmin}
              isLoadingCorpus={corpus.isLoadingCorpus}
              isIngestingCorpus={corpus.isIngestingCorpus}
              corpusQuery={corpus.corpusQuery}
              onCorpusQueryChange={corpus.setCorpusQuery}
              corpusStatus={corpus.corpusStatus}
              corpusStats={corpus.corpusStats}
              corpusResults={corpus.corpusResults}
              onRefreshStats={() => {
                void corpus.refreshCorpusStats();
              }}
              onIngestCorpus={() => {
                void corpus.runCorpusIngest();
              }}
              onSearchCorpus={() => {
                void corpus.runCorpusSearch();
              }}
            />
          </div>
        </details>
      </main>
      <ToastContainer toasts={wizard.toasts} onDismiss={wizard.removeToast} />
    </>
  );
}
