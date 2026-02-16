"use client";

import React from "react";

interface SectionErrorBoundaryProps {
  /** Label shown in the fallback to tell the user which section broke. */
  section: string;
  children: React.ReactNode;
}

interface SectionErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Lightweight error boundary designed to wrap individual page sections
 * (e.g. HearingRoom, JudgmentView). When a section crashes, only that
 * section shows the fallback — the rest of the page stays interactive.
 */
export class SectionErrorBoundary extends React.Component<
  SectionErrorBoundaryProps,
  SectionErrorBoundaryState
> {
  constructor(props: SectionErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): SectionErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      `[SectionErrorBoundary:${this.props.section}] Uncaught error:`,
      error,
      info.componentStack,
    );
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-6 text-center dark:border-rose-900 dark:bg-rose-950/20">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950/50">
            <svg
              className="h-5 w-5 text-rose-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          </div>
          <p className="text-sm font-semibold text-rose-800 dark:text-rose-300">
            {this.props.section} encountered an error
          </p>
          <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
            The rest of the page should still work. You can retry this section
            or reload the full page.
          </p>

          {this.state.error && (
            <details className="mx-auto mt-3 max-w-sm rounded-lg border border-rose-200 bg-white text-left dark:border-rose-800 dark:bg-zinc-900">
              <summary className="cursor-pointer px-3 py-1.5 text-xs font-medium text-rose-400 hover:text-rose-600 dark:hover:text-rose-300">
                Details
              </summary>
              <pre className="max-h-28 overflow-auto px-3 pb-2 pt-0.5 font-mono text-[11px] text-rose-600 dark:text-rose-400">
                {this.state.error.message}
              </pre>
            </details>
          )}

          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-700"
            >
              Retry section
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg border border-rose-300 px-4 py-2 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/50"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
