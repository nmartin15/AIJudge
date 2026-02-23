import { useEffect, useState } from "react";
import { SIMULATION_MODE } from "@/lib/simulationService";
import {
  claimAdminRole,
  getCorpusStats,
  getSessionAuth,
  ingestCorpus,
  searchCorpus,
} from "@/lib/api";
import type { CorpusSearchResult, CorpusStats, OperatorRole } from "@/lib/types";
import { normalizeError } from "@/lib/normalizeError";

export function useCorpusAdmin() {
  const [corpusStats, setCorpusStats] = useState<CorpusStats | null>(null);
  const [corpusQuery, setCorpusQuery] = useState("");
  const [corpusResults, setCorpusResults] = useState<CorpusSearchResult[]>([]);
  const [isLoadingCorpus, setIsLoadingCorpus] = useState(false);
  const [isIngestingCorpus, setIsIngestingCorpus] = useState(false);
  const [corpusStatus, setCorpusStatus] = useState<string | null>(null);
  const [sessionRole, setSessionRole] = useState<OperatorRole | null>(null);
  const [adminKey, setAdminKey] = useState("");
  const [isClaimingAdmin, setIsClaimingAdmin] = useState(false);
  const isCorpusAdmin = sessionRole === "admin";

  async function refreshCorpusStats(): Promise<void> {
    if (!isCorpusAdmin) {
      setCorpusStatus("Admin role required for corpus operations.");
      return;
    }
    setIsLoadingCorpus(true);
    try {
      const stats = await getCorpusStats();
      setCorpusStats(stats);
      setCorpusStatus(null);
    } catch (error) {
      setCorpusStatus(normalizeError(error));
    } finally {
      setIsLoadingCorpus(false);
    }
  }

  async function runCorpusSearch(): Promise<void> {
    if (!isCorpusAdmin) {
      setCorpusStatus("Admin role required for corpus operations.");
      return;
    }
    if (!corpusQuery.trim()) return;
    setIsLoadingCorpus(true);
    try {
      const results = await searchCorpus(corpusQuery.trim(), 5);
      setCorpusResults(results);
      setCorpusStatus(null);
    } catch (error) {
      setCorpusStatus(normalizeError(error));
    } finally {
      setIsLoadingCorpus(false);
    }
  }

  async function runCorpusIngest(): Promise<void> {
    if (!isCorpusAdmin) {
      setCorpusStatus("Admin role required for corpus operations.");
      return;
    }
    setIsIngestingCorpus(true);
    try {
      const response = await ingestCorpus();
      setCorpusStatus(
        `Ingest complete. Chunks ingested: ${response.chunks_ingested}`,
      );
      await refreshCorpusStats();
    } catch (error) {
      setCorpusStatus(normalizeError(error));
    } finally {
      setIsIngestingCorpus(false);
    }
  }

  async function refreshSessionRole(): Promise<void> {
    if (SIMULATION_MODE !== "backend") return;
    try {
      const auth = await getSessionAuth();
      setSessionRole(auth.role);
    } catch {
      setSessionRole(null);
    }
  }

  async function authenticateCorpusAdmin(): Promise<void> {
    if (!adminKey.trim()) {
      setCorpusStatus("Provide an admin key.");
      return;
    }
    setIsClaimingAdmin(true);
    try {
      const role = await claimAdminRole(adminKey.trim());
      setSessionRole(role);
      setAdminKey("");
      setCorpusStatus("Admin role claim updated.");
      await refreshCorpusStats();
    } catch (error) {
      setCorpusStatus(normalizeError(error));
    } finally {
      setIsClaimingAdmin(false);
    }
  }

  // ── Effects ────────────────────────────────────────────────────────

  useEffect(() => {
    void refreshSessionRole();
  }, []);

  useEffect(() => {
    if (SIMULATION_MODE !== "backend" || !isCorpusAdmin) return;
    let active = true;
    async function syncCorpusStats(): Promise<void> {
      setIsLoadingCorpus(true);
      try {
        const stats = await getCorpusStats();
        if (!active) return;
        setCorpusStats(stats);
        setCorpusStatus(null);
      } catch (error) {
        if (!active) return;
        setCorpusStatus(normalizeError(error));
      } finally {
        if (active) setIsLoadingCorpus(false);
      }
    }
    void syncCorpusStats();
    return () => {
      active = false;
    };
  }, [isCorpusAdmin]);

  return {
    sessionRole,
    isCorpusAdmin,
    adminKey,
    setAdminKey,
    isClaimingAdmin,
    authenticateCorpusAdmin,
    corpusStats,
    corpusQuery,
    setCorpusQuery,
    corpusResults,
    isLoadingCorpus,
    isIngestingCorpus,
    corpusStatus,
    refreshCorpusStats,
    runCorpusSearch,
    runCorpusIngest,
  };
}
