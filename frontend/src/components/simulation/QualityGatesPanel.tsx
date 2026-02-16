import type { JudgmentMetadata } from "@/lib/types";

interface QualityGatesPanelProps {
  caseId: string | null;
  metadata: JudgmentMetadata | null;
  onRefreshMetadata: () => void;
}

export function QualityGatesPanel({
  caseId,
  metadata,
  onRefreshMetadata,
}: QualityGatesPanelProps) {
  return (
    <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Quality gates</h2>
        {caseId ? (
          <button
            type="button"
            className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            onClick={onRefreshMetadata}
          >
            Refresh metadata
          </button>
        ) : null}
      </div>
      {metadata ? (
        <>
          <div className="grid gap-3 text-sm sm:grid-cols-4">
            <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
              <p className="text-xs text-zinc-500">Total cost</p>
              <p className="font-semibold">${metadata.total_cost_usd}</p>
            </div>
            <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
              <p className="text-xs text-zinc-500">Total latency</p>
              <p className="font-semibold">{metadata.total_latency_ms} ms</p>
            </div>
            <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
              <p className="text-xs text-zinc-500">Input tokens</p>
              <p className="font-semibold">{metadata.total_input_tokens}</p>
            </div>
            <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
              <p className="text-xs text-zinc-500">Output tokens</p>
              <p className="font-semibold">{metadata.total_output_tokens}</p>
            </div>
          </div>
          {metadata.calls.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Per-step LLM calls
              </p>
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-700">
                    <th className="px-2 py-2">Step</th>
                    <th className="px-2 py-2">Model</th>
                    <th className="px-2 py-2">Input</th>
                    <th className="px-2 py-2">Output</th>
                    <th className="px-2 py-2">Cost</th>
                    <th className="px-2 py-2">Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {metadata.calls.map((call, index) => (
                    <tr
                      key={`${call.step}-${index}`}
                      className="border-b border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="px-2 py-2">{call.step}</td>
                      <td className="px-2 py-2">{call.model}</td>
                      <td className="px-2 py-2">{call.input_tokens}</td>
                      <td className="px-2 py-2">{call.output_tokens}</td>
                      <td className="px-2 py-2">${call.cost_usd.toFixed(4)}</td>
                      <td className="px-2 py-2">{call.latency_ms} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No judgment metadata yet. Run a backend judgment first.
        </p>
      )}
    </section>
  );
}
