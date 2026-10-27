"""Tests for file download path traversal protection and file service security.

Covers:
- Path traversal rejection in read_and_decrypt()
- Missing file returns 404
- Filename sanitization
- Extension validation whitelist
"""

import os
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from services.file_service import (
    ALLOWED_EXTENSIONS,
    _sanitize_filename,
    _validate_extension,
    pipeline_excerpt,
    read_and_decrypt,
    safe_filename,
)


# ─── Path Traversal Protection ────────────────────────────────────────────────


class TestPathTraversalProtection:
    """Ensure read_and_decrypt() rejects paths outside the upload directory."""

    @pytest.fixture()
    def upload_dir(self, tmp_path):
        upload = tmp_path / "uploads"
        upload.mkdir()
        return str(upload)

    def test_rejects_path_traversal_dotdot(self, upload_dir):
        malicious_path = os.path.join(upload_dir, "..", "etc", "passwd")
        with patch("services.file_service.settings") as mock_settings:
            mock_settings.upload_dir = upload_dir
            with pytest.raises(HTTPException) as exc_info:
                read_and_decrypt(malicious_path)
            assert exc_info.value.status_code == 403
            assert "Access denied" in str(exc_info.value.detail)

    def test_rejects_absolute_path_outside_root(self, upload_dir):
        with patch("services.file_service.settings") as mock_settings:
            mock_settings.upload_dir = upload_dir
            with pytest.raises(HTTPException) as exc_info:
                read_and_decrypt("/etc/shadow")
            assert exc_info.value.status_code == 403

    def test_rejects_symlink_escape(self, upload_dir, tmp_path):
        """Ensure a symlink pointing outside upload_dir is rejected."""
        outside = tmp_path / "secret.txt"
        outside.write_text("secret data")
        link = Path(upload_dir) / "link.txt"
        try:
            link.symlink_to(outside)
        except OSError:
            pytest.skip("Symlinks not supported on this OS/filesystem")
        with patch("services.file_service.settings") as mock_settings:
            mock_settings.upload_dir = upload_dir
            with pytest.raises(HTTPException) as exc_info:
                read_and_decrypt(str(link))
            # Should either be 403 (path escape) or succeed since the resolved
            # path is outside. On some systems os.path.abspath follows symlinks.
            assert exc_info.value.status_code in (403, 404)

    def test_valid_path_within_upload_dir(self, upload_dir):
        """A file legitimately inside upload_dir should be read."""
        test_file = os.path.join(upload_dir, "test.txt")
        with open(test_file, "wb") as f:
            f.write(b"hello world")

        with patch("services.file_service.settings") as mock_settings:
            mock_settings.upload_dir = upload_dir
            with patch("services.file_service.decrypt_file_bytes", return_value=b"hello world"):
                result = read_and_decrypt(test_file)
                assert result == b"hello world"

    def test_missing_file_returns_404(self, upload_dir):
        missing = os.path.join(upload_dir, "nonexistent.pdf")
        with patch("services.file_service.settings") as mock_settings:
            mock_settings.upload_dir = upload_dir
            with pytest.raises(HTTPException) as exc_info:
                read_and_decrypt(missing)
            assert exc_info.value.status_code == 404
            assert "no longer exists" in str(exc_info.value.detail).lower()


# ─── Filename Sanitization ────────────────────────────────────────────────────


class TestFilenameSanitization:
    def test_strips_special_characters(self):
        assert _sanitize_filename("my file (1).pdf") == "my_file__1_.pdf"

    def test_strips_path_separators(self):
        result = _sanitize_filename("../../etc/passwd")
        assert "/" not in result
        assert "\\" not in result
        assert ".." not in result.split("_")  # dots stripped from edges

    def test_preserves_valid_characters(self):
        assert _sanitize_filename("report-2024.pdf") == "report-2024.pdf"

    def test_empty_after_sanitization_raises(self):
        with pytest.raises(HTTPException) as exc_info:
            _sanitize_filename("...")
        assert exc_info.value.status_code == 400

    def test_unicode_characters_replaced(self):
        result = _sanitize_filename("résumé.pdf")
        assert "é" not in result  # non-ASCII replaced with _
        assert result.endswith(".pdf")

    def test_null_bytes_stripped(self):
        result = _sanitize_filename("file\x00.pdf")
        assert "\x00" not in result


# ─── Extension Validation ─────────────────────────────────────────────────────


class TestExtensionValidation:
    @pytest.mark.parametrize("ext", [".pdf", ".png", ".jpg", ".jpeg", ".txt", ".csv", ".doc", ".docx"])
    def test_allowed_extensions_pass(self, ext):
        _validate_extension(f"file{ext}")  # Should not raise

    @pytest.mark.parametrize("ext", [".exe", ".bat", ".sh", ".py", ".js", ".php", ".rb"])
    def test_disallowed_extensions_rejected(self, ext):
        with pytest.raises(HTTPException) as exc_info:
            _validate_extension(f"file{ext}")
        assert exc_info.value.status_code == 400
        assert "Unsupported file type" in str(exc_info.value.detail)

    def test_case_insensitive_extension(self):
        _validate_extension("file.PDF")  # .pdf is allowed, .PDF should be too

    def test_double_extension_checks_last(self):
        with pytest.raises(HTTPException):
            _validate_extension("report.pdf.exe")


# ─── safe_filename ────────────────────────────────────────────────────────────


class TestSafeFilename:
    def test_extracts_basename(self):
        assert safe_filename("/uploads/case123/abc_report.pdf") == "abc_report.pdf"

    def test_strips_directory(self):
        result = safe_filename("uploads/subdir/nested/file.txt")
        assert "/" not in result
        assert result == "file.txt"


class TestPipelineExcerpt:
    def test_reads_text_and_omits_the_server_path(self):
        with patch(
            "services.file_service.read_and_decrypt",
            return_value=b"Lease ended June 1.",
        ):
            text = pipeline_excerpt(r"C:\uploads\case\note.txt")
        assert text == "Lease ended June 1."
        assert "uploads" not in text

    def test_pdf_is_marked_attached_and_not_transcribed(self):
        with patch(
            "services.file_service.read_and_decrypt",
            return_value=b"%PDF-1.7",
        ):
            text = pipeline_excerpt("/uploads/case/scan.pdf")
        assert text is not None
        assert "not transcribed" in text

    def test_docx_extracts_document_text(self):
        import zipfile
        from io import BytesIO

        xml = (
            '<?xml version="1.0"?>'
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            "<w:body><w:p><w:r><w:t>Rent was paid.</w:t></w:r></w:p></w:body>"
            "</w:document>"
        )
        buffer = BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("word/document.xml", xml)
        with patch(
            "services.file_service.read_and_decrypt",
            return_value=buffer.getvalue(),
        ):
            assert pipeline_excerpt("/uploads/case/letter.docx") == "Rent was paid."

    def test_unreadable_file_does_not_raise(self):
        with patch(
            "services.file_service.read_and_decrypt",
            side_effect=HTTPException(status_code=404, detail="missing"),
        ):
            text = pipeline_excerpt("/uploads/case/gone.txt")
        assert text is not None
        assert "could not be read" in text

    def test_missing_path_returns_none(self):
        assert pipeline_excerpt(None) is None
