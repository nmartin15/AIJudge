import type { CaseType } from "@/lib/types";

const STORED_CASE_TYPES = new Set<string>([
  "contract",
  "property_damage",
  "security_deposit",
  "loan_debt",
  "consumer",
  "other",
]);

const TEMPLATE_CASE_TYPE_MAP: Record<string, CaseType> = {
  landlord_tenant: "other",
  wages: "contract",
  neighbor: "property_damage",
  pet: "other",
};

export function toStoredCaseType(value: string | undefined): CaseType | undefined {
  if (!value) return undefined;
  if (STORED_CASE_TYPES.has(value)) return value as CaseType;
  return TEMPLATE_CASE_TYPE_MAP[value] ?? "other";
}
