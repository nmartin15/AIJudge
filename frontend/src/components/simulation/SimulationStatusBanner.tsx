import type {
  BackendReadinessStatus,
  SimulationMode,
} from "@/lib/simulationService";

interface SimulationStatusBannerProps {
  configuredMode: SimulationMode;
  backendStatus: BackendReadinessStatus | null;
  backendDetail: string;
  isCheckingBackend: boolean;
  lastCheckedAt: string | null;
  onRecheckBackend: () => void;
}

export function SimulationStatusBanner({
  configuredMode,
  backendStatus,
  backendDetail,
  isCheckingBackend,
  lastCheckedAt,
  onRecheckBackend,
}: SimulationStatusBannerProps) {
  const badgeClass =
    backendStatus === "ready"
      ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
      : backendStatus === "degraded"
      ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
      : backendStatus === "offline"
      ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300"
      : "border-zinc-300 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300";

  return (
    <>
      <div className="mb-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-300">
        <strong>Educational simulation:</strong> This interface currently uses mock
        WY-style data in mock mode so you can validate UX before full legal corpus
        integration.
      </div>
      <div className="mb-8 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
        Runtime mode from env:{" "}
        <span className="font-semibold uppercase">{configuredMode}</span>{" "}
        (<code>NEXT_PUBLIC_SIMULATION_MODE</code>)
      </div>
      <div className={`mb-8 rounded-lg border p-3 text-sm ${badgeClass}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-semibold">
            Backend status:{" "}
            {isCheckingBackend
              ? "checking..."
              : backendStatus
              ? backendStatus
              : "unknown"}
          </span>
          <button
            type="button"
            onClick={onRecheckBackend}
            disabled={isCheckingBackend}
            className="rounded-md border border-current px-3 py-1 text-xs font-semibold uppercase tracking-wide opacity-90 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCheckingBackend ? "Checking..." : "Re-check backend"}
          </button>
        </div>
        <p className="mt-1 text-xs opacity-90">{backendDetail}</p>
        {lastCheckedAt ? (
          <p className="mt-1 text-xs opacity-80">Last checked at {lastCheckedAt}</p>
        ) : null}
      </div>
    </>
  );
}
