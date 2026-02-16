export type JudgeTemperament =
  | "strict"
  | "common_sense"
  | "evidence_heavy"
  | "practical";

export interface MockJudgeArchetype {
  id: JudgeTemperament;
  name: string;
  tone: string;
  description: string;
}

export interface MockCaseTemplate {
  id: string;
  title: string;
  caseType: "security_deposit" | "property_damage" | "contract";
  plaintiffNarrative: string;
  defendantNarrative: string;
  amountClaimed: number;
  citations: string[];
}

export interface SimulationInput {
  templateId: string;
  plaintiffNarrative: string;
  defendantNarrative: string;
  amountClaimed: number;
  plaintiffEvidenceStrength: number;
  defendantEvidenceStrength: number;
  judgeId: JudgeTemperament;
}

export interface SimulationOutput {
  winner: "plaintiff" | "defendant";
  awardAmount: number;
  confidence: number;
  rationale: string;
  citedAuthorities: string[];
  findingsOfFact: string[];
  conclusionsOfLaw: Array<{ text: string; citation: string }>;
  judgmentText: string;
  evidenceScoreSummary: Array<{ item: string; score: number }>;
  reasoningChain?: Record<string, unknown>;
  advisory?: import("@/lib/types").CaseAdvisory | null;
}

export const mockJudges: MockJudgeArchetype[] = [
  {
    id: "strict",
    name: "The Strict Judge",
    tone: "Formal and procedural",
    description:
      "Penalizes missing records and timeline inconsistencies. Applies hard procedural expectations.",
  },
  {
    id: "common_sense",
    name: "The Common-Sense Judge",
    tone: "Practical and fair-minded",
    description:
      "Looks for the most reasonable story and a fair middle-ground when both sides are partly credible.",
  },
  {
    id: "evidence_heavy",
    name: "The Evidence-Heavy Judge",
    tone: "Analytical and record-focused",
    description:
      "Gives the highest weight to receipts, photos, and timestamped documents over testimony alone.",
  },
  {
    id: "practical",
    name: "The Practical Judge",
    tone: "Direct and outcome-focused",
    description:
      "Prioritizes enforceable outcomes and narrow, workable remedies over broad theory.",
  },
];

export const mockCaseTemplates: MockCaseTemplate[] = [
  {
    id: "wy-deposit-001",
    title: "Security Deposit Dispute (Cheyenne)",
    caseType: "security_deposit",
    plaintiffNarrative:
      "Tenant claims the landlord withheld a $1,500 security deposit without itemized deductions.",
    defendantNarrative:
      "Landlord alleges cleaning and carpet repair exceeded normal wear and tear.",
    amountClaimed: 1500,
    citations: ["Wyo. Stat. 1-21-1208", "W.R.E. 401"],
  },
  {
    id: "wy-auto-002",
    title: "Minor Vehicle Damage (Casper)",
    caseType: "property_damage",
    plaintiffNarrative:
      "Plaintiff seeks reimbursement for rear bumper repair after a parking lot collision.",
    defendantNarrative:
      "Defendant argues prior existing damage inflated the claimed repair amount.",
    amountClaimed: 980,
    citations: ["Wyo. Stat. 1-1-109", "W.R.E. 702"],
  },
  {
    id: "wy-handyman-003",
    title: "Home Repair Contract (Laramie)",
    caseType: "contract",
    plaintiffNarrative:
      "Homeowner claims contractor took payment but failed to complete the agreed deck repairs.",
    defendantNarrative:
      "Contractor claims work paused due to changed scope and nonpayment of final installment.",
    amountClaimed: 2400,
    citations: ["Wyo. Stat. 1-23-105", "W.R.C.P. 26"],
  },
];

function roundToCurrency(value: number): number {
  return Math.max(0, Math.round(value * 100) / 100);
}

export function runMockSimulation(input: SimulationInput): SimulationOutput {
  const judgeBias = {
    strict: { evidenceWeight: 1.2, splitBias: 0.85, defendantLean: 0.05 },
    common_sense: { evidenceWeight: 0.95, splitBias: 1.05, defendantLean: 0.0 },
    evidence_heavy: { evidenceWeight: 1.35, splitBias: 0.8, defendantLean: 0.02 },
    practical: { evidenceWeight: 1.0, splitBias: 1.1, defendantLean: -0.02 },
  }[input.judgeId];

  const plaintiffScore = input.plaintiffEvidenceStrength * judgeBias.evidenceWeight;
  const defendantScore =
    input.defendantEvidenceStrength * judgeBias.evidenceWeight +
    judgeBias.defendantLean * 10;
  const totalScore = Math.max(1, plaintiffScore + defendantScore);
  const plaintiffRatio = plaintiffScore / totalScore;

  const winner = plaintiffRatio >= 0.5 ? "plaintiff" : "defendant";
  const spread = Math.abs(plaintiffRatio - 0.5) * 2;
  const confidence = Math.min(0.95, Math.max(0.51, 0.55 + spread * 0.4));

  const likelyAwardFraction =
    winner === "plaintiff"
      ? Math.min(1, plaintiffRatio * judgeBias.splitBias)
      : Math.min(1, (1 - plaintiffRatio) * 0.2);

  const awardAmount =
    winner === "plaintiff"
      ? roundToCurrency(input.amountClaimed * likelyAwardFraction)
      : 0;

  const rationale =
    winner === "plaintiff"
      ? `The court finds the plaintiff's record more credible under the ${input.judgeId.replace(
          "_",
          " "
        )} approach, with stronger support from submitted evidence.`
      : `The court finds the defendant's position more persuasive due to gaps in the plaintiff's proof under the ${input.judgeId.replace(
          "_",
          " "
        )} approach.`;

  const template = mockCaseTemplates.find((item) => item.id === input.templateId);
  const conclusionsOfLaw = (template?.citations ?? ["Wyo. Stat. (placeholder)"]).map(
    (citation) => ({
      text: "The cited authority supports the applied burden and remedy framework.",
      citation,
    })
  );
  const findingsOfFact = [
    `The court considered both narratives and weighted the ${input.judgeId.replace("_", " ")} judicial approach.`,
    "The evidentiary record was assessed for internal consistency and documentary support.",
    `The claimed amount of $${input.amountClaimed} was reviewed against probable proof of damages.`,
  ];
  const judgmentText =
    winner === "plaintiff"
      ? `Judgment is entered for the plaintiff in the amount of $${awardAmount}.`
      : "Judgment is entered for the defendant. No monetary award is granted.";
  const evidenceScoreSummary = [
    {
      item: "Plaintiff evidentiary support",
      score: roundToCurrency(Math.min(100, plaintiffScore)),
    },
    {
      item: "Defendant evidentiary support",
      score: roundToCurrency(Math.min(100, defendantScore)),
    },
  ];

  return {
    winner,
    awardAmount,
    confidence: roundToCurrency(confidence),
    rationale,
    citedAuthorities: template?.citations ?? ["Wyo. Stat. (placeholder)"],
    findingsOfFact,
    conclusionsOfLaw,
    judgmentText,
    evidenceScoreSummary,
    reasoningChain: {
      model: "mock",
      plaintiffRatio: roundToCurrency(plaintiffRatio),
      judgeId: input.judgeId,
    },
  };
}
