/** TypeScript types mirroring the backend Pydantic schemas. */

// ─── Enums ────────────────────────────────────────────────────────────────────

export type PartyRole = "plaintiff" | "defendant";

export type CaseStatus = "intake" | "ready" | "hearing" | "decided";
export type OperatorRole = "viewer" | "admin";

export type CaseType =
  | "contract"
  | "property_damage"
  | "security_deposit"
  | "loan_debt"
  | "consumer"
  | "other";

export type EvidenceType =
  | "document"
  | "photo"
  | "receipt"
  | "text_message"
  | "email"
  | "contract"
  | "other";

// ─── Session ──────────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  role: OperatorRole;
  created_at: string;
}

export interface SessionAuth {
  session_id: string;
  role: OperatorRole;
  is_admin: boolean;
}

// ─── Party ────────────────────────────────────────────────────────────────────

export interface PartyCreate {
  role: PartyRole;
  name: string;
  address?: string;
  phone?: string;
}

export interface Party {
  id: string;
  case_id: string;
  role: PartyRole;
  name: string;
  address: string | null;
  phone: string | null;
}

// ─── Evidence ─────────────────────────────────────────────────────────────────

export interface EvidenceCreate {
  submitted_by: PartyRole;
  evidence_type: EvidenceType;
  title: string;
  description?: string;
}

export interface Evidence {
  id: string;
  case_id: string;
  submitted_by: PartyRole;
  evidence_type: EvidenceType;
  title: string;
  description: string | null;
  file_path: string | null;
  score: number | null;
  score_explanation: string | null;
  created_at: string;
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

export interface TimelineEventCreate {
  event_date: string;
  description: string;
  source?: PartyRole;
  disputed?: boolean;
}

export interface TimelineEvent {
  id: string;
  case_id: string;
  event_date: string;
  description: string;
  source: PartyRole | null;
  disputed: boolean;
  created_at: string;
}

// ─── Case ─────────────────────────────────────────────────────────────────────

export interface CaseCreate {
  case_type?: CaseType;
  plaintiff_narrative?: string;
  defendant_narrative?: string;
  claimed_amount?: number;
  damages_breakdown?: Record<string, number>;
}

export interface CaseUpdate {
  case_type?: CaseType;
  plaintiff_narrative?: string;
  defendant_narrative?: string;
  claimed_amount?: number;
  damages_breakdown?: Record<string, number>;
  archetype_id?: string;
}

export interface Case {
  id: string;
  session_id: string;
  status: CaseStatus;
  case_type: CaseType | null;
  case_type_confidence: number | null;
  plaintiff_narrative: string | null;
  defendant_narrative: string | null;
  claimed_amount: number | null;
  damages_breakdown: Record<string, number> | null;
  archetype_id: string | null;
  created_at: string;
  updated_at: string;
  parties: Party[];
  evidence: Evidence[];
  timeline_events: TimelineEvent[];
}

export interface CaseSummary {
  id: string;
  status: CaseStatus;
  case_type: CaseType | null;
  claimed_amount: number | null;
  created_at: string;
  updated_at: string;
}

// ─── Hearing ──────────────────────────────────────────────────────────────────

export interface HearingMessage {
  id: string;
  hearing_id: string;
  role: string;
  content: string;
  sequence: number;
  created_at: string;
}

export interface HearingMessageCreate {
  role: "plaintiff" | "defendant";
  content: string;
}

export interface HearingMessageExchange {
  judge_message: {
    role: "judge";
    content: string;
    sequence: number;
  };
  hearing_concluded: boolean;
}

export interface Hearing {
  id: string;
  case_id: string;
  archetype_id: string;
  started_at: string;
  completed_at: string | null;
  messages: HearingMessage[];
}

// ─── Judgment ─────────────────────────────────────────────────────────────────

export interface CaseStrength {
  score: number;
  label: string;
  prevailing_party: string;
  confidence: string;
  elements_proven: number;
  elements_total: number;
  damages_proven: boolean;
  amount_justified: number | null;
}

export interface EvidenceAction {
  element: string;
  current_strength: string;
  action: string;
  what_to_bring: string;
  impact: string;
}

export interface StrategicAdvice {
  category: string;
  title: string;
  advice: string;
  priority: "high" | "medium" | "low";
}

export interface CourtPreparation {
  case_summary: string;
  evidence_checklist: Array<{
    item: string;
    priority: string;
    note: string;
  }>;
  opening_statement: string;
  anticipated_questions: Array<{
    question: string;
    suggested_approach: string;
  }>;
  key_points: string[];
}

export interface EvidenceRecommendation {
  element: string;
  current_score: number;
  defendant_score: number;
  priority: string;
  gap_description: string;
  plaintiff_evidence: string;
  net_assessment: string;
}

export interface CaseAdvisory {
  case_strength: CaseStrength;
  evidence_recommendations: EvidenceRecommendation[];
  evidence_actions: EvidenceAction[];
  strategic_advice: StrategicAdvice[];
  court_preparation: CourtPreparation;
}

export interface Judgment {
  id: string;
  case_id: string;
  archetype_id: string;
  findings_of_fact: string[];
  conclusions_of_law: { text: string; citation: string }[];
  judgment_text: string;
  rationale: string;
  awarded_amount: number | null;
  in_favor_of: PartyRole;
  evidence_scores: Record<string, unknown> | null;
  reasoning_chain: Record<string, unknown> | null;
  advisory: CaseAdvisory | null;
  created_at: string;
}

export interface JudgmentCallMetadata {
  step: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  latency_ms: number;
}

export interface JudgmentMetadata {
  total_cost_usd: number;
  total_latency_ms: number;
  total_input_tokens: number;
  total_output_tokens: number;
  calls: JudgmentCallMetadata[];
}

export interface ComparisonResult {
  archetype_id: string;
  findings_of_fact: string[];
  conclusions_of_law: { text: string; citation: string }[];
  judgment_text: string;
  rationale: string;
  awarded_amount: number | null;
  in_favor_of: PartyRole;
  evidence_scores: Record<string, unknown> | null;
  reasoning_chain: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface ComparisonInsights {
  consensus: string;
  consensus_text: string;
  plaintiff_wins: number;
  defendant_wins: number;
  total_judges: number;
  award_range: {
    min: number;
    max: number;
    avg: number;
    median: number;
  };
  risks: Array<{
    archetype_id: string;
    reason: string;
  }>;
  favorable_judges: string[];
}

export interface ComparisonRun {
  id: string;
  case_id: string;
  archetype_ids: string[];
  reused: boolean;
  created_at: string;
  results: ComparisonResult[];
  comparison_insights: ComparisonInsights | null;
}

// ─── Archetypes ───────────────────────────────────────────────────────────────

export interface Archetype {
  id: string;
  name: string;
  description: string;
  tone: string;
  icon: string;
}

export interface CorpusSearchResult {
  source_type: string;
  source_title: string;
  section_number: string | null;
  topic: string | null;
  content: string;
  similarity: number;
}

export interface CorpusStats {
  total_chunks: number;
  by_source_type: Record<string, number>;
}

// ─── Health ───────────────────────────────────────────────────────────────────

export interface HealthCheck {
  status: string;
  service: string;
  version: string;
}
