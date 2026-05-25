"""Tests for sanitize_url_for_logging."""
import pytest

from app.utils.url_utils import sanitize_url_for_logging


class TestSensitiveParamRedaction:
    def test_token_redacted(self):
        url = "https://example.com/path?token=secret123&other=value"
        result = sanitize_url_for_logging(url)
        assert "secret123" not in result
        assert "token=[REDACTED]" in result
        assert "other=value" in result

    def test_multiple_sensitive_params(self):
        url = "https://example.com?access_token=abc&jwt=xyz&sig=123&normal=keep"
        result = sanitize_url_for_logging(url)
        assert "[REDACTED]" in result
        assert "normal=keep" in result

    def test_auth_param_redacted(self):
        url = "https://cdn.example.com/data?auth=mysecretauthkey&limit=10"
        result = sanitize_url_for_logging(url)
        assert "auth=[REDACTED]" in result
        assert "mysecretauthkey" not in result

    def test_signature_param_redacted(self):
        url = "https://example.com/file?signature=abc123&key=secret"
        result = sanitize_url_for_logging(url)
        assert "signature=[REDACTED]" in result
        assert "key=[REDACTED]" in result

    def test_session_param_redacted(self):
        url = "https://example.com/dashboard?session=sess_abc123&cookie=monster"
        result = sanitize_url_for_logging(url)
        assert "session=[REDACTED]" in result
        assert "cookie=[REDACTED]" in result

    def test_case_insensitive_redaction(self):
        url = "https://example.com?Token=abc&SESSION=xyz&JwT=123"
        result = sanitize_url_for_logging(url)
        assert "Token=[REDACTED]" in result
        assert "SESSION=[REDACTED]" in result
        assert "JwT=[REDACTED]" in result


class TestURLTruncation:
    def test_long_url_shortened(self):
        base = "https://example.com/" + "a" * 300
        result = sanitize_url_for_logging(base)
        assert len(result) <= 200
        assert result.endswith("...")

    def test_custom_max_len(self):
        url = "https://example.com/" + "x" * 50
        result = sanitize_url_for_logging(url, max_len=30)
        assert len(result) <= 30
        assert result.endswith("...")

    def test_exact_boundary_not_truncated(self):
        url = "https://example.com/exact"  # 27 chars
        result = sanitize_url_for_logging(url, max_len=27)
        assert result == url
        assert not result.endswith("...")

    def test_one_over_boundary_truncated(self):
        url = "https://example.com/1234567890abcdef"  # 38 chars
        result = sanitize_url_for_logging(url, max_len=30)
        assert len(result) <= 30
        assert result.endswith("...")


class TestNormalURLPreservation:
    def test_youtube_url_preserved(self):
        url = "https://youtube.com/watch?v=dQw4w9WgXcQ"
        result = sanitize_url_for_logging(url)
        assert url in result

    def test_instagram_url_preserved(self):
        url = "https://instagram.com/reel/ABC123/"
        result = sanitize_url_for_logging(url)
        assert url in result

    def test_url_with_no_sensitive_params(self):
        url = "https://example.com/video?format=mp4&quality=high"
        result = sanitize_url_for_logging(url)
        assert result == url

    def test_url_without_query_string(self):
        url = "https://example.com/path/to/resource"
        result = sanitize_url_for_logging(url)
        assert result == url


class TestEdgeCases:
    def test_empty_string(self):
        assert sanitize_url_for_logging("") == ""

    def test_none_url_not_provided(self):
        assert sanitize_url_for_logging("") is not None

    def test_url_with_fragment_only(self):
        url = "https://example.com/page#section"
        result = sanitize_url_for_logging(url)
        assert "section" in result

    def test_url_with_both_sensitive_and_normal_params(self):
        url = "https://example.com/search?q=hello&token=abc123&page=1&sig=xyz&sort=desc"
        result = sanitize_url_for_logging(url)
        assert "token=[REDACTED]" in result
        assert "sig=[REDACTED]" in result
        assert "q=hello" in result
        assert "page=1" in result
        assert "sort=desc" in result
        assert "abc123" not in result
        assert "xyz" not in result

    def test_sensitive_value_preserved_in_non_sensitive_param(self):
        """token as a value in a non-sensitive param should not be redacted."""
        url = "https://example.com?name=token&value=test"
        result = sanitize_url_for_logging(url)
        assert "name=token" in result
        assert "value=test" in result

    def test_malformed_url_fallback_truncation(self):
        """A URL that causes urlparse to fail should still be safely truncated."""
        # A URL with extremely bad encoding
        url = "https://example.com?" + "a=1&" * 1000 + "b=" + "\x00\x01\x02" * 100
        result = sanitize_url_for_logging(url)
        assert len(result) <= 200 or result.endswith("...")
