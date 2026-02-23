interface ProgressBarProps {
  steps: string[];
  currentStep: number;
  onStepClick?: (step: number) => void;
}

export function ProgressBar({ steps, currentStep, onStepClick }: ProgressBarProps) {
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

      {/* Progress track (mobile) */}
      <div className="relative sm:hidden">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-wy-navy-50 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-wy-navy transition-all duration-500 ease-out dark:bg-wy-gold"
            style={{
              width: `${((currentStep) / (steps.length - 1)) * 100}%`,
            }}
          />
        </div>
        {/* Mobile step dots */}
        {onStepClick && (
          <div className="mt-2 flex justify-between px-1">
            {steps.map((step, index) => {
              const isClickable = index <= currentStep;
              return (
                <button
                  key={step}
                  type="button"
                  disabled={!isClickable}
                  onClick={() => isClickable && onStepClick(index)}
                  className={`h-2 w-2 rounded-full transition-all ${
                    index === currentStep
                      ? "bg-wy-navy scale-125 dark:bg-wy-gold"
                      : index < currentStep
                        ? "bg-wy-gold cursor-pointer hover:scale-150"
                        : "bg-zinc-300 dark:bg-zinc-700"
                  }`}
                  aria-label={`Go to ${step}`}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Desktop: full stepper */}
      <ol className="hidden items-center sm:flex">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isActive = index === currentStep;
          const isClickable = onStepClick && index <= currentStep;
          return (
            <li
              key={step}
              aria-current={isActive ? "step" : undefined}
              className={`flex items-center ${index < steps.length - 1 ? "flex-1" : ""}`}
            >
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  disabled={!isClickable}
                  onClick={() => isClickable && onStepClick(index)}
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-all duration-300 ${
                    isCompleted
                      ? "bg-wy-gold text-wy-navy shadow-sm cursor-pointer hover:ring-4 hover:ring-wy-gold/30"
                      : isActive
                        ? "bg-wy-navy text-white ring-4 ring-wy-navy/10 dark:bg-wy-gold dark:text-wy-navy dark:ring-wy-gold/20"
                        : "bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600"
                  }`}
                  aria-label={`Go to ${step}`}
                >
                  {isCompleted ? (
                    <svg
                      aria-hidden="true"
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
                </button>
                <span
                  className={`mt-2 block text-xs font-medium ${
                    isClickable && !isActive ? "cursor-pointer" : ""
                  } ${
                    isActive
                      ? "text-wy-navy font-semibold dark:text-wy-gold"
                      : isCompleted
                        ? "text-wy-gold-dark dark:text-wy-gold"
                        : "text-zinc-400 dark:text-zinc-600"
                  }`}
                  onClick={() => isClickable && onStepClick(index)}
                >
                  {step}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`mx-3 h-0.5 flex-1 rounded-full transition-colors duration-300 ${
                    isCompleted
                      ? "bg-wy-gold"
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
