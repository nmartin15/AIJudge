interface ProgressBarProps {
  steps: string[];
  currentStep: number;
}

export function ProgressBar({ steps, currentStep }: ProgressBarProps) {
  return (
    <nav aria-label="Case intake progress" className="mb-6 sm:mb-10">
      {/* Mobile: compact current-step indicator */}
      <div className="mb-3 flex items-center justify-between sm:hidden">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Step {currentStep + 1} of {steps.length}
        </span>
        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
          {steps[currentStep]}
        </span>
      </div>

      {/* Progress track */}
      <div className="relative sm:hidden">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-zinc-900 transition-all duration-500 ease-out dark:bg-zinc-100"
            style={{
              width: `${((currentStep) / (steps.length - 1)) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Desktop: full stepper */}
      <ol className="hidden items-center sm:flex">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isActive = index === currentStep;
          return (
            <li
              key={step}
              className={`flex items-center ${index < steps.length - 1 ? "flex-1" : ""}`}
            >
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-all duration-300 ${
                    isCompleted
                      ? "bg-emerald-500 text-white shadow-sm"
                      : isActive
                        ? "bg-zinc-900 text-white ring-4 ring-zinc-900/10 dark:bg-zinc-100 dark:text-zinc-900 dark:ring-zinc-100/10"
                        : "bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600"
                  }`}
                >
                  {isCompleted ? (
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={`mt-2 block text-xs font-medium ${
                    isActive
                      ? "text-zinc-900 dark:text-zinc-100"
                      : isCompleted
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-zinc-400 dark:text-zinc-600"
                  }`}
                >
                  {step}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`mx-3 h-0.5 flex-1 rounded-full transition-colors duration-300 ${
                    isCompleted
                      ? "bg-emerald-500"
                      : "bg-zinc-200 dark:bg-zinc-800"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
