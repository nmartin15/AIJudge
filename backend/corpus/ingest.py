"""
Wyoming Small Claims Corpus Ingestion Pipeline.

Loads, chunks, embeds, and stores Wyoming legal materials for RAG retrieval.
Sources include statutes, court rules, bench guides, and self-help materials.
"""

import json
import uuid
from pathlib import Path
from typing import Any

from config import get_settings
from engine.llm_client import generate_embedding

settings = get_settings()

SOURCES_DIR = Path(__file__).parent / "sources"


# ─── Wyoming Small Claims Corpus Data ─────────────────────────────────────────
# These are the key statutory and procedural provisions that form the corpus.
# In production, these would be loaded from PDFs / scraped HTML. For now,
# they are structured inline to ensure accuracy and completeness.


WYOMING_STATUTES = [
    {
        "source_type": "statute",
        "source_title": "Wyoming Statutes Title 1, Chapter 21 - Small Claims",
        "section_number": "W.S. 1-21-201",
        "topic": "small_claims_jurisdiction",
        "content": (
            "W.S. 1-21-201. Small claims jurisdiction.\n\n"
            "(a) Each circuit court has a small claims docket and jurisdiction over "
            "civil actions where the amount in controversy does not exceed six thousand "
            "dollars ($6,000.00), exclusive of interest and costs.\n\n"
            "(b) Small claims actions are informal proceedings. The Wyoming Rules of "
            "Evidence and the Wyoming Rules of Civil Procedure do not apply except as "
            "specifically provided. The court may conduct the hearing in any manner "
            "it deems appropriate to determine the facts and to do justice between the parties.\n\n"
            "(c) Attorneys may appear and represent parties in small claims actions.\n\n"
            "(d) Counterclaims may be filed if they do not exceed the jurisdictional limit."
        ),
    },
    {
        "source_type": "statute",
        "source_title": "Wyoming Statutes Title 1, Chapter 21 - Small Claims",
        "section_number": "W.S. 1-21-202",
        "topic": "small_claims_filing",
        "content": (
            "W.S. 1-21-202. Commencement of action; filing fee.\n\n"
            "(a) A small claims action is commenced by filing a verified complaint with "
            "the clerk of the circuit court. The complaint shall contain a brief statement "
            "of the claim, the amount claimed, and the name and address of the defendant.\n\n"
            "(b) The filing fee for a small claims action is established by the supreme court. "
            "Filing fees are generally between $10 and $30 depending on the amount claimed.\n\n"
            "(c) The complaint form is provided by the clerk and is designed to be completed "
            "without the assistance of an attorney."
        ),
    },
    {
        "source_type": "statute",
        "source_title": "Wyoming Statutes Title 1, Chapter 21 - Small Claims",
        "section_number": "W.S. 1-21-203",
        "topic": "small_claims_service",
        "content": (
            "W.S. 1-21-203. Service of process.\n\n"
            "(a) The defendant shall be served with a copy of the complaint and a notice "
            "of the hearing date at least ten (10) days before the hearing.\n\n"
            "(b) Service may be made by:\n"
            "  (i) Personal service by the sheriff or any person over 18 years of age "
            "who is not a party to the action;\n"
            "  (ii) Certified mail, return receipt requested, to the defendant's last "
            "known address;\n"
            "  (iii) Any other means authorized by the Wyoming Rules of Civil Procedure.\n\n"
            "(c) If service cannot be completed, the court may authorize alternative "
            "methods of service."
        ),
    },
    {
        "source_type": "statute",
        "source_title": "Wyoming Statutes Title 1, Chapter 21 - Small Claims",
        "section_number": "W.S. 1-21-204",
        "topic": "small_claims_hearing",
        "content": (
            "W.S. 1-21-204. Hearing and judgment.\n\n"
            "(a) The hearing shall be held at the time and place stated in the notice. "
            "Both parties may present testimony, documents, and other evidence.\n\n"
            "(b) The court shall determine the facts based on a preponderance of the "
            "evidence standard. The plaintiff bears the burden of proof.\n\n"
            "(c) The judge may question witnesses, request additional evidence, and "
            "take any action necessary to determine the facts.\n\n"
            "(d) The court shall render judgment at the conclusion of the hearing or "
            "within a reasonable time thereafter.\n\n"
            "(e) Judgment may be entered for the plaintiff in the amount proved, for "
            "the defendant if the plaintiff fails to prove the claim, or for the "
            "defendant on a counterclaim.\n\n"
            "(f) Costs may be awarded to the prevailing party."
        ),
    },
    {
        "source_type": "statute",
        "source_title": "Wyoming Statutes Title 1, Chapter 21 - Small Claims",
        "section_number": "W.S. 1-21-205",
        "topic": "small_claims_appeal",
        "content": (
            "W.S. 1-21-205. Appeals.\n\n"
            "(a) Either party may appeal a small claims judgment to the district court "
            "within ten (10) days after the judgment is entered.\n\n"
            "(b) The appeal is a trial de novo — the case is retried from scratch in "
            "district court under the standard rules of civil procedure and evidence.\n\n"
            "(c) The appealing party must file a bond or pay a fee as required by the court."
        ),
    },
    {
        "source_type": "statute",
        "source_title": "Wyoming Statutes Title 1, Chapter 1 - Civil Procedure General",
        "section_number": "W.S. 1-1-109",
        "topic": "damages_general",
        "content": (
            "W.S. 1-1-109. Measure of damages.\n\n"
            "In civil actions, damages are measured by the actual loss sustained by the "
            "injured party. The plaintiff must prove damages with reasonable certainty. "
            "Speculative or conjectural damages are not recoverable.\n\n"
            "For property damage: the measure is the lesser of the cost of repair or "
            "the diminution in market value.\n\n"
            "For breach of contract: the measure is the benefit of the bargain — the "
            "amount that would put the plaintiff in the position they would have been "
            "in had the contract been performed."
        ),
    },
    {
        "source_type": "statute",
        "source_title": "Wyoming Statutes Title 1 - Venue",
        "section_number": "W.S. 1-5-102",
        "topic": "venue",
        "content": (
            "W.S. 1-5-102. Venue for civil actions.\n\n"
            "Civil actions shall be brought in the county where:\n"
            "  (a) The defendant resides;\n"
            "  (b) The cause of action arose; or\n"
            "  (c) The property in dispute is located.\n\n"
            "If no defendant resides in Wyoming, the action may be brought in any "
            "county where the plaintiff resides."
        ),
    },
]


