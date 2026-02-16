import { useCallback, useEffect, useRef } from "react";
import type { JudgeTemperament } from "@/lib/mockSimulation";
import type { PartyRole, EvidenceType } from "@/lib/types";

// ── Shape of persisted data ─────────────────────────────────────────

export interface PersistedFormData {
  /** ISO timestamp when the data was saved */
  savedAt: string;
  /** Schema version for forward-compat */
  version: 1;

  // Phase & step
  activeStep: number;

  // Story
  selectedTemplateId: string;
  plaintiffNarrative: string;
  defendantNarrative: string;
  amountClaimed: number;
  judgeId: JudgeTemperament;

  // Parties
  plaintiffName: string;
  plaintiffAddress: string;
  plaintiffPhone: string;
  defendantName: string;
  defendantAddress: string;
  defendantPhone: string;

  // Evidence form (current unsaved form fields)
  evidenceRole: PartyRole;
  evidenceType: EvidenceType;
  evidenceTitle: string;
  evidenceDescription: string;

  // Timeline form (current unsaved form fields)
  timelineDate: string;
  timelineDescription: string;
  timelineSource: PartyRole;
  timelineDisputed: boolean;
}

// ── Constants ────────────────────────────────────────────────────────

const STORAGE_KEY = "wyoming-ai-judge-form";
const DEBOUNCE_MS = 800;
/** Discard saved data older than 24 hours */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

// ── Helpers ──────────────────────────────────────────────────────────

function readFromStorage(): PersistedFormData | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedFormData;
    // Version & freshness check
    if (parsed.version !== 1) return null;
    if (Date.now() - new Date(parsed.savedAt).getTime() > MAX_AGE_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeToStorage(data: PersistedFormData): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

// ── Hook ─────────────────────────────────────────────────────────────

/**
 * Persists form data to sessionStorage so users don't lose work on
 * accidental tab close / reload / navigation.
 *
 * Returns:
 *  - `restore()` — call once on mount; returns saved data or null
 *  - `save(data)` — debounced save (call on every state change)
 *  - `clear()` — wipe saved state (call on judgment / start-over)
 */
export function useFormPersistence() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<PersistedFormData | null>(null);

  // Flush any pending save immediately
  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (latestRef.current) {
      writeToStorage(latestRef.current);
    }
  }, []);

  // Debounced save
  const save = useCallback(
    (data: Omit<PersistedFormData, "savedAt" | "version">) => {
      const full: PersistedFormData = {
        ...data,
        savedAt: new Date().toISOString(),
        version: 1,
      };
      latestRef.current = full;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        writeToStorage(full);
        timerRef.current = null;
      }, DEBOUNCE_MS);
    },
    []
  );

  // Read saved data (call on mount)
  const restore = useCallback((): PersistedFormData | null => {
    return readFromStorage();
  }, []);

  // Clear saved data
  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    latestRef.current = null;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  // Flush on visibility change (user switches tabs / minimizes)
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        flush();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      // Flush on unmount
      flush();
    };
  }, [flush]);

  // Also flush on beforeunload as a last resort
  useEffect(() => {
    function handleBeforeUnload() {
      flush();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [flush]);

  return { save, restore, clear };
}
