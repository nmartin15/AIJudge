"""SQLAlchemy ORM event listeners for side effects (file cleanup, etc.)."""

import logging
import os
import shutil

from sqlalchemy import event

from config import get_settings
from models.database import Case

logger = logging.getLogger(__name__)


@event.listens_for(Case, "after_delete")
def cleanup_case_uploads(mapper, connection, target):
    """Remove uploaded evidence files when a case is deleted.

    This fires on ORM-level deletes and DB-level CASCADE deletes that are
    tracked by the session.  The upload directory for a case lives at
    ``{upload_dir}/{case_id}/``.
    """
    settings = get_settings()
    upload_dir = os.path.join(settings.upload_dir, str(target.id))
    if os.path.isdir(upload_dir):
        try:
            shutil.rmtree(upload_dir)
            logger.info("Cleaned up uploads for case %s", target.id)
        except OSError as exc:
            logger.warning("Failed to clean up uploads for case %s: %s", target.id, exc)