WYOMING_COURT_RULES = [
    {
        "source_type": "rule",
        "source_title": "Wyoming Circuit Court Small Claims Procedures",
        "section_number": "Rule SC-1",
        "topic": "small_claims_procedures",
        "content": (
            "Small Claims Procedures — General.\n\n"
            "1. Cases on the small claims docket are heard informally. The judge may "
            "ask questions of either party or any witness.\n"
            "2. Formal rules of evidence do not apply. The court may consider any "
            "evidence it deems reliable and relevant, including hearsay.\n"
            "3. Each party should bring all documents, photographs, and other evidence "
            "to the hearing. Originals are preferred.\n"
            "4. Witnesses may testify in person. Written statements may be considered "
            "but carry less weight than in-person testimony.\n"
            "5. The hearing is typically completed in one session, usually 15-30 minutes.\n"
            "6. The judge will explain the ruling and the reasons for it at the conclusion."
        ),
    },
    {
        "source_type": "rule",
        "source_title": "Wyoming Circuit Court Small Claims Procedures",
        "section_number": "Rule SC-2",
        "topic": "evidence_standards",
        "content": (
            "Small Claims Evidence Standards.\n\n"
            "1. The standard of proof is preponderance of the evidence — more likely "
            "than not (greater than 50%).\n"
            "2. Documentary evidence (receipts, contracts, photographs, text messages, "
            "emails) is generally given more weight than oral testimony alone.\n"
            "3. The credibility of witnesses is determined by the judge based on:\n"
            "   - Consistency of testimony\n"
            "   - Corroboration by other evidence\n"
            "   - Demeanor and apparent truthfulness\n"
            "   - Bias or interest in the outcome\n"
            "4. The court may take judicial notice of commonly known facts.\n"
            "5. Photographs should be dated and their context explained."
        ),
    },
    {
        "source_type": "rule",
        "source_title": "Wyoming Circuit Court Small Claims Procedures",
        "section_number": "Rule SC-3",
        "topic": "damages_calculation",
        "content": (
            "Small Claims Damages Calculation.\n\n"
            "1. The plaintiff must prove the amount of damages with reasonable certainty.\n"
            "2. For property damage claims:\n"
            "   - Repair estimates from qualified professionals\n"
            "   - Photographs of the damage (before and after if available)\n"
            "   - Fair market value documentation\n"
            "3. For contract claims:\n"
            "   - The contract itself (written or description of oral terms)\n"
            "   - Evidence of performance by the plaintiff\n"
            "   - Evidence of non-performance by the defendant\n"
            "   - Calculation of damages based on the contract terms\n"
            "4. For security deposit claims:\n"
            "   - Lease agreement\n"
            "   - Move-in/move-out inspection reports\n"
            "   - Photographs of condition\n"
            "   - Itemized deduction statement\n"
            "   - Wyoming law requires landlords to return deposits within 30 days "
            "or provide an itemized statement of deductions (W.S. 1-21-1208).\n"
            "5. The court will not award speculative damages."
        ),
    },
]


