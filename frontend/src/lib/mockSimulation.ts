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
  caseType:
    | "security_deposit"
    | "property_damage"
    | "contract"
    | "loan_debt"
    | "consumer"
    | "landlord_tenant"
    | "neighbor"
    | "wages"
    | "pet"
    | "other";
  plaintiffNarrative: string;
  defendantNarrative: string;
  amountClaimed: number;
  citations: string[];
  tags: string[];
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

export const BLANK_TEMPLATE: MockCaseTemplate = {
  id: "blank",
  title: "Start from scratch",
  caseType: "other",
  plaintiffNarrative: "",
  defendantNarrative: "",
  amountClaimed: 0,
  citations: [],
  tags: ["blank", "custom", "empty", "new"],
};

export const mockCaseTemplates: MockCaseTemplate[] = [
  BLANK_TEMPLATE,

  // ── Security Deposit ───────────────────────────────────────────────
  {
    id: "wy-deposit-001",
    title: "Security Deposit Withheld Without Itemization (Cheyenne)",
    caseType: "security_deposit",
    plaintiffNarrative:
      "Tenant claims the landlord withheld a $1,500 security deposit without providing an itemized list of deductions within the 30-day window required by Wyoming law.",
    defendantNarrative:
      "Landlord alleges cleaning and carpet repair exceeded normal wear and tear, and that photos taken at move-out justify the full withholding.",
    amountClaimed: 1500,
    citations: ["Wyo. Stat. § 1-21-1208", "W.R.E. 401"],
    tags: ["security deposit", "landlord", "tenant", "rental", "move-out", "deductions", "withholding"],
  },
  {
    id: "wy-deposit-002",
    title: "Partial Deposit Return Dispute (Sheridan)",
    caseType: "security_deposit",
    plaintiffNarrative:
      "Tenant received only $400 of a $1,200 deposit. The landlord deducted $800 for 'carpet replacement,' but the carpet was already worn when the tenant moved in.",
    defendantNarrative:
      "Landlord states the pre-move-in inspection showed acceptable carpet, and the tenant's pet caused stains that required full replacement.",
    amountClaimed: 800,
    citations: ["Wyo. Stat. § 1-21-1208", "W.R.E. 401", "W.R.E. 1002"],
    tags: ["security deposit", "carpet", "pet damage", "partial return", "rental"],
  },

  // ── Landlord / Tenant (non-deposit) ────────────────────────────────
  {
    id: "wy-landlord-001",
    title: "Uninhabitable Rental — Mold & Heating (Rock Springs)",
    caseType: "landlord_tenant",
    plaintiffNarrative:
      "Tenant withheld last month's rent ($950) after repeated complaints about mold in the bathroom and a broken furnace that landlord never repaired.",
    defendantNarrative:
      "Landlord says the tenant never submitted written repair requests and that mold was caused by the tenant's failure to ventilate the bathroom.",
    amountClaimed: 950,
    citations: ["Wyo. Stat. § 1-21-1202", "Wyo. Stat. § 1-21-1206"],
    tags: ["landlord", "tenant", "mold", "habitability", "rent withholding", "repairs", "heating"],
  },
  {
    id: "wy-landlord-002",
    title: "Wrongful Eviction — Lease Still Active (Gillette)",
    caseType: "landlord_tenant",
    plaintiffNarrative:
      "Tenant was locked out mid-lease with no court order. Lost perishable food, had to stay in a motel for five nights, and belongings were put outside.",
    defendantNarrative:
      "Landlord states the tenant was three weeks behind on rent and verbally agreed to vacate after being notified of the overdue balance.",
    amountClaimed: 2200,
    citations: ["Wyo. Stat. § 1-21-1203", "Wyo. Stat. § 6-3-407"],
    tags: ["landlord", "tenant", "eviction", "lockout", "lease", "wrongful"],
  },

  // ── Vehicle / Property Damage ──────────────────────────────────────
  {
    id: "wy-auto-001",
    title: "Parking Lot Fender Bender (Casper)",
    caseType: "property_damage",
    plaintiffNarrative:
      "Plaintiff seeks $980 for rear bumper repair after the defendant backed into their parked car in a grocery store lot.",
    defendantNarrative:
      "Defendant argues prior existing damage inflated the claimed repair amount and that the bumper had a dent before the incident.",
    amountClaimed: 980,
    citations: ["Wyo. Stat. § 1-1-109", "W.R.E. 702"],
    tags: ["vehicle", "car", "accident", "fender bender", "parking lot", "bumper"],
  },
  {
    id: "wy-auto-002",
    title: "Borrowed Vehicle Returned Damaged (Riverton)",
    caseType: "property_damage",
    plaintiffNarrative:
      "Plaintiff loaned their truck to a friend for a weekend move. It was returned with a cracked windshield, dented tailgate, and 600 miles beyond what was agreed.",
    defendantNarrative:
      "Defendant says the windshield crack was from a rock on the highway, the dent was minor, and extra mileage was needed due to a second trip the owner approved verbally.",
    amountClaimed: 1800,
    citations: ["Wyo. Stat. § 1-1-109", "W.R.E. 401"],
    tags: ["vehicle", "truck", "borrowed", "loaned", "windshield", "property damage"],
  },

  // ── Contract Disputes ──────────────────────────────────────────────
  {
    id: "wy-contract-001",
    title: "Unfinished Deck Repair (Laramie)",
    caseType: "contract",
    plaintiffNarrative:
      "Homeowner paid $2,400 upfront for deck repairs. The contractor completed roughly half the work, then stopped showing up and won't return calls.",
    defendantNarrative:
      "Contractor claims work paused because the homeowner changed the scope mid-project and refused to pay for additional materials.",
    amountClaimed: 2400,
    citations: ["Wyo. Stat. § 1-23-105", "W.R.C.P. 26"],
    tags: ["contract", "contractor", "home repair", "deck", "incomplete work"],
  },
  {
    id: "wy-contract-002",
    title: "Wedding Photographer No-Show (Jackson)",
    caseType: "contract",
    plaintiffNarrative:
      "Couple paid a $1,200 deposit for wedding photography. The photographer cancelled 48 hours before the wedding and has not returned the deposit.",
    defendantNarrative:
      "Photographer had a family emergency and offered to reschedule; the couple refused and hired someone else, so the contract's cancellation clause applies.",
    amountClaimed: 1200,
    citations: ["Wyo. Stat. § 1-23-105", "W.R.E. 803(6)"],
    tags: ["contract", "wedding", "photographer", "deposit", "cancellation", "services"],
  },
  {
    id: "wy-contract-003",
    title: "Fence Installation Dispute (Cody)",
    caseType: "contract",
    plaintiffNarrative:
      "Homeowner hired a fencing company for a $3,500 vinyl privacy fence. The fence was installed crooked, panels are already warping, and the company refuses to fix it.",
    defendantNarrative:
      "Company says the installation met industry standards, warping is due to extreme temperature swings, and the homeowner didn't water the post concrete as instructed.",
    amountClaimed: 3500,
    citations: ["Wyo. Stat. § 1-23-105", "W.R.E. 702"],
    tags: ["contract", "fence", "installation", "defective work", "home improvement"],
  },

  // ── Consumer / Defective Goods ─────────────────────────────────────
  {
    id: "wy-consumer-001",
    title: "Used Car Sold With Hidden Engine Damage (Cheyenne)",
    caseType: "consumer",
    plaintiffNarrative:
      "Buyer purchased a used truck for $4,500 from a private seller. Within two weeks the engine seized. A mechanic found evidence the oil light had been tampered with.",
    defendantNarrative:
      "Seller disclosed the vehicle was sold as-is, buyer had the opportunity to inspect and chose not to get a pre-purchase mechanic check.",
    amountClaimed: 4500,
    citations: ["Wyo. Stat. § 40-12-108", "W.R.E. 401"],
    tags: ["consumer", "used car", "as-is", "fraud", "engine", "defective"],
  },
  {
    id: "wy-consumer-002",
    title: "Appliance Warranty Refusal (Evanston)",
    caseType: "consumer",
    plaintiffNarrative:
      "Buyer purchased a $1,100 refrigerator with a 2-year warranty. It stopped cooling after 14 months and the store refuses to honor the warranty, calling it 'cosmetic damage.'",
    defendantNarrative:
      "Store says the unit shows signs of impact damage on the compressor housing, which voids the warranty per the written terms.",
    amountClaimed: 1100,
    citations: ["Wyo. Stat. § 40-12-108", "UCC § 2-314"],
    tags: ["consumer", "warranty", "appliance", "refrigerator", "defective product"],
  },

  // ── Loan / Debt ────────────────────────────────────────────────────
  {
    id: "wy-loan-001",
    title: "Unpaid Personal Loan Between Friends (Rawlins)",
    caseType: "loan_debt",
    plaintiffNarrative:
      "Plaintiff lent $3,000 to a friend via bank transfer with a text-message promise to repay within 6 months. It has been over a year with no payment.",
    defendantNarrative:
      "Defendant says the money was a gift to help with medical bills, not a loan, and that no written agreement was ever signed.",
    amountClaimed: 3000,
    citations: ["Wyo. Stat. § 1-3-105", "W.R.E. 801(d)(2)"],
    tags: ["loan", "debt", "personal loan", "friend", "gift", "repayment", "text messages"],
  },
  {
    id: "wy-loan-002",
    title: "Unpaid Veterinary Bill (Thermopolis)",
    caseType: "loan_debt",
    plaintiffNarrative:
      "A veterinary clinic is owed $2,100 for emergency surgery on the defendant's dog. The defendant signed a payment plan, made one payment, and stopped responding.",
    defendantNarrative:
      "Defendant claims the quoted estimate was $1,200, the final bill was inflated without consent, and the vet performed procedures beyond what was authorized.",
    amountClaimed: 2100,
    citations: ["Wyo. Stat. § 1-3-105", "W.R.E. 803(6)"],
    tags: ["debt", "veterinary", "vet bill", "payment plan", "medical", "animal"],
  },

  // ── Wages / Services ───────────────────────────────────────────────
  {
    id: "wy-wages-001",
    title: "Unpaid Freelance Web Design (Cheyenne)",
    caseType: "wages",
    plaintiffNarrative:
      "Freelance designer completed a $2,000 website for a local business. The client approved the final design in email, took the site live, but never paid the remaining $1,500 balance.",
    defendantNarrative:
      "Business owner says the designer delivered the site three weeks late, the final product had bugs, and the delay cost them revenue during a seasonal promotion.",
    amountClaimed: 1500,
    citations: ["Wyo. Stat. § 27-4-104", "W.R.E. 803(6)"],
    tags: ["wages", "freelance", "web design", "unpaid", "services", "invoice"],
  },
  {
    id: "wy-wages-002",
    title: "Unpaid Ranch Work (Buffalo)",
    caseType: "wages",
    plaintiffNarrative:
      "Worker performed 3 weeks of ranch labor (fencing, feeding, equipment repair) at an agreed rate of $200/day. The ranch owner paid for 1 week and refuses to pay the remaining $2,800.",
    defendantNarrative:
      "Ranch owner says the worker left the job unfinished, damaged a tractor, and the work quality was poor — requiring a replacement worker to redo several sections of fence.",
    amountClaimed: 2800,
    citations: ["Wyo. Stat. § 27-4-104", "Wyo. Stat. § 27-4-101"],
    tags: ["wages", "ranch", "labor", "unpaid work", "agriculture", "employment"],
  },

  // ── Neighbor Disputes ──────────────────────────────────────────────
  {
    id: "wy-neighbor-001",
    title: "Tree Fell on Neighbor's Shed (Powell)",
    caseType: "neighbor",
    plaintiffNarrative:
      "A dead cottonwood tree on the neighbor's property fell during a storm and destroyed the plaintiff's storage shed and riding mower. Multiple prior requests to remove it were ignored.",
    defendantNarrative:
      "Neighbor says the tree appeared healthy, the storm was unusually severe (act of God), and the plaintiff never formally asked in writing for the tree's removal.",
    amountClaimed: 4200,
    citations: ["Wyo. Stat. § 1-1-109", "W.R.E. 401"],
    tags: ["neighbor", "tree", "property damage", "shed", "storm", "negligence"],
  },
  {
    id: "wy-neighbor-002",
    title: "Shared Fence Cost Dispute (Torrington)",
    caseType: "neighbor",
    plaintiffNarrative:
      "Plaintiff replaced a deteriorated boundary fence and is seeking half the cost ($1,600) from the neighbor, who benefits from the fence but refused to contribute.",
    defendantNarrative:
      "Neighbor says they were never consulted, didn't agree to the fence style or contractor, and would have chosen a cheaper option.",
    amountClaimed: 1600,
    citations: ["Wyo. Stat. § 11-28-103", "W.R.E. 401"],
    tags: ["neighbor", "fence", "boundary", "shared cost", "property line"],
  },

  // ── Pet-Related ────────────────────────────────────────────────────
  {
    id: "wy-pet-001",
    title: "Dog Bite Injury (Green River)",
    caseType: "pet",
    plaintiffNarrative:
      "Plaintiff was bitten by the defendant's off-leash dog while jogging on a public trail. Medical bills for stitches and a tetanus shot total $1,800.",
    defendantNarrative:
      "Dog owner says the jogger startled the dog by running too close, the dog has no bite history, and the injuries were minor scratches, not a serious bite.",
    amountClaimed: 1800,
    citations: ["Wyo. Stat. § 1-1-109", "Wyo. Stat. § 11-31-301"],
    tags: ["pet", "dog bite", "injury", "medical bills", "off-leash", "animal"],
  },
  {
    id: "wy-pet-002",
    title: "Boarding Kennel Lost Dog (Lander)",
    caseType: "pet",
    plaintiffNarrative:
      "Plaintiff's dog escaped from a boarding facility due to a broken gate latch. The dog was found injured two days later. Vet bills plus emotional distress amount to $2,500.",
    defendantNarrative:
      "Kennel owner says the latch was in working order, another guest may have left the gate open, and the contract limits liability to the boarding fee.",
    amountClaimed: 2500,
    citations: ["Wyo. Stat. § 1-1-109", "W.R.E. 401"],
    tags: ["pet", "dog", "boarding", "kennel", "escape", "negligence", "vet bills"],
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
