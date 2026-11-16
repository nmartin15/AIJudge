"""A reading of the saved deposit file. It does not coach either person."""

from __future__ import annotations

import re

from services.claim_track import DEPOSIT_CAP

STATUTE_1208 = {
    "citation": "W.S. 1-21-1208",
    "source": "2026 Wyoming Statutes, statutes.wyoleg.gov",
    "paragraphs": [
        "(a) Upon termination of the rental agreement, property or money held as a deposit may be applied by the owner or his agent to the payment of accrued rent, damages to the residential rental unit beyond reasonable wear and tear, the cost to clean the unit to the condition at the beginning of the rental agreement and to other costs provided by any contract. The balance of any deposit and prepaid rent and a written itemization of any deductions from the deposit together with reasons therefor, shall be delivered or mailed without interest to the renter within thirty (30) days after termination of the rental agreement or within fifteen (15) days after receipt of the renter's new mailing address, whichever is later. If there is damage to the residential rental unit, this period shall be extended by thirty (30) days. The renter shall within thirty (30) days of termination of the rental agreement, notify the owner or designated agent of the location where payment and notice may be made or mailed.",
        "(c) If the owner of a residential rental unit or his agent unreasonably fails to comply with subsection (a) or (b) of this section, the renter may recover the full deposit and court costs.",
    ],
}


def _files(side: dict) -> list[dict]:
    found: list[dict] = []
    for claim in side.get("claims") or []:
        if not isinstance(claim, dict):
            continue
        who = str(claim.get("text") or "")[:48]
        for file in claim.get("files") or []:
            if isinstance(file, dict):
                found.append({"who": who, "title": str(file.get("title") or ""), "blob": _blob(file)})
    return found


def _blob(file: dict) -> str:
    lines = file.get("lines") or []
    text = " ".join(str(line) for line in lines) if isinstance(lines, list) else ""
    return f"{file.get('title') or ''} {file.get('kind') or ''} {text}"


def read_record(record: dict) -> dict:
    """Read the shared file. Private gaps are not part of the reading."""
    sides = record.get("sides") or {}
    alex = sides.get("alex") if isinstance(sides.get("alex"), dict) else {}
    jordan = sides.get("jordan") if isinstance(sides.get("jordan"), dict) else {}
    try:
        amount = float(alex.get("amount"))
    except (TypeError, ValueError):
        amount = None
    filed = _files(alex) + _files(jordan)
    blob = " ".join(item["blob"] for item in filed)
    itemization_filed = re.search(r"itemiz", blob, re.IGNORECASE) is not None
    bill_filed = re.search(r"invoice|receipt|\bbill\b", blob, re.IGNORECASE) is not None
    over_cap = amount is not None and amount > DEPOSIT_CAP
    open_questions = [
        "Whether the carpet patches were beyond reasonable wear and tear.",
        "Whether the owner unreasonably failed to comply with the itemization deadline in the statute quoted here.",
    ]
    if not bill_filed:
        open_questions.append("What the cleaning and carpet work cost. No bill is in the file.")
    plaintiff = str(alex.get("name") or "The renter")
    defendant = str(jordan.get("name") or "The owner")
    if over_cap:
        outcome = f"This track stops at ${DEPOSIT_CAP:,}. No award is read from an amount above that."
    elif not itemization_filed and amount is not None:
        outcome = (
            f"Reading of this file: the ${amount:,.0f} deposit returns to {plaintiff}. "
            "The written itemization is not in the file."
        )
    elif itemization_filed:
        outcome = "An itemization is in the file. This reading does not turn the photos into a winner by themselves."
    else:
        outcome = f"{plaintiff} and {defendant} both have a side in the file."
    return {
        "overCap": over_cap,
        "amount": amount or 0,
        "plaintiff": plaintiff,
        "defendant": defendant,
        "filed": [{"who": item["who"], "title": item["title"]} for item in filed],
        "itemizationFiled": itemization_filed,
        "billFiled": bill_filed,
        "outcome": outcome,
        "openQuestions": open_questions,
        "statute": STATUTE_1208,
    }
