"use client";

/**
 * Next.js route-level error boundary.
 *
 * Catches errors thrown during rendering of the current route segment.
 * This covers cases the React ErrorBoundary might miss — e.g. errors in
 * server components that bubble up to the client, or async errors in
 * route transitions.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="mx-auto max-w-md text-center">
        {/* Icon */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 dark:bg-rose-950/40">
          <svg
            className="h-8 w-8 text-rose-600 dark:text-rose-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>

        <h2 className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl dark:text-zinc-100">
          Something went wrong
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          An unexpected error occurred while loading this page. Your case data
          is safe on the server — try again and you should be able to pick up
          where you left off.
        </p>

        {/* Error digest (useful for support tickets / logs) */}
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-zinc-400">
            Error ID: {error.digest}
          </p>
        )}

        {/* Collapsible details */}
        <details className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 text-left dark:border-zinc-800 dark:bg-zinc-900">
          <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
            Technical details
          </summary>
          <pre className="max-h-40 overflow-auto px-4 pb-3 pt-1 font-mono text-xs text-rose-600 dark:text-rose-400">
            {error.message}
            {error.stack && (
              <>
                {"\n\n"}
                {error.stack}
              </>
            )}
          </pre>
        </details>

        {/* Actions */}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center sm:gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-zinc-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-zinc-800 sm:py-2.5 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg border border-zinc-300 px-6 py-3 text-sm font-semibold transition-colors hover:bg-zinc-50 sm:py-2.5 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Reload page
          </button>
        </div>

        <p className="mt-6 text-xs text-zinc-400">
          If this keeps happening, please clear your browser cache or try a
          different browser.
        </p>
      </div>
    </div>
  );
}
