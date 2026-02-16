import type { CorpusSearchResult, CorpusStats } from "@/lib/types";

interface CorpusAdminPanelProps {
  sessionRole: "viewer" | "admin" | null;
  isCorpusAdmin: boolean;
  adminKey: string;
  onAdminKeyChange: (value: string) => void;
  onClaimAdminRole: () => void;
  isClaimingAdmin: boolean;
  isLoadingCorpus: boolean;
  isIngestingCorpus: boolean;
  corpusQuery: string;
  onCorpusQueryChange: (value: string) => void;
  corpusStatus: string | null;
  corpusStats: CorpusStats | null;
  corpusResults: CorpusSearchResult[];
  onRefreshStats: () => void;
  onIngestCorpus: () => void;
  onSearchCorpus: () => void;
}

export function CorpusAdminPanel({
  sessionRole,
  isCorpusAdmin,
  adminKey,
  onAdminKeyChange,
  onClaimAdminRole,
  isClaimingAdmin,
  isLoadingCorpus,
  isIngestingCorpus,
  corpusQuery,
  onCorpusQueryChange,
  corpusStatus,
  corpusStats,
  corpusResults,
  onRefreshStats,
  onIngestCorpus,
  onSearchCorpus,
}: CorpusAdminPanelProps) {
  return (
    <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Corpus admin</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-semibold dark:border-zinc-700">
            Role claim: {sessionRole ?? "loading"}
          </span>
          <input
            className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
            value={adminKey}
            onChange={(event) => onAdminKeyChange(event.target.value)}
            placeholder="Admin key"
            type="password"
          />
          <button
            type="button"
            className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-semibold hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
            onClick={onClaimAdminRole}
            disabled={isClaimingAdmin || !adminKey.trim() || isCorpusAdmin}
          >
            {isClaimingAdmin ? "Authenticating..." : "Authenticate admin"}
          </button>
          <button
            type="button"
            className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-semibold hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
            onClick={onRefreshStats}
            disabled={isLoadingCorpus || !isCorpusAdmin}
          >
            Refresh stats
          </button>
          <button
            type="button"
            className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-semibold hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
            onClick={onIngestCorpus}
            disabled={isIngestingCorpus || !isCorpusAdmin}
          >
            {isIngestingCorpus ? "Ingesting..." : "Re-ingest corpus"}
          </button>
        </div>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Admin-only operations for corpus retrieval and embedding refresh.
        {!isCorpusAdmin ? " Authenticate with an admin key to enable controls." : ""}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          placeholder="Search corpus (e.g., security deposit withholding)"
          value={corpusQuery}
          onChange={(event) => onCorpusQueryChange(event.target.value)}
          disabled={!isCorpusAdmin}
        />
        <button
          type="button"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          onClick={onSearchCorpus}
          disabled={isLoadingCorpus || !corpusQuery.trim() || !isCorpusAdmin}
        >
          Search
        </button>
      </div>
      {corpusStatus ? (
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{corpusStatus}</p>
      ) : null}
      {corpusStats ? (
        <p className="mt-2 text-sm">
          Total chunks: <span className="font-semibold">{corpusStats.total_chunks}</span>
        </p>
      ) : null}
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
        {corpusResults.map((entry, index) => (
          <li key={`${entry.source_title}-${index}`}>
            {entry.source_title} ({entry.source_type}) - sim {entry.similarity.toFixed(3)}
          </li>
        ))}
      </ul>
    </section>
  );
}
