"use client";

/**
 * Next.js global error boundary.
 *
 * This is the *last resort* — it catches errors that occur in the root
 * layout itself (including the <html> and <body> tags). Because it
 * replaces the root layout, it must render its own <html> and <body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="mx-auto max-w-md text-center">
            {/* Icon */}
            <div
              className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{ backgroundColor: "rgba(225, 29, 72, 0.1)" }}
            >
              <svg
                className="h-8 w-8"
                style={{ color: "#e11d48" }}
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

            <h1
              className="text-2xl font-bold tracking-tight"
              style={{ fontFamily: "system-ui, sans-serif" }}
            >
              Something went wrong
            </h1>

            <p
              className="mt-3 text-sm leading-relaxed"
              style={{ color: "#71717a" }}
            >
              The application encountered a critical error. This is rare and
              usually resolves with a page reload.
            </p>

            {error.digest && (
              <p
                className="mt-3 font-mono text-xs"
                style={{ color: "#a1a1aa" }}
              >
                Error ID: {error.digest}
              </p>
            )}

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center sm:gap-3">
              <button
                type="button"
                onClick={reset}
                style={{
                  backgroundColor: "#18181b",
                  color: "#fff",
                  padding: "0.625rem 1.5rem",
                  borderRadius: "0.5rem",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: "none",
                }}
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  backgroundColor: "transparent",
                  color: "#18181b",
                  padding: "0.625rem 1.5rem",
                  borderRadius: "0.5rem",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: "1px solid #d4d4d8",
                }}
              >
                Reload page
              </button>
            </div>

            <p className="mt-6 text-xs" style={{ color: "#a1a1aa" }}>
              If this keeps happening, please clear your browser cache or try a
              different browser.
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