WYOMING_JUDICIAL_GUIDES = [
    {
        "source_type": "guide",
        "source_title": "Wyoming Small Claims Bench Guide",
        "section_number": "BG-1",
        "topic": "judicial_reasoning_framework",
        "content": (
            "Small Claims Judicial Reasoning Framework.\n\n"
            "When deciding a small claims case, follow this analytical framework:\n\n"
            "1. JURISDICTION CHECK\n"
            "   - Is the amount within the $6,000 limit?\n"
            "   - Is the claim one that small claims court can hear?\n"
            "   - Is venue proper?\n\n"
            "2. IDENTIFY THE CLAIMS\n"
            "   - What specific legal claim is the plaintiff making?\n"
            "   - What are the elements the plaintiff must prove?\n"
            "   - Has a counterclaim been filed?\n\n"
            "3. DETERMINE THE FACTS\n"
            "   - What facts are undisputed?\n"
            "   - Where do the parties disagree?\n"
            "   - What evidence supports each version?\n\n"
            "4. WEIGH THE EVIDENCE\n"
            "   - Apply the preponderance standard\n"
            "   - Consider documentary vs. testimonial evidence\n"
            "   - Assess credibility of witnesses\n\n"
            "5. APPLY THE LAW\n"
            "   - Does the evidence meet the legal elements?\n"
            "   - Are there any defenses that apply?\n"
            "   - What amount of damages is proved?\n\n"
            "6. RENDER JUDGMENT\n"
            "   - State findings of fact clearly\n"
            "   - Explain the legal basis\n"
            "   - State the judgment amount\n"
            "   - Award costs if appropriate"
        ),
    },
    {
        "source_type": "guide",
        "source_title": "Wyoming Small Claims Bench Guide",
        "section_number": "BG-2",
        "topic": "common_claim_elements",
        "content": (
            "Elements of Common Small Claims.\n\n"
            "BREACH OF CONTRACT:\n"
            "1. A valid contract existed (written or oral)\n"
            "2. Plaintiff performed their obligations (or was excused)\n"
            "3. Defendant breached the contract\n"
            "4. Plaintiff suffered damages as a result\n\n"
            "PROPERTY DAMAGE (Negligence):\n"
            "1. Defendant owed plaintiff a duty of care\n"
            "2. Defendant breached that duty\n"
            "3. The breach caused the damage\n"
            "4. Plaintiff suffered actual damages\n\n"
            "SECURITY DEPOSIT:\n"
            "1. Tenant paid a security deposit\n"
            "2. Lease terminated and tenant vacated\n"
            "3. Landlord failed to return deposit within 30 days\n"
            "4. Landlord failed to provide itemized deduction statement\n"
            "   OR deductions were unreasonable\n\n"
            "MONEY OWED (Debt/Loan):\n"
            "1. Defendant received money/goods from plaintiff\n"
            "2. Defendant agreed to pay (or an obligation to pay exists)\n"
            "3. Defendant has not paid\n"
            "4. The amount claimed is correct\n\n"
            "CONSUMER DISPUTE:\n"
            "1. Transaction occurred\n"
            "2. Goods/services were defective or not as represented\n"
            "3. Plaintiff notified defendant of the problem\n"
            "4. Defendant failed to remedy\n"
            "5. Plaintiff suffered damages"
        ),
    },
    {
        "source_type": "guide",
        "source_title": "Wyoming Magistrate Training - Small Claims",
        "section_number": "MT-1",
        "topic": "hearing_management",
        "content": (
            "Managing the Small Claims Hearing.\n\n"
            "OPENING:\n"
            "- Introduce yourself and explain the informal nature of the proceeding\n"
            "- Verify the parties are present\n"
            "- Ask if there has been any attempt to resolve the matter\n"
            "- Explain the order of presentation\n\n"
            "PLAINTIFF'S CASE:\n"
            "- Let the plaintiff tell their story without interruption\n"
            "- Then ask clarifying questions\n"
            "- Ask the plaintiff to present documentary evidence\n"
            "- Allow the defendant to ask questions\n\n"
            "DEFENDANT'S CASE:\n"
            "- Let the defendant respond to the claims\n"
            "- Ask clarifying questions\n"
            "- Ask the defendant to present documentary evidence\n"
            "- Allow the plaintiff to ask questions\n\n"
            "CLOSING:\n"
            "- Ask each party if they have anything to add\n"
            "- Thank both parties for their time\n"
            "- Announce the decision or indicate when it will be issued\n\n"
            "TIPS:\n"
            "- Keep control of the hearing but remain approachable\n"
            "- Do not let parties argue with each other\n"
            "- Focus on the key disputed issues\n"
            "- Take notes during testimony\n"
            "- If math is involved, work through it openly"
        ),
    },
    {
        "source_type": "guide",
        "source_title": "Wyoming Self-Help Guide - Small Claims Court",
        "section_number": "SH-1",
        "topic": "self_help_procedural",
        "content": (
            "Wyoming Small Claims Court — What to Expect.\n\n"
            "WHO CAN FILE:\n"
            "- Any person or business owed money or claiming property damage\n"
            "- The amount must be $6,000 or less\n"
            "- You must file in the correct county\n\n"
            "WHAT TO BRING:\n"
            "- Any written contract or agreement\n"
            "- Receipts, invoices, or estimates\n"
            "- Photographs of damage or defective goods\n"
            "- Text messages or emails related to the dispute\n"
            "- A witness who can support your case (if available)\n"
            "- A clear, organized summary of your claim\n\n"
            "WHAT THE JUDGE CONSIDERS:\n"
            "- Who is more believable based on the evidence\n"
            "- Whether the plaintiff has proven their case by a preponderance\n"
            "- The exact amount of damages that are proven\n"
            "- Any defenses raised by the defendant\n\n"
            "COMMON REASONS CASES ARE LOST:\n"
            "- Not enough evidence (just saying it happened is often not enough)\n"
            "- Not proving the amount of damages\n"
            "- Filing in the wrong court\n"
            "- Not properly serving the defendant\n"
            "- Missing the hearing"
        ),
    },
]


def get_all_corpus_chunks() -> list[dict]:
    """Return all corpus chunks ready for embedding and storage."""
    all_chunks = []
    all_chunks.extend(WYOMING_STATUTES)
    all_chunks.extend(WYOMING_COURT_RULES)
    all_chunks.extend(WYOMING_JUDICIAL_GUIDES)
    return all_chunks


async def embed_and_prepare_chunks() -> list[dict]:
    """Generate embeddings for all corpus chunks. Returns list ready for DB insert."""
    chunks = get_all_corpus_chunks()
    prepared = []

    for chunk in chunks:
        # Build embedding text: combine section + topic + content for best retrieval
        embed_text = f"{chunk['source_title']} {chunk.get('section_number', '')} {chunk.get('topic', '')}\n\n{chunk['content']}"
        embedding = await generate_embedding(embed_text)

        prepared.append(
            {
                "id": uuid.uuid4(),
                "source_type": chunk["source_type"],
                "source_title": chunk["source_title"],
                "section_number": chunk.get("section_number"),
                "topic": chunk.get("topic"),
                "content": chunk["content"],
                "embedding": embedding,
                "metadata_": {
                    "source_type": chunk["source_type"],
                    "topic": chunk.get("topic"),
                },
            }
        )

    return prepared
