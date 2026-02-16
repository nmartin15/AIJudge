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
        "court": "Wyoming Circuit Court — Small Claims Docket",
        "statute": "W.S. 1-21-201",
        "rule": "Amount in controversy must not exceed $6,000, exclusive of interest and costs.",
    },
    "burden_of_proof": {
        "standard": "Preponderance of the evidence",
        "description": "More likely than not (greater than 50%). The plaintiff bears the burden.",
        "statute": "W.S. 1-21-204(b)",
    },
    "evidence_rules": {
        "formality": "Formal rules of evidence do not apply",
        "standard": "Court may consider any evidence it deems reliable and relevant",
        "preference": "Documentary evidence generally given more weight than oral testimony alone",
        "statute": "W.S. 1-21-201(b)",
    },
    "damages": {
        "general": "Damages must be proven with reasonable certainty. Speculative damages not recoverable.",
        "property": "Lesser of cost of repair or diminution in market value.",
        "contract": "Benefit of the bargain — position plaintiff would be in had contract been performed.",
        "statute": "W.S. 1-1-109",
    },
    "service": {
        "notice": "Defendant must be served at least 10 days before hearing.",
        "methods": ["Personal service", "Certified mail return receipt", "Other authorized means"],
        "statute": "W.S. 1-21-203",
    },
    "security_deposit": {
        "return_period": "30 days after lease termination",
        "requirement": "Itemized statement of deductions required",
        "statute": "W.S. 1-21-1208",
    },
    "counterclaims": {
        "allowed": True,
        "limit": "Must not exceed $6,000 jurisdictional limit",
        "statute": "W.S. 1-21-201(d)",
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
            "Landlord failed to return deposit within 30 days OR failed to provide itemized deductions",
            "Deductions (if any) were unreasonable or unsupported",
        ],
        "damages_measure": "Amount of deposit wrongfully withheld",
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
