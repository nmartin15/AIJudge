"""Who is writing on the claim track. The two demo logins are checked here."""

import hashlib
import hmac
import time

from config import get_settings

ACCOUNTS = {
    "alex.rivera@demo.wy": ("deposit1500", "alex"),
    "jordan.hale@demo.wy": ("carpet1500", "jordan"),
}
TOKEN_MAX_AGE = 60 * 60 * 12


def _secret() -> bytes:
    settings = get_settings()
    return (settings.field_encryption_key or "wy-claim-track-demo").encode()


def actor_for_login(email: str, password: str) -> str | None:
    record = ACCOUNTS.get(email.strip().lower())
    if record is None or record[0] != password:
        return None
    return record[1]


def issue_token(actor: str) -> str:
    issued = str(int(time.time()))
    body = f"{actor}.{issued}"
    signature = hmac.new(_secret(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{signature}"


def read_token(token: str) -> str | None:
    actor, issued, signature = (token.split(".") + ["", ""])[:3]
    if actor not in {"alex", "jordan"} or not issued.isdigit() or not signature:
        return None
    body = f"{actor}.{issued}"
    expected = hmac.new(_secret(), body.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        return None
    if int(time.time()) - int(issued) > TOKEN_MAX_AGE:
        return None
    return actor
