/**
 * TEMPORARY video demo. Delete this folder and src/app/demo together.
 * It does not call the backend.
 *
 * Each person writes an account, files proof on a point, gets one private
 * chance to add what they lack, then replies only to what they dispute.
 * The other person's gaps stay off their screen.
 */
import type { SimulationOutput } from "@/lib/mockSimulation";

export type DemoStep =
  | "welcome"
  | "login"
  | "home"
  | "submit-alex"
  | "alex-done"
  | "both-parties"
  | "alex-reply"
  | "jordan-reply"
  | "decision";

export type DemoOwner = "alex" | "jordan";

export const DEMO_STEPS: DemoStep[] = [
  "welcome",
  "login",
  "home",
  "submit-alex",
  "alex-done",
  "both-parties",
  "alex-reply",
  "jordan-reply",
  "decision",
];

/** A new claim is stamped with this day. The person can change it. */
export const DEMO_TODAY = "2026-11-10";

export const demoLogin = {
  name: "Alex Rivera",
  email: "alex.rivera@demo.wy",
  password: "deposit1500",
};

export const demoCase = {
  judgeId: "common_sense" as const,
  amountClaimed: 1500,
  plaintiffName: "Alex Rivera",
  defendantName: "Jordan Hale",
  premises: "418 Carey Ave, Cheyenne, WY 82001",
};

export interface AccountPoint {
  date: string;
  iso: string;
  text: string;
}

export interface DemoAccount {
  owner: DemoOwner;
  wants: string;
  story: string;
  points: AccountPoint[];
}

export const accounts: Record<DemoOwner, DemoAccount> = {
  alex: {
    owner: "alex",
    wants: "Return of the $1,500 security deposit.",
    story:
      "I rented 418 Carey Ave from Jordan Hale. On June 1, 2024 I paid a $1,500 security deposit. On April 1, 2025 I mailed written notice that I would leave on May 1. I moved out that day, returned both keys, and left the carpet with ordinary wear. No deduction list came back, and I still do not have the $1,500.",
    points: [
      {
        date: "June 1, 2024",
        iso: "2024-06-01",
        text: "I moved into 418 Carey Ave and paid Jordan Hale a $1,500 security deposit at signing.",
      },
      {
        date: "April 1, 2025",
        iso: "2025-04-01",
        text: "I mailed Jordan written notice that I would leave on May 1, and I asked for the deposit back.",
      },
      {
        date: "May 1, 2025",
        iso: "2025-05-01",
        text: "I moved out on the date in the notice, returned both keys, and left the carpet with ordinary traffic marks. No burns, no holes, no pets.",
      },
      {
        date: "May 31, 2025",
        iso: "2025-05-31",
        text: "No deduction list came back to me. The $1,500 was not returned.",
      },
    ],
  },
  jordan: {
    owner: "jordan",
    wants: "To keep the $1,500 and apply it to the carpet and cleaning.",
    story:
      "Alex moved out of 418 Carey Ave on May 1, 2025. The carpet had dark patches by the entry, in the hallway, and at the bedroom door. I took four photos before the cleaners started. The cleaning and carpet work used the full $1,500, so I kept the deposit.",
    points: [
      {
        date: "May 1, 2025",
        iso: "2025-05-01",
        text: "I walked the unit the day Alex moved out. The carpet had dark patches by the entry, in the hallway, and at the bedroom doorway.",
      },
      {
        date: "May 1, 2025",
        iso: "2025-05-01",
        text: "I took four photos of those patches before the cleaners started.",
      },
      {
        date: "May 20, 2025",
        iso: "2025-05-20",
        text: "A cleaner and a carpet company did the work. I say that work used the full $1,500, so the deposit stays with me.",
      },
    ],
  },
};

export interface DemoFile {
  id: string;
  owner: DemoOwner;
  when: string;
  point: string;
  title: string;
  kind: string;
  lines: string[];
  addedOnChance?: boolean;
}

const bankRecord: DemoFile = {
  id: "bank",
  owner: "alex",
  when: "June 1, 2024",
  point: "I paid a $1,500 deposit",
  title: "Bank record",
  kind: "Account line",
  addedOnChance: true,
  lines: [
    "First Interstate Bank. Account ending 4412. Alex Rivera.",
    "June 1, 2024. Withdrawal of $1,500.00.",
    "Paid to Jordan Hale.",
    "Memo: security deposit, 418 Carey Ave.",
  ],
};

export const demoFiles: DemoFile[] = [
  {
    id: "lease",
    owner: "alex",
    when: "June 1, 2024",
    point: "I paid a $1,500 deposit",
    title: "Signed lease",
    kind: "Lease",
    lines: [
      "Signed June 1, 2024, by Alex Rivera and Jordan Hale.",
      "Premises: 418 Carey Ave, Cheyenne, WY 82001.",
      "Month to month. Rent $1,200, due on the first.",
      "Security deposit $1,500, held by the landlord.",
      "Tenant returns the unit in the same condition, ordinary wear excepted.",
      "Two keys.",
    ],
  },
  {
    id: "notice",
    owner: "alex",
    when: "April 1, 2025",
    point: "I gave written notice and moved out on time",
    title: "Move-out notice",
    kind: "Letter",
    lines: [
      "Dated April 1, 2025. From Alex Rivera.",
      "Mailed to Jordan Hale, 2201 Evans Ave, Cheyenne, WY 82001.",
      "“I am ending the tenancy at 418 Carey Ave.”",
      "“I will move out on May 1, 2025, and return both keys.”",
      "“Please return the $1,500 security deposit.”",
      "Signed Alex Rivera.",
    ],
  },
  bankRecord,
  {
    id: "photos",
    owner: "jordan",
    when: "May 1, 2025",
    point: "The carpet was stained past normal wear",
    title: "Move-out photos",
    kind: "Four photos",
    lines: [
      "Phone photos, May 1, 2025, about 4:10 p.m., before cleaning.",
      "Photo 1. Living room entry. A dark patch about the width of a shoe.",
      "Photo 2. Hallway. One spot beside the closet door.",
      "Photo 3. Bedroom doorway. A third dark patch along the threshold.",
      "Photo 4. A closer crop of the living-room patch.",
      "Two of the four have no date on the image.",
    ],
  },
];

