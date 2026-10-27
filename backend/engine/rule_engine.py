"""
Step 3: Rule Retrieval and Application.

Hybrid approach: static foundational rules + dynamic RAG retrieval.
Builds the legal framework the judge will apply to the case.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from corpus.retriever import get_relevant_rules

# ─── Static Rules (always available, no RAG needed) ───────────────────────────

STATIC_RULES = {
    "jurisdiction": {
        "amount_limit": 6000.00,
        "court": "Wyoming Circuit Court, small claims track",
        "rule": (
            "W.S. 1-21-201 applies when the amount claimed, exclusive of costs, "
            "does not exceed $6,000. Costs are outside the cap. Interest is not. "
            "A civil claim above $6,000 and through $50,000 is still a circuit-court "
            "case on the regular civil track under W.S. 5-9-128."
        ),
        "statute": "W.S. 1-21-201; W.S. 5-9-128",
    },
    "burden_of_proof": {
        "standard": "Preponderance of the evidence",
        "description": (
            "The plaintiff must show the claim is more likely than not. "
            "W.S. 1-21-204 sets the appearance date. It does not state the burden."
        ),
        "statute": "Small Claims Rule 6",
    },
    "evidence_rules": {
        "formality": "Strict rules of evidence do not apply",
        "standard": (
            "The court excludes irrelevant, immaterial, or unduly repetitious evidence "
            "and may receive evidence that reasonably prudent people rely on in their "
            "serious affairs. Hearsay that is probative, trustworthy, and credible may be received."
        ),
        "statute": "Small Claims Rule 6",
    },
    "damages": {
        "general": "The plaintiff must prove the dollars claimed. A round number without support is not proof of the amount.",
        "comparative_fault": (
            "W.S. 1-1-109 is comparative fault for injury to person or property. "
            "Recovery is barred if the claimant's fault is more than 50 percent. "
            "Otherwise damages are reduced by the claimant's share of fault."
        ),
        "security_deposit": (
            "W.S. 1-21-1208: the balance, prepaid rent, and a written itemization go out "
            "within 30 days after termination or 15 days after the renter's new address, "
            "whichever is later. Damage to the unit extends that period by 30 days. "
            "The renter must give a payment address within 30 days of termination. "
            "An unreasonable failure lets the renter recover the full deposit and court costs."
        ),
        "statute": "W.S. 1-1-109; W.S. 1-21-1208",
    },
    "service": {
        "notice": (
            "The appearance date is not more than 20 days and not less than 12 days after service. "
            "That window has applied to cases filed on or after July 1, 2021."
        ),
        "methods": [
            "Service as otherwise provided by law",
            "Certified mail to a defendant who resides in Wyoming, complete when the circuit judge receives the return receipt signed by the defendant or the defendant's agent",
        ],
        "statute": "W.S. 1-21-203; W.S. 1-21-204",
    },
    "pleadings": {
        "answer_required": False,
        "description": (
            "No answer or other responsive pleading is required. The hearing is informal, "
            "and no pleading beyond the claim and notice is necessary. "
            "The small-claims article does not create a separate counterclaim form."
        ),
        "statute": "W.S. 1-21-205; Small Claims Rule 5",
    },
    "appeal": {
        "deadline": "Notice of appeal is filed within 30 days after entry of the appealable order.",
        "scope": (
            "The district court reviews questions of law. "
            "The appeal is not a new trial and does not review whether the evidence was sufficient."
        ),
        "statute": "Small Claims Rule 7; W.R.A.P. 2.01",
    },
}

# Elements required for each claim type
CLAIM_ELEMENTS = {
    "contract": {
        "name": "Breach of Contract",
        "elements": [
            "A valid contract existed (written or oral)",
            "Plaintiff performed their obligations (or was excused from performance)",
            "Defendant breached the contract",
            "Plaintiff suffered damages as a direct result of the breach",
        ],
        "damages_measure": "Benefit of the bargain",
    },
    "property_damage": {
        "name": "Property Damage (Negligence)",
        "elements": [
            "Defendant owed plaintiff a duty of care",
            "Defendant breached that duty",
            "The breach was the proximate cause of the damage",
            "Plaintiff suffered actual, quantifiable damages",
        ],
        "damages_measure": "Lesser of repair cost or diminution in value",
    },
    "security_deposit": {
        "name": "Security Deposit Return",
        "elements": [
            "Tenant paid a security deposit",
            "Lease terminated and tenant vacated the property",
            "Owner missed the W.S. 1-21-1208 deadline: 30 days after termination or 15 days after the renter's new address, whichever is later, plus 30 days if the unit was damaged",
            "Renter gave a payment address within 30 days of termination, or the owner already had it",
            "Deductions were unsupported, or the owner gave no written itemization",
        ],
        "damages_measure": "Full deposit and court costs if the failure was unreasonable; otherwise the amount wrongfully withheld",
    },
    "loan_debt": {
        "name": "Money Owed (Debt/Loan)",
        "elements": [
            "Defendant received money or goods from plaintiff",
            "An agreement to repay existed (express or implied)",
            "Defendant has failed to repay",
            "The amount claimed is accurate",
        ],
        "damages_measure": "Principal amount owed plus any agreed interest",
    },
    "consumer": {
        "name": "Consumer Dispute",
        "elements": [
            "A transaction occurred between the parties",
            "Goods or services were defective or not as represented",
            "Plaintiff notified defendant of the problem",
            "Defendant failed to remedy the situation",
            "Plaintiff suffered quantifiable damages",
        ],
        "damages_measure": "Cost to remedy or difference in value",
    },
    "other": {
        "name": "General Civil Claim",
        "elements": [
            "Defendant owed a duty or obligation to plaintiff",
            "Defendant breached that duty or obligation",
            "Plaintiff suffered damages as a result",
            "The amount of damages is proven",
        ],
        "damages_measure": "Actual proven damages",
    },
}


async def get_applicable_rules(
    db: AsyncSession,
    case_type: str,
    claim_description: str,
    disputed_issues: list[dict] | None = None,
) -> dict:
    """
    Build the complete legal framework for a case.

    Combines static rules with dynamically retrieved corpus chunks.

    Returns:
        dict with static rules, claim elements, and retrieved corpus chunks
    """
    # Get the claim elements for this type
    claim_type_key = case_type.lower().replace(" ", "_")
    elements = CLAIM_ELEMENTS.get(claim_type_key, CLAIM_ELEMENTS["other"])

    # Build retrieval query from the claim and disputed issues
    retrieval_query = f"{case_type} claim: {claim_description}"
    if disputed_issues:
        issues_text = "; ".join(i.get("issue", "") for i in disputed_issues[:3])
        retrieval_query += f" Disputed: {issues_text}"

    # RAG retrieval for specific statutes and guidance
    retrieved_chunks = await get_relevant_rules(db, case_type, retrieval_query, limit=6)

    return {
        "static_rules": STATIC_RULES,
        "claim_elements": elements,
        "retrieved_corpus": retrieved_chunks,
        "case_type": case_type,
    }