export interface DemoClaim {
  id: string;
  text: string;
  files: DemoFile[];
}

export const alexClaims: DemoClaim[] = [
  {
    id: "deposit",
    text: accounts.alex.points[0].text,
    files: demoFiles.filter((file) => file.id === "lease" || file.id === "bank"),
  },
  {
    id: "notice",
    text: accounts.alex.points[1].text,
    files: demoFiles.filter((file) => file.id === "notice"),
  },
  {
    id: "moveout",
    text: accounts.alex.points[2].text,
    files: [],
  },
  {
    id: "unreturned",
    text: accounts.alex.points[3].text,
    files: [],
  },
];

export interface ChanceNote {
  label: string;
  outcome: "added" | "left-open";
  note: string;
}

export const chanceNotes: Record<DemoOwner, ChanceNote[]> = {
  alex: [
    {
      label: "Bank record of the $1,500 deposit",
      outcome: "added",
      note: "You added the June 1 withdrawal. It is now with your other files.",
    },
    {
      label: "Your own photos of the carpet on move-out day",
      outcome: "left-open",
      note: "You did not add these. That chance is closed.",
    },
  ],
  jordan: [
    {
      label: "Itemized list of deductions, sent within 30 days of move-out",
      outcome: "left-open",
      note: "You did not add this. That chance is closed.",
    },
    {
      label: "Receipt or invoice for the cleaning and carpet work",
      outcome: "left-open",
      note: "You did not add this. That chance is closed.",
    },
  ],
};

export interface DemoReply {
  owner: DemoOwner;
  lines: string[];
}

export const replies: Record<DemoOwner, DemoReply> = {
  alex: {
    owner: "alex",
    lines: [
      "I dispute that the patches are beyond ordinary wear. They are the traffic marks of a year at the entry, the hall, and the bedroom door.",
      "I dispute that the work cost $1,500. The photos show spots. They do not show a bill, and no deduction list came back to me.",
    ],
  },
  jordan: {
    owner: "jordan",
    lines: [
      "I dispute ordinary wear. The photos show dark patches in the living room, the hallway, and the bedroom doorway.",
      "I dispute returning the deposit. The cleaning and the carpet work used the $1,500.",
    ],
  },
};

export const demoJudgment: SimulationOutput = {
  winner: "plaintiff",
  awardAmount: 1500,
  confidence: 0.74,
  decided: true,
  rationale:
    "Alex filed the lease, the April 1 notice, and the bank record of the $1,500. Jordan filed four photos. No itemized list and no repair bill were filed. The photos leave the carpet condition open, and the deposit still goes back.",
  citedAuthorities: ["W.S. 1-21-1208"],
  findingsOfFact: [
    "On June 1, 2024, Alex Rivera paid Jordan Hale a $1,500 security deposit for 418 Carey Ave. The lease and the bank record both say so.",
    "On April 1, 2025, Alex mailed written notice of a May 1 move-out and asked for the deposit back.",
    "Alex moved out on May 1, 2025, and returned both keys.",
    "Jordan walked the unit that day and filed four photos of dark patches in three spots.",
    "From May 1 through May 31, no itemized list of deductions and no bill for cleaning or carpet work were filed.",
    "Alex calls the patches ordinary wear. Jordan calls them damage. The photos do not settle that.",
  ],
  conclusionsOfLaw: [
    {
      text: "A landlord who keeps a security deposit has to give the tenant an itemized list of deductions within the time the statute allows. That list is not in this file, so the $1,500 goes back to Alex Rivera.",
      citation: "W.S. 1-21-1208",
    },
  ],
  judgmentText:
    "Judgment for Alex Rivera in the amount of $1,500.00. Jordan Hale shall return the security deposit.",
  evidenceScoreSummary: [
    { item: "Written notice", score: 82 },
    { item: "Bank record", score: 80 },
    { item: "Move-out photos", score: 48 },
  ],
};

export const stillUncertain = [
  "Whether the dark patches were ordinary wear or damage beyond it.",
  "What the cleaning and carpet work cost. No bill was filed, so that number stays unknown.",
];

export function otherOwner(owner: DemoOwner): DemoOwner {
  return owner === "alex" ? "jordan" : "alex";
}

export function filesOwnedBy(owner: DemoOwner): DemoFile[] {
  return demoFiles.filter((file) => file.owner === owner);
}

export function filesFromOther(owner: DemoOwner): DemoFile[] {
  return demoFiles.filter((file) => file.owner !== owner);
}

export function nextDemoStep(step: DemoStep): DemoStep | null {
  const index = DEMO_STEPS.indexOf(step);
  return DEMO_STEPS[index + 1] ?? null;
}
